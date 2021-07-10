/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IDisposable, IMarker, ISelectionPosition, ILinkProvider } from 'xterm';
import { IEvent, EventEmitter } from 'common/EventEmitter';
import { ICharacterJoinerService, ICharSizeService, IMouseService, IRenderService, ISelectionService } from 'browser/services/Services';
import { IRenderDimensions, IRenderer, IRequestRedrawEvent } from 'browser/renderer/Types';
import { IColorSet, ILinkMatcherOptions, ITerminal, ILinkifier, ILinkifier2, IBrowser, IViewport, IColorManager, ICompositionHelper, CharacterJoinerHandler } from 'browser/Types';
import { IBuffer, IBufferStringIterator, IBufferSet } from 'common/buffer/Types';
import { IBufferLine, ICellData, IAttributeData, ICircularList, XtermListener, ICharset, ITerminalOptions, IDecorationElement } from 'common/Types';
import { Buffer } from 'common/buffer/Buffer';
import * as Browser from 'common/Platform';
import { Terminal } from 'browser/Terminal';
import { IUnicodeService, IOptionsService } from 'common/services/Services';
import { IFunctionIdentifier, IParams } from 'common/parser/Types';
import { AttributeData } from 'common/buffer/AttributeData';

export class TestTerminal extends Terminal {
  public get curAttrData(): IAttributeData { return (this as any)._inputHandler._curAttrData; }
  public keyDown(ev: any): boolean | undefined { return this._keyDown(ev); }
  public keyPress(ev: any): boolean { return this._keyPress(ev); }
  public writeP(data: string | Uint8Array): Promise<void> {
    return new Promise(r => this.write(data, r));
  }
}

export class MockTerminal implements ITerminal {
  public onBlur!: IEvent<void>;
  public onFocus!: IEvent<void>;
  public onA11yChar!: IEvent<string>;
  public onA11yTab!: IEvent<number>;
  public onCursorMove!: IEvent<void>;
  public onLineFeed!: IEvent<void>;
  public onSelectionChange!: IEvent<void>;
  public onData!: IEvent<string>;
  public onBinary!: IEvent<string>;
  public onTitleChange!: IEvent<string>;
  public onBell!: IEvent<void>;
  public onScroll!: IEvent<number>;
  public onKey!: IEvent<{ key: string, domEvent: KeyboardEvent }>;
  public onRender!: IEvent<{ start: number, end: number }>;
  public onResize!: IEvent<{ cols: number, rows: number }>;
  public markers!: IMarker[];
  public optionsService!: IOptionsService;
  public unicodeService!: IUnicodeService;
  public addMarker(cursorYOffset: number): IMarker {
    throw new Error('Method not implemented.');
  }
  public selectLines(start: number, end: number): void {
    throw new Error('Method not implemented.');
  }
  public scrollToLine(line: number): void {
    throw new Error('Method not implemented.');
  }
  public static string: any;
  public setOption(key: any, value: any): void {
    throw new Error('Method not implemented.');
  }
  public blur(): void {
    throw new Error('Method not implemented.');
  }
  public focus(): void {
    throw new Error('Method not implemented.');
  }
  public resize(columns: number, rows: number): void {
    throw new Error('Method not implemented.');
  }
  public writeln(data: string): void {
    throw new Error('Method not implemented.');
  }
  public paste(data: string): void {
    throw new Error('Method not implemented.');
  }
  public open(parent: HTMLElement): void {
    throw new Error('Method not implemented.');
  }
  public attachCustomKeyEventHandler(customKeyEventHandler: (event: KeyboardEvent) => boolean): void {
    throw new Error('Method not implemented.');
  }
  public registerCsiHandler(id: IFunctionIdentifier, callback: (params: IParams) => boolean | Promise<boolean>): IDisposable {
    throw new Error('Method not implemented.');
  }
  public registerDcsHandler(id: IFunctionIdentifier, callback: (data: string, param: IParams) => boolean | Promise<boolean>): IDisposable {
    throw new Error('Method not implemented.');
  }
  public registerEscHandler(id: IFunctionIdentifier, handler: () => boolean | Promise<boolean>): IDisposable {
    throw new Error('Method not implemented.');
  }
  public registerOscHandler(ident: number, callback: (data: string) => boolean | Promise<boolean>): IDisposable {
    throw new Error('Method not implemented.');
  }
  public registerLinkMatcher(regex: RegExp, handler: (event: MouseEvent, uri: string) => boolean | void, options?: ILinkMatcherOptions): number {
    throw new Error('Method not implemented.');
  }
  public deregisterLinkMatcher(matcherId: number): void {
    throw new Error('Method not implemented.');
  }
  public registerLinkProvider(linkProvider: ILinkProvider): IDisposable {
    throw new Error('Method not implemented.');
  }
  public hasSelection(): boolean {
    throw new Error('Method not implemented.');
  }
  public getSelection(): string {
    throw new Error('Method not implemented.');
  }
  public getSelectionPosition(): ISelectionPosition | undefined {
    throw new Error('Method not implemented.');
  }
  public clearSelection(): void {
    throw new Error('Method not implemented.');
  }
  public select(column: number, row: number, length: number): void {
    throw new Error('Method not implemented.');
  }
  public selectAll(): void {
    throw new Error('Method not implemented.');
  }
  public dispose(): void {
    throw new Error('Method not implemented.');
  }
  public scrollPages(pageCount: number): void {
    throw new Error('Method not implemented.');
  }
  public scrollToTop(): void {
    throw new Error('Method not implemented.');
  }
  public scrollToBottom(): void {
    throw new Error('Method not implemented.');
  }
  public clear(): void {
    throw new Error('Method not implemented.');
  }
  public write(data: string): void {
    throw new Error('Method not implemented.');
  }
  public writeUtf8(data: Uint8Array): void {
    throw new Error('Method not implemented.');
  }
  public bracketedPasteMode!: boolean;
  public renderer!: IRenderer;
  public linkifier!: ILinkifier;
  public linkifier2!: ILinkifier2;
  public isFocused!: boolean;
  public options: ITerminalOptions = {};
  public element!: HTMLElement;
  public screenElement!: HTMLElement;
  public rowContainer!: HTMLElement;
  public selectionContainer!: HTMLElement;
  public selectionService!: ISelectionService;
  public textarea!: HTMLTextAreaElement;
  public rows!: number;
  public cols!: number;
  public browser: IBrowser = Browser as any;
  public writeBuffer!: string[];
  public children!: HTMLElement[];
  public cursorHidden!: boolean;
  public cursorState!: number;
  public scrollback!: number;
  public buffers!: IBufferSet;
  public buffer!: IBuffer;
  public viewport!: IViewport;
  public applicationCursor!: boolean;
  public handler(data: string): void {
    throw new Error('Method not implemented.');
  }
  public on(event: string, callback: (...args: any[]) => void): void {
    throw new Error('Method not implemented.');
  }
  public off(type: string, listener: XtermListener): void {
    throw new Error('Method not implemented.');
  }
  public addDisposableListener(type: string, handler: XtermListener): IDisposable {
    throw new Error('Method not implemented.');
  }
  public scrollLines(disp: number): void {
    throw new Error('Method not implemented.');
  }
  public scrollToRow(absoluteRow: number): number {
    throw new Error('Method not implemented.');
  }
  public cancel(ev: Event, force?: boolean): void {
    throw new Error('Method not implemented.');
  }
  public log(text: string): void {
    throw new Error('Method not implemented.');
  }
  public emit(event: string, data: any): void {
    throw new Error('Method not implemented.');
  }
  public reset(): void {
    throw new Error('Method not implemented.');
  }
  public refresh(start: number, end: number): void {
    throw new Error('Method not implemented.');
  }
  public registerCharacterJoiner(handler: CharacterJoinerHandler): number { return 0; }
  public deregisterCharacterJoiner(joinerId: number): void { }
  public addDecoration(element: IDecorationElement): number | undefined {
    throw new Error('Method not implemented.');
  }
  public removeDeoration(handle: number): boolean {
    throw new Error('Method not implemented.');
  }
  public clearDecorations(): number {
    throw new Error('Method not implemented.');
  }
}

export class MockBuffer implements IBuffer {
  public markers!: IMarker[];
  public addMarker(y: number): IMarker {
    throw new Error('Method not implemented.');
  }
  public isCursorInViewport!: boolean;
  public lines!: ICircularList<IBufferLine>;
  public ydisp!: number;
  public ybase!: number;
  public hasScrollback!: boolean;
  public y!: number;
  public x!: number;
  public tabs: any;
  public scrollBottom!: number;
  public scrollTop!: number;
  public savedY!: number;
  public savedX!: number;
  public savedCharset: ICharset | undefined;
  public savedCurAttrData = new AttributeData();
  public translateBufferLineToString(lineIndex: number, trimRight: boolean, startCol?: number, endCol?: number): string {
    return Buffer.prototype.translateBufferLineToString.apply(this, arguments as any);
  }
  public getWrappedRangeForLine(y: number): { first: number, last: number } {
    return Buffer.prototype.getWrappedRangeForLine.apply(this, arguments as any);
  }
  public nextStop(x?: number): number {
    throw new Error('Method not implemented.');
  }
  public prevStop(x?: number): number {
    throw new Error('Method not implemented.');
  }
  public setLines(lines: ICircularList<IBufferLine>): void {
    this.lines = lines;
  }
  public getBlankLine(attr: IAttributeData, isWrapped?: boolean): IBufferLine {
    return Buffer.prototype.getBlankLine.apply(this, arguments as any);
  }
  public stringIndexToBufferIndex(lineIndex: number, stringIndex: number): number[] {
    return Buffer.prototype.stringIndexToBufferIndex.apply(this, arguments as any);
  }
  public iterator(trimRight: boolean, startIndex?: number, endIndex?: number): IBufferStringIterator {
    return Buffer.prototype.iterator.apply(this, arguments as any);
  }
  public getNullCell(attr?: IAttributeData): ICellData {
    throw new Error('Method not implemented.');
  }
  public getWhitespaceCell(attr?: IAttributeData): ICellData {
    throw new Error('Method not implemented.');
  }
}

export class MockRenderer implements IRenderer {
  public onRequestRedraw!: IEvent<IRequestRedrawEvent>;
  public onCanvasResize!: IEvent<{ width: number, height: number }>;
  public onRender!: IEvent<{ start: number, end: number }>;
  public dispose(): void {
    throw new Error('Method not implemented.');
  }
  public colorManager!: IColorManager;
  public on(type: string, listener: XtermListener): void {
    throw new Error('Method not implemented.');
  }
  public off(type: string, listener: XtermListener): void {
    throw new Error('Method not implemented.');
  }
  public emit(type: string, data?: any): void {
    throw new Error('Method not implemented.');
  }
  public addDisposableListener(type: string, handler: XtermListener): IDisposable {
    throw new Error('Method not implemented.');
  }
  public dimensions!: IRenderDimensions;
  public setColors(colors: IColorSet): void {
    throw new Error('Method not implemented.');
  }
  public onResize(cols: number, rows: number): void { }
  public onCharSizeChanged(): void { }
  public onBlur(): void { }
  public onFocus(): void { }
  public onSelectionChanged(start: [number, number], end: [number, number]): void { }
  public onDecorationsChanged(): void { }
  public onCursorMove(): void { }
  public onOptionsChanged(): void { }
  public onDevicePixelRatioChange(): void { }
  public clear(): void { }
  public renderRows(start: number, end: number): void { }
}

export class MockViewport implements IViewport {
  public dispose(): void {
    throw new Error('Method not implemented.');
  }
  public scrollBarWidth: number = 0;
  public onThemeChange(colors: IColorSet): void {
    throw new Error('Method not implemented.');
  }
  public onWheel(ev: WheelEvent): boolean {
    throw new Error('Method not implemented.');
  }
  public onTouchStart(ev: TouchEvent): void {
    throw new Error('Method not implemented.');
  }
  public onTouchMove(ev: TouchEvent): boolean {
    throw new Error('Method not implemented.');
  }
  public syncScrollArea(): void { }
  public getLinesScrolled(ev: WheelEvent): number {
    throw new Error('Method not implemented.');
  }
}

export class MockCompositionHelper implements ICompositionHelper {
  public get isComposing(): boolean {
    return false;
  }
  public compositionstart(): void {
    throw new Error('Method not implemented.');
  }
  public compositionupdate(ev: CompositionEvent): void {
    throw new Error('Method not implemented.');
  }
  public compositionend(): void {
    throw new Error('Method not implemented.');
  }
  public updateCompositionElements(dontRecurse?: boolean): void {
    throw new Error('Method not implemented.');
  }
  public keydown(ev: KeyboardEvent): boolean {
    return true;
  }
}

export class MockCharSizeService implements ICharSizeService {
  public serviceBrand: undefined;
  public get hasValidSize(): boolean { return this.width > 0 && this.height > 0; }
  public onCharSizeChange: IEvent<void> = new EventEmitter<void>().event;
  constructor(public width: number, public height: number) {}
  public measure(): void {}
}

export class MockMouseService implements IMouseService {
  public serviceBrand: undefined;
  public getCoords(event: {clientX: number, clientY: number}, element: HTMLElement, colCount: number, rowCount: number, isSelection?: boolean): [number, number] | undefined {
    throw new Error('Not implemented');
  }

  public getRawByteCoords(event: MouseEvent, element: HTMLElement, colCount: number, rowCount: number): { x: number, y: number } | undefined {
    throw new Error('Not implemented');
  }
}

export class MockRenderService implements IRenderService {
  public serviceBrand: undefined;
  public onDimensionsChange: IEvent<IRenderDimensions> = new EventEmitter<IRenderDimensions>().event;
  public onRenderedBufferChange: IEvent<{ start: number, end: number }, void> = new EventEmitter<{ start: number, end: number }>().event;
  public onRefreshRequest: IEvent<{ start: number, end: number}, void> = new EventEmitter<{ start: number, end: number }>().event;
  public dimensions: IRenderDimensions = {
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
  public refreshRows(start: number, end: number): void {
    throw new Error('Method not implemented.');
  }
  public resize(cols: number, rows: number): void {
    throw new Error('Method not implemented.');
  }
  public changeOptions(): void {
    throw new Error('Method not implemented.');
  }
  public setRenderer(renderer: IRenderer): void {
    throw new Error('Method not implemented.');
  }
  public setColors(colors: IColorSet): void {
    throw new Error('Method not implemented.');
  }
  public onDevicePixelRatioChange(): void {
    throw new Error('Method not implemented.');
  }
  public onResize(cols: number, rows: number): void {
    throw new Error('Method not implemented.');
  }
  public onCharSizeChanged(): void {
    throw new Error('Method not implemented.');
  }
  public onBlur(): void {
    throw new Error('Method not implemented.');
  }
  public onFocus(): void {
    throw new Error('Method not implemented.');
  }
  public onSelectionChanged(start: [number, number], end: [number, number], columnSelectMode: boolean): void {
    throw new Error('Method not implemented.');
  }
  public onDecorationsChanged(): void {
    throw new Error('Method not implemented.');
  }
  public onCursorMove(): void {
    throw new Error('Method not implemented.');
  }
  public clear(): void {
    throw new Error('Method not implemented.');
  }
  public dispose(): void {
    throw new Error('Method not implemented.');
  }
}

export class MockCharacterJoinerService implements ICharacterJoinerService {
  public serviceBrand: undefined;
  public register(handler: (text: string) => [number, number][]): number {
    return 0;
  }
  public deregister(joinerId: number): boolean {
    return true;
  }
  public getJoinedCharacters(row: number): [number, number][] {
    return [];
  }
}
