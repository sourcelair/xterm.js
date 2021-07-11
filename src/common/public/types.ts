import { IBuffer, IBufferSet } from 'common/buffer/Types';
import { IEvent } from 'common/EventEmitter';
import { IFunctionIdentifier, IParams } from 'common/parser/Types';
import { ICoreTerminal, IDisposable, IMarker, ITerminalOptions } from 'common/Types';

export interface ITerminal extends ICoreTerminal {
  rows: number;
  cols: number;
  buffer: IBuffer;
  buffers: IBufferSet;
  markers: IMarker[];
  // TODO: We should remove options once components adopt optionsService
  options: ITerminalOptions;

  onCursorMove: IEvent<void>;
  onData: IEvent<string>;
  onBinary: IEvent<string>;
  onLineFeed: IEvent<void>;
  onResize: IEvent<{ cols: number, rows: number }>;
  onTitleChange: IEvent<string>;
  resize(columns: number, rows: number): void;
  addCsiHandler(id: IFunctionIdentifier, callback: (params: IParams) => boolean): IDisposable;
  addDcsHandler(id: IFunctionIdentifier, callback: (data: string, param: IParams) => boolean): IDisposable;
  addEscHandler(id: IFunctionIdentifier, callback: () => boolean): IDisposable;
  addOscHandler(ident: number, callback: (data: string) => boolean): IDisposable;
  addMarker(cursorYOffset: number): IMarker | undefined;
  dispose(): void;
  clear(): void;
  write(data: string | Uint8Array, callback?: () => void): void;
  reset(): void;
}