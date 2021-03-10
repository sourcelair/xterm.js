/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Terminal as ITerminalApi, ITerminalOptions, IMarker, IDisposable, ILinkMatcherOptions, ITheme, ILocalizableStrings, ITerminalAddon, ISelectionPosition, IBufferNamespace as IBufferNamespaceApi, IParser, ILinkProvider, IUnicodeHandling, FontWeight } from 'xterm';
import { ITerminal } from 'browser/Types';
import { Terminal as TerminalCore } from '../Terminal';
import * as Strings from '../LocalizableStrings';
import { IEvent } from 'common/EventEmitter';
import { ParserApi } from 'common/public/ParserApi';
import { UnicodeApi } from 'common/public/UnicodeApi';
import { AddonManager } from './AddonManager';
import { BufferNamespaceApi } from 'common/public/BufferNamespaceApi';

export class Terminal implements ITerminalApi {
  private _core: ITerminal;
  private _addonManager: AddonManager;
  private _parser: IParser | undefined;
  private _buffer: BufferNamespaceApi | undefined;

  constructor(options?: ITerminalOptions) {
    this._core = new TerminalCore(options);
    this._addonManager = new AddonManager();
  }

  private _checkProposedApi(): void {
    if (!this._core.optionsService.options.allowProposedApi) {
      throw new Error('You must set the allowProposedApi option to true to use proposed API');
    }
  }

  public get onCursorMove(): IEvent<void> { return this._core.onCursorMove; }
  public get onLineFeed(): IEvent<void> { return this._core.onLineFeed; }
  public get onSelectionChange(): IEvent<void> { return this._core.onSelectionChange; }
  public get onData(): IEvent<string> { return this._core.onData; }
  public get onBinary(): IEvent<string> { return this._core.onBinary; }
  public get onTitleChange(): IEvent<string> { return this._core.onTitleChange; }
  public get onScroll(): IEvent<number> { return this._core.onScroll; }
  public get onKey(): IEvent<{ key: string, domEvent: KeyboardEvent }> { return this._core.onKey; }
  public get onRender(): IEvent<{ start: number, end: number }> { return this._core.onRender; }
  public get onResize(): IEvent<{ cols: number, rows: number }> { return this._core.onResize; }

  public get element(): HTMLElement | undefined { return this._core.element; }
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
  public get textarea(): HTMLTextAreaElement | undefined { return this._core.textarea; }
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
  public blur(): void {
    this._core.blur();
  }
  public focus(): void {
    this._core.focus();
  }
  public resize(columns: number, rows: number): void {
    this._verifyIntegers(columns, rows);
    this._core.resize(columns, rows);
  }
  public open(parent: HTMLElement): void {
    this._core.open(parent);
  }
  public attachCustomKeyEventHandler(customKeyEventHandler: (event: KeyboardEvent) => boolean): void {
    this._core.attachCustomKeyEventHandler(customKeyEventHandler);
  }
  public registerLinkMatcher(regex: RegExp, handler: (event: MouseEvent, uri: string) => void, options?: ILinkMatcherOptions): number {
    this._checkProposedApi();
    return this._core.registerLinkMatcher(regex, handler, options);
  }
  public deregisterLinkMatcher(matcherId: number): void {
    this._checkProposedApi();
    this._core.deregisterLinkMatcher(matcherId);
  }
  public registerLinkProvider(linkProvider: ILinkProvider): IDisposable {
    this._checkProposedApi();
    return this._core.registerLinkProvider(linkProvider);
  }
  public registerCharacterJoiner(handler: (text: string) => [number, number][]): number {
    this._checkProposedApi();
    return this._core.registerCharacterJoiner(handler);
  }
  public deregisterCharacterJoiner(joinerId: number): void {
    this._checkProposedApi();
    this._core.deregisterCharacterJoiner(joinerId);
  }
  public registerMarker(cursorYOffset: number): IMarker | undefined {
    this._checkProposedApi();
    this._verifyIntegers(cursorYOffset);
    return this._core.addMarker(cursorYOffset);
  }
  public addMarker(cursorYOffset: number): IMarker | undefined {
    return this.registerMarker(cursorYOffset);
  }
  public hasSelection(): boolean {
    return this._core.hasSelection();
  }
  public select(column: number, row: number, length: number): void {
    this._verifyIntegers(column, row, length);
    this._core.select(column, row, length);
  }
  public getSelection(): string {
    return this._core.getSelection();
  }
  public getSelectionPosition(): ISelectionPosition | undefined {
    return this._core.getSelectionPosition();
  }
  public clearSelection(): void {
    this._core.clearSelection();
  }
  public selectAll(): void {
    this._core.selectAll();
  }
  public selectLines(start: number, end: number): void {
    this._verifyIntegers(start, end);
    this._core.selectLines(start, end);
  }
  public dispose(): void {
    this._addonManager.dispose();
    this._core.dispose();
  }
  public scrollLines(amount: number): void {
    this._verifyIntegers(amount);
    this._core.scrollLines(amount);
  }
  public scrollPages(pageCount: number): void {
    this._verifyIntegers(pageCount);
    this._core.scrollPages(pageCount);
  }
  public scrollToTop(): void {
    this._core.scrollToTop();
  }
  public scrollToBottom(): void {
    this._core.scrollToBottom();
  }
  public scrollToLine(line: number): void {
    this._verifyIntegers(line);
    this._core.scrollToLine(line);
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
  public paste(data: string): void {
    this._core.paste(data);
  }
  public getOption(key: 'bellSound' | 'bellStyle' | 'cursorStyle' | 'fontFamily' | 'logLevel' | 'rendererType' | 'termName' | 'wordSeparator'): string;
  public getOption(key: 'allowTransparency' | 'altClickMovesCursor' | 'cancelEvents' | 'convertEol' | 'cursorBlink' | 'disableStdin' | 'macOptionIsMeta' | 'rightClickSelectsWord' | 'popOnBell' | 'visualBell'): boolean;
  public getOption(key: 'cols' | 'fontSize' | 'letterSpacing' | 'lineHeight' | 'rows' | 'tabStopWidth' | 'scrollback'): number;
  public getOption(key: 'fontWeight' | 'fontWeightBold'): FontWeight;
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
  public setOption(key: 'theme', value: ITheme): void;
  public setOption(key: 'cols' | 'rows', value: number): void;
  public setOption(key: string, value: any): void;
  public setOption(key: any, value: any): void {
    this._core.optionsService.setOption(key, value);
  }
  public refresh(start: number, end: number): void {
    this._verifyIntegers(start, end);
    this._core.refresh(start, end);
  }
  public reset(): void {
    this._core.reset();
  }
  public loadAddon(addon: ITerminalAddon): void {
    return this._addonManager.loadAddon(this, addon);
  }
  public static get strings(): ILocalizableStrings {
    return Strings;
  }

  private _verifyIntegers(...values: number[]): void {
    for (const value of values) {
      if (value === Infinity || isNaN(value) || value % 1 !== 0) {
        throw new Error('This API only accepts integers');
      }
    }
  }
}
