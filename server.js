var express = require('express')

var settings = require('./settings')
  , poller = require('./poller')
  , redisTweets = require('./tweets')

if (settings.serverPoll) {
  console.log('Starting poller...')
  poller.start()
}

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

/**
 * Index page.
 */
app.get('/', function index(req, res, next) {
  redisTweets.get(function(err, tweets) {
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
  redisTweets.since(req.params.latest, function(err, tweets) {
    if (err) return next(err)
    renderNewTweets(res, next, tweets)
  })
})

/**
 * Previous page of Tweets (XHR)
 */
app.get('/page/:earliest', function index(req, res, next) {
  redisTweets.priorTo(req.params.earliest, function(err, tweets) {
    if (err) return next(err)
    renderNewTweets(res, next, tweets)
  })
})

/**
 * User Tweets (XHR)
 */
app.get('/user/:id', function index(req, res, next) {
  redisTweets.byUser(req.params.id, function(err, tweets) {
    if (err) return next(err)
    res.render('user', {tweets: tweets})
  })
})

app.listen(3000, '0.0.0.0')
console.log('%s server listening on http://0.0.0.0:3000', settings.search)
