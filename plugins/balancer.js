import config from '/config.js'

var balancer = new algo.LoadBalancer(config.brokers, { algorithm: 'round-robin' })

var $ctx
var $conn
export default pipeline($ => $
  .onStart(function (ctx) {
    $ctx = ctx
    $conn = balancer.allocate()
    $ctx.target = $conn.target
  })
  .onEnd(() => {
    $conn?.free()
  })
  .mux(() => $ctx).to($ => $
    .fork().to($ => $
      .encodeMQTT()
      .connect(() => $conn.target)
      .decodeMQTT()
      .swap(() => $ctx.down)
    )
  )
)