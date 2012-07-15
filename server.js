var format = require('util').format

var express = require('express')
  , twitter = require('twitter-text')
  , moment = require('moment')

var settings = require('./settings')
  , redis = require('./redis')
  , extend = require('./utils').extend
  , poller = require('./poller')

if (settings.serverPoll) {
  console.log('Starting poller...')
  poller.start()
}

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

// ------------------------------------------------------------ URL Handlers ---

/**
 * Index page.
 */
app.get('/', function index(req, res, next) {
  getTweets(function(err, tweets) {
    if (err) return next(err)
    res.render('index', {
      tweets: tweets
    , pollInterval: settings.browserPollInterval * 1000
    , latestTweetId: tweets.length ? tweets[0].id : 0
    , earliestTweetId: tweets.length ? tweets[tweets.length - 1].id : 0
    , infiniteScroll: settings.infiniteScroll
    })
  })
})

/**
 * Helper for rendering new tweets as a JSON response to XHR.
 */
function renderNewTweets(res, next, tweets) {
  if (!tweets.length) return res.json({count: 0})
  res.render('new_tweets', {tweets: tweets}, function(err, html) {
    if (err) return next(err)
    res.json({
      count: tweets.length
    , html: html
    , latestTweetId: tweets[0].id
    , earliestTweetId: tweets[tweets.length - 1].id
    })
  })
}

/**
 * New Tweets (XHR)
 */
app.get('/new/:latest', function index(req, res, next) {
  getTweetsSince(req.params.latest, function(err, tweets) {
    if (err) return next(err)
    renderNewTweets(res, next, tweets)
  })
})

/**
 * Previous page of Tweets (XHR)
 */
app.get('/page/:earliest', function index(req, res, next) {
  getTweetsPriorTo(req.params.earliest, function(err, tweets) {
    if (err) return next(err)
    renderNewTweets(res, next, tweets)
  })
})

/**
 * User Tweets (XHR)
 */
app.get('/user/:id', function index(req, res, next) {
  getTweetsForUser(req.params.id, function(err, tweets) {
    if (err) return next(err)
    res.render('user', {tweets: tweets})
  })
})

app.listen(3000, '0.0.0.0')
console.log('%s server listening on http://0.0.0.0:3000', settings.search)

// --------------------------------------------------------- Redis/Tweet API ---

/**
 * Retrieve a page of Tweets in reverse chronological order by start index &
 * count.
 */
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
  $r.zrevrange('tweets.cron', start, stop, function(err, tweetIds) {
    if (err) return cb(err)
    getTweetsById(tweetIds, cb)
  })
}

/**
 * Retrieve a page of Tweets prior to the given Tweet.
 */
function getTweetsPriorTo(tweetId, cb) {
  $r.zrevrank('tweets.cron', tweetId, function(err, tweetIndex) {
    if (err) return cb(err)
    // Invalid tweet id
    if (tweetIndex === null) return cb(null, [])
    getTweets({start: tweetIndex + 1}, cb)
  })
}

/**
 * Retrieve all Tweets since the given Tweet.
 */
function getTweetsSince(tweetId, cb) {
  $r.zrevrank('tweets.cron', tweetId, function(err, tweetIndex) {
    if (err) return cb(err)
    // Invalid tweet id or first tweet id
    if (tweetIndex === null || tweetIndex === 0) return cb(null, [])
    getTweets({start: 0, count: tweetIndex}, cb)
  })
}

/**
 * Retrieve all Tweets for the given user.
 */
function getTweetsForUser(userId, cb) {
  $r.zrevrange('user.posted:#' + userId, 0, -1, function(err, tweetIds) {
    if (err) return cb(err)
    getTweetsById(tweetIds, cb)
  })
}

/**
 * Retrieve all Tweets with the given ids.
 */
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
