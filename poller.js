var EventEmitter = require('events').EventEmitter
  , format = require('util').format

var async = require('async')

var settings = require('./settings')
  , pluralise = require('./utils').pluralise
  , redisTweets = require('./tweets')

// Export public API
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

// ------------------------------------------------------------------- Utils ---

/**
 * Determines if tweet data received from a Twitter API is a retweet.
 */
function isRT(tweet) {
  return (tweet.text.indexOf('RT ') == 0)
}

/**
 * Wraps a function and negates its result when called.
 */
function negate(fn) {
  return function() {
    return !fn.apply(null, arguments)
  }
}

// --------------------------------------------------------------- Lifecycle ---

function start() {
  console.log('Poller starting...')
  running = true
  searchForNewTweets()
}

function stop() {
  stopping = true
  try {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
    if (activeStream !== null) {
      activeStream.destroy()
    }
  }
  finally {
    stopped()
  }
}

/**
 * Resets status to initial values.
 */
function stopped() {
  running = false
  polling = false
  activeStream = null
  timeoutId = null
  console.log('Poller stopped.')
  stopping = false
}

// -------------------------------------------------------------- Search API ---

/**
 * Entry point for using the Search API.
 */
function searchForNewTweets() {
  redisTweets.maxId(function(err, sinceId) {
    if (err) throw err
    sinceId = sinceId || 0
    console.log('Searching for tweets with "%s", since #%s...',
        settings.search, sinceId)
    $t.search(settings.search, {
      rpp: 100
    , result_type: 'recent'
    , since_id: sinceId
    , include_entities: true
    }, onSearchResults)
  })
}

/**
 * Handler for results from the Search API.
 */
function onSearchResults(err, search) {
  if (err) throw err

  if (!search.results.length) {
    console.log('No new tweets found.')
    return afterSearch()
  }

  // We got at least one search result, so store the max tweet id we've seen
  // before proceeding.
  redisTweets.maxId(search.max_id_str, function(err) {
    if (err) throw err

    var tweets = search.results
      , filtered = '.'
    if (settings.filterRTs) {
      tweets = tweets.filter(negate(isRT))
      var rts = search.results.length - tweets.length
      if (rts) {
        filtered = format(' (after filtering %s retweet%s).', rts, pluralise(rts))
      }
    }

    console.log('Got %s new tweet%s%s',
        tweets.length, pluralise(tweets.length), filtered)

    // If we only got RTs as search results, we might have just filtered them
    if (!tweets.length) {
      return afterSearch()
    }

    async.mapSeries(tweets, redisTweets.storeSearch, function(err, displayTweets) {
      if (err) throw err
      afterSearch(displayTweets)
    })
  })
}

/**
 * Determines what to do next after search results have been processed. If
 * we're polling the Search API and any tweets were received, they will be
 * emitted.
 */
function afterSearch(tweets) {
  if (polling) {
    if (tweets) {
      ee.emit('tweets', tweets)
    }
    wait()
  }
  else {
    startStreaming()
  }
}

/**
 * Sets a timeout to call the search function again.
 */
function wait() {
  timeoutId = setTimeout(searchForNewTweets, settings.pollInterval * 1000)
  console.log('Waiting for %ss...', settings.pollInterval)
}

/**
 * Initiates falling back to using the Search API if streaming fails.
 */
function fallback() {
  if (stopping) return
  console.log('Falling back to polling the Search API.')
  polling = true
  wait()
}

// ----------------------------------------------------------- Streaming API ---

function startStreaming() {
  $t.verifyCredentials(function(err, data) {
    if (err) {
      console.log('Error verifying credentials: %s', err)
      return fallback()
    }

    $t.stream('statuses/filter', {'track': settings.stream}, function(stream) {
      console.log('Streaming tweets with filter "%s"...', settings.stream)
      activeStream = stream

      stream.on('data', onStreamedTweet)

      stream.on('error', function(err) {
        console.error('Error from tweet stream: %s', err)
        fallback()
      })

      stream.on('destroy', function(data) {
        console.log('Tweet stream destroyed: %s', data)
        fallback()
      })
    })
  })
}

function onStreamedTweet(tweet) {
  if (settings.filterRTs && isRT(tweet)) {
    console.log('Filtered out a retweet.')
    return
  }

  redisTweets.storeStream(tweet, function(err, storedTweet) {
    if (err) {
      console.log('Error storing tweet: %s', err)
      return stop()
    }
    ee.emit('tweet', storedTweet)
  })
}

// Allow starting via `node poller.js`
if (require.main === module) {
  start()
}
