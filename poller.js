var async = require('async')
  , moment = require('moment')

var settings = require('./settings')
  , pluralise = require('./utils').pluralise

var $r = require('redis').createClient()

$r.on('error', function (err) {
  console.error('Redis Error: %s', err)
})

if (settings.redisDatabase) {
  $r.select(settings.redisDatabase)
}

var $t = new require('ntwitter')({
  consumer_key: settings.consumerKey
, consumer_secret: settings.consumerSecret
, access_token_key: settings.accessToken
, access_token_secret: settings.accessTokenSecret
})

// Start polling
getNewTweets()

function wait() {
  setTimeout(getNewTweets, settings.pollInterval * 1000)
  console.log('Waiting for %ss...', settings.pollInterval)
}

function getNewTweets() {
  $r.get('since', function(err, sinceId) {
    if (err) throw err
    sinceId = sinceId || 0
    console.log('Searching for %s Tweets since #%s', settings.search, sinceId)
    $t.search(settings.search, {
        rpp: 100
      , result_type: 'recent'
      , since_id: sinceId
      }, onSearchResults)
  })
}

function onSearchResults(err, search) {
  if (err) throw err
  if (!search.results.length) {
    console.log('No new tweets found.')
    return wait()
  }

  var tweets = search.results
  console.log('Got %s new Tweet%s', tweets.length, pluralise(tweets.length))
  async.forEach(tweets, insertTweet, function(err) {
    if (err) throw err
    $r.set('since', search.max_id_str, function(err) {
      if (err) throw err
      wait()
    })
  })
}

function insertTweet(tweet, cb) {
  var created = moment(tweet.created_at)
    , ctime = created.valueOf()
  console.log('[%s] %s: %s', created.format('HH:mm'), tweet.from_user, tweet.text)
  async.parallel([
    // Add tweet id to chronological view
    function(cb) {
      $r.zadd('tweets.cron', ctime, tweet.id_str, cb)
    }
    // Add tweet id to the user's chronological view
  , function(cb) {
      $r.zadd('user.posted:#' + tweet.from_user_id_str, ctime, tweet.id_str, cb)
    }
    // Store details of the tweet
  , function(cb) {
      $r.hmset('tweets:#' + tweet.id_str, {
        id: tweet.id_str
      , text: tweet.text
      , user: tweet.from_user
      , userId: tweet.from_user_id_str
      , avatar: tweet.profile_image_url
      , created: tweet.created_at
      , ctime: ctime
      }, cb)
    }
  ], cb)
}
