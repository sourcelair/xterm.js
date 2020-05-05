/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ILinkifier2, ILinkProvider, IBufferCellPosition, ILink, ILinkifierEvent, ILinkDecorations } from 'browser/Types';
import { IDisposable } from 'common/Types';
import { IMouseService, IRenderService } from './services/Services';
import { IBufferService } from 'common/services/Services';
import { EventEmitter, IEvent } from 'common/EventEmitter';
import { Disposable, getDisposeArrayDisposable } from 'common/Lifecycle';
import { addDisposableDomListener } from 'browser/Lifecycle';

interface ILinkState {
  decorations: ILinkDecorations;
  isHovered: boolean;
}

export class Linkifier2 extends Disposable implements ILinkifier2 {
  private _element: HTMLElement | undefined;
  private _mouseService: IMouseService | undefined;
  private _renderService: IRenderService | undefined;
  private _linkProviders: ILinkProvider[] = [];
  private _currentLink: ILink | undefined;
  protected _currentLinkState: ILinkState | undefined;
  private _lastMouseEvent: MouseEvent | undefined;
  private _linkCacheDisposables: IDisposable[] = [];
  private _lastBufferCell: IBufferCellPosition | undefined;
  private _isMouseOut: boolean = true;

  private _onShowLinkUnderline = this.register(new EventEmitter<ILinkifierEvent>());
  public get onShowLinkUnderline(): IEvent<ILinkifierEvent> { return this._onShowLinkUnderline.event; }
  private _onHideLinkUnderline = this.register(new EventEmitter<ILinkifierEvent>());
  public get onHideLinkUnderline(): IEvent<ILinkifierEvent> { return this._onHideLinkUnderline.event; }

  constructor(
    @IBufferService private readonly _bufferService: IBufferService
  ) {
    super();
    this.register(getDisposeArrayDisposable(this._linkCacheDisposables));
  }

  public registerLinkProvider(linkProvider: ILinkProvider): IDisposable {
    this._linkProviders.push(linkProvider);
    return {
      dispose: () => {
        // Remove the link provider from the list
        const providerIndex = this._linkProviders.indexOf(linkProvider);

        if (providerIndex !== -1) {
          this._linkProviders.splice(providerIndex, 1);
        }
      }
    };
  }

  public attachToDom(element: HTMLElement, mouseService: IMouseService, renderService: IRenderService): void {
    this._element = element;
    this._mouseService = mouseService;
    this._renderService = renderService;

    this.register(addDisposableDomListener(this._element, 'mouseleave', () => {
      this._isMouseOut = true;
      this._clearCurrentLink();
    }));
    this.register(addDisposableDomListener(this._element, 'mousemove', this._onMouseMove.bind(this)));
    this.register(addDisposableDomListener(this._element, 'click', this._onClick.bind(this)));
  }

  private _onMouseMove(event: MouseEvent): void {
    this._lastMouseEvent = event;

    if (!this._element || !this._mouseService) {
      return;
    }

    const position = this._positionFromMouseEvent(event, this._element, this._mouseService);
    if (!position) {
      return;
    }
    this._isMouseOut = false;

    // Ignore the event if it's an embedder created hover widget
    const composedPath = event.composedPath() as HTMLElement[];
    for (let i = 0; i < composedPath.length; i++) {
      const target = composedPath[i];
      // Hit Terminal.element, break and continue
      if (target.classList.contains('xterm')) {
        break;
      }
      // It's a hover, don't respect hover event
      if (target.classList.contains('xterm-hover')) {
        return;
      }
    }

    if (!this._lastBufferCell || (position.x !== this._lastBufferCell.x || position.y !== this._lastBufferCell.y)) {
      this._onHover(position);
      this._lastBufferCell = position;
    }
  }

  private _onHover(position: IBufferCellPosition): void {
    if (this._currentLink) {
      // Check the if the link is in the mouse position
      const isInPosition = this._linkAtPosition(this._currentLink, position);

      // Check if we need to clear the link
      if (!isInPosition) {
        this._clearCurrentLink();
        this._askForLink(position);
      }
    } else {
      this._askForLink(position);
    }
  }

  private _askForLink(position: IBufferCellPosition): void {
    const providerReplies: Map<Number, ILink | undefined> = new Map();
    let linkProvided = false;

    // There is no link cached, so ask for one
    this._linkProviders.forEach((linkProvider, i) => {
      linkProvider.provideLink(position, (link: ILink | undefined) => {
        if (this._isMouseOut) {
          return;
        }
        providerReplies.set(i, link);

        // Check if every provider before this one has come back undefined
        let hasLinkBefore = false;
        for (let j = 0; j < i; j++) {
          if (!providerReplies.has(j) || providerReplies.get(j)) {
            hasLinkBefore = true;
          }
        }

        // If all providers with higher priority came back undefined, then this link should be used
        if (!hasLinkBefore && link) {
          linkProvided = true;
          this._handleNewLink(link);
        }

        // Check if all the providers have responded
        if (providerReplies.size === this._linkProviders.length && !linkProvided) {
          // Respect the order of the link providers
          for (let j = 0; j < providerReplies.size; j++) {
            const currentLink = providerReplies.get(j);
            if (currentLink) {
              this._handleNewLink(currentLink);
              break;
            }
          }
        }
      });
    });
  }

  private _onClick(event: MouseEvent): void {
    if (!this._element || !this._mouseService || !this._currentLink) {
      return;
    }

    const position = this._positionFromMouseEvent(event, this._element, this._mouseService);

    if (!position) {
      return;
    }

    if (this._linkAtPosition(this._currentLink, position)) {
      this._currentLink.activate(event, this._currentLink.text);
    }
  }

  private _clearCurrentLink(startRow?: number, endRow?: number): void {
    if (!this._element || !this._currentLink || !this._lastMouseEvent) {
      return;
    }

    // If we have a start and end row, check that the link is within it
    // FIXME: needs proper handling of multiple ranges
    if (!startRow || !endRow || (this._currentLink.ranges[0].start.y >= startRow && this._currentLink.ranges[0].end.y <= endRow)) {
      this._linkLeave(this._element, this._currentLink, this._lastMouseEvent);
      this._currentLink = undefined;
      this._currentLinkState = undefined;
      this._linkCacheDisposables.forEach(l => l.dispose());
      this._linkCacheDisposables = [];
    }
  }

  private _handleNewLink(link: ILink): void {
    if (!this._element || !this._lastMouseEvent || !this._mouseService) {
      return;
    }

    const position = this._positionFromMouseEvent(this._lastMouseEvent, this._element, this._mouseService);

    if (!position) {
      return;
    }

    // Trigger hover if the we have a link at the position
    if (this._linkAtPosition(link, position)) {
      this._currentLink = link;
      this._currentLinkState = {
        decorations: {
          underline: link.decorations === undefined ? true : link.decorations.underline,
          pointerCursor: link.decorations === undefined ? true : link.decorations.pointerCursor
        },
        isHovered: true
      };
      this._linkHover(this._element, link, this._lastMouseEvent);

      // Add listener for tracking decorations changes
      link.decorations = {} as ILinkDecorations;
      Object.defineProperties(link.decorations, {
        pointerCursor: {
          get: () => this._currentLinkState?.decorations.pointerCursor,
          set: v => {
            if (this._currentLinkState && this._currentLinkState?.decorations.pointerCursor !== v) {
              this._currentLinkState.decorations.pointerCursor = v;
              if (this._currentLinkState.isHovered) {
                this._element?.classList.toggle('xterm-cursor-pointer', v);
              }
            }
          }
        },
        underline: {
          get: () => this._currentLinkState?.decorations.underline,
          set: v => {
            if (this._currentLinkState && this._currentLinkState?.decorations.underline !== v) {
              this._currentLinkState.decorations.underline = v;
              if (this._currentLinkState.isHovered) {
                this._fireUnderlineEvent(link, v);
              }
            }
          }
        }
      });

      // Add listener for rerendering
      if (this._renderService) {
        this._linkCacheDisposables.push(this._renderService.onRenderedBufferChange(e => {
          // When start is 0 a scroll most likely occurred, make sure links above the fold also get
          // cleared.
          const start = e.start === 0 ? 0 : e.start + 1 + this._bufferService.buffer.ydisp;
          this._clearCurrentLink(start, e.end + 1 + this._bufferService.buffer.ydisp);
        }));
      }
    }
  }

  protected _linkHover(element: HTMLElement, link: ILink, event: MouseEvent): void {
    if (this._currentLinkState) {
      this._currentLinkState.isHovered = true;
      if (this._currentLinkState.decorations.underline) {
        this._fireUnderlineEvent(link, true);
      }
      if (this._currentLinkState.decorations.pointerCursor) {
        element.classList.add('xterm-cursor-pointer');
      }
    }

    if (link.hover) {
      link.hover(event, link.text);
    }
  }

  private _fireUnderlineEvent(link: ILink, showEvent: boolean): void {
    // FIXME: dirty hack to get everything underlined, needs proper handling
    for (const range of link.ranges) {
      const scrollOffset = this._bufferService.buffer.ydisp;
      const event = this._createLinkUnderlineEvent(range.start.x - 1, range.start.y - scrollOffset - 1, range.end.x, range.end.y - scrollOffset - 1, undefined);
      const emitter = showEvent ? this._onShowLinkUnderline : this._onHideLinkUnderline;
      emitter.fire(event);
    }
  }

  protected _linkLeave(element: HTMLElement, link: ILink, event: MouseEvent): void {
    if (this._currentLinkState) {
      this._currentLinkState.isHovered = false;
      if (this._currentLinkState.decorations.underline) {
        this._fireUnderlineEvent(link, false);
      }
      if (this._currentLinkState.decorations.pointerCursor) {
        element.classList.remove('xterm-cursor-pointer');
      }
    }

    if (link.leave) {
      link.leave(event, link.text);
    }
  }

  /**
   * Check if the buffer position is within the link
   * @param link
   * @param position
   */
  // private _linkAtPosition(link: ILink, position: IBufferCellPosition): boolean {
  //   const sameLine = link.range.start.y === link.range.end.y;
  //   const wrappedFromLeft = link.range.start.y < position.y;
  //   const wrappedToRight = link.range.end.y > position.y;
  //
  //   // If the start and end have the same y, then the position must be between start and end x
  //   // If not, then handle each case seperately, depending on which way it wraps
  //   return ((sameLine && link.range.start.x <= position.x && link.range.end.x >= position.x) ||
  //     (wrappedFromLeft && link.range.end.x >= position.x) ||
  //     (wrappedToRight && link.range.start.x <= position.x) ||
  //     (wrappedFromLeft && wrappedToRight)) &&
  //     link.range.start.y <= position.y &&
  //     link.range.end.y >= position.y;
  // }
  // FIXME: proper test against multiple ranges
  private _linkAtPosition(link: ILink, pos: IBufferCellPosition): boolean {
    for (const r of link.ranges) {
      if (r.end.y >= pos.y && r.end.x >= pos.x && r.start.y <= pos.y && r.start.x <= pos.x) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get the buffer position from a mouse event
   * @param event
   */
  private _positionFromMouseEvent(event: MouseEvent, element: HTMLElement, mouseService: IMouseService): IBufferCellPosition | undefined {
    const coords = mouseService.getCoords(event, element, this._bufferService.cols, this._bufferService.rows);
    if (!coords) {
      return;
    }

    return { x: coords[0], y: coords[1] + this._bufferService.buffer.ydisp };
  }

  private _createLinkUnderlineEvent(x1: number, y1: number, x2: number, y2: number, fg: number | undefined): ILinkifierEvent {
    return { x1, y1, x2, y2, cols: this._bufferService.cols, fg };
  }
}
