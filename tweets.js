var moment = require('moment')
  , twitter = require('twitter-text')

var settings = require('./settings')
  , extend = require('./utils').extend
  , redis = require('./redis')

module.exports = {
  store: store
, maxId: maxId
, get: get
, byId: byId
, byUser: byUser
, since: since
, priorTo: priorTo
}

var $r = redis.connect()

// Replace moment's time-ago format strings with shorter representations
extend(moment.relativeTime, {
  s: 'now'
, m: '1m', mm: '%dm'
, h: '1h', hh: '%dh'
, d: '1d', dd: '%dd'
, M: '1m', MM: '%dm'
, y: '1y', yy: '%dy'
})

/**
 * Stores (presumed) new Tweet data.
 */
function store(tweet, cb) {
  var created = moment(tweet.created_at)
    , ctime = created.valueOf()
  console.log('[%s] %s: %s', created.format('HH:mm'), tweet.from_user, tweet.text)
  var multi = $r.multi()
  // Add Tweet id to chronological view
  multi.zadd('tweets.cron', ctime, tweet.id_str)
  // Add Tweet id to the user's chronological view
  multi.zadd('user.posted:#' + tweet.from_user_id_str, ctime, tweet.id_str)
  // Store Tweet details
  multi.hmset('tweets:#' + tweet.id_str, {
    id: tweet.id_str
  , text: tweet.text
  , user: tweet.from_user
  , userId: tweet.from_user_id_str
  , avatar: tweet.profile_image_url
  , created: created.format('h:mm A - DD MMM YY')
  , ctime: ctime
  })
  multi.exec(cb)
}

/**
 * Combined getter/setter for the max Tweet id that's been seen.
 */
function maxId(id, cb) {
  if (typeof id == 'function') {
    cb = id
    $r.get('since', cb)
  }
  else {
    $r.set('since', id, cb)
  }
}

/**
 * Retrieve a page of Tweets in reverse chronological order by start index &
 * count.
 */
function get(options, cb) {
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
    byId(tweetIds, cb)
  })
}

/**
 * Retrieves all Tweet data with the given ids and prepares it for display.
 */
function byId(ids, cb) {
  var multi = $r.multi()
    , now = moment()
  ids.forEach(function(id) { multi.hgetall('tweets:#' + id) })
  multi.exec(function(err, objects) {
    if (err) return cb(err)
    cb(null, objects.map(function(obj) { return tweetDisplay(obj, now) }))
  })
}

/**
 * Prepares Tweet data for display.
 */
function tweetDisplay(obj, now) {
  var created = moment(+obj.ctime)
    , accountlink = 'https://twitter.com/' + obj.user
  return {
    id: obj.id
  , text: twitter.autoLink(obj.text)
  // User
  , user: obj.user
  , userId: obj.userId
  , avatar: obj.avatar
  // Time
  , created: obj.created
  , timestamp: obj.ctime
  , ago: created.from(now, true)
  // Links
  , accountlink: accountlink
  , permalink: accountlink + '/status/' + obj.id
  }
}

/**
 * Retrieve all Tweets for the given user.
 */
function byUser(userId, cb) {
  $r.zrevrange('user.posted:#' + userId, 0, -1, function(err, tweetIds) {
    if (err) return cb(err)
    byId(tweetIds, cb)
  })
}


/**
 * Retrieve all Tweets since the given Tweet.
 */
function since(tweetId, cb) {
  $r.zrevrank('tweets.cron', tweetId, function(err, tweetIndex) {
    if (err) return cb(err)
    // Invalid tweet id or first tweet id
    if (tweetIndex === null || tweetIndex === 0) return cb(null, [])
    get({start: 0, count: tweetIndex}, cb)
  })
}

/**
 * Retrieve a page of Tweets prior to the given Tweet.
 */
function priorTo(tweetId, cb) {
  $r.zrevrank('tweets.cron', tweetId, function(err, tweetIndex) {
    if (err) return cb(err)
    // Invalid tweet id
    if (tweetIndex === null) return cb(null, [])
    get({start: tweetIndex + 1}, cb)
  })
}
