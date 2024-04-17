var publishCounter = new stats.Counter('mqtt_publish_count', ['clientID', 'topic', 'qos'])
var publishACKCounter = new stats.Counter('mqtt_publish_ack_count', ['clientID', 'qos'])
var receiveCounter = new stats.Counter('mqtt_receive_count', ['clientID', 'topic', 'qos'])

var $clientID
export var request = pipeline($ => $
  .onStart(ctx => void ($clientID = ctx.connMsg?.payload?.clientID))
  .handleMessageStart(
    function (msg) {
      if (msg?.head?.type === 'PUBLISH') {
        publishCounter.withLabels($clientID, msg?.head?.topicName, msg?.head?.qos).increase()
      }
    }
  )
  .pipeNext()
)

export var response = pipeline($ => $
  .onStart(ctx => void ($clientID = ctx.connMsg?.payload?.clientID))
  .handleMessageStart(
    function (msg) {
      if (msg?.head?.type === 'PUBACK') {
        publishACKCounter.withLabels($clientID, msg?.head?.qos).increase()
      }
      if (msg?.head?.type === 'PUBLISH') {//msg received by subscriber
        receiveCounter.withLabels($clientID, msg?.head?.topicName, msg?.head?.qos).increase()
      }
    }
  )
  .pipeNext()
)