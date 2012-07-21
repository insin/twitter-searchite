var redis = require('./redis')

module.exports = {
  store: store
, get: get
, byId: byId
, active: active
, del: del
}

var $r = redis.connection()

/**
 * Saves or updates a search, based on whether or not it has an id.
 */
function store(search, cb) {
  if (!search.id) {
    $r.incr('searches:id', function(err, id) {
      if (err) return cb(err)
      search.id = id
      var multi = $r.multi()
      multi.zadd('searches', search.id, search.id)
      multi.hmset('searches:#' +  search.id, search)
      multi.exec(cb)
    })
  }
  else {
    $r.hmset('searches:#' + search.id, search, cb)
  }
}

/**
 * Gets a search by id.
 */
function byId(id, cb) {
  $r.hgetall('searches:#' + id, cb)
}

/**
 * Gets all searches.
 */
function get(cb) {
  $r.zrange('searches', 0, -1, function(err, ids) {
    if (err) return cb(err)
    if (!ids.length) return cb(null, ids)
    var multi = $r.multi()
    ids.forEach(function(id) { multi.hgetall('searches:#' + id) })
    multi.exec(cb)
  })
}

/**
 * Gets the search currently marked as active.
 */
function active(searchId, cb) {
  if (typeof searchId == 'function') {
    cb = searchId
    $r.get('searches:active', function(err, activeId) {
      if (err) return cb(err)
      byId(activeId, cb)
    })
  }
  else {
    $r.set('searches:active', searchId, cb)
  }
}

/**
 * Deletes the given search.
 */
function del(search, cb) {
  var multi = $r.multi()
  multi.zrem('searches', search.id)
  multi.del('searches:#' + search.id)
  multi.exec(cb)
}
