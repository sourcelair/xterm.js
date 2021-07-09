/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ITerminalAddon, IDisposable } from 'xterm';
import { ImageRenderer } from './ImageRenderer';
import { ImageStorage } from './ImageStorage';
import { SixelHandler } from './SixelHandler';
import { ICoreTerminal, IImageAddonOptionalOptions, IImageAddonOptions } from './Types';
import { WorkerManager } from './WorkerManager';

// to run testfiles:
// cd ../node-sixel/testfiles/
// shopt -s extglob
// cat !(*_clean).six

// no scrolling test:
// echo -ne '\x1b[?80l\x1bP0;0q' && cat ../node-sixel/testfiles/screen_clean.six && echo -e '\x1b\\'

// mpv test
// cd ../mpv-build/
// mpv/build/mpv /home/jerch/Downloads/sintel.webm --vo=sixel --vo-sixel-width=800 --vo-sixel-height=600 \
// --profile=sw-fast --vo-sixel-fixedpalette=no --vo-sixel-reqcolors=256 --really-quiet

/**
 * TODOs / next steps:
 * - update sixel lib to FastSixelDecoder
 * - allow overprinting with blending? (needed for correct handling of transparent pixels)
 * - find some working serialize solution (re-encode?)
 * - investigate in worker based drawing (OffscreenCanvas, createImageBitmap)
 * - think about additional library like public API endpoints:
 *    - get image(canvas|blob) under pointer full | line | tile
 *    - get images in buffer range with cell notion (right expanding?)
 *    - possible storage events: onAdded(imageSpec), onBeforeEvicted(imageSpec)
 *    - query addon settings
 *
 * Longterm:
 * - iTerm2 protocol support
 * - a better image protocol
 * - nodejs support (drawing and export shims)
 */


// default values of addon ctor options
const DEFAULT_OPTIONS: IImageAddonOptions = {
  workerPath: '/workers/xterm-addon-image-worker.js',
  enableSizeReports: true,
  pixelLimit: 16777216, // limit to 4096 x 4096 images
  cursorRight: false,
  cursorBelow: false,
  sixelSupport: true,
  sixelScrolling: true,
  sixelPaletteLimit: 256,
  sixelSizeLimit: 25000000,
  sixelPrivatePalette: true,
  sixelDefaultPalette: 'VT340-COLOR',
  storageLimit: 128,
  showPlaceholder: true
};

// definitions for _xtermGraphicsAttributes sequence
const enum GaItem {
  COLORS = 1,
  SIXEL_GEO = 2,
  REGIS_GEO = 3
}
const enum GaAction {
  READ = 1,
  SET_DEFAULT = 2,
  SET = 3,
  READ_MAX = 4
}
const enum GaStatus {
  SUCCESS = 0,
  ITEM_ERROR = 1,
  ACTION_ERROR = 2,
  FAILURE = 3
}


export class ImageAddon implements ITerminalAddon {
  private _opts: IImageAddonOptions;
  private _defaultOpts: IImageAddonOptions;
  private _storage: ImageStorage | undefined;
  private _renderer: ImageRenderer | undefined;
  private _disposables: IDisposable[] = [];
  private _terminal: ICoreTerminal | undefined;
  private _workerManager: WorkerManager;

  constructor(opts: IImageAddonOptionalOptions = DEFAULT_OPTIONS) {
    this._opts = Object.assign({}, DEFAULT_OPTIONS, opts);
    this._defaultOpts = Object.assign({}, DEFAULT_OPTIONS, opts);
    this._workerManager = new WorkerManager(this._opts.workerPath, this._opts);
    this._disposeLater(this._workerManager);
  }

  public dispose(): void {
    for (const obj of this._disposables) {
      obj.dispose();
    }
    this._disposables.length = 0;
  }

  private _disposeLater(...args: IDisposable[]): void {
    for (const obj of args) {
      this._disposables.push(obj);
    }
  }

  public activate(terminal: ICoreTerminal): void {
    this._terminal = terminal;

    // internal data structures
    this._renderer = new ImageRenderer(terminal, this._opts.showPlaceholder);
    this._storage = new ImageStorage(terminal, this._renderer, this._opts);

    // enable size reports
    if (this._opts.enableSizeReports) {
      const windowOptions = terminal.getOption('windowOptions');
      windowOptions.getWinSizePixels = true;
      windowOptions.getCellSizePixels = true;
      windowOptions.getWinSizeChars = true;
      terminal.setOption('windowOptions', windowOptions);
    }

    this._disposeLater(
      this._renderer,
      this._storage,

      // DECSET/DECRST/DA1/XTSMGRAPHICS handlers
      terminal.parser.registerCsiHandler({ prefix: '?', final: 'h' }, params => this._decset(params)),
      terminal.parser.registerCsiHandler({ prefix: '?', final: 'l' }, params => this._decrst(params)),
      terminal.parser.registerCsiHandler({ final: 'c' }, params => this._da1(params)),
      terminal.parser.registerCsiHandler({ prefix: '?', final: 'S' }, params => this._xtermGraphicsAttributes(params)),

      // render hook
      terminal.onRender(range => this._storage?.render(range)),

      /**
       * reset handlers covered:
       * - DECSTR
       * - RIS
       * - Terminal.reset()
       */
      terminal.parser.registerCsiHandler({ intermediates: '!', final: 'p' }, () => this.reset()),
      terminal.parser.registerEscHandler({ final: 'c' }, () => this.reset()),
      terminal._core._inputHandler.onRequestReset(() => this.reset()),

      // wipe canvas and delete alternate images on buffer switch
      terminal.buffer.onBufferChange(() => this._storage?.wipeAlternate()),

      // extend images to the right on resize
      terminal.onResize(metrics => this._storage?.viewportResize(metrics))
    );

    // SIXEL handler
    if (this._opts.sixelSupport) {
      this._disposeLater(
        terminal._core._inputHandler._parser.registerDcsHandler(
          { final: 'q' }, new SixelHandler(this._opts, this._storage, terminal, this._workerManager))
      );
    }
  }

  // Note: storageLimit is skipped here to not intoduce a surprising side effect.
  public reset(): boolean {
    // reset options customizable by sequences to defaults
    this._opts.sixelScrolling = this._defaultOpts.sixelScrolling;
    this._opts.cursorRight = this._defaultOpts.cursorRight;
    this._opts.cursorBelow = this._defaultOpts.cursorBelow;
    this._opts.sixelPrivatePalette = this._defaultOpts.sixelPrivatePalette;
    this._opts.sixelPaletteLimit = this._defaultOpts.sixelPaletteLimit;
    // also clear image storage
    this._storage?.reset();
    return false;
  }

  public get storageLimit(): number {
    return this._storage?.getLimit() || -1;
  }

  public set storageLimit(limit: number) {
    this._storage?.setLimit(limit);
    this._opts.storageLimit = limit;
  }

  public get storageUsage(): number {
    if (this._storage) {
      return this._storage.getUsage();
    }
    return -1;
  }

  public get showPlaceholder(): boolean {
    return this._opts.showPlaceholder;
  }

  public set showPlaceholder(value: boolean) {
    this._opts.showPlaceholder = value;
    this._renderer?.showPlaceholder(value);
  }

  public getImageAtBufferCell(x: number, y: number): HTMLCanvasElement | undefined {
    return this._storage?.getImageAtBufferCell(x, y);
  }

  public extractTileAtBufferCell(x: number, y: number): HTMLCanvasElement | undefined {
    return this._storage?.extractTileAtBufferCell(x, y);
  }

  private _report(s: string): void {
    this._terminal?._core._coreService.triggerDataEvent(s);
  }

  private _decset(params: (number | number[])[]): boolean {
    for (let i = 0; i < params.length; ++i) {
      switch (params[i]) {
        case 80:
          this._opts.sixelScrolling = true;
          break;
        case 1070:
          this._opts.sixelPrivatePalette = true;
          break;
        case 8452:
          this._opts.cursorRight = true;
          break;
        case 7730:
          this._opts.cursorBelow = true;
          break;
      }
    }
    return false;
  }

  private _decrst(params: (number | number[])[]): boolean {
    for (let i = 0; i < params.length; ++i) {
      switch (params[i]) {
        case 80:
          this._opts.sixelScrolling = false;
          break;
        case 1070:
          this._opts.sixelPrivatePalette = false;
          break;
        case 8452:
          this._opts.cursorRight = false;
          break;
        case 7730:
          this._opts.cursorBelow = false;
          break;
      }
    }
    return false;
  }

  // overload DA to return something more appropriate
  private _da1(params: (number | number[])[]): boolean {
    if (params[0] > 0) {
      return true;
    }
    // reported features:
    // 62 - VT220
    // 4 - SIXEL support
    // 9 - charsets
    // 22 - ANSI colors
    if (this._opts.sixelSupport && !this._workerManager.failed) {
      this._report(`\x1b[?62;4;9;22c`);
      return true;
    }
    return false;
  }

  /**
   * Implementation of xterm's graphics attribute sequence.
   *
   * Supported features:
   * - read/change palette limits (max 65536 by sixel lib)
   * - read SIXEL canvas geometry (always reports pixelLimit as square)
   *
   * Everything else is deactivated.
   */
  private _xtermGraphicsAttributes(params: (number | number[])[]): boolean {
    if (params.length < 2) {
      return true;
    }
    if (this._workerManager.failed) {
      // on worker error report graphics caps as not supported
      this._report(`\x1b[?${params[0]};${GaStatus.ITEM_ERROR}S`);
      return true;
    }
    if (params[0] === GaItem.COLORS) {
      switch (params[1]) {
        case GaAction.READ:
          this._report(`\x1b[?${params[0]};${GaStatus.SUCCESS};${this._opts.sixelPaletteLimit}S`);
          return true;
        case GaAction.SET_DEFAULT:
          this._opts.sixelPaletteLimit = this._defaultOpts.sixelPaletteLimit;
          this._report(`\x1b[?${params[0]};${GaStatus.SUCCESS};${this._opts.sixelPaletteLimit}S`);
          return true;
        case GaAction.SET:
          if (params.length > 2 && !(params[2] instanceof Array) && params[2] <= 65536) {
            this._opts.sixelPaletteLimit = params[2];
            this._report(`\x1b[?${params[0]};${GaStatus.SUCCESS};${this._opts.sixelPaletteLimit}S`);
          } else {
            this._report(`\x1b[?${params[0]};${GaStatus.ACTION_ERROR}S`);
          }
          return true;
        case GaAction.READ_MAX:
          this._report(`\x1b[?${params[0]};${GaStatus.SUCCESS};65536S`);
          return true;
        default:
          this._report(`\x1b[?${params[0]};${GaStatus.ACTION_ERROR}S`);
          return true;
      }
    }
    if (params[0] === GaItem.SIXEL_GEO) {
      switch (params[1]) {
        // we only implement read here (returns pixelLimit as square)
        case GaAction.READ:
          const x = Math.floor(Math.sqrt(this._opts.pixelLimit));
          this._report(`\x1b[?${params[0]};${GaStatus.SUCCESS};${x};${x}S`);
          return true;
        default:
          this._report(`\x1b[?${params[0]};${GaStatus.ACTION_ERROR}S`);
          return true;
      }
    }
    // exit with error on ReGIS or any other requests
    this._report(`\x1b[?${params[0]};${GaStatus.ITEM_ERROR}S`);
    return true;
  }
}
