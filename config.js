var config = YAML.decode(
  pipy.load('config.yaml')
)
// unhealthy brokers cache
var unhealthyBrokers = new algo.Cache()
// global logger
var logger = new logging.JSONLogger('console').toStdout()

var brokerCapacities = config.brokers.reduce(function (caps, i) {
  caps = caps + Number.parseInt(i.capicity)
  return caps
}, 0)
var connRate = Number.parseInt(config.limits.conn.rate)
var connQuota = new algo.Quota((connRate < brokerCapacities ? connRate : brokerCapacities) / __thread.concurrency, {key: 'conn'})

// valid a broker
//   1. add to unhealthy cache
//   2. decrease connection quota
var validBroker = (target) => {
  var previous = connQuota.current
  if (unhealthyBrokers.get(target.addr)) {
    unhealthyBrokers.remove(target.addr)
  }
  var pre = brokerCapacities
  brokerCapacities += target.capicity
  if (connRate > pre) {
    if (connRate < brokerCapacities) {
      connQuota.produce((connRate - pre) / __thread.concurrency)
    } else {
      connQuota.produce(target.capicity / __thread.concurrency)
    }
  }
  logger.log(`Broker ${target.addr} valid, change connection quota from ${previous * __thread.concurrency} to $
  {connQuota.current * __thread.concurrency} `)
}

// invalid a broker:
//   1. remove from unhealthy cache
//   2. increate connection quota
var invalidBroker = (target) => {
  var previous = connQuota.current
  unhealthyBrokers.set(target.addr, true)
  var pre = brokerCapacities
  brokerCapacities -= target.capicity
  if (connRate < pre && connRate > brokerCapacities) {
    connQuota.consume((connRate - brokerCapacities) / __thread.concurrency)
  } else if (connRate >= pre) {
    connQuota.consume(target.capicity / __thread.concurrency)
  }
  logger.log(`Broker ${target.addr} invalid, change connection quota from ${previous * __thread.concurrency} to ${connQuota.current * __thread.concurrency} `)
}

export { config, logger, unhealthyBrokers, connQuota, validBroker, invalidBroker }