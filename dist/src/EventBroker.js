"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ActivityBroker = ActivityBroker;
exports.DefinitionBroker = DefinitionBroker;
exports.MessageFlowBroker = MessageFlowBroker;
exports.ProcessBroker = ProcessBroker;
exports.EventBroker = EventBroker;

var _smqp = require("smqp");

var _Errors = require("./error/Errors");

function ActivityBroker(activity) {
  const executionBroker = ExecutionBroker(activity, 'activity');
  return executionBroker;
}

function ProcessBroker(owner) {
  return ExecutionBroker(owner, 'process');
}

function DefinitionBroker(owner, onBrokerReturn) {
  return ExecutionBroker(owner, 'definition', onBrokerReturn);
}

function MessageFlowBroker(owner) {
  const eventBroker = EventBroker(owner, {
    prefix: 'messageflow',
    autoDelete: false,
    durable: false
  });
  const broker = eventBroker.broker;
  broker.assertExchange('message', 'topic', {
    durable: true,
    autoDelete: false
  });
  broker.assertQueue('message-q', {
    durable: true,
    autoDelete: false
  });
  broker.bindQueue('message-q', 'message', 'message.#');
  return eventBroker;
}

function ExecutionBroker(brokerOwner, prefix, onBrokerReturn) {
  const eventBroker = EventBroker(brokerOwner, {
    prefix,
    autoDelete: false,
    durable: false
  }, onBrokerReturn);
  const broker = eventBroker.broker;
  broker.assertExchange('api', 'topic', {
    autoDelete: false,
    durable: false
  });
  broker.assertExchange('run', 'topic', {
    autoDelete: false
  });
  broker.assertExchange('format', 'topic', {
    autoDelete: false
  });
  broker.assertExchange('execution', 'topic', {
    autoDelete: false
  });
  const runQ = broker.assertQueue('run-q', {
    durable: true,
    autoDelete: false
  });
  const formatRunQ = broker.assertQueue('format-run-q', {
    durable: true,
    autoDelete: false
  });
  const executionQ = broker.assertQueue('execution-q', {
    durable: true,
    autoDelete: false
  });
  broker.bindQueue(runQ.name, 'run', 'run.#');
  broker.bindQueue(formatRunQ.name, 'format', 'run.#');
  broker.bindQueue(executionQ.name, 'execution', 'execution.#');
  return eventBroker;
}

function EventBroker(brokerOwner, options, onBrokerReturn) {
  const broker = new _smqp.Broker(brokerOwner);
  const pfx = options.prefix;
  broker.assertExchange('event', 'topic', options);
  broker.on('return', onBrokerReturn || onBrokerReturnFn);
  return {
    eventPrefix: pfx,
    broker,
    on,
    once,
    waitFor,
    emit,
    emitFatal
  };

  function on(eventName, callback, eventOptions = {
    once: false
  }) {
    const key = getEventRoutingKey(eventName);
    if (eventOptions.once) return broker.subscribeOnce('event', key, eventCallback, eventOptions);
    return broker.subscribeTmp('event', key, eventCallback, { ...eventOptions,
      noAck: true
    });

    function eventCallback(routingKey, message, owner) {
      if (eventName === 'error') return callback((0, _Errors.makeErrorFromMessage)(message));
      callback(owner.getApi(message));
    }
  }

  function once(eventName, callback, eventOptions = {}) {
    return on(eventName, callback, { ...eventOptions,
      once: true
    });
  }

  function waitFor(eventName, onMessage) {
    const key = getEventRoutingKey(eventName);
    return new Promise((resolve, reject) => {
      const consumers = [broker.subscribeTmp('event', key, eventCallback, {
        noAck: true
      }), broker.subscribeTmp('event', '*.error', errorCallback, {
        noAck: true
      })];

      function eventCallback(routingKey, message, owner) {
        if (onMessage && !onMessage(routingKey, message, owner)) return;
        unsubscribe();
        return resolve(owner.getApi(message));
      }

      function errorCallback(routingKey, message, owner) {
        if (!message.properties.mandatory) return;
        unsubscribe();
        return reject((0, _Errors.makeErrorFromMessage)(message, owner));
      }

      function unsubscribe() {
        consumers.forEach(consumer => consumer.cancel());
      }
    });
  }

  function onBrokerReturnFn(message) {
    if (message.properties.type === 'error') {
      const err = (0, _Errors.makeErrorFromMessage)(message);
      throw err;
    }
  }

  function getEventRoutingKey(eventName) {
    if (eventName.indexOf('.') > -1) return eventName;

    switch (eventName) {
      case 'wait':
        {
          return `activity.${eventName}`;
        }

      default:
        {
          return `${pfx}.${eventName}`;
        }
    }
  }

  function emit(eventName, content = {}, props = {}) {
    broker.publish('event', `${pfx}.${eventName}`, { ...content
    }, {
      type: eventName,
      ...props
    });
  }

  function emitFatal(error, content = {}) {
    emit('error', { ...content,
      error
    }, {
      mandatory: true
    });
  }
}