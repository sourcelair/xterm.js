/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { CharData, IBufferLine, ICellData, IAttributeData, IExtendedAttrs } from 'common/Types';
import { stringFromCodePoint } from 'common/input/TextDecoder';
import { CHAR_DATA_CHAR_INDEX, CHAR_DATA_WIDTH_INDEX, CHAR_DATA_ATTR_INDEX, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE, WHITESPACE_CELL_CHAR, Content, BgFlags, Cell } from 'common/buffer/Constants';
import { CellData } from 'common/buffer/CellData';
import { AttributeData, ExtendedAttrs } from 'common/buffer/AttributeData';

export const DEFAULT_ATTR_DATA = Object.freeze(new AttributeData());

/**
 * Typed array based bufferline implementation.
 *
 * There are 2 ways to insert data into the cell buffer:
 * - `setCellFromCodepoint` + `addCodepointToCell`
 *   Use these for data that is already UTF32.
 *   Used during normal input in `InputHandler` for faster buffer access.
 * - `setCell`
 *   This method takes a CellData object and stores the data in the buffer.
 *   Use `CellData.fromCharData` to create the CellData object (e.g. from JS string).
 *
 * To retrieve data from the buffer use either one of the primitive methods
 * (if only one particular value is needed) or `loadCell`. For `loadCell` in a loop
 * memory allocs / GC pressure can be greatly reduced by reusing the CellData object.
 */
export class BufferLine implements IBufferLine {
  protected _data: Uint32Array;
  protected _combined: {[index: number]: string} = {};
  protected _extendedAttrs: {[index: number]: ExtendedAttrs} = {};
  public length: number;

  constructor(cols: number, fillCellData?: ICellData, public isWrapped: boolean = false) {
    this._data = new Uint32Array(cols * Cell.SIZE);
    const cell = fillCellData || CellData.fromCharData([0, NULL_CELL_CHAR, NULL_CELL_WIDTH, NULL_CELL_CODE]);
    for (let i = 0; i < cols; ++i) {
      this.setCell(i, cell);
    }
    this.length = cols;
  }

  /**
   * Get cell data CharData.
   * @deprecated
   */
  public get(index: number): CharData {
    const content = this._data[index * Cell.SIZE + Cell.CONTENT];
    const cp = content & Content.CODEPOINT_MASK;
    return [
      this._data[index * Cell.SIZE + Cell.FG],
      (content & Content.IS_COMBINED_MASK)
        ? this._combined[index]
        : (cp) ? stringFromCodePoint(cp) : '',
      content >> Content.WIDTH_SHIFT,
      (content & Content.IS_COMBINED_MASK)
        ? this._combined[index].charCodeAt(this._combined[index].length - 1)
        : cp
    ];
  }

  /**
   * Set cell data from CharData.
   * @deprecated
   */
  public set(index: number, value: CharData): void {
    this._data[index * Cell.SIZE + Cell.FG] = value[CHAR_DATA_ATTR_INDEX];
    if (value[CHAR_DATA_CHAR_INDEX].length > 1) {
      this._combined[index] = value[1];
      this._data[index * Cell.SIZE + Cell.CONTENT] = index | Content.IS_COMBINED_MASK | (value[CHAR_DATA_WIDTH_INDEX] << Content.WIDTH_SHIFT);
    } else {
      this._data[index * Cell.SIZE + Cell.CONTENT] = value[CHAR_DATA_CHAR_INDEX].charCodeAt(0) | (value[CHAR_DATA_WIDTH_INDEX] << Content.WIDTH_SHIFT);
    }
  }

  /**
   * primitive getters
   * use these when only one value is needed, otherwise use `loadCell`
   */
  public getWidth(index: number): number {
    return this._data[index * Cell.SIZE + Cell.CONTENT] >> Content.WIDTH_SHIFT;
  }

  /** Test whether content has width. */
  public hasWidth(index: number): number {
    return this._data[index * Cell.SIZE + Cell.CONTENT] & Content.WIDTH_MASK;
  }

  /** Get FG cell component. */
  public getFg(index: number): number {
    return this._data[index * Cell.SIZE + Cell.FG];
  }

  /** Get BG cell component. */
  public getBg(index: number): number {
    return this._data[index * Cell.SIZE + Cell.BG];
  }

  /**
   * Test whether contains any chars.
   * Basically an empty has no content, but other cells might differ in FG/BG
   * from real empty cells.
   * */
  public hasContent(index: number): number {
    return this._data[index * Cell.SIZE + Cell.CONTENT] & Content.HAS_CONTENT_MASK;
  }

  /**
   * Get codepoint of the cell.
   * To be in line with `code` in CharData this either returns
   * a single UTF32 codepoint or the last codepoint of a combined string.
   */
  public getCodePoint(index: number): number {
    const content = this._data[index * Cell.SIZE + Cell.CONTENT];
    if (content & Content.IS_COMBINED_MASK) {
      return this._combined[index].charCodeAt(this._combined[index].length - 1);
    }
    return content & Content.CODEPOINT_MASK;
  }

  /** Test whether the cell contains a combined string. */
  public isCombined(index: number): number {
    return this._data[index * Cell.SIZE + Cell.CONTENT] & Content.IS_COMBINED_MASK;
  }

  /** Returns the string content of the cell. */
  public getString(index: number): string {
    const content = this._data[index * Cell.SIZE + Cell.CONTENT];
    if (content & Content.IS_COMBINED_MASK) {
      return this._combined[index];
    }
    if (content & Content.CODEPOINT_MASK) {
      return stringFromCodePoint(content & Content.CODEPOINT_MASK);
    }
    // return empty string for empty cells
    return '';
  }

  /**
   * Load data at `index` into `cell`. This is used to access cells in a way that's more friendly
   * to GC as it significantly reduced the amount of new objects/references needed.
   */
  public loadCell(index: number, cell: ICellData): ICellData {
    const startIndex = index * Cell.SIZE;
    cell.content = this._data[startIndex + Cell.CONTENT];
    cell.fg = this._data[startIndex + Cell.FG];
    cell.bg = this._data[startIndex + Cell.BG];
    if (cell.content & Content.IS_COMBINED_MASK) {
      cell.combinedData = this._combined[index];
    }
    if (cell.bg & BgFlags.HAS_EXTENDED) {
      cell.extended = this._extendedAttrs[index];
    }
    return cell;
  }

  /**
   * Set data at `index` to `cell`.
   */
  public setCell(index: number, cell: ICellData): void {
    if (cell.content & Content.IS_COMBINED_MASK) {
      this._combined[index] = cell.combinedData;
    }
    if (cell.bg & BgFlags.HAS_EXTENDED) {
      this._extendedAttrs[index] = cell.extended;
    }
    this._data[index * Cell.SIZE + Cell.CONTENT] = cell.content;
    this._data[index * Cell.SIZE + Cell.FG] = cell.fg;
    this._data[index * Cell.SIZE + Cell.BG] = cell.bg;
  }

  /**
   * Set cell data from input handler.
   * Since the input handler see the incoming chars as UTF32 codepoints,
   * it gets an optimized access method.
   */
  public setCellFromCodePoint(index: number, codePoint: number, width: number, fg: number, bg: number, eAttrs: IExtendedAttrs): void {
    if (bg & BgFlags.HAS_EXTENDED) {
      this._extendedAttrs[index] = eAttrs;
    }
    this._data[index * Cell.SIZE + Cell.CONTENT] = codePoint | (width << Content.WIDTH_SHIFT);
    this._data[index * Cell.SIZE + Cell.FG] = fg;
    this._data[index * Cell.SIZE + Cell.BG] = bg;
  }

  /**
   * Add a codepoint to a cell from input handler.
   * During input stage combining chars with a width of 0 follow and stack
   * onto a leading char. Since we already set the attrs
   * by the previous `setDataFromCodePoint` call, we can omit it here.
   */
  public addCodepointToCell(index: number, codePoint: number): void {
    let content = this._data[index * Cell.SIZE + Cell.CONTENT];
    if (content & Content.IS_COMBINED_MASK) {
      // we already have a combined string, simply add
      this._combined[index] += stringFromCodePoint(codePoint);
    } else {
      if (content & Content.CODEPOINT_MASK) {
        // normal case for combining chars:
        //  - move current leading char + new one into combined string
        //  - set combined flag
        this._combined[index] = stringFromCodePoint(content & Content.CODEPOINT_MASK) + stringFromCodePoint(codePoint);
        content &= ~Content.CODEPOINT_MASK; // set codepoint in buffer to 0
        content |= Content.IS_COMBINED_MASK;
      } else {
        // should not happen - we actually have no data in the cell yet
        // simply set the data in the cell buffer with a width of 1
        content = codePoint | (1 << Content.WIDTH_SHIFT);
      }
      this._data[index * Cell.SIZE + Cell.CONTENT] = content;
    }
  }

  public insertCells(pos: number, n: number, fillCellData: ICellData, eraseAttr?: IAttributeData): void {
    pos %= this.length;

    // handle fullwidth at pos: reset cell one to the left if pos is second cell of a wide char
    if (pos && this.getWidth(pos - 1) === 2) {
      this.setCellFromCodePoint(pos - 1, 0, 1, eraseAttr?.fg || 0, eraseAttr?.bg || 0, eraseAttr?.extended || new ExtendedAttrs());
    }

    if (n < this.length - pos) {
      const cell = new CellData();
      for (let i = this.length - pos - n - 1; i >= 0; --i) {
        this.setCell(pos + n + i, this.loadCell(pos + i, cell));
      }
      for (let i = 0; i < n; ++i) {
        this.setCell(pos + i, fillCellData);
      }
    } else {
      for (let i = pos; i < this.length; ++i) {
        this.setCell(i, fillCellData);
      }
    }

    // handle fullwidth at line end: reset last cell if it is first cell of a wide char
    if (this.getWidth(this.length - 1) === 2) {
      this.setCellFromCodePoint(this.length - 1, 0, 1, eraseAttr?.fg || 0, eraseAttr?.bg || 0, eraseAttr?.extended || new ExtendedAttrs());
    }
  }

  public deleteCells(pos: number, n: number, fillCellData: ICellData, eraseAttr?: IAttributeData): void {
    pos %= this.length;
    if (n < this.length - pos) {
      const cell = new CellData();
      for (let i = 0; i < this.length - pos - n; ++i) {
        this.setCell(pos + i, this.loadCell(pos + n + i, cell));
      }
      for (let i = this.length - n; i < this.length; ++i) {
        this.setCell(i, fillCellData);
      }
    } else {
      for (let i = pos; i < this.length; ++i) {
        this.setCell(i, fillCellData);
      }
    }

    // handle fullwidth at pos:
    // - reset pos-1 if wide char
    // - reset pos if width==0 (previous second cell of a wide char)
    if (pos && this.getWidth(pos - 1) === 2) {
      this.setCellFromCodePoint(pos - 1, 0, 1, eraseAttr?.fg || 0, eraseAttr?.bg || 0, eraseAttr?.extended || new ExtendedAttrs());
    }
    if (this.getWidth(pos) === 0 && !this.hasContent(pos)) {
      this.setCellFromCodePoint(pos, 0, 1, eraseAttr?.fg || 0, eraseAttr?.bg || 0, eraseAttr?.extended || new ExtendedAttrs());
    }
  }

  public replaceCells(start: number, end: number, fillCellData: ICellData, eraseAttr?: IAttributeData): void {
    // handle fullwidth at start: reset cell one to the left if start is second cell of a wide char
    if (start && this.getWidth(start - 1) === 2) {
      this.setCellFromCodePoint(start - 1, 0, 1, eraseAttr?.fg || 0, eraseAttr?.bg || 0, eraseAttr?.extended || new ExtendedAttrs());
    }
    // handle fullwidth at last cell + 1: reset to empty cell if it is second part of a wide char
    if (end < this.length && this.getWidth(end - 1) === 2) {
      this.setCellFromCodePoint(end, 0, 1, eraseAttr?.fg || 0, eraseAttr?.bg || 0, eraseAttr?.extended || new ExtendedAttrs());
    }

    while (start < end  && start < this.length) {
      this.setCell(start++, fillCellData);
    }
  }

  public resize(cols: number, fillCellData: ICellData): void {
    if (cols === this.length) {
      return;
    }
    if (cols > this.length) {
      const data = new Uint32Array(cols * Cell.SIZE);
      if (this.length) {
        if (cols * Cell.SIZE < this._data.length) {
          data.set(this._data.subarray(0, cols * Cell.SIZE));
        } else {
          data.set(this._data);
        }
      }
      this._data = data;
      for (let i = this.length; i < cols; ++i) {
        this.setCell(i, fillCellData);
      }
    } else {
      if (cols) {
        const data = new Uint32Array(cols * Cell.SIZE);
        data.set(this._data.subarray(0, cols * Cell.SIZE));
        this._data = data;
        // Remove any cut off combined data, FIXME: repeat this for extended attrs
        const keys = Object.keys(this._combined);
        for (let i = 0; i < keys.length; i++) {
          const key = parseInt(keys[i], 10);
          if (key >= cols) {
            delete this._combined[key];
          }
        }
      } else {
        this._data = new Uint32Array(0);
        this._combined = {};
      }
    }
    this.length = cols;
  }

  /** fill a line with fillCharData */
  public fill(fillCellData: ICellData): void {
    this._combined = {};
    this._extendedAttrs = {};
    for (let i = 0; i < this.length; ++i) {
      this.setCell(i, fillCellData);
    }
  }

  /** alter to a full copy of line  */
  public copyFrom(line: BufferLine): void {
    if (this.length !== line.length) {
      this._data = new Uint32Array(line._data);
    } else {
      // use high speed copy if lengths are equal
      this._data.set(line._data);
    }
    this.length = line.length;
    this._combined = {};
    for (const el in line._combined) {
      this._combined[el] = line._combined[el];
    }
    this._extendedAttrs = {};
    for (const el in line._extendedAttrs) {
      this._extendedAttrs[el] = line._extendedAttrs[el];
    }
    this.isWrapped = line.isWrapped;
  }

  /** create a new clone */
  public clone(): IBufferLine {
    const newLine = new BufferLine(0);
    newLine._data = new Uint32Array(this._data);
    newLine.length = this.length;
    for (const el in this._combined) {
      newLine._combined[el] = this._combined[el];
    }
    for (const el in this._extendedAttrs) {
      newLine._extendedAttrs[el] = this._extendedAttrs[el];
    }
    newLine.isWrapped = this.isWrapped;
    return newLine;
  }

  public getTrimmedLength(): number {
    for (let i = this.length - 1; i >= 0; --i) {
      if ((this._data[i * Cell.SIZE + Cell.CONTENT] & Content.HAS_CONTENT_MASK)) {
        return i + (this._data[i * Cell.SIZE + Cell.CONTENT] >> Content.WIDTH_SHIFT);
      }
    }
    return 0;
  }

  public copyCellsFrom(src: BufferLine, srcCol: number, destCol: number, length: number, applyInReverse: boolean): void {
    const srcData = src._data;
    if (applyInReverse) {
      for (let cell = length - 1; cell >= 0; cell--) {
        for (let i = 0; i < Cell.SIZE; i++) {
          this._data[(destCol + cell) * Cell.SIZE + i] = srcData[(srcCol + cell) * Cell.SIZE + i];
        }
      }
    } else {
      for (let cell = 0; cell < length; cell++) {
        for (let i = 0; i < Cell.SIZE; i++) {
          this._data[(destCol + cell) * Cell.SIZE + i] = srcData[(srcCol + cell) * Cell.SIZE + i];
        }
      }
    }

    // Move any combined data over as needed, FIXME: repeat for extended attrs
    const srcCombinedKeys = Object.keys(src._combined);
    for (let i = 0; i < srcCombinedKeys.length; i++) {
      const key = parseInt(srcCombinedKeys[i], 10);
      if (key >= srcCol) {
        this._combined[key - srcCol + destCol] = src._combined[key];
      }
    }
  }

  public translateToString(trimRight: boolean = false, startCol: number = 0, endCol: number = this.length): string {
    if (trimRight) {
      endCol = Math.min(endCol, this.getTrimmedLength());
    }
    let result = '';
    while (startCol < endCol) {
      const content = this._data[startCol * Cell.SIZE + Cell.CONTENT];
      const cp = content & Content.CODEPOINT_MASK;
      result += (content & Content.IS_COMBINED_MASK) ? this._combined[startCol] : (cp) ? stringFromCodePoint(cp) : WHITESPACE_CELL_CHAR;
      startCol += (content >> Content.WIDTH_SHIFT) || 1; // always advance by 1
    }
    return result;
  }
}
