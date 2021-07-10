/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Disposable } from 'common/Lifecycle';
import { IDecorationService } from 'browser/services/Services';
import { IDecorationElement, IDecorationHandle } from 'common/Types';

interface IDecorationRegistration {
  handle: IDecorationHandle;
  element: IDecorationElement;
}


export class DecorationService extends Disposable implements IDecorationService {
  public serviceBrand: undefined;
  private _handle = 0;

  private _activeDecorations: IDecorationRegistration[] = [];

  constructor() {
    super();
  }

  public addDecoration(element: IDecorationElement): number {
    this._handle += 1;
    const registration: IDecorationRegistration = {
      handle: this._handle,
      element: element
    };
    this._activeDecorations.push(registration);
    return this._handle;
  }

  public removeDeoration(handle: IDecorationHandle): boolean {
    for (let index = 0 ; index < this._activeDecorations.length ; index++) {
      const reg = this._activeDecorations[index];
      if (reg.handle === handle) {
        this._activeDecorations.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  public forEachDecoration(callback: (decoration: IDecorationElement) => boolean): void {
    for (const reg of this._activeDecorations) {
      if (callback(reg.element)) {
        return;
      }
    }
  }

  public clearDecorations(): number {
    const count = this._activeDecorations.length;
    this._activeDecorations = [];
    return count;
  }
}
