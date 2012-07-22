var express = require('express')
  , RedisStore = require('connect-redis')(express)
  , app = express.createServer()
  , io = require('socket.io').listen(app)
  , jade = require('jade')
  , OAuth = require('oauth').OAuth

var settings = require('./settings')
  , Poller = require('./poller')
  , redis = require('./redis')
  , extend = require('./utils').extend
  , forms = require('./forms')

var SearchForm = forms.SearchForm

var poller = new Poller({
  search: {searchText: settings.search, filterText: settings.stream}
, filterRTs: settings.filterRTs
, pollInterval: settings.pollInterval
, ntwitterConfig: {
    consumer_key: settings.consumerKey
  , consumer_secret: settings.consumerSecret
  , access_token_key: settings.accessToken
  , access_token_secret: settings.accessTokenSecret
  }
})

var $r = require('./redis/connection')

var $o = new OAuth(
  'https://api.twitter.com/oauth/request_token'
, 'https://api.twitter.com/oauth/access_token'
, settings.consumerKey
, settings.consumerSecret
, '1.0'
, settings.callbackDomain + '/auth/callback'
, 'HMAC-SHA1'
)

// --------------------------------------------- Express Config & Middleware ---

/**
 * Loads user details when the current user is authenticated.
 */
function loadUser(req, res, next) {
  if (req.session.userId) {
    redis.users.byId(req.session.userId, function(err, user) {
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

/**
 * Asserts that the current user is an admin.
 */
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
app.use(express.csrf())
app.use(loadUser)
app.use(app.router)
app.use(express.static(__dirname + '/static'))
app.use(express.errorHandler({showStack: true, dumpExceptions: true}))

app.set('view engine', 'jade')
app.set('view options', {layout: false})
app.helpers({
  activeSearchText: settings.search
, appName: require('./package.json').name
, appVersion: require('./package.json').version
})
app.dynamicHelpers({
  user: function(req, res) { return req.user }
, csrfToken: function(req, res) { return req.session._csrf }
})

io.set('log level', 1)

// ------------------------------------------------------------ URL Handlers ---

/**
 * Index page.
 */
app.get('/', function index(req, res, next) {
  redis.tweets.get(function(err, tweets) {
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
 * Poller info.
 */
app.get('/admin/poller', requiresAdmin, function index(req, res, next) {
  redis.redis.info(function(err, info) {
    if (err) return next(err)
    res.render('poller', {poller: poller})
  })
})

/**
 * Poller control.
 */
app.post('/admin/poller-control', requiresAdmin, function index(req, res, next) {
  if (req.body.start) {
    poller.start()
  }
  else if (req.body.stop) {
    poller.stop()
  }
  res.redirect('/admin/poller')
})

/**
 * Redis info.
 */
app.get('/admin/redis-info', requiresAdmin, function index(req, res, next) {
  redis.redis.info(function(err, info) {
    if (err) return next(err)
    res.render('redis_info', {info: info})
  })
})

/**
 * Search list.
 */
app.get('/admin/searches', requiresAdmin, function index(req, res, next) {
  redis.searches.get(function(err, searches) {
    if (err) return next(err)
    res.render('searches', {searches: searches})
  })
})

/**
 * Add search
 */
app.all('/admin/searches/add', requiresAdmin, function index(req, res, next) {
  if (req.method == 'POST') {
    var form = new SearchForm({data: req.body})
    if (form.isValid()) {
      var search = form.cleanedData
      return redis.searches.store(search, function(err) {
        if (err) return next(err)
        res.redirect('/admin/searches')
      })
    }
  }
  else {
    var form = new SearchForm()
  }
  res.render('search_form', {action: 'Add', actionURL: req.url, form: form})
})

/**
 * Edit search.
 */
app.all('/admin/searches/:id/edit', requiresAdmin, function index(req, res, next) {
  redis.searches.byId(req.params.id, function(err, search) {
    if (!search) return res.send(404)
    if (req.method == 'POST') {
      var form = new SearchForm({initial: search, data: req.body})
      if (form.isValid()) {
        extend(search, form.cleanedData)
        return redis.searches.store(search, function(err) {
          if (err) return next(err)
          res.redirect('/admin/searches')
        })
      }
    }
    else {
      var form = new SearchForm({initial: search})
    }
    res.render('search_form', {action: 'Edit', actionURL: req.url, form: form})
  })
})

/**
 * Delete search.
 */
app.all('/admin/searches/:id/delete', requiresAdmin, function index(req, res, next) {
  redis.searches.byId(req.params.id, function(err, search) {
    if (!search) return res.send(404)
    if (req.method == 'POST') {
      return redis.searches.del(search, function(err) {
        if (err) return next(err)
        res.redirect('/admin/searches')
      })
    }
    res.render('delete_search', {actionURL: req.url, search: search})
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
  redis.tweets.since(req.params.latest, function(err, tweets) {
    if (err) return next(err)
    renderNewTweets(res, next, tweets)
  })
})

/**
 * Previous page of Tweets (XHR)
 */
app.get('/page/:earliest', function index(req, res, next) {
  redis.tweets.priorTo(req.params.earliest, function(err, tweets) {
    if (err) return next(err)
    renderNewTweets(res, next, tweets)
  })
})

/**
 * User Tweets (XHR)
 */
app.get('/user/:id', function index(req, res, next) {
  redis.tweets.byUser(req.params.id, function(err, tweets) {
    if (err) return next(err)
    res.render('user', {tweets: tweets})
  })
})

/**
 * Twitter auth initiation.
 */
app.post('/auth', function(req, res, next) {
  $o.getOAuthRequestToken(function(err, token, secret, results) {
    if (err) return next(err)
    req.session.oauth = {token: token, secret: secret}
    res.redirect('https://twitter.com/oauth/authenticate?oauth_token=' + token)
  })
})

/**
 * Twitter auth callback.
 */
app.get('/auth/callback', function(req, res, next) {
  if (!req.session.oauth) return res.send(403)
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
    redis.users.store(user, function(err) {
      if (err) return next(err)
      req.session.userId = user.id
      delete req.session.oauth
      res.redirect('/')
    })
  })
})

/**
 * Logout.
 */
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