import { config } from '/config.js'

var healtchCheck
if (pipy.thread.id === 0 && config.healthCheck.enabled === 'true') { // run in single thread
  var interval = Number.parseInt(config.healthCheck.interval)
  var failureThreshold = Number.parseInt(config.healthCheck.failureThreshold)
  var successThreshold = Number.parseInt(config.healthCheck.successThreshold)
  var backoffRate = Number.parseInt(config.healthCheck.backoffRate)
  var brokers = config.brokers.map(b => ({
    addr: b.addr,
    capicity: Number.parseInt(b.capicity),
    failureCount: 0,
    successCount: 0,
    healthy: true,
    retries: 0,
    retryTick: 1
  }))
  var unhealthyBrokers = {}

  var doSuccess = (target) => {
    var key = target.addr
    if (!target.healthy) { // unhealthy
      if (++target.successCount >= successThreshold) { // unhealthy -> healthy
        target.healthy = true
        target.failureCount = 0
        target.retries = 0
        target.retryTick = 0
        target.successCount = 0
        delete unhealthyBrokers[target.addr]
      }
    }
  }

  var doFailure = (target) => {
    var key = target.addr
    if (target.healthy) {
      if (++target.failureCount >= failureThreshold) { // healthy -> unhealty
        target.healthy = false
        unhealthyBrokers[target.addr] = 0
      }
    } else { // unhealthy
      target.retries++
      target.retryTick = Math.pow(backoffRate, target.retries)
    }
  }

  var checkPromises
  var $target
  var $resolve

  healtchCheck = pipeline($ => $
    .onStart(new Data)
    .repeat(() => new Timeout(interval).wait().then(true)).to($ => $
      .handleStreamStart(function () {
        println('Health checking starting ...')
      })
      .replaceData(function () {
        var messages = []
        checkPromises = []
        brokers.forEach(broker => {
          if (broker.healthy || --broker.retryTick <= 0) { // check the healthy one and unhealthy one which should retry ONLY
            var resolve
            checkPromises.push(new Promise(r => resolve = r))
            messages.push(new Message({ broker, resolve: resolve }))
          }
        })
        messages.push(new StreamEnd) // for next repeat
        return messages
      })
      .demux().to($ => $
        .handleMessageStart(function (msg) {
          $target = msg.head.broker
          $resolve = msg.head.resolve
        })
        .connect(() => $target.addr,
          {
            connectTimeout: 0.1,
            readTimeout: 0.1,
            idleTimeout: 0.1,
          }
        )
        .replaceData(
          () => new Data
        )
        .replaceStreamEnd(e => {
          if (!e.error || e.error === "ReadTimeout" || e.error === "IdleTimeout") {
            console.log(`healthy -> ${$target.addr} ...`)
            doSuccess($target)
          } else {
            console.log(`unhealthy -> ${$target.addr} ...`)
            doFailure($target)
          }
          $resolve()
          return new Message
        })
      )
      .wait(() => {
        return Promise.all(checkPromises)
      })
    )
  )

  pipy.listen(config.healthCheck.port, $=>$
    .serveHTTP(
      function(req) {
        switch(req.head.path) {
          case '/unhealthy':
            return new Message(
              { headers: { 'content-type': 'application/json' }},
              JSON.encode(Object.keys(unhealthyBrokers))
            )
        }
      }
    )
  )
}
export default healtchCheck

