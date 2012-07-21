var express = require('express')
  , RedisStore = require('connect-redis')(express)
  , app = express.createServer()
  , io = require('socket.io').listen(app)
  , jade = require('jade')
  , OAuth = require('oauth').OAuth

var settings = require('./settings')
  , poller = require('./poller')
  , redis = require('./redis')
  , redisTweets = require('./tweets')
  , redisUsers = require('./users')
  , extend = require('./utils').extend

var $r = redis.connection()

var $o = new OAuth(
  'https://api.twitter.com/oauth/request_token'
, 'https://api.twitter.com/oauth/access_token'
, settings.consumerKey
, settings.consumerSecret
, '1.0'
, settings.callbackDomain + '/auth/callback'
, 'HMAC-SHA1'
)

// ---------------------------------------------------------- Express Config ---

/**
 * Middleware which loads user details when the current user is authenticated.
 */
function loadUser(req, res, next) {
  if (req.session.userId) {
    redisUsers.byId(req.session.userId, function(err, user) {
      if (err) return next(err)
      req.user = extend(user, {
        isAuthenticated: true
      , isAnonymous: false
      })
      next()
    })
  }
  else {
    req.user = {
      isAuthenticated: false
    , isAnonymous: true
    , isAdmin: false
    }
    next()
  }
}

function requiresAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.send(401)
  next()
}

app.use(express.bodyParser())
app.use(express.cookieParser())
app.use(express.session({
  secret: settings.sessionSecret
, store: new RedisStore({client: $r})
}))
app.use(loadUser)
app.use(app.router)
app.use(express.static(__dirname + '/static'))
app.use(express.errorHandler({showStack: true, dumpExceptions: true}))

app.set('view engine', 'jade')
app.set('view options', {layout: false})
app.helpers({
  search: settings.search
, version: require('./package.json').version
})
app.dynamicHelpers({
  user: function(req, res) { return req.user }
})

io.set('log level', 1)

// ------------------------------------------------------------ URL Handlers ---

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
    , autoDisplayNew: settings.autoDisplayNew
    })
  })
})

/**
 * Admin page.
 */
app.get('/admin', requiresAdmin, function index(req, res, next) {
  res.render('admin')
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

app.post('/auth', function(req, res, next) {
  $o.getOAuthRequestToken(function(err, token, secret, results) {
    if (err) return next(err)
    req.session.oauth = {token: token, secret: secret}
    res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + token)
  })
})

app.get('/auth/callback', function(req, res, next) {
  if (!req.session.oauth) return next(new Error('Twitter auth not in progress'))
  var oauth = req.session.oauth
  $o.getOAuthAccessToken(oauth.token, oauth.secret, req.query.oauth_verifier,
  function(err, accessKey, accessSecret, results) {
    if (err) return next(err)
    var user = {
      id: results.user_id
    , name: results.screen_name
    , accessKey: accessKey
    , accessSecret: accessSecret
    }
    redisUsers.store(user, function(err) {
      if (err) return next(err)
      req.session.userId = user.id
      delete req.session.oauth
      res.redirect('/')
    })
  })
})

app.post('/unauth', function(req, res, next) {
  if (!req.user.isAuthenticated) return res.redirect('/')
  req.session.destroy(function(err) {
    if (err) return next(err)
    res.redirect('/')
  })
})

// --------------------------------------------------------- Poller Handlers ---

poller.on('tweet', function(tweet) {
  jade.renderFile('views/index_tweet.jade', {cache: true, tweet: tweet},
  function(err, html) {
    if (err) throw err
    io.sockets.emit('tweet', {
      latestTweetId: tweet.id
    , html: html
    })
  })
})

poller.on('tweets', function(tweets) {
  jade.renderFile('views/new_tweets.jade', {cache: true, tweets: tweets},
  function(err, html) {
    if (err) throw err
    io.sockets.emit('tweets', {
      count: tweets.length
    , latestTweetId: tweets[0].id
    , html: html
    })
  })
})

// ----------------------------------------------------------------- Startup ---

app.listen(settings.port, '0.0.0.0')
console.log('%s server listening on http://0.0.0.0:%s',
    settings.search, settings.port)
poller.start()