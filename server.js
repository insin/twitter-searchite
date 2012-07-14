var format = require('util').format

var express = require('express')
  , twitter = require('twitter-text')
  , moment = require('moment')

var settings = require('./settings')
  , redis = require('./redis')
  , extend = require('./utils').extend

// Replace moment's time-ago format strings with shorter representations
extend(moment.relativeTime, {
  s: 'now'
, m: '1m', mm: '%dm'
, h: '1h', hh: '%dh'
, d: '1d', dd: '%dd'
, M: '1m', MM: '%dm'
, y: '1y', yy: '%dy'
})

var $r = redis.connect()

var app = express.createServer()
app.use(app.router)
app.use(express.static(__dirname + '/static'))
app.use(express.errorHandler({showStack: true, dumpExceptions: true}))

app.set('view engine', 'jade')
app.set('view options', {layout: false})
app.helpers({
  search: settings.search
, version: require('./package.json').version
})

app.get('/', function index(req, res, next) {
  getTweets(function(err, tweets) {
    if (err) return next(err)
    res.render('index', {
      tweets: tweets
    , pollInterval: settings.pollInterval / 2 * 1000
    })
  })
})

app.get('/new/:last', function index(req, res, next) {
  $r.hget('tweets:#' + req.params.last, 'ctime', function(err, ctime) {
    if (err) return next(err)
    getTweetsSince(+ctime, function(err, tweets) {
      if (err) return next(err)
      if (tweets.length) {
        res.render('new_tweets', {tweets: tweets}, function(err, html) {
          if (err) return next(err)
          res.json({
            count: tweets.length
          , html: html
          , latestTweetId: tweets[0].id
          })
        })
      }
      else {
        res.json({count: 0})
      }
    })
  })
})

app.get('/user/:id', function index(req, res, next) {
  getTweetsForUser(req.params.id, function(err, tweets) {
    if (err) return next(err)
    res.render('user', {tweets: tweets})
  })
})

app.listen(3000, '0.0.0.0')
console.log('%s server listening on http://0.0.0.0:3000', settings.search)

function getTweets(options, cb) {
  var defaultOptions = {start: 0, count: settings.tweetsPerPage}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = extend(defaultOptions, options)
  }

  var start = options.start
    , stop = options.start + (options.count - 1)
  $r.zrevrange('tweets.cron', start, stop,
  function(err, tweetIds) {
    if (err) return cb(err)
    getTweetsById(tweetIds, cb)
  })
}

function getTweetsSince(ctime, cb) {
  $r.zrevrangebyscore('tweets.cron', '+inf', ctime + 1,
  function(err, tweetIds) {
    if (err) return cb(err)
    getTweetsById(tweetIds, cb)
  })
}

function getTweetsForUser(userId, cb) {
  $r.zrevrange('user.posted:#' + userId, 0, -1,
  function(err, tweetIds) {
    if (err) return cb(err)
    getTweetsById(tweetIds, cb)
  })
}

function getTweetsById(ids, cb) {
  var multi = $r.multi()
    , now = moment()
  ids.forEach(function(id) { multi.hgetall('tweets:#' + id) })
  multi.exec(function(err, objects) {
    if (err) return cb(err)
    cb(null, objects.map(function(obj) { return new Tweet(obj, now) }))
  })
}

function Tweet(obj, now) {
  this.id = obj.id
  this.text = twitter.autoLink(obj.text)
  // User
  this.user = obj.user
  this.userId = obj.userId
  this.avatar = obj.avatar
  // Time
  var created = moment(obj.created)
  this.created = created.format('h:mm A - DD MMM YY')
  this.timestamp = created.valueOf()
  this.ago = created.from(now, true)
  // Links
  this.accountlink = format('https://twitter.com/%s', this.user)
  this.permalink = format('%s/status/%s', this.accountlink, this.id)
}
