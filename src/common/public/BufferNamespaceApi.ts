import { IBuffer as IBufferApi, IBufferNamespace as IBufferNamespaceApi } from 'xterm';
import { BufferApiView } from 'common/public/BufferApiView';
import { IEvent, EventEmitter } from 'common/EventEmitter';
import { ITerminal } from 'browser/Types';

export class BufferNamespaceApi implements IBufferNamespaceApi {
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
