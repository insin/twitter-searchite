var moment = require('moment')
  , twitter = require('twitter-text')

var settings = require('./settings')
  , extend = require('./utils').extend
  , redis = require('./redis')

module.exports = {
  storeSearch: storeSearch
, storeStream: storeStream
, maxId: maxId
, get: get
, byId: byId
, byUser: byUser
, since: since
, priorTo: priorTo
}

var $r = redis.connection()

// Replace moment's time-ago format strings with shorter representations
extend(moment.relativeTime, {
  s: 'now'
, m: '1m', mm: '%dm'
, h: '1h', hh: '%dh'
, d: '1d', dd: '%dd'
, M: '1m', MM: '%dm'
, y: '1y', yy: '%dy'
})

function storeSearch(data, cb) {
  var created = moment(data.created_at)
  var tweet = {
    id: data.id_str
  , text: data.text
  , user: data.from_user
  , userId: data.from_user_id_str
  , avatar: data.profile_image_url
  , created: created.format('h:mm A - DD MMM YY')
  , ctime: created.valueOf()
  }
  store(tweet, {source: 'search'}, cb)
}

function storeStream(data, cb) {
  var created = moment(data.created_at)
  var tweet = {
    id: data.id_str
  , text: data.text
  , user: data.user.screen_name
  , userId: data.user.id_str
  , avatar: data.user.profile_image_url
  , created: created.format('h:mm A - DD MMM YY')
  , ctime: created.valueOf()
  }
  store(tweet, {source: 'stream', storeMaxId: true}, cb)
}

/**
 * Stores new Tweet data, returning it prepared for display if successful.
 */
function store(tweet, options, cb) {
  options = extend({storeMaxId: false}, options)
  console.log('%s> [%s] %s: %s', options.source, moment(+tweet.ctime).format('HH:mm'), tweet.user, tweet.text)
  var multi = $r.multi()
  // Add Tweet id to chronological view
  multi.zadd('tweets.cron', tweet.ctime, tweet.id)
  // Add Tweet id to the user's chronological view
  multi.zadd('user.posted:#' + tweet.userId, tweet.ctime, tweet.id)
  // Store Tweet details
  multi.hmset('tweets:#' + tweet.id, tweet)
  // Store Tweet id as the max id, if requested
  if (options.storeMaxId) {
    multi.set('since', tweet.id)
  }
  multi.exec(function(err) {
    if (err) return cb(err)
    cb(null, tweetDisplay(tweet, moment()))
  })
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
