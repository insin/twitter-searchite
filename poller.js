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

var running = false         // true when streaming or waiting to poll
  , polling = false         // true when polling the Search API as a fallback
  , stopping = false        // true while the poller is being stopped
  , activeStream = null     // Stream being used with the Streaming API
  , timeoutId = null        // Timeout id when polling the Search API
  , ee = new EventEmitter() // EventEmitter for poller events

function start() {
  console.log('Poller starting...')
  running = true
  searchForNewTweets()
}

function stop() {
  stopping = true
  if (timeoutId !== null) {
    clearTimeout(timeoutId)
  }
  if (activeStream !== null) {
    activeStream.destroy()
  }
  stopped()
}

function stopped() {
  running = false
  polling = false
  activeStream = null
  timeoutId = null
  console.log('Poller stopped.')
  stopping = false
}

function fallback() {
  if (stopping) return
  console.log('Falling back to polling the Search API.')
  polling = true
  wait()
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
    if (polling) {
      wait()
    }
    else {
      startStreaming()
    }
    return
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
  async.mapSeries(tweets, redisTweets.storeSearch, function(err, displayTweets) {
    if (err) throw err
    redisTweets.maxId(search.max_id_str, function(err) {
      if (err) throw err
      if (polling) {
        ee.emit('tweets', displayTweets)
        wait()
      }
      else {
        startStreaming()
      }
    })
  })
}

function startStreaming() {
  $t.verifyCredentials(function(err, data) {
    if (err) {
      console.log('Error verifying credentials: %s', err)
      return fallback()
    }

    $t.stream('statuses/filter', {'track': settings.stream}, function(stream) {
      console.log('Streaming Tweets with filter "%s"...', settings.stream)
      activeStream = stream

      stream.on('data', onStreamedTweet)

      stream.on('error', function(err) {
        console.error('Error from Tweet stream: %s', err)
        fallback()
      })

      stream.on('destroy', function(data) {
        console.log('Stream destroyed: %s', data)
        fallback()
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
