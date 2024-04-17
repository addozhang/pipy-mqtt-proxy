import config from '/config.js'

var connQuotaBlock = new algo.Quota(
  Number.parseFloat(config.limits.conn.rate / __thread.concurrency),
  { per: 1 }
)
var connQuota = new algo.Quota(Number.parseFloat(config.limits.conn.rate))
var $ctx
export default pipeline($ => $
  .onStart(
    function(ctx) {
      $ctx = ctx
    }
  )
  .pipe(
    function (event) {
      if (event instanceof MessageStart) {
        var type = event?.head?.type
        switch (type) {
          case 'CONNECT':
            if (config.limits.conn.fastFail === 'true') {
              if (connQuota.consume(1) !== 1) {
                return 'conn-fastFail'
              }
              $ctx.connQuota = connQuota
              return 'bypass'
            }
            return 'conn-throttle'
          case 'PUBLISH':
            return 'pub-throttle'
          default: return 'bypass'
        }
      }
      return 'bypass'
    }, {
    'conn-throttle': $ => $
      .throttleMessageRate(connQuotaBlock, { blockInput: config.limits.conn.blockInput })
      .pipeNext()
    ,
    'conn-fastFail': $ => $
      .replaceMessage(
        [new Message({ type: 'CONNACK', reasonCode: 159, sessionPresent: false }, 'Connection rate exceeded'), new StreamEnd]
      )
      .fork().to($=>$.swap(() => $ctx.down))
    ,
    'pub-throttle': $ => $
      .throttleMessageRate(
        new algo.Quota(Number.parseFloat(config.limits.pub.rate / __thread.concurrency), { per: 1 }),
        { blockInput: config.limits.conn.blockInput })
      .pipeNext()
    ,
    'bypass': $ => $.pipeNext()
  })
)