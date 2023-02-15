# Node Socket Packet Assembler

* [Installation](#installation)
* [Public API](#public-api)
* [Example](#example)
* [License](#license)

__This wrapper for Node's `net.Socket` waits for and emits the previously set number of bytes read from the stream (not more, not fewer).__

You can use custom event names instead of `data`, which may make your code more understandable.

It can be useful if you are implementing a custom protocol over TCP.

__What problem does it solve?__

No matter in what timing the bytes are received, no matter how many bytes are emitted in Socket's `data` event,
this wrapper emits the requested number of bytes (and no more) only when they all have been received.
So if the bytes you wait for from the stream are processable as a whole, you don't need to
check the length of Buffers nor slice and concatenate them.

__Compatibility__

Node 12+

## Installation

Add it to your project using a package manager, eg.

```
npm install socket-packet-assembler
```

To run tests in development environment:

```
npm install && npm test
```

## Public API

__`class SocketPacketAssembler extends events.EventEmitter`__

* `constructor(socket: net.Socket)`  
    Initialize a new assembler on given socket.
* `readonly origSocket: net.Socket`  
    The Socket object which is wrapped.
* `readBytes(bytesToRead: number, identifier: string = "data"): void`  
    Set how many bytes you want to receive in the next event.
    You may use a custom event name (`identifier`).  
    If there are enough bytes in the internal buffer at the time of call, it triggers the event asynchronously.  
    It can't be called again until the event is triggered.

## Example

```javascript
const SocketPacketAssembler = require('socket-packet-assembler');

tcpServer.on('connection', socket => {
  
  // Wrap new socket as soon as we get it
  const assembler = new SocketPacketAssembler(socket);
  
  assembler.on('greeting', buffer => {
    // These are the first 64 bytes the client sent,
    // you should process the buffer here
    // (which contains exactly 64 bytes).
  
    // Now we wait for the first 1024-byte message
    assembler.readBytes(1024, 'message');
  });
  
  assembler.on('message', buffer => {
    // This is a 1024-byte message,
    // you should process the buffer here
    // (which contains exactly 1024 bytes).
  
    // Wait for another message
    assembler.readBytes(1024, 'message');
  });
  
  // At first, we wait for some kind of greeting from client,
  // which must be 64 bytes.
  assembler.readBytes(64, 'greeting');
  
});
```

## License

[MIT](LICENSE)
