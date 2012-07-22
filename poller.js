var EventEmitter = require('events').EventEmitter
  , format = require('util').format

var async = require('async')
  , Concur = require('Concur')
  , Twitter = require('ntwitter')

var utils = require('./utils')
  , redis = require('./redis')

var pluralise = utils.pluralise
  , extend = utils.extend

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

// ------------------------------------------------------------------- Enums ---

var States = {
  STOPPED  : 'STOPPED'
, STARTING : 'STARTING'
, RUNNING  : 'RUNNING'
, STOPPING : 'STOPPING'
}

var Methods = {
  STREAMING : 'STREAMING'
, POLLING   : 'POLLING'
}

var TRANSITION = true

// ================================================================== Poller ===

var Poller = module.exports = Concur.extend({
  __mixin__: EventEmitter

, constructor: function Poller(kwargs) {
    // Poller state
    this.state = States.STOPPED
    this.method = null // Defined when state is RUNNING
    this.stream = null
    this.timeoutId = null
    // User-supplied state
    kwargs = extend({
      search: null
    , filterRTs: true
    , pollInterval: 60
    , ntwitterConfig: {}
    }, kwargs)
    if (kwargs.search === null) throw new Error('Pollers need a search config.')
    this.search = kwargs.search
    this.filterRTs = kwargs.filterRTs
    this.pollInterval = kwargs.pollInterval
    // Make dependencies mockable
    this._db = redis
    this._twitter = new Twitter(kwargs.ntwitterConfig)
  }

, stopped: function(transition) {
    if (!transition) return this.state === States.STOPPED
    this.state = States.STOPPED
  }
, starting: function(transition) {
    if (!transition) return this.state === States.STARTING
    this.state = States.STARTING
  }
, running: function(transition) {
    if (!transition) return this.state === States.RUNNING
    this.state = States.RUNNING
  }
, stopping: function(transition) {
    if (!transition) return this.state === States.STOPPING
    this.state = States.STOPPING
  }

, polling: function(transition) {
    return this.method === Methods.POLLING
  }
, streaming: function(transition) {
    return this.method === Methods.STREAMING
  }
})

// --------------------------------------------------------------- Lifecycle ---

/**
 * Starts the poller.
 */
Poller.prototype.start = function() {
  this.starting(TRANSITION)
  this.searchForNewTweets()
}

/**
 * Stops the poller.
 */
Poller.prototype.stop = function() {
  this.stopping(TRANSITION)
  try {
    if (this.timeoutId !== null) {
      clearTimeout(this.timeoutId)
    }
    if (this.stream !== null) {
      this.stream.destroySilent()
    }
  }
  finally {
    this.afterStop()
  }
}

/**
 * Resets state back to STOPPED.
 */
Poller.prototype.afterStop = function() {
  this.stopped(TRANSITION)
  this.method = null
  this.stream = null
  this.timeoutId = null
  console.log('Poller stopped.')
}

// -------------------------------------------------------------- Search API ---

/**
 * Entry point for using the Search API.
 */
Poller.prototype.searchForNewTweets = function() {
  var poller = this
  this._db.tweets.maxId(function(err, sinceId) {
    if (err) throw err
    sinceId = sinceId || 0
    console.log('Searching for tweets with "%s", since #%s...',
        poller.search.searchText, sinceId)
    poller._twitter.search(poller.search.searchText, {
      rpp: 100
    , result_type: 'recent'
    , since_id: sinceId
    , include_entities: true
    }, poller.onSearchResults.bind(poller))
  })
}

/**
 * Handler for results from the Search API.
 */
Poller.prototype.onSearchResults = function(err, search) {
  if (err) throw err
  if (!search.results.length) {
    console.log('No new tweets found.')
    return this.afterSearch()
  }
  // We got at least one search result, so store the max tweet id we've seen
  // before proceeding.
  var poller = this
  this._db.tweets.maxId(search.max_id_str, function(err) {
    if (err) throw err
    var tweets = search.results
      , filtered = '.'
    if (poller.filterRTs) {
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
      return poller.afterSearch()
    }
    async.mapSeries(tweets, poller._db.tweets.storeSearch,
    function(err, displayTweets) {
      if (err) throw err
      poller.afterSearch(displayTweets)
    })
  })
}

/**
 * Emits any tweets retrieved via the Search API and determines what to do next.
 */
Poller.prototype.afterSearch = function(tweets) {
  if (tweets) {
    this.emit('tweets', tweets)
  }
  // If we're still starting up, try to initiate streaming
  if (this.starting()) {
    this.startStreaming()
  }
  // Otherwise, if we're polling wait for the configured time
  else if (this.polling()) {
    this.wait()
  }
}

/**
 * Sets a timeout to call the search function again.
 */
Poller.prototype.wait = function() {
  this.timeoutId = setTimeout(this.searchForNewTweets.bind(this),
                              this.pollInterval * 1000)
  console.log('Waiting for %ss...', this.pollInterval)
}

/**
 * Initiates falling back to using the Search API if streaming fails.
 */
Poller.prototype.fallback = function() {
  // If we're stopping, we don't care if streaming goes down
  if (this.stopping()) return
  console.log('Falling back to polling the Search API.')
  // If we're falling back while starting, we're done starting up
  if (this.starting()) {
    this.running(TRANSITION)
  }
  this.method = Methods.POLLING
  this.wait()
}

// ----------------------------------------------------------- Streaming API ---

Poller.prototype.startStreaming = function() {
  var poller = this
  this._twitter.verifyCredentials(function(err, data) {
    if (err) {
      console.error('Error verifying credentials: %s', err)
      return poller.fallback()
    }

    poller._twitter.stream('statuses/filter', {'track': poller.search.filterText},
    function(stream) {
      console.log('Streaming tweets with filter "%s"...', poller.search.filterText)
      poller.stream = stream
      stream.on('data', poller.onStreamData.bind(poller))
      stream.on('error', poller.onStreamError.bind(poller))
      stream.on('destroy', poller.onStreamDestroyed.bind(poller))
      poller.running(TRANSITION)
      poller.method = Methods.STREAMING
    })
  })
}

Poller.prototype.onStreamData = function(tweet) {
  if (this.filterRTs && isRT(tweet)) {
    return console.log('Filtered out a retweet.')
  }

  var poller = this
  this._db.tweets.storeStream(tweet, function(err, storedTweet) {
    if (err) {
      console.error('Error storing tweet: %s', err)
      return poller.stop()
    }
    poller.emit('tweet', storedTweet)
  })
}

Poller.prototype.onStreamError = function(err, statusCode) {
  console.error('Error from tweet stream: %s', err)
  if (statusCode) {
    console.error('Error status code: %s', statusCode)
  }
  this.fallback()
}

Poller.prototype.onStreamDestroyed = function(data) {
  console.log('Tweet stream destroyed: %s', data)
  this.fallback()
}
