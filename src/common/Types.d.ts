/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ITerminalOptions as IPublicTerminalOptions } from 'xterm';
import { IEvent, IEventEmitter } from 'common/EventEmitter';
import { IDeleteEvent, IInsertEvent } from 'common/CircularList';
import { IParams } from 'common/parser/Types';
import { IOptionsService, IUnicodeService } from 'common/services/Services';

export interface ICoreTerminal {
  optionsService: IOptionsService;
  unicodeService: IUnicodeService;
}

export interface IDisposable {
  dispose(): void;
}

// TODO: The options that are not in the public API should be reviewed
export interface ITerminalOptions extends IPublicTerminalOptions {
  [key: string]: any;
  cancelEvents?: boolean;
  convertEol?: boolean;
  termName?: string;
}

export type XtermListener = (...args: any[]) => void;

/**
 * A keyboard event interface which does not depend on the DOM, KeyboardEvent implicitly extends
 * this event.
 */
export interface IKeyboardEvent {
  altKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
  keyCode: number;
  key: string;
  type: string;
}

export interface ICircularList<T> {
  length: number;
  maxLength: number;
  isFull: boolean;

  onDeleteEmitter: IEventEmitter<IDeleteEvent>;
  onDelete: IEvent<IDeleteEvent>;
  onInsertEmitter: IEventEmitter<IInsertEvent>;
  onInsert: IEvent<IInsertEvent>;
  onTrimEmitter: IEventEmitter<number>;
  onTrim: IEvent<number>;

  get(index: number): T | undefined;
  set(index: number, value: T): void;
  push(value: T): void;
  recycle(): T;
  pop(): T | undefined;
  splice(start: number, deleteCount: number, ...items: T[]): void;
  trimStart(count: number): void;
  shiftElements(start: number, count: number, offset: number): void;
}

export const enum KeyboardResultType {
  SEND_KEY,
  SELECT_ALL,
  PAGE_UP,
  PAGE_DOWN
}

export interface IKeyboardResult {
  type: KeyboardResultType;
  cancel: boolean;
  key: string | undefined;
}

export interface ICharset {
  [key: string]: string | undefined;
}

export type CharData = [number, string, number, number];
export type IColorRGB = [number, number, number];

export interface IExtendedAttrs {
  underlineStyle: number;
  underlineColor: number;
  urlId: number;
  clone(): IExtendedAttrs;
  isEmpty(): boolean;
}

/** Attribute data */
export interface IAttributeData {
  fg: number;
  bg: number;
  extended: IExtendedAttrs;

  clone(): IAttributeData;

  // flags
  isInverse(): number;
  isBold(): number;
  isUnderline(): number;
  isBlink(): number;
  isInvisible(): number;
  isItalic(): number;
  isDim(): number;

  // color modes
  getFgColorMode(): number;
  getBgColorMode(): number;
  isFgRGB(): boolean;
  isBgRGB(): boolean;
  isFgPalette(): boolean;
  isBgPalette(): boolean;
  isFgDefault(): boolean;
  isBgDefault(): boolean;
  isAttributeDefault(): boolean;

  // colors
  getFgColor(): number;
  getBgColor(): number;

  // extended attrs
  hasExtendedAttrs(): number;
  updateExtended(): void;
  getUnderlineColor(): number;
  getUnderlineColorMode(): number;
  isUnderlineColorRGB(): boolean;
  isUnderlineColorPalette(): boolean;
  isUnderlineColorDefault(): boolean;
  getUnderlineStyle(): number;
}

/** Cell data */
export interface ICellData extends IAttributeData {
  content: number;
  combinedData: string;
  isCombined(): number;
  getWidth(): number;
  getChars(): string;
  getCode(): number;
  setFromCharData(value: CharData): void;
  getAsCharData(): CharData;
}

/**
 * Interface for a line in the terminal buffer.
 */
export interface IBufferLine {
  length: number;
  isWrapped: boolean;
  get(index: number): CharData;
  set(index: number, value: CharData): void;
  loadCell(index: number, cell: ICellData): ICellData;
  setCell(index: number, cell: ICellData): void;
  setCellFromCodePoint(index: number, codePoint: number, width: number, fg: number, bg: number, eAttrs: IExtendedAttrs): void;
  addCodepointToCell(index: number, codePoint: number): void;
  insertCells(pos: number, n: number, ch: ICellData, eraseAttr?: IAttributeData): void;
  deleteCells(pos: number, n: number, fill: ICellData, eraseAttr?: IAttributeData): void;
  replaceCells(start: number, end: number, fill: ICellData, eraseAttr?: IAttributeData): void;
  resize(cols: number, fill: ICellData): void;
  fill(fillCellData: ICellData): void;
  copyFrom(line: IBufferLine): void;
  clone(): IBufferLine;
  getTrimmedLength(): number;
  translateToString(trimRight?: boolean, startCol?: number, endCol?: number): string;

  /* direct access to cell attrs */
  getWidth(index: number): number;
  hasWidth(index: number): number;
  getFg(index: number): number;
  getBg(index: number): number;
  hasContent(index: number): number;
  getCodePoint(index: number): number;
  isCombined(index: number): number;
  getString(index: number): string;
}

export interface IMarker extends IDisposable {
  readonly id: number;
  readonly isDisposed: boolean;
  readonly line: number;
}
export interface IModes {
  insertMode: boolean;
}

export interface IDecPrivateModes {
  applicationCursorKeys: boolean;
  applicationKeypad: boolean;
  bracketedPasteMode: boolean;
  origin: boolean;
  reverseWraparound: boolean;
  sendFocus: boolean;
  wraparound: boolean; // defaults: xterm - true, vt100 - false
}

export interface IRowRange {
  start: number;
  end: number;
}

/**
 * Interface for mouse events in the core.
 */
export const enum CoreMouseButton {
  LEFT = 0,
  MIDDLE = 1,
  RIGHT = 2,
  NONE = 3,
  WHEEL = 4,
  // additional buttons 1..8
  // untested!
  AUX1 = 8,
  AUX2 = 9,
  AUX3 = 10,
  AUX4 = 11,
  AUX5 = 12,
  AUX6 = 13,
  AUX7 = 14,
  AUX8 = 15
}

export const enum CoreMouseAction {
  UP = 0,     // buttons, wheel
  DOWN = 1,   // buttons, wheel
  LEFT = 2,   // wheel only
  RIGHT = 3,  // wheel only
  MOVE = 32   // buttons only
}

export interface ICoreMouseEvent {
  /** column (zero based). */
  col: number;
  /** row (zero based). */
  row: number;
  /**
   * Button the action occured. Due to restrictions of the tracking protocols
   * it is not possible to report multiple buttons at once.
   * Wheel is treated as a button.
   * There are invalid combinations of buttons and actions possible
   * (like move + wheel), those are silently ignored by the CoreMouseService.
   */
  button: CoreMouseButton;
  action: CoreMouseAction;
  /**
   * Modifier states.
   * Protocols will add/ignore those based on specific restrictions.
   */
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
}

/**
 * CoreMouseEventType
 * To be reported to the browser component which events a mouse
 * protocol wants to be catched and forwarded as an ICoreMouseEvent
 * to CoreMouseService.
 */
export const enum CoreMouseEventType {
  NONE = 0,
  /** any mousedown event */
  DOWN = 1,
  /** any mouseup event */
  UP = 2,
  /** any mousemove event while a button is held */
  DRAG = 4,
  /** any mousemove event without a button */
  MOVE = 8,
  /** any wheel event */
  WHEEL = 16
}

/**
 * Mouse protocol interface.
 * A mouse protocol can be registered and activated at the CoreMouseService.
 * `events` should contain a list of needed events as a hint for the browser component
 * to install/remove the appropriate event handlers.
 * `restrict` applies further protocol specific restrictions like not allowed
 * modifiers or filtering invalid event types.
 */
export interface ICoreMouseProtocol {
  events: CoreMouseEventType;
  restrict: (e: ICoreMouseEvent) => boolean;
}

/**
 * CoreMouseEncoding
 * The tracking encoding can be registered and activated at the CoreMouseService.
 * If a ICoreMouseEvent passes all procotol restrictions it will be encoded
 * with the active encoding and sent out.
 * Note: Returning an empty string will supress sending a mouse report,
 * which can be used to skip creating falsey reports in limited encodings
 * (DEFAULT only supports up to 223 1-based as coord value).
 */
export type CoreMouseEncoding = (event: ICoreMouseEvent) => string;

/**
 * windowOptions
 */
export interface IWindowOptions {
  restoreWin?: boolean;
  minimizeWin?: boolean;
  setWinPosition?: boolean;
  setWinSizePixels?: boolean;
  raiseWin?: boolean;
  lowerWin?: boolean;
  refreshWin?: boolean;
  setWinSizeChars?: boolean;
  maximizeWin?: boolean;
  fullscreenWin?: boolean;
  getWinState?: boolean;
  getWinPosition?: boolean;
  getWinSizePixels?: boolean;
  getScreenSizePixels?: boolean;
  getCellSizePixels?: boolean;
  getWinSizeChars?: boolean;
  getScreenSizeChars?: boolean;
  getIconTitle?: boolean;
  getWinTitle?: boolean;
  pushTitle?: boolean;
  popTitle?: boolean;
  setWinLines?: boolean;
}

/**
 * Calls the parser and handles actions generated by the parser.
 */
export interface IInputHandler {
  onTitleChange: IEvent<string>;
  onRequestScroll: IEvent<IAttributeData, boolean | void>;

  parse(data: string | Uint8Array): void;
  print(data: Uint32Array, start: number, end: number): void;

  /** C0 BEL */ bell(): void;
  /** C0 LF */ lineFeed(): void;
  /** C0 CR */ carriageReturn(): void;
  /** C0 BS */ backspace(): void;
  /** C0 HT */ tab(): void;
  /** C0 SO */ shiftOut(): void;
  /** C0 SI */ shiftIn(): void;

  /** CSI @ */ insertChars(params: IParams): void;
  /** CSI SP @ */ scrollLeft(params: IParams): void;
  /** CSI A */ cursorUp(params: IParams): void;
  /** CSI SP A */ scrollRight(params: IParams): void;
  /** CSI B */ cursorDown(params: IParams): void;
  /** CSI C */ cursorForward(params: IParams): void;
  /** CSI D */ cursorBackward(params: IParams): void;
  /** CSI E */ cursorNextLine(params: IParams): void;
  /** CSI F */ cursorPrecedingLine(params: IParams): void;
  /** CSI G */ cursorCharAbsolute(params: IParams): void;
  /** CSI H */ cursorPosition(params: IParams): void;
  /** CSI I */ cursorForwardTab(params: IParams): void;
  /** CSI J */ eraseInDisplay(params: IParams): void;
  /** CSI K */ eraseInLine(params: IParams): void;
  /** CSI L */ insertLines(params: IParams): void;
  /** CSI M */ deleteLines(params: IParams): void;
  /** CSI P */ deleteChars(params: IParams): void;
  /** CSI S */ scrollUp(params: IParams): void;
  /** CSI T */ scrollDown(params: IParams, collect?: string): void;
  /** CSI X */ eraseChars(params: IParams): void;
  /** CSI Z */ cursorBackwardTab(params: IParams): void;
  /** CSI ` */ charPosAbsolute(params: IParams): void;
  /** CSI a */ hPositionRelative(params: IParams): void;
  /** CSI b */ repeatPrecedingCharacter(params: IParams): void;
  /** CSI c */ sendDeviceAttributesPrimary(params: IParams): void;
  /** CSI > c */ sendDeviceAttributesSecondary(params: IParams): void;
  /** CSI d */ linePosAbsolute(params: IParams): void;
  /** CSI e */ vPositionRelative(params: IParams): void;
  /** CSI f */ hVPosition(params: IParams): void;
  /** CSI g */ tabClear(params: IParams): void;
  /** CSI h */ setMode(params: IParams, collect?: string): void;
  /** CSI l */ resetMode(params: IParams, collect?: string): void;
  /** CSI m */ charAttributes(params: IParams): void;
  /** CSI n */ deviceStatus(params: IParams, collect?: string): void;
  /** CSI p */ softReset(params: IParams, collect?: string): void;
  /** CSI q */ setCursorStyle(params: IParams, collect?: string): void;
  /** CSI r */ setScrollRegion(params: IParams, collect?: string): void;
  /** CSI s */ saveCursor(params: IParams): void;
  /** CSI u */ restoreCursor(params: IParams): void;
  /** CSI ' } */ insertColumns(params: IParams): void;
  /** CSI ' ~ */ deleteColumns(params: IParams): void;
  /** OSC 0
      OSC 2 */ setTitle(data: string): void;
  /** ESC E */ nextLine(): void;
  /** ESC = */ keypadApplicationMode(): void;
  /** ESC > */ keypadNumericMode(): void;
  /** ESC % G
      ESC % @ */ selectDefaultCharset(): void;
  /** ESC ( C
      ESC ) C
      ESC * C
      ESC + C
      ESC - C
      ESC . C
      ESC / C */ selectCharset(collectAndFlag: string): void;
  /** ESC D */ index(): void;
  /** ESC H */ tabSet(): void;
  /** ESC M */ reverseIndex(): void;
  /** ESC c */ fullReset(): void;
  /** ESC n
      ESC o
      ESC |
      ESC }
      ESC ~ */ setgLevel(level: number): void;
  /** ESC # 8 */ screenAlignmentPattern(): void;
}
