var EventEmitter = require('events').EventEmitter

var async = require('async')

var settings = require('./settings')
  , pluralise = require('./utils').pluralise
  , redisTweets = require('./tweets')

module.exports = {
  start: start
, stop: stop
, running: function() { return running }
, on: function(event, fn) { ee.on(event, fn) }
}

var $t = new require('ntwitter')({
  consumer_key: settings.consumerKey
, consumer_secret: settings.consumerSecret
, access_token_key: settings.accessToken
, access_token_secret: settings.accessTokenSecret
})

var running = false
  , timeoutId = null
  , activeStream = null
  , ee = new EventEmitter()

function start() {
  console.log('Poller starting...')
  running = true
  searchForNewTweets()
}

function stop() {
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
    timeoutId = null
  }
  if (activeStream !== null) {
    activeStream.destroy()
    activeStream = null
  }
  stopped()
}

function stopped() {
  running = false
  activeStream = null
  console.log('Poller stopped.')
}

function wait() {
  timeoutId = setTimeout(searchForNewTweets, settings.pollInterval * 1000)
  console.log('Waiting for %ss...', settings.pollInterval)
}

function searchForNewTweets() {
  redisTweets.maxId(function(err, sinceId) {
    if (err) throw err
    sinceId = sinceId || 0
    console.log('Searching for "%s" Tweets since #%s...', settings.search, sinceId)
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
    return startStreaming()
  }

  var tweets = search.results
  if (settings.ignoreRTs) {
    var tweetCount = tweets.length
    tweets = tweets.filter(function(tweet) {
      return (tweet.text.indexOf('RT ') != 0)
    })
    var filtered = tweetCount - tweets.length
  }
  console.log('Got %s new Tweet%s', tweets.length, pluralise(tweets.length))
  if (filtered) {
    console.log('(Filtered out %s RT%s)', filtered, pluralise(filtered))
  }
  async.forEach(tweets, redisTweets.storeSearch, function(err) {
    if (err) throw err
    redisTweets.maxId(search.max_id_str, function(err) {
      if (err) throw err
      startStreaming()
    })
  })
}

function startStreaming() {
  console.log('Streaming Tweets with filter "%s"...', settings.stream)
  $t.verifyCredentials(function(err, data) {
    if (err) {
      console.log('Error verifying credentials: %s', err)
      return stop()
    }

    $t.stream('statuses/filter', {'track': settings.stream}, function(stream) {
      activeStream = stream

      stream.on('data', onStreamedTweet)

      stream.on('error', function(err) {
        console.error('Error from Tweet stream: %s', err)
        stopped()
      })

      stream.on('destroy', function(data) {
        console.log('Stream destroyed: %s', data)
        stopped()
      })
    })
  })
}

function onStreamedTweet(tweet) {
  if (settings.ignoreRTs && tweet.text.indexOf('RT ') == 0) {
    console.log('Filtered out RT: ' + tweet.text)
    return
  }

  redisTweets.storeStream(tweet, function(err, storedTweet) {
    if (err) {
      console.log('Error storing Tweet: %s', err)
      return stop()
    }
    ee.emit('tweet', storedTweet)
  })
}

// Allow starting via `node poller.js`
if (require.main === module) {
  start()
}
