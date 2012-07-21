var redis = require('redis')
  , async = require('async')

var settings = require('./settings')

var $r = redis.createClient(settings.redisPort, settings.redisHost)

$r.on('error', function (err) {
  console.error('Redis Error: %s', err)
})

if (settings.redisAuth) {
  $r.auth(settings.redisAuth)
}

if (settings.redisDatabase) {
  $r.select(settings.redisDatabase)
}

exports.connection = function() {
  return $r
}

exports.info = function(cb) {
  async.auto({
    tweets: function(cb) {
      $r.zcard('tweets.cron', cb)
    }
  , INFO: function(cb) {
      $r.info(function(err, info) {
        if (err) return cb(err)
        var INFO = {}
        info.split(/\r?\n/).sort().forEach(function(item) {
          if (!item) return
          var parts = item.split(':')
          INFO[parts[0]] = parts[1]
        })
        cb(null, INFO)
      })
    }
  }, cb)
}
