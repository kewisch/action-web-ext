const npmConf = require('@pnpm/npm-conf')

module.exports = function getRegistryUrl (scope, npmrc) {
  var rc = npmrc ? { get: (key) => npmrc[key] } : npmConf()
  var url = rc.get(scope + ':registry') || rc.get('registry') || npmConf.defaults.registry
  return url.slice(-1) === '/' ? url : url + '/'
}
