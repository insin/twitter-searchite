var express = require('express')
  , twitter = require('twitter-text')
  , moment = require('moment')

var settings = require('./settings')
  , extend = require('./utils').extend

var $r = require('redis').createClient()

$r.on('error', function (err) {
  console.error('Redis Error: %s', err)
})

if (settings.redisDatabase) {
  $r.select(settings.redisDatabase)
}

var app = express.createServer()
app.use(app.router)
app.use(express.errorHandler({showStack: true, dumpExceptions: true}))

app.set('view engine', 'jade')
app.set('view options', {layout: false})
app.helpers({
  search: settings.search
, version: require('./package.json').version
})

app.get('/', function index(req, res, next) {
  getLatestTweets(function(err, tweets) {
    if (err) return next(err)
    res.render('index', {tweets: tweets})
  })
})

app.listen(3000, '0.0.0.0')
console.log('%s server listening on http://0.0.0.0:3000', settings.search)

function getLatestTweets(options, cb) {
  var defaultOptions = {start: 0, count: 10}
  if (typeof options == 'function') {
    cb = options
    options = defaultOptions
  }
  else {
    options = extend(defaultOptions, options)
  }

  var start = options.start
    , stop = options.start + (options.count - 1)
  $r.zrevrange('tweets.cron', start, stop, function(err, tweetIds) {
    if (err) return cb(err)
    getTweetsById(tweetIds, cb)
  })
}

function getTweetsById(ids, cb) {
  var multi = $r.multi()
  ids.forEach(function(id) { multi.hgetall('tweets:#' + id) })
  multi.exec(function(err, objects) {
    if (err) return cb(err)
    cb(null, objects.map(function(obj) { return new Tweet(obj) }))
  })
}

function Tweet(obj) {
  this.id = obj.id
  this.text = twitter.autoLink(twitter.htmlEscape(obj.text))
  this.user = obj.user
  this.userId = obj.userId
  this.avatar = obj.avatar
  this.created = moment(obj.created).format('h:mm A - DD MMM YY')
}
