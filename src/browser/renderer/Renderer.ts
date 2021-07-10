/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { TextRenderLayer } from 'browser/renderer/TextRenderLayer';
import { SelectionRenderLayer } from 'browser/renderer/SelectionRenderLayer';
import { CursorRenderLayer } from 'browser/renderer/CursorRenderLayer';
import { IRenderLayer, IRenderer, IRenderDimensions, IRequestRedrawEvent } from 'browser/renderer/Types';
import { LinkRenderLayer } from 'browser/renderer/LinkRenderLayer';
import { Disposable } from 'common/Lifecycle';
import { IColorSet, ILinkifier, ILinkifier2 } from 'browser/Types';
import { ICharSizeService, ICoreBrowserService } from 'browser/services/Services';
import { IBufferService, IOptionsService, ICoreService, IInstantiationService } from 'common/services/Services';
import { removeTerminalFromCache } from 'browser/renderer/atlas/CharAtlasCache';
import { EventEmitter, IEvent } from 'common/EventEmitter';
import { DecorationRenderLayer } from 'browser/renderer/DecorationRenderLayer';

let nextRendererId = 1;

export class Renderer extends Disposable implements IRenderer {
  private _id = nextRendererId++;

  private _renderLayers: IRenderLayer[];
  private _devicePixelRatio: number;

  public dimensions: IRenderDimensions;

  private _onRequestRedraw = new EventEmitter<IRequestRedrawEvent>();
  public get onRequestRedraw(): IEvent<IRequestRedrawEvent> { return this._onRequestRedraw.event; }

  constructor(
    private _colors: IColorSet,
    private readonly _screenElement: HTMLElement,
    linkifier: ILinkifier,
    linkifier2: ILinkifier2,
    @IInstantiationService instantiationService: IInstantiationService,
    @IBufferService private readonly _bufferService: IBufferService,
    @ICharSizeService private readonly _charSizeService: ICharSizeService,
    @IOptionsService private readonly _optionsService: IOptionsService
  ) {
    super();
    const allowTransparency = this._optionsService.options.allowTransparency;
    this._renderLayers = [
      instantiationService.createInstance(TextRenderLayer, this._screenElement, 0, this._colors, allowTransparency, this._id),
      instantiationService.createInstance(SelectionRenderLayer, this._screenElement, 1, this._colors, this._id),
      instantiationService.createInstance(LinkRenderLayer, this._screenElement, 2, this._colors, this._id, linkifier, linkifier2),
      instantiationService.createInstance(DecorationRenderLayer, this._screenElement, 3, this._colors, this._id),
      instantiationService.createInstance(CursorRenderLayer, this._screenElement, 4, this._colors, this._id, this._onRequestRedraw)
    ];
    this.dimensions = {
      scaledCharWidth: 0,
      scaledCharHeight: 0,
      scaledCellWidth: 0,
      scaledCellHeight: 0,
      scaledCharLeft: 0,
      scaledCharTop: 0,
      scaledCanvasWidth: 0,
      scaledCanvasHeight: 0,
      canvasWidth: 0,
      canvasHeight: 0,
      actualCellWidth: 0,
      actualCellHeight: 0
    };
    this._devicePixelRatio = window.devicePixelRatio;
    this._updateDimensions();
    this.onOptionsChanged();
  }

  public dispose(): void {
    for (const l of this._renderLayers) {
      l.dispose();
    }
    super.dispose();
    removeTerminalFromCache(this._id);
  }

  public onDevicePixelRatioChange(): void {
    // If the device pixel ratio changed, the char atlas needs to be regenerated
    // and the terminal needs to refreshed
    if (this._devicePixelRatio !== window.devicePixelRatio) {
      this._devicePixelRatio = window.devicePixelRatio;
      this.onResize(this._bufferService.cols, this._bufferService.rows);
    }
  }

  public setColors(colors: IColorSet): void {
    this._colors = colors;
    // Clear layers and force a full render
    for (const l of this._renderLayers) {
      l.setColors(this._colors);
      l.reset();
    }
  }

  public onResize(cols: number, rows: number): void {
    // Update character and canvas dimensions
    this._updateDimensions();

    // Resize all render layers
    for (const l of this._renderLayers) {
      l.resize(this.dimensions);
    }

    // Resize the screen
    this._screenElement.style.width = `${this.dimensions.canvasWidth}px`;
    this._screenElement.style.height = `${this.dimensions.canvasHeight}px`;
  }

  public onCharSizeChanged(): void {
    this.onResize(this._bufferService.cols, this._bufferService.rows);
  }

  public onBlur(): void {
    this._runOperation(l => l.onBlur());
  }

  public onFocus(): void {
    this._runOperation(l => l.onFocus());
  }

  public onSelectionChanged(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean = false): void {
    this._runOperation(l => l.onSelectionChanged(start, end, columnSelectMode));
  }

  public onDecorationsChanged(): void {
    this._runOperation(l => l.onDecorationsChanged());
  }

  public onCursorMove(): void {
    this._runOperation(l => l.onCursorMove());
  }

  public onOptionsChanged(): void {
    this._runOperation(l => l.onOptionsChanged());
  }

  public clear(): void {
    this._runOperation(l => l.reset());
  }

  private _runOperation(operation: (layer: IRenderLayer) => void): void {
    for (const l of this._renderLayers) {
      operation(l);
    }
  }

  /**
   * Performs the refresh loop callback, calling refresh only if a refresh is
   * necessary before queueing up the next one.
   */
  public renderRows(start: number, end: number): void {
    for (const l of this._renderLayers) {
      l.onGridChanged(start, end);
    }
  }

  /**
   * Recalculates the character and canvas dimensions.
   */
  private _updateDimensions(): void {
    if (!this._charSizeService.hasValidSize) {
      return;
    }

    // Calculate the scaled character width. Width is floored as it must be
    // drawn to an integer grid in order for the CharAtlas "stamps" to not be
    // blurry. When text is drawn to the grid not using the CharAtlas, it is
    // clipped to ensure there is no overlap with the next cell.
    this.dimensions.scaledCharWidth = Math.floor(this._charSizeService.width * window.devicePixelRatio);

    // Calculate the scaled character height. Height is ceiled in case
    // devicePixelRatio is a floating point number in order to ensure there is
    // enough space to draw the character to the cell.
    this.dimensions.scaledCharHeight = Math.ceil(this._charSizeService.height * window.devicePixelRatio);

    // Calculate the scaled cell height, if lineHeight is not 1 then the value
    // will be floored because since lineHeight can never be lower then 1, there
    // is a guarentee that the scaled line height will always be larger than
    // scaled char height.
    this.dimensions.scaledCellHeight = Math.floor(this.dimensions.scaledCharHeight * this._optionsService.options.lineHeight);

    // Calculate the y coordinate within a cell that text should draw from in
    // order to draw in the center of a cell.
    this.dimensions.scaledCharTop = this._optionsService.options.lineHeight === 1 ? 0 : Math.round((this.dimensions.scaledCellHeight - this.dimensions.scaledCharHeight) / 2);

    // Calculate the scaled cell width, taking the letterSpacing into account.
    this.dimensions.scaledCellWidth = this.dimensions.scaledCharWidth + Math.round(this._optionsService.options.letterSpacing);

    // Calculate the x coordinate with a cell that text should draw from in
    // order to draw in the center of a cell.
    this.dimensions.scaledCharLeft = Math.floor(this._optionsService.options.letterSpacing / 2);

    // Recalculate the canvas dimensions; scaled* define the actual number of
    // pixel in the canvas
    this.dimensions.scaledCanvasHeight = this._bufferService.rows * this.dimensions.scaledCellHeight;
    this.dimensions.scaledCanvasWidth = this._bufferService.cols * this.dimensions.scaledCellWidth;

    // The the size of the canvas on the page. It's very important that this
    // rounds to nearest integer and not ceils as browsers often set
    // window.devicePixelRatio as something like 1.100000023841858, when it's
    // actually 1.1. Ceiling causes blurriness as the backing canvas image is 1
    // pixel too large for the canvas element size.
    this.dimensions.canvasHeight = Math.round(this.dimensions.scaledCanvasHeight / window.devicePixelRatio);
    this.dimensions.canvasWidth = Math.round(this.dimensions.scaledCanvasWidth / window.devicePixelRatio);

    // Get the _actual_ dimensions of an individual cell. This needs to be
    // derived from the canvasWidth/Height calculated above which takes into
    // account window.devicePixelRatio. ICharSizeService.width/height by itself
    // is insufficient when the page is not at 100% zoom level as it's measured
    // in CSS pixels, but the actual char size on the canvas can differ.
    this.dimensions.actualCellHeight = this.dimensions.canvasHeight / this._bufferService.rows;
    this.dimensions.actualCellWidth = this.dimensions.canvasWidth / this._bufferService.cols;
  }
}
