/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IRenderDimensions } from 'browser/renderer/Types';
import { BaseRenderLayer } from 'browser/renderer/BaseRenderLayer';
import { IColorSet } from 'browser/Types';
import { IBufferService, IOptionsService } from 'common/services/Services';

interface ISelectionState {
  start?: [number, number];
  end?: [number, number];
  columnSelectMode?: boolean;
  ydisp?: number;
}

export class SelectionRenderLayer extends BaseRenderLayer {
  private _state!: ISelectionState;

  constructor(
    container: HTMLElement,
    zIndex: number,
    colors: IColorSet,
    rendererId: number,
    @IBufferService bufferService: IBufferService,
    @IOptionsService optionsService: IOptionsService
  ) {
    super(container, 'selection', zIndex, true, colors, rendererId, bufferService, optionsService);
    this._clearState();
  }

  private _clearState(): void {
    this._state = {
      start: undefined,
      end: undefined,
      columnSelectMode: undefined,
      ydisp: undefined
    };
  }

  public resize(dim: IRenderDimensions): void {
    super.resize(dim);
    // Redraw state after it got cleared
    if (this._state.start && this._state.end) {
      this._drawState(this._state);
    }
  }

  public reset(): void {
    if (this._state.start && this._state.end) {
      this._clearState();
      this._clearAll();
    }
  }

  public onSelectionChanged(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean): void {
    // Selection has not changed
    if (!this._didStateChange(start, end, columnSelectMode, this._bufferService.buffer.ydisp)) {
      return;
    }

    // Draw state
    this._drawState({
      start: start,
      end: end,
      columnSelectMode: columnSelectMode,
      ydisp: this._bufferService.buffer.ydisp
    });

    if (!start || !end) {
      return;
    }

    // Save state for next render
    this._state.start = [start[0], start[1]];
    this._state.end = [end[0], end[1]];
    this._state.columnSelectMode = columnSelectMode;
    this._state.ydisp = this._bufferService.buffer.ydisp;
  }

  private _drawState(stateToDraw: ISelectionState): void {
    // Remove all selections
    this._clearAll();

    // Selection does not exist
    if (!stateToDraw.start || !stateToDraw.end) {
      this._clearState();
      return;
    }

    // Translate from buffer position to viewport position
    const viewportStartRow = stateToDraw.start[1] - this._bufferService.buffer.ydisp;
    const viewportEndRow = stateToDraw.end[1] - this._bufferService.buffer.ydisp;
    const viewportCappedStartRow = Math.max(viewportStartRow, 0);
    const viewportCappedEndRow = Math.min(viewportEndRow, this._bufferService.rows - 1);

    // No need to draw the selection
    if (viewportCappedStartRow >= this._bufferService.rows || viewportCappedEndRow < 0) {
      this._state.ydisp = this._bufferService.buffer.ydisp;
      return;
    }

    this._ctx.fillStyle = this._colors.selectionTransparent.css;

    if (stateToDraw.columnSelectMode) {
      const startCol = stateToDraw.start[0];
      const width = stateToDraw.end[0] - startCol;
      const height = viewportCappedEndRow - viewportCappedStartRow + 1;
      this._fillCells(startCol, viewportCappedStartRow, width, height);
    } else {
      // Draw first row
      const startCol = viewportStartRow === viewportCappedStartRow ? stateToDraw.start[0] : 0;
      const startRowEndCol = viewportCappedStartRow === viewportEndRow ? stateToDraw.end[0] : this._bufferService.cols;
      this._fillCells(startCol, viewportCappedStartRow, startRowEndCol - startCol, 1);

      // Draw middle rows
      const middleRowsCount = Math.max(viewportCappedEndRow - viewportCappedStartRow - 1, 0);
      this._fillCells(0, viewportCappedStartRow + 1, this._bufferService.cols, middleRowsCount);

      // Draw final row
      if (viewportCappedStartRow !== viewportCappedEndRow) {
        // Only draw viewportEndRow if it's not the same as viewportStartRow
        const endCol = viewportEndRow === viewportCappedEndRow ? stateToDraw.end[0] : this._bufferService.cols;
        this._fillCells(0, viewportCappedEndRow, endCol, 1);
      }
    }
  }

  private _didStateChange(start: [number, number] | undefined, end: [number, number] | undefined, columnSelectMode: boolean, ydisp: number): boolean {
    return !this._areCoordinatesEqual(start, this._state.start) ||
      !this._areCoordinatesEqual(end, this._state.end) ||
      columnSelectMode !== this._state.columnSelectMode ||
      ydisp !== this._state.ydisp;
  }

  private _areCoordinatesEqual(coord1: [number, number] | undefined, coord2: [number, number] | undefined): boolean {
    if (!coord1 || !coord2) {
      return false;
    }

    return coord1[0] === coord2[0] && coord1[1] === coord2[1];
  }
}
