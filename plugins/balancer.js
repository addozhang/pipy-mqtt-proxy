import {config, unhealtyBrokers} from '/config.js'
// connecting latency
var connectLatency = new stats.Histogram(
  'connect_latency',
  new Array(13).fill().map((_,i) => Math.pow(1.5, i+1)|0).concat([Infinity]),
  ['broker'],
)
// load balancer
var addrs = config.brokers.map(b => b.addr)
var balancer = new algo.LoadBalancer(addrs, { algorithm: 'round-robin' })

var $ctx
var $conn
var $requestTime
export default pipeline($ => $
  .onStart(function (ctx) {
    $ctx = ctx
    $conn = balancer.allocate(undefined, unhealtyBrokers)
    $ctx.target = $conn.target
  })
  .onEnd(() => {
    $conn?.free()
  })
  .handleMessageStart(
    function(msg) {
      if (msg?.head?.type === 'CONNECT') {
        $requestTime = Date.now()
      }
    }
  )
  .encodeMQTT()
  .connect(() => $conn.target)
  .decodeMQTT()
  .handleMessageStart(
    function(msg) {
      if (msg?.head?.type === 'CONNACK') {
        connectLatency.withLabels($conn.target).observe(Date.now() - $requestTime)
      }
    }
  )
  .swap(() => $ctx.down)
)