import { config, connQuota } from '/config.js'

var connQuotaBlock = new algo.Quota(
  Number.parseInt(config.limits.conn.rate),
  { key: 'conn-block' }
)

var $ctx
export default pipeline($ => $
  .onStart(
    function (ctx) {
      $ctx = ctx
    }
  )
  .demux().to($ => $
    .pipe(
      function (event) {
        if (event instanceof MessageStart) {
          var type = event?.head?.type
          switch (type) {
            case 'CONNECT':
              if (config.limits.conn.fastFail === 'true') {
                if (connQuota.consume(1) !== 1) {
                  return connFastFail
                }
                //record to release when disconnecting in main pipeline
                $ctx.connQuota = connQuota
                return bypass
              }
              return connThrottle
            case 'PUBLISH':
              return pubThrottle
            default: return bypass
          }
        }
        return bypass
      })
  )
)

var connThrottle = pipeline($ => $
  .throttleMessageRate(connQuotaBlock, { blockInput: config.limits.conn.blockInput })
  .pipe(() => bypass)
)

var pubThrottle = pipeline($ => $
  .throttleMessageRate(
    new algo.Quota(Number.parseInt(config.limits.pub.rate), { key: 'pub', per: 1}),
    { blockInput: config.limits.conn.blockInput })
  .pipe(() => bypass)
)

var connFastFail = pipeline($ => $
  .replaceMessage(
    [new Message({ type: 'CONNACK', reasonCode: 159, sessionPresent: false }, 'Connection rate exceeded'), new StreamEnd]
  )
  .fork().to($ => $.swap(() => $ctx.down))
)

var bypass = pipeline($ => $
  .mux(() => $ctx).to($ => $
    .fork().to($ => $.pipeNext())
  ))