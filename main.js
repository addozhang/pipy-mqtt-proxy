import { config } from './config.js'

import healthCheck from './healthcheck.js'

if (pipy.thread.id === 0) { // run in single thread
  healthCheck.spawn()
}

var plugins
var main
//init plugins
plugins = config.plugins.map(
  name => pipy.import(`./plugins/${name}.js`)
)
var reqPlugins = plugins.map(
  p => {
    return p.request ? p.request : p.default
  }
)
var respPlugins = plugins.filter(p => p.response).map(
  p => {
    return p.response
  }
).reverse()
if (respPlugins.length == 0) {
  respPlugins.push(pipeline($ => $.pipeNext()))
}

var $ctx
var $inbound
main = pipeline($ => $
  .onStart(
    function () {
      $ctx = {
        inbound: $inbound,
        down: new pipeline.Hub
      }
    }
  )
  .onEnd(
    function () {
      if ($ctx?.connQuota) {
        $ctx.connQuota.produce(1)
      }
    }
  )
  .decodeMQTT()
  .handleMessageStart(function (msg) {
    $ctx.protocalLevel = msg.head.protocolLevel
    $ctx.type = msg?.head?.type
    $ctx.target = null
    //record connection message
    if (msg?.head?.type == 'CONNECT') {
      $ctx.connMsg = { head: msg.head }
    }
  })
  .handleMessageEnd(
    function (msg) {
      if ($ctx.type == 'CONNECT') {
        $ctx.connMsg.payload = msg.payload
      }
    }
  )
  .fork().to($ => $
    .onStart(() => Promise.resolve())
    .pipe(reqPlugins, () => $ctx)
  )
  .replace((_, i) => i === 0 ? new Data : undefined)
  .swap(() => $ctx.down)
  .pipe(respPlugins, () => $ctx)
  .encodeMQTT()
)

// plain: mqtt
if (config.listen) {
  pipy.listen(config.listen, $ => $
    .onStart(ib => void ($inbound = ib))
    .pipe(main)
  )
}
// TLS: mqtts
if (config.listenTLS) {
  var cert = new crypto.CertificateChain(
    pipy.load(config.listenTLS.cert)
  )
  var key = new crypto.PrivateKey(
    pipy.load(config.listenTLS.key)
  )
  pipy.listen(config.listenTLS.port, $ => $
    .onStart(ib => void ($inbound = ib))
    .acceptTLS({
      certificate: { cert, key }
    })
    .to(main)
  )
}