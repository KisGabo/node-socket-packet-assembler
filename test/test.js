const chai = require('chai');
const sinon = require('sinon');
const sinonChai = require('sinon-chai');
const net = require('net');
const SocketPacketAssembler = require('../lib/index');

const expect = chai.expect;

chai.use(sinonChai);

describe('Socket Packet Assembler', function () {

  /** @type SocketPacketAssembler */
  let sock;

  beforeEach(function () {
    sock = new SocketPacketAssembler(new net.Socket());
  });

  it('should never emit when num of bytes to read is not specified', function () {
    const eventHandler = sinon.spy();
    sock.on('data', eventHandler);

    sock.origSocket.emit('data', Buffer.from('data data'));
    sock.origSocket.emit('data', Buffer.from('data data'));
    sock.origSocket.emit('data', Buffer.from('data data'));

    expect(eventHandler).not.been.called;
  });

  it('should emit the original buffer when just enough data arrives', function () {
    /** @type ?Buffer */
    let lastEmitted = null;

    const eventHandler = sinon.spy(buf => lastEmitted = buf);

    const testBufs = [
      Buffer.from('a'),
      Buffer.from('bc'),
      Buffer.from('defghij'),
      Buffer.from('pqr'.repeat(1000)),
    ];

    sock.on('data', eventHandler);

    for (let bufIdx in testBufs) {
      const buf = testBufs[bufIdx];

      sock.readBytes(buf.length);
      sock.origSocket.emit('data', buf);

      expect(eventHandler).have.callCount(parseInt(bufIdx) + 1);
      expect(lastEmitted.equals(buf), 'Wrong bytes emitted').be.true;
    }
  });

  it('should delay emitting until enough data arrives', function () {
    /** @type ?Buffer */
    let lastEmitted = null;

    const eventHandler = sinon.spy(buf => lastEmitted = buf);

    const testBufs = [
      [
        Buffer.from('a'),
        Buffer.from('bcde'),
        Buffer.from('fghijklmnop'),
      ], [
        Buffer.from('z'),
        Buffer.from('pqr'.repeat(1000)),
        Buffer.from('123'),
        Buffer.from('456'.repeat(100)),
      ],
    ];

    sock.on('data', eventHandler);

    for (let groupIdx in testBufs) {
      const bufGroup = testBufs[groupIdx];
      const resultBuf = Buffer.concat(bufGroup);
      sock.readBytes(resultBuf.length);

      bufGroup.forEach(buf => sock.origSocket.emit('data', buf));

      expect(eventHandler).have.callCount(parseInt(groupIdx) + 1);
      expect(lastEmitted.equals(resultBuf), 'Wrong bytes emitted').be.true;
    }
  });

  it('should emit exactly as many bytes as expected, and buffer the rest', function () {
    /** @type ?Buffer */
    let lastEmitted = null;

    const eventHandler = sinon.spy(buf => lastEmitted = buf);

    const testBufs = [
      Buffer.from([ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]),
      Buffer.from([ 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30 ]),
      Buffer.from([ 31, 32, 33, 34, 35 ]),
      Buffer.from([ 36, 37, 38, 39, 40 ]),
    ];

    sock.on('data', eventHandler);

    // 1.

    sock.readBytes(10);
    sock.origSocket.emit('data', testBufs[0]);

    expect(eventHandler).been.calledOnce;
    expect(lastEmitted.equals(testBufs[0].slice(0, 10)), 'Wrong bytes emitted').be.true;

    // 2.

    sock.readBytes(15);
    sock.origSocket.emit('data', testBufs[1]);

    expect(eventHandler).been.calledTwice;
    expect(lastEmitted.equals(Buffer.concat([
      testBufs[0].slice(10),
      testBufs[1].slice(0, 10)
    ])), 'Wrong bytes emitted').be.true;

    // 3.

    sock.readBytes(11);
    sock.origSocket.emit('data', testBufs[2]);

    expect(eventHandler).been.calledTwice;

    // 4.

    sock.origSocket.emit('data', testBufs[3]);

    expect(eventHandler).have.callCount(3);
    expect(lastEmitted.equals(Buffer.concat([
      testBufs[1].slice(10),
      testBufs[2],
      testBufs[3].slice(0, 1)
    ])), 'Wrong bytes emitted').be.true;
  });

  it('should emit named events', function () {
    const tests = [ 'abc', 'def', 'ghi' ];

    for (let test of tests) {
      const buf = Buffer.from(test + 'content');
      const eventName = test + 'event';
      let emitted = null;

      sock.on(eventName, buf => emitted = buf);
      sock.readBytes(buf.length, eventName);
      sock.origSocket.emit('data', buf);

      expect(emitted, 'No bytes emitted').not.be.null;
      expect(emitted.equals(buf), 'Wrong bytes emitted').be.true;
    }
  });

  it('#readBytes() should not allow to alter the number of bytes to read', function () {
    sock.readBytes(5);

    expect(() => sock.readBytes(6)).throw(Error);
  });

  it('#readBytes() should not execute event handlers synchronously', function () {
    const eventHandler = sinon.spy();
    sock.on('data', eventHandler);
    sock.origSocket.emit('data', Buffer.from([ 1 ]));

    sock.readBytes(1);

    expect(eventHandler).not.been.called;
  });

  it('#readBytes() should emit if necessary', function () {
    /** @type ?Buffer */
    let lastEmitted = null;

    const eventHandler = sinon.spy(buf => lastEmitted = buf);
    const clock = sinon.useFakeTimers();

    const testBuf = Buffer.from([ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]);

    sock.on('data', eventHandler);

    sock.origSocket.emit('data', testBuf);

    // 1.

    sock.readBytes(5);
    clock.next();

    expect(eventHandler).been.calledOnce;
    expect(lastEmitted.equals(testBuf.slice(0, 5))).be.true;

    // 2.

    sock.readBytes(5);
    clock.next();

    expect(eventHandler).been.calledTwice;
    expect(lastEmitted.equals(testBuf.slice(5, 10))).be.true;

    // 3.

    sock.readBytes(6);
    clock.next();

    expect(eventHandler).been.calledTwice;

    clock.restore();
  });

  it('should buffer all bytes & stream the requested number of bytes, then end the stream', async function () {
    const endHandler = sinon.spy(()=> {});

    const testBuf = Buffer.from([ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]);
    let bufFromStream = Buffer.from([]);

    sock.origSocket.emit('data', testBuf.slice(0, 5));

    sock.pipeBytesToStream(10)
      .on('data', buf => bufFromStream = Buffer.concat([bufFromStream, buf]))
      .on('end', endHandler);

    await waitForTimeoutQueue();

    expect(bufFromStream.equals(testBuf.slice(0, 5))).be.true;
    expect(endHandler).not.been.called;

    sock.origSocket.emit('data', testBuf.slice(5));

    await waitForTimeoutQueue();

    expect(bufFromStream.equals(testBuf.slice(0, 10))).be.true;
    expect(endHandler).been.calledOnce;

    sock.pipeBytesToStream(5)
        .on('data', buf => bufFromStream = Buffer.concat([bufFromStream, buf]))
        .on('end', endHandler);

    await waitForTimeoutQueue();

    expect(bufFromStream.equals(testBuf)).be.true;
    expect(endHandler).been.calledTwice;
  });

  it('should handle event and stream modes mixed ', async function () {
    sock.on('data', buf => bufFromSocket = Buffer.concat([bufFromSocket, buf]));

    const endHandler = sinon.spy(()=> {});

    const testBuf = Buffer.from([ 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15 ]);
    let bufFromSocket = Buffer.from([]);

    sock.pipeBytesToStream(3)
        .on('data', buf => bufFromSocket = Buffer.concat([bufFromSocket, buf]))
        .on('end', endHandler);

    sock.origSocket.emit('data', testBuf.slice(0, 5));

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf.slice(0, 3))).be.true;
    expect(endHandler).been.calledOnce;

    sock.readBytes(2);

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf.slice(0, 5))).be.true;

    sock.origSocket.emit('data', testBuf.slice(5, 6));

    sock.pipeBytesToStream(3)
        .on('data', buf => bufFromSocket = Buffer.concat([bufFromSocket, buf]))
        .on('end', endHandler);

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf.slice(0, 6))).be.true;
    expect(endHandler).been.calledOnce;

    sock.origSocket.emit('data', testBuf.slice(6, 10));

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf.slice(0, 8))).be.true;
    expect(endHandler).been.calledTwice;

    sock.readBytes(4);

    sock.origSocket.emit('data', testBuf.slice(10, 11));

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf.slice(0, 8))).be.true;

    sock.origSocket.emit('data', testBuf.slice(11));

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf.slice(0, 12))).be.true;

    sock.pipeBytesToStream(10)
        .on('data', buf => bufFromSocket = Buffer.concat([bufFromSocket, buf]))
        .on('end', endHandler);

    await waitForTimeoutQueue();

    expect(bufFromSocket.equals(testBuf)).be.true;
    expect(endHandler).been.calledTwice;
  });

  it('#pipeBytesToStream() should not allow to alter the number of bytes to pipe', function () {
    sock.pipeBytesToStream(5);

    expect(() => sock.pipeBytesToStream(6)).throw(Error);
  });

  it('should allow to call #readBytes() in the data event handler', async function () {
    const handler = sinon.spy(() => sock.readBytes(1));

    sock.on('data', handler);

    sock.readBytes(1);

    sock.origSocket.emit('data', Buffer.from([1]));

    await waitForTimeoutQueue();

    expect(handler).be.calledOnce;
  });

  it('should allow to call #pipeBytesToStream() in the end event handler', async function () {
    const handler = sinon.spy(() => sock.pipeBytesToStream(1));

    sock.pipeBytesToStream(1).on('data', () => {}).on('end', handler);

    sock.origSocket.emit('data', Buffer.from([1]));

    await waitForTimeoutQueue();

    expect(handler).be.calledOnce;
  });

});

function waitForTimeoutQueue() {
  return new Promise(resolve => setTimeout(resolve));
}
