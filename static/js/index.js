void function() {

var forEach = Array.prototype.forEach

var POLL_INTERVAL = context.pollInterval
  , TIMESTAMP_UPDATE_INTERVAL = 60000

var latestTweetId = context.latestTweetId
  , earliestTweetId = context.earliestTweetId
  , infiniteScroll = context.infiniteScroll

var newTweetHTML = []
  , newTweetCount = 0
  , loadingNextPage = false

function extend(dest, src) {
  for (var prop in src) {
    if (src.hasOwnProperty(prop)) {
      dest[prop] = src[prop]
    }
  }
  return dest
}

function pluralise(number) {
  return (number == 1 ? '' : 's')
}

extend(moment.relativeTime, {
  s: 'now'
, m: '1m', mm: '%dm'
, h: '1h', hh: '%dh'
, d: '1d', dd: '%dd'
, M: '1m', MM: '%dm'
, y: '1y', yy: '%dy'
})

/**
 * Basic XHR wrapper for GET requests.
 */
function get(url, cb) {
  var xhr = new XMLHttpRequest()
  xhr.open('GET', url, true)
  xhr.onreadystatechange = function(){
    if (xhr.readyState == 4) {
      if (xhr.status == 200) {
        cb(null, xhr.responseText)
      }
      else {
        cb(xhr.responseText)
      }
    }
  }
  xhr.send(null)
}

function getNewTweets() {
  get('/new/' + latestTweetId, onNewTweetsReceived)
}

function onNewTweetsReceived(err, response) {
  if (err) return console.error(err)
  var obj = JSON.parse(response)
  if (obj.count) {
    latestTweetId = obj.latestTweetId
    newTweetCount += obj.count
    newTweetHTML.unshift(obj.html)
    var newTweetsBar = document.getElementById('new-tweets-bar')
    newTweetsBar.style.display = ''
    newTweetsBar.innerHTML = newTweetCount + ' new Tweet' + pluralise(newTweetCount)
  }
  setTimeout(getNewTweets, POLL_INTERVAL)
}

function showNewTweets() {
  var tweets = document.getElementById('tweets')
    , newTweetsBar = document.getElementById('new-tweets-bar')
    , fragment = document.createDocumentFragment()
    , div = document.createElement('div')
    , now = moment()
  newTweetHTML.forEach(function(html) {
    div.innerHTML = html
    while(div.firstChild) {
      updateTweetTimestamp(div.firstChild, now)
      registerTweetEventHandlers(div.firstChild)
      fragment.appendChild(div.firstChild)
    }
  })
  tweets.insertBefore(fragment, tweets.firstChild)
  newTweetsBar.style.display = 'none'
  newTweetsBar.innerHTML = '0 new Tweets'
  newTweetHTML = []
  newTweetCount = 0
}

function getTweetsForUser(userId, tweetEl) {
  var userTweets = document.getElementById('user-tweets')
  userTweets.innerHTML = 'Loading...'
  userTweets.style.top = tweetEl.offsetTop + 'px'

  get('/user/' + userId, function(err, response) {
    if (err) {
      console.error(err)
      userTweets.innerHTML = 'Error loading user Tweets'
    }
    else {
      userTweets.innerHTML = response
      userTweets.querySelector('button.close').onclick = function() {
        userTweets.innerHTML = ''
      }
    }
  })
}

function getNextPageOfTweets() {
  loadingNextPage = true
  var loadingBar = document.getElementById('loading-bar')
  loadingBar.style.display = ''
  if (!infiniteScroll) {
    var moreTweets = document.getElementById('more-tweets')
    moreTweets.style.display = 'none'
  }
  get('/page/' + earliestTweetId, onNextPageReceived)
}

function onNextPageReceived(err, response) {
  // Undo loading status
  loadingNextPage = false
  var loadingBar = document.getElementById('loading-bar')
  loadingBar.style.display = 'none'
  if (!infiniteScroll) {
    var moreTweets = document.getElementById('more-tweets')
    moreTweets.style.display = ''
  }

  if (err) return console.error(err)
  var obj = JSON.parse(response)
  if (obj.count) {
    earliestTweetId = obj.earliestTweetId
    // Display the new Tweets
    var tweets = document.getElementById('tweets')
      , fragment = document.createDocumentFragment()
      , div = document.createElement('div')
      , now = moment()
    div.innerHTML = obj.html
    while(div.firstChild) {
      updateTweetTimestamp(div.firstChild, now)
      registerTweetEventHandlers(div.firstChild)
      fragment.appendChild(div.firstChild)
    }
    tweets.appendChild(fragment)
  }
  else if (!infiniteScroll) {
    // Keep the More Tweets bar hidden if we didn't get any more Tweets
    moreTweets.style.display = 'none'
  }
}

function updateTweetTimestamps() {
  var tweets = document.querySelectorAll('.tweet')
    , now = moment()
  forEach.call(tweets, function(tweet) {
    updateTweetTimestamp(tweet, now)
  })
  setTimeout(updateTweetTimestamps, TIMESTAMP_UPDATE_INTERVAL)
}

function updateTweetTimestamp(tweet, now) {
  var timestamp = tweet.querySelector('span[data-time]')
    , ctime = timestamp.getAttribute('data-time')
    , newTimestamp = moment(+ctime).from(now, true)
  if (newTimestamp != timestamp.innerHTML) {
    timestamp.innerHTML = newTimestamp
  }
}

function registerTweetEventHandlers(tweetEl) {
  var span = tweetEl.querySelector('span[data-userid]')
    , userId = span.getAttribute('data-userid')
  span.parentNode.insertBefore(document.createTextNode(' · '), span)
  span.appendChild(document.createTextNode('All Tweets'))
  span.onclick = getTweetsForUser.bind(null, userId, tweetEl)
}

// Set up handler for and hide the new tweets bar
var newTweetsBar = document.getElementById('new-tweets-bar')
newTweetsBar.onclick = showNewTweets
newTweetsBar.style.display = 'none'

// Set up paging
var loadingBar = document.getElementById('loading-bar')
loadingBar.style.display = 'none'

if (infiniteScroll) {
  window.onscroll = function() {
    var html = document.querySelector('html')
      , body = document.body
    return function() {
      if (loadingNextPage) return
      var scroll = (html.scrollTop || body.scrollTop) + window.innerHeight
      if (body.scrollHeight - scroll < 5) {
        getNextPageOfTweets()
      }
    }
  }()
}
else {
  var moreTweets = document.getElementById('more-tweets')
  moreTweets.onclick = getNextPageOfTweets
}

// Add 'All Tweets' controls to initial Tweets
var initialTweets = document.querySelectorAll('#tweets .tweet')
forEach.call(initialTweets, registerTweetEventHandlers)

// Start polling for new Tweets
setTimeout(getNewTweets, POLL_INTERVAL)
// Update Tweet timestamps once a minute
setTimeout(updateTweetTimestamps, TIMESTAMP_UPDATE_INTERVAL)

}()