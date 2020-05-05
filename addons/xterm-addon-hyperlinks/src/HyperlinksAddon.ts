/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 *
 * UnicodeVersionProvider for V11.
 */

import { Terminal, ITerminalAddon, IDisposable, IBufferRange, ILinkProvider, IBufferCellPosition, ILink } from 'xterm';

/**
 * TODO:
 * Need the following changes in xterm.js:
 * - allow LinkProvider callback to contain multiple ranges (currently sloppy hacked into Linkifier2)
 * - make extended attributes contributable by outer code
 * - extend public API by extended attributes
 */

/**
 * Configurable scheme link handler.
 */
interface ISchemeHandler {
  matcher: RegExp;
  opener: (event: MouseEvent, text: string) => void;
}

interface IUrlWithHandler {
  url: string;
  schemeHandler: ISchemeHandler;
}


/**
 * Default link handler. Opens the link in a new browser tab.
 * Used by the default scheme handlers for http, https and ftp.
 */
function handleLink(event: MouseEvent, uri: string): void {
  const newWindow = window.open();
  if (newWindow) {
    newWindow.opener = null;
    newWindow.location.href = uri;
  } else {
    console.warn('Opening link blocked as opener could not be cleared');
  }
}


/**
 * Some default scheme handlers. Handled in-browser.
 */
export const DEFAULT_SCHEMES = {
  HTTP: {matcher: new RegExp('^http://.*'), opener: handleLink},
  HTTPS: {matcher: new RegExp('^http://.*'), opener: handleLink},
  FTP: {matcher: new RegExp('^ftp://.*'), opener: handleLink}
};


// limit stored URLs to avoid OOM
// cached by the addon (FIFO): limit <= n <= limit * 2
const CACHE_LIMIT = 500;
// values taken from spec as used by VTE
const MAX_URL_LENGTH = 2083;
const MAX_ID_LENGTH = 250;


export class HyperlinksAddon implements ITerminalAddon {
  private _oscHandler: IDisposable | undefined;
  private _linkProvider: IDisposable | undefined;
  private _internalId = 1;
  private _lowestId = 1;
  private _idMap: Map<string, number> = new Map();
  private _urlMap: Map<number, IUrlWithHandler> = new Map();
  private _schemes: ISchemeHandler[] = [];

  constructor(
    public cacheLimit: number = CACHE_LIMIT,
    public maxUrlLength: number = MAX_URL_LENGTH,
    public maxIdLength: number = MAX_ID_LENGTH
  ) {}

  /**
   * Parse params part of the data.
   * Converts into a key-value mapping object if:
   * - fully empty (returns empty object)
   * - all keys and values are set
   * - key-value pairs are properly separated by ':'
   * - keys and values are separated by '='
   * - a key-value pair can be empty
   * Any other case will drop to `false` as return value.
   */
  private _parseParams(paramString: string): {[key: string]: string} | void {
    const result: {[key: string]: string} = {};
    const params = paramString.split(':').filter(Boolean).map(el => el.split('='));
    for (const p of params) {
      if (p.length !== 2) {
        return;
      }
      const [key, value] = p;
      if (!key || !value || value.length > this.maxIdLength) {
        return;
      }
      result[key] = value;
    }
    return result;
  }

  /**
   * Method to filter allowed URL schemes.
   * Returns the url with the matching handler, or nothing.
   */
  private _filterUrl(urlString: string): IUrlWithHandler | void {
    if (!urlString || urlString.length > this.maxUrlLength) {
      return;
    }
    for (const schemeHandler of this._schemes) {
      const m = urlString.match(schemeHandler.matcher);
      if (m) {
        return {url: m[0], schemeHandler};
      }
    }
    return;
  }

  /**
   * Update the terminal cell attributes.
   * `hoverId` is used to identify cells of the same link.
   * A `hoverId` of 0 disables any link handling of a cell (default).
   */
  private _updateAttrs(terminal: Terminal, hoverId: number = 0): void {
    // hack: remove url notion from extended attrs by private access
    // TODO: API to contribute to extended attributes
    const attr = (terminal as any)._core._inputHandler._curAttrData;
    attr.extended = attr.extended.clone();
    attr.extended.urlId = hoverId;
    attr.updateExtended();
  }

  private _limitCache(): void {
    if (this._internalId - this._lowestId > this.cacheLimit * 2) {
      this._lowestId = this._internalId - this.cacheLimit;
      [...this._urlMap.keys()]
        .filter(key => key < this._lowestId)
        .forEach(key => this._urlMap.delete(key));
      [...this._idMap.entries()]
        .filter(([unused, value]) => value < this._lowestId)
        .forEach(([key, unused]) => this._idMap.delete(key));
    }
  }

  public activate(terminal: Terminal): void {
    // register the OSC 8 sequence handler
    this._oscHandler = terminal.parser.registerOscHandler(8, data => {
      // always reset URL notion / link handling in buffer
      // This is a safety measure, any OSC 8 invocations (even malformed)
      // are treated as an attempt to finalize a previous url start.
      this._updateAttrs(terminal);

      // malformed, exit early
      if (data.indexOf(';') === -1) {
        return true;
      }

      // extract needed bits of the sequence: params (might hold an id), url
      const params = this._parseParams(data.slice(0, data.indexOf(';')));
      const urlData = this._filterUrl(data.slice(data.indexOf(';') + 1));

      // OSC 8 ; ; ST - official URL anchor end marker
      if (!urlData) {
        return true;
      }

      // OSC 8 ; [id=value] ; url ST - official URL anchor starter

      let hoverId;
      if (params && params.id) {
        // an id was given, thus try to match with earlier sequences
        // we only consider full equality (id && url) as match,
        // as the id might get reused by a later program with different url
        const oldInternal = this._idMap.get(params.id);
        if (oldInternal && this._urlMap.get(oldInternal)?.url === urlData.url) {
          hoverId = oldInternal;
        } else {
          hoverId = this._internalId++;
          this._idMap.set(params.id, hoverId);
          this._urlMap.set(hoverId, urlData);
        }
      } else {
        hoverId = this._internalId++;
        this._urlMap.set(hoverId, urlData);
      }

      // cleanup maps
      this._limitCache();

      // update extended cell attributes with hoverId
      this._updateAttrs(terminal, hoverId);
      return true;
    });

    // register a linkprovider to handle the extended attribute set by the sequence handler
    this._linkProvider = terminal.registerLinkProvider(new HyperlinkProvider(terminal, this._urlMap));
  }

  public dispose(): void {
    this._oscHandler?.dispose();
    this._linkProvider?.dispose();
    this._idMap.clear();
    this._urlMap.clear();
    this._schemes.length = 0;
  }

  /**
   * Register a scheme handler for the hyperlinks addon.
   */
  public registerSchemeHandler(exe: ISchemeHandler): IDisposable {
    const schemes = this._schemes;
    if (schemes.indexOf(exe) === -1) {
      schemes.push(exe);
    }
    return {
      dispose: () => {
        if (schemes.indexOf(exe) !== -1) {
          schemes.splice(schemes.indexOf(exe), 1);
        }
      }
    };
  }
}


class HyperlinkProvider implements ILinkProvider {
  constructor(
    private readonly _terminal: Terminal,
    private readonly _urlMap: Map<number, IUrlWithHandler>
  ) {}

  public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
    // fix position to 0-based right exclusive
    const pos = {x: position.x - 1, y: position.y - 1};

    // test whether the pointer is over a cell with an urlId
    // also test that we actually have an url stored for the id
    // TODO: need API extension
    const urlId = (this._terminal.buffer.active.getLine(pos.y)?.getCell(pos.x) as any).extended.urlId;
    if (!urlId || !this._urlMap.get(urlId)) {
      callback(undefined);
      return;
    }

    // walk all viewport cells and collect cells with the same urlId in buffer ranges
    const yOffset = this._terminal.buffer.active.viewportY;
    const ranges: IBufferRange[] = [];
    let r: IBufferRange | null = null;
    for (let y = yOffset; y < this._terminal.rows + yOffset; ++y) {
      const line = this._terminal.buffer.active.getLine(y);
      if (!line) {
        break;
      }
      for (let x = 0; x < this._terminal.rows; ++x) {
        const cell = line.getCell(x);
        if (!cell) {
          break;
        }
        if ((cell as any).extended.urlId === urlId) {
          if (!r) {
            r = {start: {x, y}, end: {x: x + 1, y}};
          } else {
            r.end.x = x + 1;
            r.end.y = y;
          }
        } else {
          if (r) {
            r.end.x = x;
            r.end.y = y;
            ranges.push(r);
            r = null;
          }
        }
      }
    }
    if (r) {
      ranges.push(r);
    }

    // fix ranges to 1-based, right inclusive
    for (const r of ranges) {
      r.start.x++;
      r.start.y++;
      r.end.y++;
    }

    // TODO: make this better customizable from outside
    callback({
      ranges,
      text: this._urlMap.get(urlId)!.url,
      decorations: {pointerCursor: true, underline: true},
      activate: this._urlMap.get(urlId)!.schemeHandler.opener,
      hover: (event: MouseEvent, text: string) => {
        console.log('tooltip to show:', text);
      }
    });
  }
}
