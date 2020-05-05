/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IDisposable, IMarker, ISelectionPosition } from 'xterm';
import { IEvent } from 'common/EventEmitter';
import { ICoreTerminal, CharData, ITerminalOptions } from 'common/Types';
import { IMouseService, IRenderService } from './services/Services';
import { IBuffer, IBufferSet } from 'common/buffer/Types';
import { IFunctionIdentifier, IParams } from 'common/parser/Types';

export interface ITerminal extends IPublicTerminal, ICoreTerminal {
  element: HTMLElement | undefined;
  screenElement: HTMLElement | undefined;
  browser: IBrowser;
  buffer: IBuffer;
  buffers: IBufferSet;
  viewport: IViewport | undefined;
  // TODO: We should remove options once components adopt optionsService
  options: ITerminalOptions;
  linkifier: ILinkifier;
  linkifier2: ILinkifier2;

  onBlur: IEvent<void>;
  onFocus: IEvent<void>;
  onA11yChar: IEvent<string>;
  onA11yTab: IEvent<number>;

  cancel(ev: Event, force?: boolean): boolean | void;
}

// Portions of the public API that are required by the internal Terminal
export interface IPublicTerminal extends IDisposable {
  textarea: HTMLTextAreaElement | undefined;
  rows: number;
  cols: number;
  buffer: IBuffer;
  markers: IMarker[];
  onCursorMove: IEvent<void>;
  onData: IEvent<string>;
  onBinary: IEvent<string>;
  onKey: IEvent<{ key: string, domEvent: KeyboardEvent }>;
  onLineFeed: IEvent<void>;
  onScroll: IEvent<number>;
  onSelectionChange: IEvent<void>;
  onRender: IEvent<{ start: number, end: number }>;
  onResize: IEvent<{ cols: number, rows: number }>;
  onTitleChange: IEvent<string>;
  blur(): void;
  focus(): void;
  resize(columns: number, rows: number): void;
  open(parent: HTMLElement): void;
  attachCustomKeyEventHandler(customKeyEventHandler: (event: KeyboardEvent) => boolean): void;
  addCsiHandler(id: IFunctionIdentifier, callback: (params: IParams) => boolean): IDisposable;
  addDcsHandler(id: IFunctionIdentifier, callback: (data: string, param: IParams) => boolean): IDisposable;
  addEscHandler(id: IFunctionIdentifier, callback: () => boolean): IDisposable;
  addOscHandler(ident: number, callback: (data: string) => boolean): IDisposable;
  registerLinkMatcher(regex: RegExp, handler: (event: MouseEvent, uri: string) => void, options?: ILinkMatcherOptions): number;
  deregisterLinkMatcher(matcherId: number): void;
  registerLinkProvider(linkProvider: ILinkProvider): IDisposable;
  registerCharacterJoiner(handler: (text: string) => [number, number][]): number;
  deregisterCharacterJoiner(joinerId: number): void;
  addMarker(cursorYOffset: number): IMarker | undefined;
  hasSelection(): boolean;
  getSelection(): string;
  getSelectionPosition(): ISelectionPosition | undefined;
  clearSelection(): void;
  select(column: number, row: number, length: number): void;
  selectAll(): void;
  selectLines(start: number, end: number): void;
  dispose(): void;
  scrollLines(amount: number): void;
  scrollPages(pageCount: number): void;
  scrollToTop(): void;
  scrollToBottom(): void;
  scrollToLine(line: number): void;
  clear(): void;
  write(data: string | Uint8Array, callback?: () => void): void;
  paste(data: string): void;
  refresh(start: number, end: number): void;
  reset(): void;
}

export type CustomKeyEventHandler = (event: KeyboardEvent) => boolean;

export type LineData = CharData[];

export interface ICompositionHelper {
  compositionstart(): void;
  compositionupdate(ev: CompositionEvent): void;
  compositionend(): void;
  updateCompositionElements(dontRecurse?: boolean): void;
  keydown(ev: KeyboardEvent): boolean;
}

export interface IBrowser {
  isNode: boolean;
  userAgent: string;
  platform: string;
  isFirefox: boolean;
  isMac: boolean;
  isIpad: boolean;
  isIphone: boolean;
  isWindows: boolean;
}

export interface IColorManager {
  colors: IColorSet;
  onOptionsChange(key: string): void;
}

export interface IColor {
  css: string;
  rgba: number; // 32-bit int with rgba in each byte
}

export interface IColorSet {
  foreground: IColor;
  background: IColor;
  cursor: IColor;
  cursorAccent: IColor;
  selection: IColor;
  /** The selection blended on top of background. */
  selectionOpaque: IColor;
  ansi: IColor[];
  contrastCache: IColorContrastCache;
}

export interface IColorContrastCache {
  clear(): void;
  setCss(bg: number, fg: number, value: string | null): void;
  getCss(bg: number, fg: number): string | null | undefined;
  setColor(bg: number, fg: number, value: IColor | null): void;
  getColor(bg: number, fg: number): IColor | null | undefined;
}

export interface IPartialColorSet {
  foreground: IColor;
  background: IColor;
  cursor?: IColor;
  cursorAccent?: IColor;
  selection?: IColor;
  ansi: IColor[];
}

export interface IViewport extends IDisposable {
  scrollBarWidth: number;
  syncScrollArea(immediate?: boolean): void;
  getLinesScrolled(ev: WheelEvent): number;
  onWheel(ev: WheelEvent): boolean;
  onTouchStart(ev: TouchEvent): void;
  onTouchMove(ev: TouchEvent): boolean;
  onThemeChange(colors: IColorSet): void;
}

export interface IViewportRange {
  start: IViewportRangePosition;
  end: IViewportRangePosition;
}

export interface IViewportRangePosition {
  x: number;
  y: number;
}

export type LinkMatcherHandler = (event: MouseEvent, uri: string) => void;
export type LinkMatcherHoverTooltipCallback = (event: MouseEvent, uri: string, position: IViewportRange) => void;
export type LinkMatcherValidationCallback = (uri: string, callback: (isValid: boolean) => void) => void;

export interface ILinkMatcher {
  id: number;
  regex: RegExp;
  handler: LinkMatcherHandler;
  hoverTooltipCallback?: LinkMatcherHoverTooltipCallback;
  hoverLeaveCallback?: () => void;
  matchIndex?: number;
  validationCallback?: LinkMatcherValidationCallback;
  priority?: number;
  willLinkActivate?: (event: MouseEvent, uri: string) => boolean;
}

export interface IRegisteredLinkMatcher extends ILinkMatcher {
  priority: number;
}

export interface ILinkifierEvent {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  cols: number;
  fg: number | undefined;
}

export interface ILinkifier {
  onShowLinkUnderline: IEvent<ILinkifierEvent>;
  onHideLinkUnderline: IEvent<ILinkifierEvent>;
  onLinkTooltip: IEvent<ILinkifierEvent>;

  attachToDom(element: HTMLElement, mouseZoneManager: IMouseZoneManager): void;
  linkifyRows(start: number, end: number): void;
  registerLinkMatcher(regex: RegExp, handler: LinkMatcherHandler, options?: ILinkMatcherOptions): number;
  deregisterLinkMatcher(matcherId: number): boolean;
}

export interface ILinkifier2 {
  onShowLinkUnderline: IEvent<ILinkifierEvent>;
  onHideLinkUnderline: IEvent<ILinkifierEvent>;

  attachToDom(element: HTMLElement, mouseService: IMouseService, renderService: IRenderService): void;
  registerLinkProvider(linkProvider: ILinkProvider): IDisposable;
}

export interface ILinkMatcherOptions {
  /**
   * The index of the link from the regex.match(text) call. This defaults to 0
   * (for regular expressions without capture groups).
   */
  matchIndex?: number;
  /**
   * A callback that validates an individual link, returning true if valid and
   * false if invalid.
   */
  validationCallback?: LinkMatcherValidationCallback;
  /**
   * A callback that fires when the mouse hovers over a link.
   */
  tooltipCallback?: LinkMatcherHoverTooltipCallback;
  /**
   * A callback that fires when the mouse leaves a link that was hovered.
   */
  leaveCallback?: () => void;
  /**
   * The priority of the link matcher, this defines the order in which the link
   * matcher is evaluated relative to others, from highest to lowest. The
   * default value is 0.
   */
  priority?: number;
  /**
   * A callback that fires when the mousedown and click events occur that
   * determines whether a link will be activated upon click. This enables
   * only activating a link when a certain modifier is held down, if not the
   * mouse event will continue propagation (eg. double click to select word).
   */
  willLinkActivate?: (event: MouseEvent, uri: string) => boolean;
}

export interface IMouseZoneManager extends IDisposable {
  add(zone: IMouseZone): void;
  clearAll(start?: number, end?: number): void;
}

export interface IMouseZone {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  clickCallback: (e: MouseEvent) => any;
  hoverCallback: (e: MouseEvent) => any | undefined;
  tooltipCallback: (e: MouseEvent) => any | undefined;
  leaveCallback: () => any | undefined;
  willLinkActivate: (e: MouseEvent) => boolean;
}

interface ILinkProvider {
  provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void;
}

interface ILink {
  ranges: IBufferRange[];
  text: string;
  decorations?: ILinkDecorations;
  activate(event: MouseEvent, text: string): void;
  hover?(event: MouseEvent, text: string): void;
  leave?(event: MouseEvent, text: string): void;
}

interface ILinkDecorations {
  pointerCursor: boolean;
  underline: boolean;
}

interface IBufferRange {
  start: IBufferCellPosition;
  end: IBufferCellPosition;
}

interface IBufferCellPosition {
  x: number;
  y: number;
}
