/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IRenderDimensions } from 'browser/renderer/Types';
import { BaseRenderLayer } from 'browser/renderer/BaseRenderLayer';
import { IColorSet } from 'browser/Types';
import { IBufferService, IOptionsService } from 'common/services/Services';
import { IDecorationService } from 'browser/services/Services';


export class DecorationRenderLayer extends BaseRenderLayer {

  private _decorationService: IDecorationService;

  constructor(
    container: HTMLElement,
    zIndex: number,
    colors: IColorSet,
    rendererId: number,
    @IDecorationService decorationService: IDecorationService,
    @IBufferService bufferService: IBufferService,
    @IOptionsService optionsService: IOptionsService
  ) {
    super(container, 'decorations', zIndex, true, colors, rendererId, bufferService, optionsService);
    this._decorationService = decorationService;
  }

  public reset(): void {
    this._clearAll();
  }

  public onDecorationsChanged(): void {
    // Remove all decorations
    this._clearAll();

    this._decorationService.forEachDecoration((element) => {
      // Translate from buffer position to viewport position
      const viewportStartRow = element.startRow - this._bufferService.buffer.ydisp;
      const viewportEndRow = element.endRow - this._bufferService.buffer.ydisp;
      const viewportCappedStartRow = Math.max(viewportStartRow, 0);
      const viewportCappedEndRow = Math.min(viewportEndRow, this._bufferService.rows - 1);
      const width = element.endColumn - element.startColumn;
      const height = viewportCappedEndRow - viewportCappedStartRow + 1;
      if (viewportStartRow <= viewportEndRow) {
        if (element.fillStyle) {
          this._ctx.fillStyle = element.fillStyle;
          this._fillCells(element.startColumn, viewportCappedStartRow, width, height);
        }
        if (element.strokeStyle) {
          this._ctx.strokeStyle = element.strokeStyle;
          this._strokeRectAtCell(element.startColumn, viewportCappedStartRow, width, height);
        }
      }
      return false;
    });
  }

}
