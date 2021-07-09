/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

// setup options
export interface ISetupOptions {
  pixelLimit: number;
}

// pixel data from worker
export interface IImagePixel {
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

/**
 * Worker message protocol types (used on both ends).
 */
export interface IAckMessage {
  type: 'ACK';
  payload: 'ping' | 'alive';
  options: ISetupOptions | null;
}
// outgoing
export interface ISixelInitMessage {
  type: 'SIXEL_INIT';
  payload: {
    fillColor: number;
    paletteName: 'VT340-COLOR' | 'VT340-GREY' | 'ANSI-256' | 'private';
    limit: number;
  };
}
export interface ISixelPutMessage {
  type: 'SIXEL_PUT';
  payload: {
    buffer: ArrayBuffer;
    length: number;
  };
}
export interface ISixelEndMessage {
  type: 'SIXEL_END';
  payload: boolean;
}
// incoming
export interface ISixelImageMessage {
  type: 'SIXEL_IMAGE';
  payload: IImagePixel | null;
}
export interface IChunkTransferMessage {
  type: 'CHUNK_TRANSFER';
  payload: ArrayBuffer;
}
export interface ISizeExceededMessage {
  type: 'SIZE_EXCEEDED';
}

export type IImageWorkerMessage = (
  IAckMessage | ISixelInitMessage | ISixelPutMessage | ISixelEndMessage |
  ISixelImageMessage | IChunkTransferMessage | ISizeExceededMessage
);
