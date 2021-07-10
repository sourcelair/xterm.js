/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IDisposable } from 'common/Types';
import { IColorSet } from 'browser/Types';
import { IEvent } from 'common/EventEmitter';

export interface IRenderDimensions {
  scaledCharWidth: number;
  scaledCharHeight: number;
  scaledCellWidth: number;
  scaledCellHeight: number;
  scaledCharLeft: number;
  scaledCharTop: number;
  scaledCanvasWidth: number;
  scaledCanvasHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  actualCellWidth: number;
  actualCellHeight: number;
}

export interface IRequestRedrawEvent {
  start: number;
  end: number;
}

/**
 * Note that IRenderer implementations should emit the refresh event after
 * rendering rows to the screen.
 */
export interface IRenderer extends IDisposable {
  readonly dimensions: IRenderDimensions;

  /**
   * Fires when the renderer is requesting to be redrawn on the next animation
   * frame but is _not_ a result of content changing (eg. selection changes).
   */
  readonly onRequestRedraw: IEvent<IRequestRedrawEvent>;

  dispose(): void;
  setColors(colors: IColorSet): void;
  onDevicePixelRatioChange(): void;
  onResize(cols: number, rows: number): void;
  onCharSizeChanged(): void;
  onBlur(): void;
  onFocus(): void;
  onSelectionChanged(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean): void;
  onDecorationsChanged(): void;
  onCursorMove(): void;
  onOptionsChanged(): void;
  clear(): void;
  renderRows(start: number, end: number): void;
}

export interface IRenderLayer extends IDisposable {
  /**
   * Called when the terminal loses focus.
   */
  onBlur(): void;

  /**
   * * Called when the terminal gets focus.
   */
  onFocus(): void;

  /**
   * Called when the cursor is moved.
   */
  onCursorMove(): void;

  /**
   * Called when options change.
   */
  onOptionsChanged(): void;

  /**
   * Called when the theme changes.
   */
  setColors(colorSet: IColorSet): void;

  /**
   * Called when the data in the grid has changed (or needs to be rendered
   * again).
   */
  onGridChanged(startRow: number, endRow: number): void;

  /**
   * Calls when the selection changes.
   */
  onSelectionChanged(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean): void;

  /**
   * Called when decorations change
   */
  onDecorationsChanged(): void;

  /**
   * Resize the render layer.
   */
  resize(dim: IRenderDimensions): void;

  /**
   * Clear the state of the render layer.
   */
  reset(): void;
}
