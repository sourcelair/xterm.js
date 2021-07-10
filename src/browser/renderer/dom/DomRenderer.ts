/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IRenderer, IRenderDimensions, IRequestRedrawEvent } from 'browser/renderer/Types';
import { BOLD_CLASS, ITALIC_CLASS, CURSOR_CLASS, CURSOR_STYLE_BLOCK_CLASS, CURSOR_BLINK_CLASS, CURSOR_STYLE_BAR_CLASS, CURSOR_STYLE_UNDERLINE_CLASS, DomRendererRowFactory } from 'browser/renderer/dom/DomRendererRowFactory';
import { INVERTED_DEFAULT_COLOR } from 'browser/renderer/atlas/Constants';
import { Disposable } from 'common/Lifecycle';
import { IColorSet, ILinkifierEvent, ILinkifier, ILinkifier2 } from 'browser/Types';
import { ICharSizeService } from 'browser/services/Services';
import { IOptionsService, IBufferService, IInstantiationService } from 'common/services/Services';
import { EventEmitter, IEvent } from 'common/EventEmitter';
import { color } from 'browser/Color';
import { removeElementFromParent } from 'browser/Dom';

const TERMINAL_CLASS_PREFIX = 'xterm-dom-renderer-owner-';
const ROW_CONTAINER_CLASS = 'xterm-rows';
const FG_CLASS_PREFIX = 'xterm-fg-';
const BG_CLASS_PREFIX = 'xterm-bg-';
const FOCUS_CLASS = 'xterm-focus';
const SELECTION_CLASS = 'xterm-selection';

let nextTerminalId = 1;

/**
 * A fallback renderer for when canvas is slow. This is not meant to be
 * particularly fast or feature complete, more just stable and usable for when
 * canvas is not an option.
 */
export class DomRenderer extends Disposable implements IRenderer {
  private _rowFactory: DomRendererRowFactory;
  private _terminalClass: number = nextTerminalId++;

  private _themeStyleElement!: HTMLStyleElement;
  private _dimensionsStyleElement!: HTMLStyleElement;
  private _rowContainer: HTMLElement;
  private _rowElements: HTMLElement[] = [];
  private _selectionContainer: HTMLElement;

  public dimensions: IRenderDimensions;

  public get onRequestRedraw(): IEvent<IRequestRedrawEvent> { return new EventEmitter<IRequestRedrawEvent>().event; }

  constructor(
    private _colors: IColorSet,
    private readonly _element: HTMLElement,
    private readonly _screenElement: HTMLElement,
    private readonly _viewportElement: HTMLElement,
    private readonly _linkifier: ILinkifier,
    private readonly _linkifier2: ILinkifier2,
    @IInstantiationService instantiationService: IInstantiationService,
    @ICharSizeService private readonly _charSizeService: ICharSizeService,
    @IOptionsService private readonly _optionsService: IOptionsService,
    @IBufferService private readonly _bufferService: IBufferService
  ) {
    super();
    this._rowContainer = document.createElement('div');
    this._rowContainer.classList.add(ROW_CONTAINER_CLASS);
    this._rowContainer.style.lineHeight = 'normal';
    this._rowContainer.setAttribute('aria-hidden', 'true');
    this._refreshRowElements(this._bufferService.cols, this._bufferService.rows);
    this._selectionContainer = document.createElement('div');
    this._selectionContainer.classList.add(SELECTION_CLASS);
    this._selectionContainer.setAttribute('aria-hidden', 'true');

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
    this._updateDimensions();
    this._injectCss();

    this._rowFactory = instantiationService.createInstance(DomRendererRowFactory, document, this._colors);

    this._element.classList.add(TERMINAL_CLASS_PREFIX + this._terminalClass);
    this._screenElement.appendChild(this._rowContainer);
    this._screenElement.appendChild(this._selectionContainer);

    this._linkifier.onShowLinkUnderline(e => this._onLinkHover(e));
    this._linkifier.onHideLinkUnderline(e => this._onLinkLeave(e));

    this._linkifier2.onShowLinkUnderline(e => this._onLinkHover(e));
    this._linkifier2.onHideLinkUnderline(e => this._onLinkLeave(e));
  }

  public dispose(): void {
    this._element.classList.remove(TERMINAL_CLASS_PREFIX + this._terminalClass);

    // Outside influences such as React unmounts may manipulate the DOM before our disposal.
    // https://github.com/xtermjs/xterm.js/issues/2960
    removeElementFromParent(this._rowContainer, this._selectionContainer, this._themeStyleElement, this._dimensionsStyleElement);

    super.dispose();
  }

  private _updateDimensions(): void {
    this.dimensions.scaledCharWidth = this._charSizeService.width * window.devicePixelRatio;
    this.dimensions.scaledCharHeight = Math.ceil(this._charSizeService.height * window.devicePixelRatio);
    this.dimensions.scaledCellWidth = this.dimensions.scaledCharWidth + Math.round(this._optionsService.options.letterSpacing);
    this.dimensions.scaledCellHeight = Math.floor(this.dimensions.scaledCharHeight * this._optionsService.options.lineHeight);
    this.dimensions.scaledCharLeft = 0;
    this.dimensions.scaledCharTop = 0;
    this.dimensions.scaledCanvasWidth = this.dimensions.scaledCellWidth * this._bufferService.cols;
    this.dimensions.scaledCanvasHeight = this.dimensions.scaledCellHeight * this._bufferService.rows;
    this.dimensions.canvasWidth = Math.round(this.dimensions.scaledCanvasWidth / window.devicePixelRatio);
    this.dimensions.canvasHeight = Math.round(this.dimensions.scaledCanvasHeight / window.devicePixelRatio);
    this.dimensions.actualCellWidth = this.dimensions.canvasWidth / this._bufferService.cols;
    this.dimensions.actualCellHeight = this.dimensions.canvasHeight / this._bufferService.rows;

    for (const element of this._rowElements) {
      element.style.width = `${this.dimensions.canvasWidth}px`;
      element.style.height = `${this.dimensions.actualCellHeight}px`;
      element.style.lineHeight = `${this.dimensions.actualCellHeight}px`;
      // Make sure rows don't overflow onto following row
      element.style.overflow = 'hidden';
    }

    if (!this._dimensionsStyleElement) {
      this._dimensionsStyleElement = document.createElement('style');
      this._screenElement.appendChild(this._dimensionsStyleElement);
    }

    const styles =
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS} span {` +
      ` display: inline-block;` +
      ` height: 100%;` +
      ` vertical-align: top;` +
      ` width: ${this.dimensions.actualCellWidth}px` +
      `}`;

    this._dimensionsStyleElement.textContent = styles;

    this._selectionContainer.style.height = this._viewportElement.style.height;
    this._screenElement.style.width = `${this.dimensions.canvasWidth}px`;
    this._screenElement.style.height = `${this.dimensions.canvasHeight}px`;
  }

  public setColors(colors: IColorSet): void {
    this._colors = colors;
    this._injectCss();
  }

  private _injectCss(): void {
    if (!this._themeStyleElement) {
      this._themeStyleElement = document.createElement('style');
      this._screenElement.appendChild(this._themeStyleElement);
    }

    // Base CSS
    let styles =
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS} {` +
      ` color: ${this._colors.foreground.css};` +
      ` font-family: ${this._optionsService.options.fontFamily};` +
      ` font-size: ${this._optionsService.options.fontSize}px;` +
      `}`;
    // Text styles
    styles +=
      `${this._terminalSelector} span:not(.${BOLD_CLASS}) {` +
      ` font-weight: ${this._optionsService.options.fontWeight};` +
      `}` +
      `${this._terminalSelector} span.${BOLD_CLASS} {` +
      ` font-weight: ${this._optionsService.options.fontWeightBold};` +
      `}` +
      `${this._terminalSelector} span.${ITALIC_CLASS} {` +
      ` font-style: italic;` +
      `}`;
    // Blink animation
    styles +=
      `@keyframes blink_box_shadow` + `_` + this._terminalClass + ` {` +
      ` 50% {` +
      `  box-shadow: none;` +
      ` }` +
      `}`;
    styles +=
      `@keyframes blink_block` + `_` + this._terminalClass + ` {` +
      ` 0% {` +
      `  background-color: ${this._colors.cursor.css};` +
      `  color: ${this._colors.cursorAccent.css};` +
      ` }` +
      ` 50% {` +
      `  background-color: ${this._colors.cursorAccent.css};` +
      `  color: ${this._colors.cursor.css};` +
      ` }` +
      `}`;
    // Cursor
    styles +=
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS}:not(.${FOCUS_CLASS}) .${CURSOR_CLASS}.${CURSOR_STYLE_BLOCK_CLASS} {` +
      ` outline: 1px solid ${this._colors.cursor.css};` +
      ` outline-offset: -1px;` +
      `}` +
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS}.${FOCUS_CLASS} .${CURSOR_CLASS}.${CURSOR_BLINK_CLASS}:not(.${CURSOR_STYLE_BLOCK_CLASS}) {` +
      ` animation: blink_box_shadow` + `_` + this._terminalClass + ` 1s step-end infinite;` +
      `}` +
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS}.${FOCUS_CLASS} .${CURSOR_CLASS}.${CURSOR_BLINK_CLASS}.${CURSOR_STYLE_BLOCK_CLASS} {` +
      ` animation: blink_block` + `_` + this._terminalClass + ` 1s step-end infinite;` +
      `}` +
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS}.${FOCUS_CLASS} .${CURSOR_CLASS}.${CURSOR_STYLE_BLOCK_CLASS} {` +
      ` background-color: ${this._colors.cursor.css};` +
      ` color: ${this._colors.cursorAccent.css};` +
      `}` +
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS} .${CURSOR_CLASS}.${CURSOR_STYLE_BAR_CLASS} {` +
      ` box-shadow: ${this._optionsService.options.cursorWidth}px 0 0 ${this._colors.cursor.css} inset;` +
      `}` +
      `${this._terminalSelector} .${ROW_CONTAINER_CLASS} .${CURSOR_CLASS}.${CURSOR_STYLE_UNDERLINE_CLASS} {` +
      ` box-shadow: 0 -1px 0 ${this._colors.cursor.css} inset;` +
      `}`;
    // Selection
    styles +=
      `${this._terminalSelector} .${SELECTION_CLASS} {` +
      ` position: absolute;` +
      ` top: 0;` +
      ` left: 0;` +
      ` z-index: 1;` +
      ` pointer-events: none;` +
      `}` +
      `${this._terminalSelector} .${SELECTION_CLASS} div {` +
      ` position: absolute;` +
      ` background-color: ${this._colors.selectionTransparent.css};` +
      `}`;
    // Colors
    this._colors.ansi.forEach((c, i) => {
      styles +=
        `${this._terminalSelector} .${FG_CLASS_PREFIX}${i} { color: ${c.css}; }` +
        `${this._terminalSelector} .${BG_CLASS_PREFIX}${i} { background-color: ${c.css}; }`;
    });
    styles +=
      `${this._terminalSelector} .${FG_CLASS_PREFIX}${INVERTED_DEFAULT_COLOR} { color: ${color.opaque(this._colors.background).css}; }` +
      `${this._terminalSelector} .${BG_CLASS_PREFIX}${INVERTED_DEFAULT_COLOR} { background-color: ${this._colors.foreground.css}; }`;

    this._themeStyleElement.textContent = styles;
  }

  public onDevicePixelRatioChange(): void {
    this._updateDimensions();
  }

  private _refreshRowElements(cols: number, rows: number): void {
    // Add missing elements
    for (let i = this._rowElements.length; i <= rows; i++) {
      const row = document.createElement('div');
      this._rowContainer.appendChild(row);
      this._rowElements.push(row);
    }
    // Remove excess elements
    while (this._rowElements.length > rows) {
      this._rowContainer.removeChild(this._rowElements.pop()!);
    }
  }

  public onResize(cols: number, rows: number): void {
    this._refreshRowElements(cols, rows);
    this._updateDimensions();
  }

  public onCharSizeChanged(): void {
    this._updateDimensions();
  }

  public onBlur(): void {
    this._rowContainer.classList.remove(FOCUS_CLASS);
  }

  public onFocus(): void {
    this._rowContainer.classList.add(FOCUS_CLASS);
  }

  public onSelectionChanged(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean): void {
    // Remove all selections
    while (this._selectionContainer.children.length) {
      this._selectionContainer.removeChild(this._selectionContainer.children[0]);
    }

    // Selection does not exist
    if (!start || !end) {
      return;
    }

    // Translate from buffer position to viewport position
    const viewportStartRow = start[1] - this._bufferService.buffer.ydisp;
    const viewportEndRow = end[1] - this._bufferService.buffer.ydisp;
    const viewportCappedStartRow = Math.max(viewportStartRow, 0);
    const viewportCappedEndRow = Math.min(viewportEndRow, this._bufferService.rows - 1);

    // No need to draw the selection
    if (viewportCappedStartRow >= this._bufferService.rows || viewportCappedEndRow < 0) {
      return;
    }

    // Create the selections
    const documentFragment = document.createDocumentFragment();

    if (columnSelectMode) {
      documentFragment.appendChild(
        this._createSelectionElement(viewportCappedStartRow, start[0], end[0], viewportCappedEndRow - viewportCappedStartRow + 1)
      );
    } else {
      // Draw first row
      const startCol = viewportStartRow === viewportCappedStartRow ? start[0] : 0;
      const endCol = viewportCappedStartRow === viewportEndRow ? end[0] : this._bufferService.cols;
      documentFragment.appendChild(this._createSelectionElement(viewportCappedStartRow, startCol, endCol));
      // Draw middle rows
      const middleRowsCount = viewportCappedEndRow - viewportCappedStartRow - 1;
      documentFragment.appendChild(this._createSelectionElement(viewportCappedStartRow + 1, 0, this._bufferService.cols, middleRowsCount));
      // Draw final row
      if (viewportCappedStartRow !== viewportCappedEndRow) {
        // Only draw viewportEndRow if it's not the same as viewporttartRow
        const endCol = viewportEndRow === viewportCappedEndRow ? end[0] : this._bufferService.cols;
        documentFragment.appendChild(this._createSelectionElement(viewportCappedEndRow, 0, endCol));
      }
    }
    this._selectionContainer.appendChild(documentFragment);
  }

  /**
   * Creates a selection element at the specified position.
   * @param row The row of the selection.
   * @param colStart The start column.
   * @param colEnd The end columns.
   */
  private _createSelectionElement(row: number, colStart: number, colEnd: number, rowCount: number = 1): HTMLElement {
    const element = document.createElement('div');
    element.style.height = `${rowCount * this.dimensions.actualCellHeight}px`;
    element.style.top = `${row * this.dimensions.actualCellHeight}px`;
    element.style.left = `${colStart * this.dimensions.actualCellWidth}px`;
    element.style.width = `${this.dimensions.actualCellWidth * (colEnd - colStart)}px`;
    return element;
  }

  public onDecorationsChanged(): void {
    // TBD
  }

  public onCursorMove(): void {
    // No-op, the cursor is drawn when rows are drawn
  }

  public onOptionsChanged(): void {
    // Force a refresh
    this._updateDimensions();
    this._injectCss();
  }

  public clear(): void {
    for (const e of this._rowElements) {
      e.innerText = '';
    }
  }

  public renderRows(start: number, end: number): void {
    const cursorAbsoluteY = this._bufferService.buffer.ybase + this._bufferService.buffer.y;
    const cursorX = Math.min(this._bufferService.buffer.x, this._bufferService.cols - 1);
    const cursorBlink = this._optionsService.options.cursorBlink;

    for (let y = start; y <= end; y++) {
      const rowElement = this._rowElements[y];
      rowElement.innerText = '';

      const row = y + this._bufferService.buffer.ydisp;
      const lineData = this._bufferService.buffer.lines.get(row);
      const cursorStyle = this._optionsService.options.cursorStyle;
      rowElement.appendChild(this._rowFactory.createRow(lineData!, row, row === cursorAbsoluteY, cursorStyle, cursorX, cursorBlink, this.dimensions.actualCellWidth, this._bufferService.cols));
    }
  }

  private get _terminalSelector(): string {
    return `.${TERMINAL_CLASS_PREFIX}${this._terminalClass}`;
  }

  private _onLinkHover(e: ILinkifierEvent): void {
    this._setCellUnderline(e.x1, e.x2, e.y1, e.y2, e.cols, true);
  }

  private _onLinkLeave(e: ILinkifierEvent): void {
    this._setCellUnderline(e.x1, e.x2, e.y1, e.y2, e.cols, false);
  }

  private _setCellUnderline(x: number, x2: number, y: number, y2: number, cols: number, enabled: boolean): void {
    while (x !== x2 || y !== y2) {
      const row = this._rowElements[y];
      if (!row) {
        return;
      }
      const span = row.children[x] as HTMLElement;
      if (span) {
        span.style.textDecoration = enabled ? 'underline' : 'none';
      }
      if (++x >= cols) {
        x = 0;
        y++;
      }
    }
  }
}
