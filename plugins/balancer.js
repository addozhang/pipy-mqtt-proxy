import config from '/config.js'

var pool = ['198.19.249.11', '198.19.249.12', '198.19.249.13']
var quotas = pool.reduce(function (acc, ip) {
  acc[ip] = new algo.Quota(30);
  return acc;
}, {})
var alloc = () => {
  return Object.entries(quotas).find(([ip, q]) => q.consume(1) === 1)
}
var balancer = new algo.LoadBalancer(config.brokers, { algorithm: 'round-robin' })

var $ctx
var $conn
var $localAddr
export default pipeline($ => $
  .onStart(function (ctx) {
    $ctx = ctx
    $conn = balancer.allocate()
    $ctx.target = $conn.target
  })
  .onEnd(() => {
    $conn?.free()
    $localAddr?.[1] && $localAddr[1].produce(1)
  })
  .mux(() => $ctx).to($ => $
    .fork().to($ => $
      .encodeMQTT()
      .connect(
        () => $conn.target,
        {
          bind: () => {
            if ($localAddr = alloc()) {
              return $localAddr[0]
            }
            return undefined
          }
        }
      )
      .decodeMQTT()
      .swap(() => $ctx.down)
    )
  )
)