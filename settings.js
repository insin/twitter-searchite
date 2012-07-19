module.exports = {
// Twitter
  consumerKey: ''
, consumerSecret: ''
, accessToken: ''
, accessTokenSecret: ''

// Poller
  // Search text
, search: '#nodejs OR Node.js'
  // Stream filter
, stream: '#nodejs,Node.js'
  // Wait time between Search API calls checking for new Tweets (seconds)
, pollInterval: 60
  // Should the poller filter Tweets which appear to be RTs?
, filterRTs: true

// Redis
, redisPort: 6379
, redisHost: '127.0.0.1'
, redisDatabase: 0
  // Password, or false if auth is nor required
, redisAuth: false

// Frontend
  // Number of Tweets per page
, tweetsPerPage: 50
  // (true) Use infinite scrolling
  // (false) Show the More Tweets bar
, infiniteScroll: false
  // (true) Automatically display new Tweets
  // (false) Show the New Tweets bar
, autoDisplayNew: true
}
