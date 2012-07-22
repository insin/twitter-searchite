var async = require('async')

module.exports = {
  info: info
}

var $r = require('./connection')

function info(cb) {
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
