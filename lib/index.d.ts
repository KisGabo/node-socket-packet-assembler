import { EventEmitter } from 'events';
import { Socket } from 'net';
import { Readable } from "stream";

/**
 * Utility to read definite number of bytes from a socket.
 */
declare class SocketPacketAssembler extends EventEmitter {

  /** The original Socket object wrapped. */
  public readonly origSocket: Socket;

  private bytesToRead: number|null;
  private eventName: string|null;
  private buffer: Buffer|null;
  private stream: Readable|null;
  private bytesReadInStreamMode: number;

  /**
   * Initialize an assembler on given socket
   * by subscribing to socket's "data" event.
   *
   * @param socket
   */
  public constructor(socket: Socket);

  /**
   * Set the number of bytes to expect on stream.
   *
   * @param bytesToRead
   * @param [identifier=data] - Name of event emitted when bytes arrived.
   */
  public readBytes(bytesToRead: number, identifier: string|null|undefined): void;

  /**
   * Start a stream to receive given number of bytes.
   *
   * @param bytesToRead
   */
  public pipeBytesToStream(bytesToRead: number): Readable;

  private handleDataFromSocket(data: Buffer): void;
  private checkBytesToReadValue(bytesToRead: number): void;
  private emitIfNecessary(): void;
  private pipeBufferToStream(): void;
  private bufferData(data: Buffer): void;
  private sliceInternalBuffer(bytes: number, notFewer: boolean): Buffer|null;

}

export = SocketPacketAssembler;
