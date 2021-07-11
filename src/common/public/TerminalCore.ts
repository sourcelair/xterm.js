/**
 * Copyright (c) 2014 The xterm.js authors. All rights reserved.
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 *   The original design remains. The terminal itself
 *   has been extended to include xterm CSI codes, among
 *   other features.
 *
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

import { ICoreTerminal, IDisposable, IMarker, ITerminalOptions } from 'common/Types';
import { EventEmitter, IEvent, forwardEvent } from 'common/EventEmitter';
import { DEFAULT_ATTR_DATA } from 'common/buffer/BufferLine';
import { IBuffer, IBufferSet } from 'common/buffer/Types';
import { CoreTerminal } from 'common/CoreTerminal';
import { ITerminalOptions as IInitializedTerminalOptions } from 'common/services/Services';
import { IFunctionIdentifier, IParams } from 'common/parser/Types';

export class Terminal extends CoreTerminal {
  // TODO: We should remove options once components adopt optionsService
  public get options(): IInitializedTerminalOptions { return this.optionsService.options; }


  private _onCursorMove = new EventEmitter<void>();
  public get onCursorMove(): IEvent<void> { return this._onCursorMove.event; }
  private _onTitleChange = new EventEmitter<string>();
  public get onTitleChange(): IEvent<string> { return this._onTitleChange.event; }

  private _onA11yCharEmitter = new EventEmitter<string>();
  public get onA11yChar(): IEvent<string> { return this._onA11yCharEmitter.event; }
  private _onA11yTabEmitter = new EventEmitter<number>();
  public get onA11yTab(): IEvent<number> { return this._onA11yTabEmitter.event; }

  /**
   * Creates a new `Terminal` object.
   *
   * @param options An object containing a set of options, the available options are:
   *   - `cursorBlink` (boolean): Whether the terminal cursor blinks
   *   - `cols` (number): The number of columns of the terminal (horizontal size)
   *   - `rows` (number): The number of rows of the terminal (vertical size)
   *
   * @public
   * @class Xterm Xterm
   * @alias module:xterm/src/xterm
   */
  constructor(
    options: ITerminalOptions = {}
  ) {
    super(options);

    this._setup();

    // Setup InputHandler listeners
    this.register(this._inputHandler.onRequestReset(() => this.reset()));
    this.register(this._inputHandler.onRequestScroll((eraseAttr, isWrapped) => this.scroll(eraseAttr, isWrapped || undefined)));
    this.register(forwardEvent(this._inputHandler.onCursorMove, this._onCursorMove));
    this.register(forwardEvent(this._inputHandler.onTitleChange, this._onTitleChange));
    this.register(forwardEvent(this._inputHandler.onA11yChar, this._onA11yCharEmitter));
    this.register(forwardEvent(this._inputHandler.onA11yTab, this._onA11yTabEmitter));
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    super.dispose();
    this.write = () => { };
  }

  /**
   * Convenience property to active buffer.
   */
  public get buffer(): IBuffer {
    return this.buffers.active;
  }

  public get markers(): IMarker[] {
    return this.buffer.markers;
  }

  public addMarker(cursorYOffset: number): IMarker | undefined {
    // Disallow markers on the alt buffer
    if (this.buffer !== this.buffers.normal) {
      return;
    }

    return this.buffer.addMarker(this.buffer.ybase + this.buffer.y + cursorYOffset);
  }

  /**
   * Resizes the terminal.
   *
   * @param x The number of columns to resize to.
   * @param y The number of rows to resize to.
   */
  public resize(x: number, y: number): void {
    if (x === this.cols && y === this.rows) {
      return;
    }

    super.resize(x, y);
  }

  /**
   * Clear the entire buffer, making the prompt line the new first line.
   */
  public clear(): void {
    if (this.buffer.ybase === 0 && this.buffer.y === 0) {
      // Don't clear if it's already clear
      return;
    }
    this.buffer.lines.set(0, this.buffer.lines.get(this.buffer.ybase + this.buffer.y)!);
    this.buffer.lines.length = 1;
    this.buffer.ydisp = 0;
    this.buffer.ybase = 0;
    this.buffer.y = 0;
    for (let i = 1; i < this.rows; i++) {
      this.buffer.lines.push(this.buffer.getBlankLine(DEFAULT_ATTR_DATA));
    }
    this._onScroll.fire(this.buffer.ydisp);
  }

  /**
   * Reset terminal.
   * Note: Calling this directly from JS is synchronous but does not clear
   * input buffers and does not reset the parser, thus the terminal will
   * continue to apply pending input data.
   * If you need in band reset (synchronous with input data) consider
   * using DECSTR (soft reset, CSI ! p) or RIS instead (hard reset, ESC c).
   */
  public reset(): void {
    /**
     * Since _setup handles a full terminal creation, we have to carry forward
     * a few things that should not reset.
     */
    this.options.rows = this.rows;
    this.options.cols = this.cols;

    this._setup();
    super.reset();
  }
}
