var async = require('async')

var settings = require('./settings')
  , pluralise = require('./utils').pluralise
  , redisTweets = require('./tweets')

module.exports = {
  start: start
, stop: stop
, isPolling: isPolling
}

var $t = new require('ntwitter')({
  consumer_key: settings.consumerKey
, consumer_secret: settings.consumerSecret
, access_token_key: settings.accessToken
, access_token_secret: settings.accessTokenSecret
})

var timeoutId = null
  , polling = false

function start() {
  polling = true
  getNewTweets()
}

function stop() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  polling = false
}

function isPolling() {
  return polling
}

function wait() {
  timeoutId = setTimeout(getNewTweets, settings.pollInterval * 1000)
  console.log('Waiting for %ss...', settings.pollInterval)
}

function getNewTweets() {
  redisTweets.maxId(function(err, sinceId) {
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
  if (settings.ignoreRTs) {
    var tweetCount = tweets.length
    tweets = tweets.filter(function(tweet) {
      return (tweet.text.indexOf('RT ') != 0)
    })
    var filtered = tweetCount - tweets.length
    if (filtered) {
      console.log('Filtered out ' + filtered + ' RT' + pluralise(filtered))
    }
  }
  console.log('Got %s new Tweet%s', tweets.length, pluralise(tweets.length))
  async.forEach(tweets, redisTweets.store, function(err) {
    if (err) throw err
    redisTweets.maxId(search.max_id_str, function(err) {
      if (err) throw err
      wait()
    })
  })
}

// Allow starting via `node poller.js`
if (require.main === module) {
  start()
}
