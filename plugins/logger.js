import {logger} from '/config.js'

var $ctx
var $reqHead
var $reqTime
var $reqSize
var $resHead
var $resTime
var $resSize

export var request = pipeline($ => $
  .onStart(ctx => void ($ctx = ctx))
  .handleMessageStart(
    function (msg) {
      $reqHead = msg.head
      $reqTime = Date.now()
    }
  )
  .handleData(
    function (data) {
      $reqSize += data.size
    }
  )
  .handleMessageEnd(
    function () {
      var ib = $ctx.inbound
      logger.log({
        remoteAddr: ib.remoteAddress,
        remotePort: ib.remotePort,
        req: $reqHead,
        reqSize: $reqSize,
        reqTime: $reqTime,
        endTime: Date.now(),
        broker: $ctx.target,
        clientID: $ctx.connMsg?.payload?.clientID,
      })
    }
  )
  .pipeNext()
)

export var response = pipeline($ => $
  .onStart(ctx => void ($ctx = ctx))
  .handleMessageStart(
    function (msg) {
      $resHead = msg.head
      $resTime = Date.now()
    }
  )
  .handleData(
    function (data) {
      $resSize += data.size
    }
  )
  .handleMessageEnd(
    function () {
      var ib = $ctx.inbound
      logger.log({
        remoteAddr: ib.remoteAddress,
        remotePort: ib.remotePort,
        res: $resHead,
        resSize: $resSize,
        resTime: $resTime,
        endTime: Date.now(),
        broker: $ctx.target,
        clientID: $ctx.connMsg?.payload?.clientID,
      })
    }
  )
  .pipeNext()
)

