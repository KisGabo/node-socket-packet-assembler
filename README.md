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
    Receive the given number of bytes via a single event, which is emitted when all the requested bytes have arrived.  
    You may use a custom event name (`identifier`).  
    If there are enough bytes in the internal buffer at the time of call, it triggers the event asynchronously.  
    This or `pipeBytesToStream()` can't be called again until the event is triggered.
* `pipeBytesToStream(bytesToRead: number): stream.Readable`  
    Receive the given number of bytes via a stream, which ends immediately after all the requested bytes have been pushed to it.  
    If there are some bytes in the internal buffer at the time of call, it pushes the data to the stream immediately.  
    This or `readBytes()` can't be called again until the stream ends.

## Example

### Using events to handle incoming data

```javascript
const SocketPacketAssembler = require('socket-packet-assembler');

tcpServer.on('connection', socket => {
  
  // Wrap new socket as soon as we get it
  const assembler = new SocketPacketAssembler(socket);
  
  assembler.on('greeting', buffer => {
    // These are the first 64 bytes the client sent,
    // you should process the buffer here
    // (which contains exactly 64 bytes).
  
    // Now we are expecting the first 1024-byte message
    assembler.readBytes(1024, 'message');
  });
  
  assembler.on('message', buffer => {
    // This is a 1024-byte message,
    // you should process the buffer here
    // (which contains exactly 1024 bytes).

    if (doesIndicateIncomingFile(buffer)) {
      // We prepare to receive a file over the socket, and pipe the incoming bytes
      // straight to a file on the disk.
        
      const fileWriteStream = fs.createWriteStream('incoming');
      
      const incomingDataStream = assembler.pipeBytesToStream(
        // Extract the filesize from the message so we know how many bytes to expect
        getIncomingFileSize(buffer)
      );
      
      incomingDataStream.end(() => {
        // Expect the next message after the file transfer has finished
        assembler.readBytes(1024, 'message');
      });
      
      incomingDataStream.pipe(fileWriteStream);
    } else {
      // Do something with the message
      processMessage(buffer);

      // Expect another message after processing finished
      assembler.readBytes(1024, 'message');
    }
  });
  
  // At first, we expect some kind of greeting from client,
  // which must be 64 bytes.
  assembler.readBytes(64, 'greeting');
  
});
```

## License

[MIT](LICENSE)
