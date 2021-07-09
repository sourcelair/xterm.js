/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IImageAddonOptions } from './Types';
import { IDisposable } from 'xterm';
import { IImageWorkerMessage, IImagePixel } from './WorkerTypes';


// narrow types for postMessage to our protocol
interface IImageWorker extends Worker {
  postMessage: {
    <T extends IImageWorkerMessage>(message: T, transfer: Transferable[]): void;
    <T extends IImageWorkerMessage>(message: T, options?: PostMessageOptions | undefined): void;
  };
}


// pool cleanup interval in ms
const CLEANUP_INTERVAL = 20000;


/**
 * Manager to encapsulate certain worker aspects:
 * - lazy worker loading
 * - low level communication protocol with worker
 * - promise based image dispatcher
 * - mem pooling
 */
export class WorkerManager implements IDisposable {
  private _worker: IImageWorker | undefined;
  private _memPool: ArrayBuffer[] = [];
  private _sixelResolver: ((img: IImagePixel | null) => void) | undefined;
  private _failedToLoad = false;
  private _poolChecker: any | undefined;
  private _lastActive = 0;
  public sizeExceeded = false;

  private _startupError: () => void = () => {
    console.warn('ImageAddon worker failed to load, image output is disabled.');
    this._failedToLoad = true;
    this.dispose();
  };

  private _message: (msg: MessageEvent<IImageWorkerMessage>) => void = event => {
    const data = event.data;
    switch (data.type) {
      case 'CHUNK_TRANSFER':
        this.storeChunk(data.payload);
        break;
      case 'SIXEL_IMAGE':
        if (this._sixelResolver) {
          this._sixelResolver(data.payload);
          this._sixelResolver = undefined;
        }
        break;
      case 'ACK':
        this._worker?.removeEventListener('error', this._startupError);
        break;
      case 'SIZE_EXCEEDED':
        this.sizeExceeded = true;
        break;
    }
  };

  private _setSixelResolver(resolver?: (img: IImagePixel | null) => void): void {
    if (this._sixelResolver) {
      this._sixelResolver(null);
    }
    this._sixelResolver = resolver;
  }

  constructor(
    public url: string,
    private _opts: IImageAddonOptions,
    public chunkSize: number = 65536 * 2,
    public maxPoolSize: number = 50
  ) {}

  public dispose(): void {
    this._worker?.terminate();
    this._worker = undefined;
    this._setSixelResolver();
    this.flushPool();
    if (this._poolChecker) {
      clearInterval(this._poolChecker);
      this._poolChecker = undefined;
    }
  }

  public get failed(): boolean {
    return this._failedToLoad;
  }

  public get worker(): IImageWorker | undefined {
    if (!this._worker && !this._failedToLoad) {
      this._worker = new Worker(this.url);
      this._worker.addEventListener('message', this._message, false);
      this._worker.addEventListener('error', this._startupError, false);
      this._worker.postMessage({
        type: 'ACK',
        payload: 'ping',
        options: { pixelLimit: this._opts.pixelLimit }
      });
    }
    return this._worker;
  }

  public getChunk(): ArrayBuffer {
    this._lastActive = Date.now();
    return this._memPool.pop() || new ArrayBuffer(this.chunkSize);
  }

  public storeChunk(chunk: ArrayBuffer): void {
    if (!this._poolChecker) {
      this._poolChecker = setInterval(() => {
        if (Date.now() - this._lastActive > CLEANUP_INTERVAL) {
          this.flushPool();
          clearInterval(this._poolChecker);
          this._poolChecker = undefined;
        }
      }, CLEANUP_INTERVAL);
    }
    if (this._memPool.length < this.maxPoolSize) {
      this._memPool.push(chunk);
    }
  }

  public flushPool(): void {
    this._memPool.length = 0;
  }

  // SIXEL message interface
  public sixelInit(fillColor: number, paletteName: 'VT340-COLOR' | 'VT340-GREY' | 'ANSI-256' | 'private', limit: number): void {
    this._setSixelResolver();
    this.sizeExceeded = false;
    this.worker?.postMessage({
      type: 'SIXEL_INIT',
      payload: { fillColor, paletteName, limit }
    });
  }
  public sixelPut(data: Uint8Array, length: number): void {
    this.worker?.postMessage({
      type: 'SIXEL_PUT',
      payload: {
        buffer: data.buffer,
        length
      }
    }, [data.buffer]);
  }
  public sixelEnd(success: boolean): Promise<IImagePixel|null> | void {
    let result: Promise<IImagePixel|null> | undefined;
    if (success && this.worker) {
      result = new Promise<IImagePixel|null>(resolve => this._setSixelResolver(resolve));
    }
    this.worker?.postMessage({ type: 'SIXEL_END', payload: success });
    return result;
  }
  public sixelSendBuffer(buffer: ArrayBuffer): void {
    this.worker?.postMessage({ type: 'CHUNK_TRANSFER', payload: buffer }, [buffer]);
  }
}
