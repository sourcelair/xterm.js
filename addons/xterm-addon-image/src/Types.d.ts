/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IDisposable, IMarker, Terminal } from 'xterm';

// private imports from base repo we build against
import { AttributeData } from 'common/buffer/AttributeData';
import { IParams, IDcsHandler, IEscapeSequenceParser } from 'common/parser/Types';
import { IBuffer } from 'common/buffer/Types';
import { IBufferLine, IExtendedAttrs, IInputHandler } from 'common/Types';
import { Cell, BgFlags, Content } from 'common/buffer/Constants';
import { IOptionsService, IDirtyRowService, ICoreService } from 'common/services/Services';
import { IColorManager } from 'browser/Types';
import { IRenderDimensions } from 'browser/renderer/Types';
import { IRenderService } from 'browser/services/Services';

// export some privates for local usage
export { AttributeData, IParams, IDcsHandler, BgFlags, IRenderDimensions, IRenderService, IColorManager, Cell, Content };

/**
 * Plugin ctor options.
 */
export interface IImageAddonOptionalOptions {
  /**
   * Path to the worker file.
   * Must be the path to the worker JS file directly loadable
   * in the integration as with `new Worker(path)`.
   *
   * You most likely want to customize this,
   * the hardcoded default '/workers/xterm-addon-image-worker.js'
   * is derived from demo integration of the xterm.js repo.
   */
  workerPath?: string;

  /**
   * Enable size reports in windowOptions:
   * - getWinSizePixels (CSI 14 t)
   * - getCellSizePixels (CSI 16 t)
   * - getWinSizeChars (CSI 18 t)
   *
   * If `true` (default), the reports will be activated during addon loading.
   * If `false`, no settings will be touched. Use this, if you have high
   * security constraints and/or deal with windowOptions by other means.
   * On addon disposal, the settings will not change.
   */
  enableSizeReports?: boolean;

  /**
   * Maximum pixels a single image may hold. Images exceeding this number will
   * be discarded during processing with no changes to the terminal buffer
   * (no cursor advance, no placeholder).
   * This setting is mainly used to restrict images sizes during initial decoding
   * including the final canvas creation.
   *
   * Note: The image worker decoder may hold additional memory up to `pixelLimit` * 4
   * permanently, plus the same amount on top temporarily for pixel transfers,
   * which should be taken into account under memory pressure conditions.
   *
   * Note: Browsers restrict allowed canvas dimensions further. We dont reflect those
   * limits here, thus the construction of an oddly shaped image having most pixels
   * in one dimension still can fail.
   *
   * Note:`pixelLimit` * 4 should not exceed `storageLimit` in bytes.
   * Default is 2^16 (4096 x 4096 pixels).
   */
  pixelLimit?: number;

  /**
   * Storage limit in MB.
   * The storage implements a FIFO cache removing old images, when the limit gets hit.
   * Also exposed as addon property for runtime adjustments.
   * Default is 128 MB.
   */
  storageLimit?: number;

  /**
   * Whether to show a placeholder for images removed from cache, default is true.
   */
  showPlaceholder?: boolean;

  /**
   * Leave cursor to right of image.
   * This has no effect, if an image covers all cells to the right.
   * Same as DECSET 8452, default is false.
   */
  cursorRight?: boolean;

  /**
   * Leave cursor below the first row of an image, scrolling if needed.
   * If disabled, the cursor is left at the beginning of the next line.
   * This settings is partially overwritten by `cursorRight`, if an image
   * does not cover all cells to the right.
   * Same as DECSET 7730, default is false.
   */
  cursorBelow?: boolean;

  /**
   * SIXEL settings
   */
  // Whether SIXEL is enabled (default is true).
  sixelSupport?: boolean;
  // Whether SIXEL scrolling is enabled (default is true). Same as DECSET 80.
  sixelScrolling?: boolean;
  // Palette color limit (default 256).
  sixelPaletteLimit?: number;
  // SIXEL image size limit in bytes (default 25000000).
  sixelSizeLimit?: number;
  // Whether to use private palettes for SIXEL sequences (default is true). Same as DECSET 1070.
  sixelPrivatePalette?: boolean;
  // Default start palette (default 'ANSI256').
  sixelDefaultPalette?: 'VT340-COLOR' | 'VT340-GREY' | 'ANSI256';
}

export type IImageAddonOptions = {
  [P in keyof IImageAddonOptionalOptions]-?: IImageAddonOptionalOptions[P];
};


/**
 * Stub into private interfaces.
 * This should be kept in line with common libs.
 * Any change made here should be replayed in the accessors test case to
 * have a somewhat reliable testing against code changes in the core repo.
 */

// overloaded IExtendedAttrs to hold image refs
export interface IExtendedAttrsImage extends IExtendedAttrs {
  imageId: number;
  tileId: number;
}

/* eslint-disable */
export interface IBufferLineExt extends IBufferLine {
  _extendedAttrs: {[index: number]: IExtendedAttrsImage | undefined};
  _data: Uint32Array;
}

interface IInputHandlerExt extends IInputHandler {
  _parser: IEscapeSequenceParser;
  _curAttrData: AttributeData;
  onRequestReset(handler: () => void): IDisposable;
}

// we need several private services from core terminal
// thus stub them here (access is tested by test case)
export interface ICoreTerminal extends Terminal {
  _core: {
    buffer: IBuffer;
    cols: number;
    rows: number;
    screenElement: HTMLElement;
    open(parent: HTMLElement): void;

    // needed sub parts
    optionsService: IOptionsService;
    _dirtyRowService: IDirtyRowService;
    _coreService: ICoreService;
    _colorManager: IColorManager;
    _inputHandler: IInputHandlerExt;
    _renderService: IRenderService;
  };
}
/* eslint-enable */


/**
 * Some storage definitions.
 */
export interface ICellSize {
  width: number;
  height: number;
}

export interface IImageSpec {
  orig: HTMLCanvasElement | undefined;
  origCellSize: ICellSize;
  actual: HTMLCanvasElement | undefined;
  actualCellSize: ICellSize;
  marker: IMarker | undefined;
  tileCount: number;
  bufferType: 'alternate' | 'normal';
}
