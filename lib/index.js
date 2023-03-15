const net = require('net');
const events = require('events');
const stream = require('stream');

/**
 * Utility to read definite number of bytes from a socket.
 */
class SocketPacketAssembler extends events.EventEmitter {

  /**
   * Initialize an assembler on given socket
   * by subscribing to socket's "data" event.
   *
   * @param {module:net.Socket} socket
   */
  constructor(socket) {
    super();

    if (! (socket instanceof net.Socket)) {
      throw new TypeError('Parameter must be a socket');
    }

    /**
     * The original Socket object wrapped.
     *
     * @type {module:net.Socket}
     * @readonly
     */
    this.origSocket = socket;

    /**
     * Number of bytes to emit at once.
     *
     * @type {?number}
     * @private
     */
    this.bytesToRead = null;

    /**
     * Next event's name.
     *
     * @type {?string}
     * @private
     */
    this.eventName = null;

    /**
     * Received data which has not been emitted yet.
     *
     * @type {?Buffer}
     * @private
     */
    this.buffer = null;

    /**
     * The stream the client code receives the bytes through (in stream mode).
     *
     * @type {?module:stream.Readable}
     * @private
     */
    this.stream = null;

    /**
     * Number of bytes read from the socket and written to the stream.
     *
     * @type {number}
     * @private
     */
    this.bytesReadInStreamMode = 0;

    this.origSocket.on('data', this.handleDataFromSocket.bind(this));
  }

  /**
   * Set the number of bytes to expect on stream.
   *
   * @param {number} bytesToRead
   * @param {string} [identifier=data] - Name of event emitted when bytes arrived.
   */
  readBytes(bytesToRead, identifier) {
    this.checkBytesToReadValue(bytesToRead);

    this.bytesToRead = bytesToRead;

    this.eventName = typeof identifier === 'string' && identifier !== ''
        ? identifier
        : 'data';

    // Check if there's something to emit immediately.
    // Using setImmediate() here to not block by executing event handlers.
    // This is also for preventing too much recursion in case
    // the handler calls another readBytes().
    if (this.buffer !== null) {
      setImmediate(this.emitIfNecessary.bind(this));
    }
  }

  /**
   * Start a stream to receive given number of bytes.
   *
   * @param {number} bytesToRead
   * @return {module:stream.Readable}
   */
  pipeBytesToStream(bytesToRead) {
    this.checkBytesToReadValue(bytesToRead);

    this.bytesToRead = bytesToRead;
    this.bytesReadInStreamMode = 0;

    const newStream = new stream.Readable({ read() {} });
    this.stream = newStream;

    // Check if there's something to pipe immediately.
    if (this.buffer !== null) {
      this.pipeBufferToStream();
    }

    return newStream;
  }

  /**
   * @param {Buffer} data Data arrived on TCP socket
   *
   * @private
   */
  handleDataFromSocket(data) {
    this.bufferData(data);

    if (this.bytesToRead === null) {
      return;
    }

    if (this.stream) {
      // Stream mode
      this.pipeBufferToStream();
    } else {
      // Event mode
      this.emitIfNecessary();
    }
  }

  /**
   * Check if bytesToRead parameter is valid. If not, then throw.
   *
   * @param {number} bytesToRead
   * @throws Error
   * @private
   */
  checkBytesToReadValue(bytesToRead) {
    if (this.bytesToRead !== null) {
      throw new Error('Can\'t alter the number of bytes to read before receiving the requested data');
    }

    if (typeof bytesToRead !== 'number') {
      throw new TypeError('bytesToRead must be a number');
    }

    if (bytesToRead <= 0 || isNaN(bytesToRead)) {
      throw new RangeError('bytesToRead must be a positive integer');
    }
  }

  /**
   * Slice internal buffer and emit the requested chunk if necessary.
   *
   * @private
   */
  emitIfNecessary() {
    const bufToEmit = this.sliceInternalBuffer(this.bytesToRead, true);

    if (bufToEmit === null) {
      // Don't emit if there are not enough bytes in the buffer
      return;
    }

    this.bytesToRead = null;

    /**
     * The requested number of bytes arrived.
     *
     * @event SocketPacketAssembler#data
     * @type Buffer
     */
    this.emit(this.eventName, bufToEmit);
  }

  /**
   * Slice internal buffer and pipe (some of) the requested chunk.
   *
   * @private
   */
  pipeBufferToStream() {
    const bufToPipe = this.sliceInternalBuffer(
        this.bytesToRead - this.bytesReadInStreamMode,
        false
    );

    this.bytesReadInStreamMode += bufToPipe.length;

    this.stream.push(bufToPipe);

    if (this.bytesReadInStreamMode === this.bytesToRead) {
      // All requested bytes have been written to the stream, closing

      const stream = this.stream;

      this.stream = null;
      this.bytesToRead = null;
      this.bytesReadInStreamMode = 0;

      stream.push(null);
    }
  }

  /**
   * Add data to internal buffer.
   *
   * @param {Buffer} data
   * @private
   */
  bufferData(data) {
    if (this.buffer === null) {
      this.buffer = data;
    } else {
      this.buffer = Buffer.concat([this.buffer, data]);
    }
  }

  /**
   * Shift given number of bytes from the start of the internal buffer
   * and return that, while keeping the rest.
   *
   * @param {number} bytesToRead
   * @param {boolean} notFewer True to avoid extracting fewer bytes than requested
   * @returns {?Buffer}
   * @private
   */
  sliceInternalBuffer(bytesToRead, notFewer) {
    let requestedChunk;

    if (this.buffer.length > bytesToRead) {
      // More data than required, so cut off the requested chunk and return that
      // and keep the rest in the internal buffer
      requestedChunk = this.buffer.slice(0, bytesToRead);
      this.buffer = this.buffer.slice(bytesToRead)
    } else if (this.buffer.length === bytesToRead || ! notFewer) {
      // Exactly as many bytes in buffer as requested, or fewer but fewer are allowed,
      // so return the whole buffer and clear the internal buffer
      requestedChunk = this.buffer;
      this.buffer = null;
    } else {
      // Not enough bytes in buffer so no slicing; keep the whole data in the internal buffer
      requestedChunk = null;
    }

    return requestedChunk;
  }

}

module.exports = SocketPacketAssembler;
