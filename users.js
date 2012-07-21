var redis = require('./redis')

module.exports = {
  store: store
, byId: byId
}

var $r = redis.connection()

function store(user, cb) {
  $r.sismember('users', user.id, function(err, exists) {
    if (err) return cb(err)
    if (exists) return cb(null)
    var multi = $r.multi()
    multi.sadd('users', user.id)
    multi.hmset('users:#' +  user.id, user)
    multi.exec(function(err) {
      if (err) return cb(err)
      cb(null)
    })
  })
}

function byId(id, cb) {
  $r.hgetall('users:#' + id, function(err, user) {
    if (err) return cb(err)
    if (!user) return cb(null, null)
    $r.sismember('admins', user.name, function(err, admin) {
      if (err) return cb(err)
      user.isAdmin = !!admin
      cb(null, user)
    })
  })
}
