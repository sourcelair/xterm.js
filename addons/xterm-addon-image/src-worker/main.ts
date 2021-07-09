/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { SixelDecoder } from 'sixel/lib/SixelDecoder';
import { PALETTE_VT340_COLOR, PALETTE_VT340_GREY, PALETTE_ANSI_256 } from 'sixel/lib/Colors';
import { IImageWorkerMessage } from '../src/WorkerTypes';


// narrow types for postMessage to our protocol
declare const postMessage: {
  <T extends IImageWorkerMessage>(message: T, transfer: Transferable[]): void;
  <T extends IImageWorkerMessage>(message: T, options?: PostMessageOptions | undefined): void;
};


let decoder: SixelDecoder | undefined;
let imageBuffer: ArrayBuffer | undefined;
let sizeExceeded = false;

// setup options loaded from ACK
let pixelLimit = 0;


function messageHandler(event: MessageEvent<IImageWorkerMessage>): void {
  const data = event.data;
  switch (data.type) {
    case 'SIXEL_PUT':
      if (!sizeExceeded) {
        if (decoder) {
          decoder.decode(new Uint8Array(data.payload.buffer, 0, data.payload.length));
          if (decoder.height * decoder.width > pixelLimit) {
            sizeExceeded = true;
            console.warn('image worker: pixelLimit exceeded, aborting');
            postMessage({ type: 'SIZE_EXCEEDED' });
          }
        }
      }
      postMessage({ type: 'CHUNK_TRANSFER', payload: data.payload.buffer }, [data.payload.buffer]);
      break;
    case 'SIXEL_END':
      const success = data.payload;
      if (success) {
        if (!decoder || !decoder.width || !decoder.height || sizeExceeded) {
          postMessage({ type: 'SIXEL_IMAGE', payload: null });
        } else {
          const width = decoder.width;
          const height = decoder.height;
          const bytes = width * height * 4;
          if (!imageBuffer || imageBuffer.byteLength < bytes) {
            imageBuffer = new ArrayBuffer(bytes);
          }
          const container = new Uint8ClampedArray(imageBuffer, 0, bytes);
          container.fill(0);  // TODO: should clearing be done by sixel lib?
          decoder.toPixelData(container, width, height);
          postMessage({
            type: 'SIXEL_IMAGE',
            payload: {
              buffer: imageBuffer,
              width,
              height
            }
          }, [imageBuffer]);
          imageBuffer = undefined;
        }
      }
      decoder = undefined;
      sizeExceeded = false;
      break;
    case 'CHUNK_TRANSFER':
      if (!imageBuffer) {
        imageBuffer = data.payload;
      }
      break;
    case 'SIXEL_INIT':
      sizeExceeded = false;
      const { fillColor, paletteName, limit } = data.payload;
      const palette = paletteName === 'VT340-COLOR'
        ? PALETTE_VT340_COLOR
        : paletteName === 'VT340-GREY'
          ? PALETTE_VT340_GREY
          : PALETTE_ANSI_256;
      // TODO: non private palette? (not really supported) - needs upstream fix in sixel lib
      decoder = new SixelDecoder(fillColor, Object.assign([], palette), limit);
      break;
    case 'ACK':
      pixelLimit = data.options?.pixelLimit || 0;
      postMessage({ type: 'ACK', payload: 'alive', options: null });
      break;
  }
}

self.addEventListener('message', messageHandler, false);
