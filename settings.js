module.exports = {
// Twitter
  // App and auth settings are currently optional
  consumerKey: ''
, consumerSecret: ''
, accessToken: ''
, accessTokenSecret: ''

// Poller
  // Search text
, search: '#nodejs OR Node.js'
  // Wait time between Search API calls checking for new Tweets (seconds)
, pollInterval: 60
  // Should the server start the poller?
, serverPoll: true
  // Should the poller ignore Tweets which appear to be RTs?
, ignoreRTs: true

// Redis
, redisPort: 6379
, redisHost: '127.0.0.1'
, redisDatabase: 0
  // Password, or false if auth is nor required
, redisAuth: false

// Frontend
  // Number of Tweets per page
, tweetsPerPage: 50
  // Wait time between XHR calls checking for new Tweets (seconds)
, browserPollInterval: 30
  // Use infinite scrolling? If not, a More Tweets control will be displayed
, infiniteScroll: false
}
