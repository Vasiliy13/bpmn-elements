import Definition from '../../src/definition/Definition';
import testHelpers from '../helpers/testHelpers';

Feature('Shaking', () => {
  Scenario('a process with two start events', () => {
    let definition;
    Given('two start events, both waiting for a message and both ending with the same end event', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <sequenceFlow id="from22end" sourceRef="start2" targetRef="end" />
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    const messages = [];
    When('definition is ran', () => {
      definition.broker.subscribeTmp('event', 'activity.shake.end', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('the start events are shaken', () => {
      expect(messages).to.have.length(2);
    });

    And('execution sequence is presented in messages', () => {
      expect(messages[0].content).to.have.property('sequence').that.is.an('array');
      const sequence1 = messages[0].content.sequence;
      expect(sequence1[0]).to.have.property('id', 'start1');
      expect(sequence1[1]).to.have.property('id', 'from12end');
      expect(sequence1[2]).to.have.property('id', 'end');
      expect(sequence1).to.have.length(3);

      expect(messages[1].content).to.have.property('sequence').that.is.an('array');
      const sequence2 = messages[1].content.sequence;
      expect(sequence2[0]).to.have.property('id', 'start2');
      expect(sequence2[1]).to.have.property('id', 'from22end');
      expect(sequence2[2]).to.have.property('id', 'end');
      expect(sequence2).to.have.length(3);
    });

    let start1, start2;
    And('both start events are waiting for message', async () => {
      [start1, start2] = definition.getPostponed();
      expect(start1).to.have.property('id', 'start1');
      expect(start2).to.have.property('id', 'start2');
    });
  });

  Scenario('a process with a loopback flow', () => {
    let definition;
    Given('two start events, the second contains a looped flow', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from22Task" sourceRef="start2" targetRef="task" />
          <task id="task" />
          <sequenceFlow id="fromTask2Gateway" sourceRef="task" targetRef="gateway" />
          <exclusiveGateway id="gateway" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="end" />
          <sequenceFlow id="back2Task" sourceRef="gateway" targetRef="task">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      const context = await testHelpers.context(source);
      definition = Definition(context);
    });

    const messages = [];
    When('definition is ran', () => {
      definition.broker.subscribeTmp('event', 'activity.shake.end', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.broker.subscribeTmp('event', 'flow.shake.loop', (_, msg) => {
        messages.push(msg);
      }, {noAck: true});

      definition.run();
    });

    Then('execution sequence is presented in first start event shake end message', () => {
      expect(messages).to.have.length(3);

      expect(messages[0].content).to.have.property('sequence').that.is.an('array');
      const sequence = messages[0].content.sequence;
      expect(sequence[0]).to.have.property('id', 'start1');
      expect(sequence[1]).to.have.property('id', 'from12end');
      expect(sequence[2]).to.have.property('id', 'end');
      expect(sequence).to.have.length(3);
    });

    And('execution sequence is presented in second start event shake end message', () => {
      expect(messages).to.have.length(3);

      expect(messages[1].content).to.have.property('sequence').that.is.an('array');
      const sequence = messages[1].content.sequence;
      expect(sequence[0]).to.have.property('id', 'start2');
      expect(sequence[1]).to.have.property('id', 'from22Task');
      expect(sequence[2]).to.have.property('id', 'task');
      expect(sequence[3]).to.have.property('id', 'fromTask2Gateway');
      expect(sequence[4]).to.have.property('id', 'gateway');
      expect(sequence[5]).to.have.property('id', 'defaultFlow');
      expect(sequence[6]).to.have.property('id', 'end');
      expect(sequence).to.have.length(7);
    });

    And('second start event loop sequence is presented in shake loop message', () => {
      expect(messages[2].content).to.have.property('sequence').that.is.an('array');
      const sequence = messages[2].content.sequence;
      expect(sequence).to.have.length(8);
      expect(sequence[0]).to.have.property('id', 'start2');
      expect(sequence[1]).to.have.property('id', 'from22Task');
      expect(sequence[2]).to.have.property('id', 'task');
      expect(sequence[3]).to.have.property('id', 'fromTask2Gateway');
      expect(sequence[4]).to.have.property('id', 'gateway');
      expect(sequence[5]).to.have.property('id', 'back2Task');
      expect(sequence[6]).to.have.property('id', 'task');
      expect(sequence[7]).to.have.property('id', 'fromTask2Gateway');
    });

    let start1, start2;
    And('both start events are waiting for message', async () => {
      [start1, start2] = definition.getPostponed();
      expect(start1).to.have.property('id', 'start1');
      expect(start2).to.have.property('id', 'start2');
    });
  });

  Scenario('manual shaking', () => {
    let context;
    Given('two start events, the second contains a looped flow, and a user task', async () => {
      const source = `
      <definitions xmlns="http://www.omg.org/spec/BPMN/20100524/MODEL" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
        <process id="messageProcess" isExecutable="true">
          <startEvent id="start1">
            <messageEventDefinition messageRef="Message1" />
          </startEvent>
          <sequenceFlow id="from12end" sourceRef="start1" targetRef="end" />
          <startEvent id="start2">
            <messageEventDefinition messageRef="Message2" />
          </startEvent>
          <sequenceFlow id="from22Task" sourceRef="start2" targetRef="task" />
          <userTask id="task" />
          <sequenceFlow id="fromTask2Gateway" sourceRef="task" targetRef="gateway" />
          <exclusiveGateway id="gateway" default="defaultFlow" />
          <sequenceFlow id="defaultFlow" sourceRef="gateway" targetRef="end" />
          <sequenceFlow id="back2Task" sourceRef="gateway" targetRef="task">
            <conditionExpression xsi:type="tFormalExpression">\${environment.variables.condition}</conditionExpression>
          </sequenceFlow>
          <endEvent id="end" />
        </process>
        <message id="Message1" name="Start by name" />
        <message id="Message2" name="Start by me" />
      </definitions>`;

      context = await testHelpers.context(source);
    });


    let result;
    [true, false].forEach((run) => {
      describe(run ? 'running definition' : 'definition is not running', () => {
        let definition;
        Given('definition is initiated', () => {
          definition = Definition(context.clone());
        });

        if (run) {
          And('definition is running', () => {
            definition.run();
            definition.signal({id: 'Message2'});
          });
        }

        const messages = [];
        And('shake messages are collected', () => {
          definition.broker.subscribeTmp('event', '*.shake*', (routingKey) => {
            messages.push(routingKey);
          }, {noAck: true});
        });

        When('definition shakes first start event', () => {
          messages.splice(0);
          result = definition.shake('start1');
        });

        Then('execution sequences are returned', () => {
          expect(result).to.have.property('start1');
          expect(result.start1).that.is.an('array').with.length(1);
          const sequence = result.start1[0];
          expect(sequence.sequence[0]).to.have.property('id', 'start1');
          expect(sequence.sequence[1]).to.have.property('id', 'from12end');
          expect(sequence.sequence[2]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(3);

          expect(Object.keys(result)).to.deep.equal(['start1']);
        });

        And('event messsages are forwarded from event activity', () => {
          expect(messages).to.have.length(1);
        });

        When('definition shakes all', () => {
          messages.splice(0);
          result = definition.shake();
        });

        Then('the second start event two run sequences', () => {
          expect(result).to.have.property('start2');
          expect(result.start2).that.is.an('array').with.length(2);
        });

        And('first sequence runs to end event', () => {
          const sequence = result.start2[0];
          expect(sequence).to.have.property('isLooped', false);
          expect(sequence.sequence[0]).to.have.property('id', 'start2');
          expect(sequence.sequence[1]).to.have.property('id', 'from22Task');
          expect(sequence.sequence[2]).to.have.property('id', 'task');
          expect(sequence.sequence[3]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence[4]).to.have.property('id', 'gateway');
          expect(sequence.sequence[5]).to.have.property('id', 'defaultFlow');
          expect(sequence.sequence[6]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(7);
        });

        And('second sequence is looped', () => {
          const sequence = result.start2[1];
          expect(sequence).to.have.property('isLooped', true);
          expect(sequence.sequence[0]).to.have.property('id', 'start2');
          expect(sequence.sequence[1]).to.have.property('id', 'from22Task');
          expect(sequence.sequence[2]).to.have.property('id', 'task');
          expect(sequence.sequence[3]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence[4]).to.have.property('id', 'gateway');
          expect(sequence.sequence[5]).to.have.property('id', 'back2Task');
          expect(sequence.sequence[6]).to.have.property('id', 'task');
          expect(sequence.sequence[7]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence).to.have.length(8);
        });

        And('event messsages are forwarded from event activity', () => {
          expect(messages).to.have.length(5);
        });

        When('an activity with inbound flows is shaken', () => {
          messages.splice(0);
          result = definition.shake('gateway');
        });

        Then('the activity has the expected run sequences', () => {
          expect(result).to.have.property('gateway');
          expect(result.gateway).that.is.an('array');

          let sequence = result.gateway[0];
          expect(sequence).to.have.property('isLooped', false);
          expect(sequence.sequence[0]).to.have.property('id', 'gateway');
          expect(sequence.sequence[1]).to.have.property('id', 'defaultFlow');
          expect(sequence.sequence[2]).to.have.property('id', 'end');
          expect(sequence.sequence).to.have.length(3);

          sequence = result.gateway[1];
          expect(sequence.sequence[0]).to.have.property('id', 'gateway');
          expect(sequence.sequence[1]).to.have.property('id', 'back2Task');
          expect(sequence.sequence[2]).to.have.property('id', 'task');
          expect(sequence.sequence[3]).to.have.property('id', 'fromTask2Gateway');
          expect(sequence.sequence).to.have.length(4);
          expect(sequence).to.have.property('isLooped', true);

          expect(result.gateway).to.have.length(2);
        });

        if (run) {
          let end;
          When('user task is signaled', () => {
            end = definition.waitFor('end');
            definition.signal({id: 'task'});
          });

          Then('run completes', () => {
            return end;
          });
        }
      });
    });
  });
});
