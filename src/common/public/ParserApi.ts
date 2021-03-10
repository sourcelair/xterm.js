import { IParams } from 'common/parser/Types';
import { ITerminal } from 'browser/Types';
import { IDisposable, IFunctionIdentifier, IParser } from 'xterm';

export class ParserApi implements IParser {
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
