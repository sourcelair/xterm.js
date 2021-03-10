import { ITerminal } from 'browser/Types';
import { IUnicodeHandling, IUnicodeVersionProvider } from 'xterm';

export class UnicodeApi implements IUnicodeHandling {
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
