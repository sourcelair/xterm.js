/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { Terminal, ITerminalAddon, IDisposable } from 'xterm';

export interface ISchemeHandler {
  matcher: RegExp;
  opener: (event: MouseEvent, text: string) => void
}

declare module 'xterm-addon-hyperlinks' {
  export class HyperlinksAddon implements ITerminalAddon {
    constructor();
    public activate(terminal: Terminal): void;
    public dispose(): void;
    public registerSchemeHandler(exe: ISchemeHandler): IDisposable;
  }
}
