/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Terminal as ITerminalApi, ITerminalOptions, IMarker, IDisposable, IBuffer as IBufferApi, IBufferNamespace as IBufferNamespaceApi, IBufferLine as IBufferLineApi, IBufferCell as IBufferCellApi, IParser, IFunctionIdentifier, IUnicodeHandling, IUnicodeVersionProvider } from 'xterm-core';
import { IBufferLine, ICellData } from 'common/Types';
import { IBuffer } from 'common/buffer/Types';
import { CellData } from 'common/buffer/CellData';
import { Terminal as TerminalCore } from './TerminalCore';
import { IEvent, EventEmitter } from 'common/EventEmitter';
import { IParams } from 'common/parser/Types';
import { ITerminal } from 'common/public/types';

export class Terminal implements ITerminalApi {
  private _core: ITerminal;
  private _parser: IParser | undefined;
  private _buffer: BufferNamespaceApi | undefined;

  constructor(options?: ITerminalOptions) {
    this._core = new TerminalCore(options);
  }

  private _checkProposedApi(): void {
    if (!this._core.optionsService.options.allowProposedApi) {
      throw new Error('You must set the allowProposedApi option to true to use proposed API');
    }
  }

  public get onCursorMove(): IEvent<void> { return this._core.onCursorMove; }
  public get onLineFeed(): IEvent<void> { return this._core.onLineFeed; }
  public get onData(): IEvent<string> { return this._core.onData; }
  public get onBinary(): IEvent<string> { return this._core.onBinary; }
  public get onTitleChange(): IEvent<string> { return this._core.onTitleChange; }
  public get onResize(): IEvent<{ cols: number, rows: number }> { return this._core.onResize; }

  public get parser(): IParser {
    this._checkProposedApi();
    if (!this._parser) {
      this._parser = new ParserApi(this._core);
    }
    return this._parser;
  }
  public get unicode(): IUnicodeHandling {
    this._checkProposedApi();
    return new UnicodeApi(this._core);
  }
  public get rows(): number { return this._core.rows; }
  public get cols(): number { return this._core.cols; }
  public get buffer(): IBufferNamespaceApi {
    this._checkProposedApi();
    if (!this._buffer) {
      this._buffer = new BufferNamespaceApi(this._core);
    }
    return this._buffer;
  }
  public get markers(): ReadonlyArray<IMarker> {
    this._checkProposedApi();
    return this._core.markers;
  }
  public resize(columns: number, rows: number): void {
    this._verifyIntegers(columns, rows);
    this._core.resize(columns, rows);
  }
  public registerMarker(cursorYOffset: number): IMarker | undefined {
    this._checkProposedApi();
    this._verifyIntegers(cursorYOffset);
    return this._core.addMarker(cursorYOffset);
  }
  public addMarker(cursorYOffset: number): IMarker | undefined {
    return this.registerMarker(cursorYOffset);
  }
  public dispose(): void {
    this._core.dispose();
  }
  public clear(): void {
    this._core.clear();
  }
  public write(data: string | Uint8Array, callback?: () => void): void {
    this._core.write(data, callback);
  }
  public writeUtf8(data: Uint8Array, callback?: () => void): void {
    this._core.write(data, callback);
  }
  public writeln(data: string | Uint8Array, callback?: () => void): void {
    this._core.write(data);
    this._core.write('\r\n', callback);
  }
  public getOption(key: 'bellSound' | 'bellStyle' | 'cursorStyle' | 'fontFamily' | 'logLevel' | 'rendererType' | 'termName' | 'wordSeparator'): string;
  public getOption(key: 'allowTransparency' | 'altClickMovesCursor' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'disableStdin' | 'macOptionIsMeta' | 'rightClickSelectsWord' | 'popOnBell' | 'visualBell'): boolean;
  public getOption(key: 'cols' | 'fontSize' | 'letterSpacing' | 'lineHeight' | 'rows' | 'tabStopWidth' | 'scrollback'): number;
  public getOption(key: string): any;
  public getOption(key: any): any {
    return this._core.optionsService.getOption(key);
  }
  public setOption(key: 'bellSound' | 'fontFamily' | 'termName' | 'wordSeparator', value: string): void;
  public setOption(key: 'fontWeight' | 'fontWeightBold', value: 'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900' | number): void;
  public setOption(key: 'logLevel', value: 'debug' | 'info' | 'warn' | 'error' | 'off'): void;
  public setOption(key: 'bellStyle', value: 'none' | 'visual' | 'sound' | 'both'): void;
  public setOption(key: 'cursorStyle', value: 'block' | 'underline' | 'bar'): void;
  public setOption(key: 'allowTransparency' | 'altClickMovesCursor' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'disableStdin' | 'macOptionIsMeta' | 'rightClickSelectsWord' | 'popOnBell' | 'visualBell', value: boolean): void;
  public setOption(key: 'fontSize' | 'letterSpacing' | 'lineHeight' | 'tabStopWidth' | 'scrollback', value: number): void;
  public setOption(key: 'cols' | 'rows', value: number): void;
  public setOption(key: string, value: any): void;
  public setOption(key: any, value: any): void {
    this._core.optionsService.setOption(key, value);
  }
  public reset(): void {
    this._core.reset();
  }

  private _verifyIntegers(...values: number[]): void {
    for (const value of values) {
      if (value === Infinity || isNaN(value) || value % 1 !== 0) {
        throw new Error('This API only accepts integers');
      }
    }
  }
}

class BufferApiView implements IBufferApi {
  constructor(
    private _buffer: IBuffer,
    public readonly type: 'normal' | 'alternate'
  ) { }

  public init(buffer: IBuffer): BufferApiView {
    this._buffer = buffer;
    return this;
  }

  public get cursorY(): number { return this._buffer.y; }
  public get cursorX(): number { return this._buffer.x; }
  public get viewportY(): number { return this._buffer.ydisp; }
  public get baseY(): number { return this._buffer.ybase; }
  public get length(): number { return this._buffer.lines.length; }
  public getLine(y: number): IBufferLineApi | undefined {
    const line = this._buffer.lines.get(y);
    if (!line) {
      return undefined;
    }
    return new BufferLineApiView(line);
  }
  public getNullCell(): IBufferCellApi { return new CellData(); }
}

class BufferNamespaceApi implements IBufferNamespaceApi {
  private _normal: BufferApiView;
  private _alternate: BufferApiView;
  private _onBufferChange = new EventEmitter<IBufferApi>();
  public get onBufferChange(): IEvent<IBufferApi> { return this._onBufferChange.event; }

  constructor(private _core: ITerminal) {
    this._normal = new BufferApiView(this._core.buffers.normal, 'normal');
    this._alternate = new BufferApiView(this._core.buffers.alt, 'alternate');
    this._core.buffers.onBufferActivate(() => this._onBufferChange.fire(this.active));
  }
  public get active(): IBufferApi {
    if (this._core.buffers.active === this._core.buffers.normal) { return this.normal; }
    if (this._core.buffers.active === this._core.buffers.alt) { return this.alternate; }
    throw new Error('Active buffer is neither normal nor alternate');
  }
  public get normal(): IBufferApi {
    return this._normal.init(this._core.buffers.normal);
  }
  public get alternate(): IBufferApi {
    return this._alternate.init(this._core.buffers.alt);
  }
}

class BufferLineApiView implements IBufferLineApi {
  constructor(private _line: IBufferLine) { }

  public get isWrapped(): boolean { return this._line.isWrapped; }
  public get length(): number { return this._line.length; }
  public getCell(x: number, cell?: IBufferCellApi): IBufferCellApi | undefined {
    if (x < 0 || x >= this._line.length) {
      return undefined;
    }

    if (cell) {
      this._line.loadCell(x, <ICellData>cell);
      return cell;
    }
    return this._line.loadCell(x, new CellData());
  }
  public translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string {
    return this._line.translateToString(trimRight, startColumn, endColumn);
  }
}

class ParserApi implements IParser {
  constructor(private _core: ITerminal) { }

  public registerCsiHandler(id: IFunctionIdentifier, callback: (params: (number | number[])[]) => boolean): IDisposable {
    return this._core.addCsiHandler(id, (params: IParams) => callback(params.toArray()));
  }
  public addCsiHandler(id: IFunctionIdentifier, callback: (params: (number | number[])[]) => boolean): IDisposable {
    return this.registerCsiHandler(id, callback);
  }
  public registerDcsHandler(id: IFunctionIdentifier, callback: (data: string, param: (number | number[])[]) => boolean): IDisposable {
    return this._core.addDcsHandler(id, (data: string, params: IParams) => callback(data, params.toArray()));
  }
  public addDcsHandler(id: IFunctionIdentifier, callback: (data: string, param: (number | number[])[]) => boolean): IDisposable {
    return this.registerDcsHandler(id, callback);
  }
  public registerEscHandler(id: IFunctionIdentifier, handler: () => boolean): IDisposable {
    return this._core.addEscHandler(id, handler);
  }
  public addEscHandler(id: IFunctionIdentifier, handler: () => boolean): IDisposable {
    return this.registerEscHandler(id, handler);
  }
  public registerOscHandler(ident: number, callback: (data: string) => boolean): IDisposable {
    return this._core.addOscHandler(ident, callback);
  }
  public addOscHandler(ident: number, callback: (data: string) => boolean): IDisposable {
    return this.registerOscHandler(ident, callback);
  }
}

class UnicodeApi implements IUnicodeHandling {
  constructor(private _core: ITerminal) { }

  public register(provider: IUnicodeVersionProvider): void {
    this._core.unicodeService.register(provider);
  }

  public get versions(): string[] {
    return this._core.unicodeService.versions;
  }

  public get activeVersion(): string {
    return this._core.unicodeService.activeVersion;
  }

  public set activeVersion(version: string) {
    this._core.unicodeService.activeVersion = version;
  }
}
