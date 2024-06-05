var config = YAML.decode(
  pipy.load('config.yaml')
)
// unhealthy brokers cache
var unhealthyBrokers = new algo.Cache()
// global logger
var logger = new logging.JSONLogger('console').toStdout()

var brokerTargets = Object.fromEntries(config.brokers.map(b => [b.addr, b]))
var brokerCapacities = config.brokers.reduce(function (caps, i) {
  caps = caps + Number.parseInt(i.capicity)
  return caps
}, 0)
var connRate = Number.parseInt(config.limits.conn.rate)
var connQuota = new algo.Quota(connRate < brokerCapacities ? connRate : brokerCapacities, { key: 'conn' })

// valid a broker
//   1. add to unhealthy cache
//   2. decrease connection quota
var validBroker = (target) => {
  var previous = connQuota.current
  var pre = brokerCapacities
  brokerCapacities += Number.parseInt(target.capicity)
  if (connRate > pre) {
    if (connRate < brokerCapacities) {
      connQuota.produce((connRate - pre))
    } else {
      connQuota.produce(target.capicity)
    }
  }
  logger.log(`Broker ${target.addr} valid, change connection quota from ${previous} to ${connQuota.current} `)
}

// invalid a broker:
//   1. remove from unhealthy cache
//   2. increate connection quota
var invalidBroker = (target) => {
  var previous = connQuota.current
  var pre = brokerCapacities
  brokerCapacities -= Number.parseInt(target.capicity)
  if (connRate < pre && connRate > brokerCapacities) {
    connQuota.consume((connRate - brokerCapacities))
  } else if (connRate >= pre) {
    connQuota.consume(Number.parseInt(target.capicity))
  }
  logger.log(`Broker ${target.addr} invalid, change connection quota from ${previous} to ${connQuota.current} `)
}

// health check
if (config.healthCheck.enabled === 'true') {
  var agent = new http.Agent(`localhost:${config.healthCheck.port}`)
  var lastUnhealthies = {}
  var healthCheck = function () {
    agent.request('GET', '/unhealthy').then(
      function (res) {
        var unhealthies = Object.fromEntries(JSON.decode(res.body).map(addr => [addr, true]))
        Object.keys(lastUnhealthies).forEach(addr => {
          if (!unhealthies[addr]) {
            pipy.thread.id === 0 && validBroker(brokerTargets[addr])
            if (unhealthyBrokers.get(addr)) {
              unhealthyBrokers.remove(addr)
            }
            delete lastUnhealthies[addr]
          }
        })
        Object.keys(unhealthies).forEach(addr => {
          if (!lastUnhealthies[addr]) {
            pipy.thread.id === 0 && invalidBroker(brokerTargets[addr])
            unhealthyBrokers.set(addr, true)
            lastUnhealthies[addr] = true
          }
        })
      }
    )
    new Timeout(Number.parseInt(config.healthCheck.interval)).wait().then(healthCheck)
  }

  healthCheck()
}

export { config, logger, unhealthyBrokers, connQuota, validBroker, invalidBroker }