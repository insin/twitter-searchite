exports.extend = function(dest, src) {
  if (src) {
    for (var prop in src) {
      if (src.hasOwnProperty(prop)) {
        dest[prop] = src[prop]
      }
    }
  }
  return dest
}

exports.pluralise = function(number) {
  return (number == 1 ? '' : 's')
}
