/**
 * Copyright (c) 2014 The xterm.js authors. All rights reserved.
 * Copyright (c) 2012-2013, Christopher Jeffrey (MIT License)
 * @license MIT
 *
 * Originally forked from (with the author's permission):
 *   Fabrice Bellard's javascript vt100 for jslinux:
 *   http://bellard.org/jslinux/
 *   Copyright (c) 2011 Fabrice Bellard
 *   The original design remains. The terminal itself
 *   has been extended to include xterm CSI codes, among
 *   other features.
 *
 * Terminal Emulation References:
 *   http://vt100.net/
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.txt
 *   http://invisible-island.net/xterm/ctlseqs/ctlseqs.html
 *   http://invisible-island.net/vttest/
 *   http://www.inwap.com/pdp10/ansicode.txt
 *   http://linux.die.net/man/4/console_codes
 *   http://linux.die.net/man/7/urxvt
 */

import { ICompositionHelper, ITerminal, IBrowser, CustomKeyEventHandler, ILinkifier, IMouseZoneManager, LinkMatcherHandler, ILinkMatcherOptions, IViewport, ILinkifier2, CharacterJoinerHandler } from 'browser/Types';
import { IRenderer } from 'browser/renderer/Types';
import { CompositionHelper } from 'browser/input/CompositionHelper';
import { Viewport } from 'browser/Viewport';
import { rightClickHandler, moveTextAreaUnderMouseCursor, handlePasteEvent, copyHandler, paste } from 'browser/Clipboard';
import { C0 } from 'common/data/EscapeSequences';
import { WindowsOptionsReportType } from '../common/InputHandler';
import { Renderer } from 'browser/renderer/Renderer';
import { Linkifier } from 'browser/Linkifier';
import { SelectionService } from 'browser/services/SelectionService';
import * as Browser from 'common/Platform';
import { addDisposableDomListener } from 'browser/Lifecycle';
import * as Strings from 'browser/LocalizableStrings';
import { SoundService } from 'browser/services/SoundService';
import { MouseZoneManager } from 'browser/MouseZoneManager';
import { AccessibilityManager } from './AccessibilityManager';
import { ITheme, IMarker, IDisposable, ISelectionPosition, ILinkProvider } from 'xterm';
import { DomRenderer } from 'browser/renderer/dom/DomRenderer';
import { IKeyboardEvent, KeyboardResultType, CoreMouseEventType, CoreMouseButton, CoreMouseAction, ITerminalOptions, ScrollSource, IAnsiColorChangeEvent } from 'common/Types';
import { evaluateKeyboardEvent } from 'common/input/Keyboard';
import { EventEmitter, IEvent, forwardEvent } from 'common/EventEmitter';
import { DEFAULT_ATTR_DATA } from 'common/buffer/BufferLine';
import { ColorManager } from 'browser/ColorManager';
import { RenderService } from 'browser/services/RenderService';
import { ICharSizeService, IRenderService, IMouseService, ISelectionService, ISoundService, ICoreBrowserService, ICharacterJoinerService } from 'browser/services/Services';
import { CharSizeService } from 'browser/services/CharSizeService';
import { IBuffer } from 'common/buffer/Types';
import { MouseService } from 'browser/services/MouseService';
import { Linkifier2 } from 'browser/Linkifier2';
import { CoreBrowserService } from 'browser/services/CoreBrowserService';
import { CoreTerminal } from 'common/CoreTerminal';
import { ITerminalOptions as IInitializedTerminalOptions } from 'common/services/Services';
import { rgba } from 'browser/Color';
import { CharacterJoinerService } from 'browser/services/CharacterJoinerService';

// Let it work inside Node.js for automated testing purposes.
const document: Document = (typeof window !== 'undefined') ? window.document : null as any;

export class Terminal extends CoreTerminal implements ITerminal {
  public textarea: HTMLTextAreaElement | undefined;
  public element: HTMLElement | undefined;
  public screenElement: HTMLElement | undefined;

  private _document: Document | undefined;
  private _viewportScrollArea: HTMLElement | undefined;
  private _viewportElement: HTMLElement | undefined;
  private _helperContainer: HTMLElement | undefined;
  private _compositionView: HTMLElement | undefined;

  // private _visualBellTimer: number;

  public browser: IBrowser = Browser as any;

  // TODO: We should remove options once components adopt optionsService
  public get options(): IInitializedTerminalOptions { return this.optionsService.options; }

  private _customKeyEventHandler: CustomKeyEventHandler | undefined;

  // browser services
  private _charSizeService: ICharSizeService | undefined;
  private _mouseService: IMouseService | undefined;
  private _renderService: IRenderService | undefined;
  private _characterJoinerService: ICharacterJoinerService | undefined;
  private _selectionService: ISelectionService | undefined;
  private _soundService: ISoundService | undefined;

  /**
   * Records whether the keydown event has already been handled and triggered a data event, if so
   * the keypress event should not trigger a data event but should still print to the textarea so
   * screen readers will announce it.
   */
  private _keyDownHandled: boolean = false;

  public linkifier: ILinkifier;
  public linkifier2: ILinkifier2;
  public viewport: IViewport | undefined;
  private _compositionHelper: ICompositionHelper | undefined;
  private _mouseZoneManager: IMouseZoneManager | undefined;
  private _accessibilityManager: AccessibilityManager | undefined;
  private _colorManager: ColorManager | undefined;
  private _theme: ITheme | undefined;

  private _onCursorMove = new EventEmitter<void>();
  public get onCursorMove(): IEvent<void> { return this._onCursorMove.event; }
  private _onKey = new EventEmitter<{ key: string, domEvent: KeyboardEvent }>();
  public get onKey(): IEvent<{ key: string, domEvent: KeyboardEvent }> { return this._onKey.event; }
  private _onRender = new EventEmitter<{ start: number, end: number }>();
  public get onRender(): IEvent<{ start: number, end: number }> { return this._onRender.event; }
  private _onSelectionChange = new EventEmitter<void>();
  public get onSelectionChange(): IEvent<void> { return this._onSelectionChange.event; }
  private _onTitleChange = new EventEmitter<string>();
  public get onTitleChange(): IEvent<string> { return this._onTitleChange.event; }
  private _onBell  = new EventEmitter<void>();
  public get onBell (): IEvent<void> { return this._onBell.event; }

  private _onFocus = new EventEmitter<void>();
  public get onFocus(): IEvent<void> { return this._onFocus.event; }
  private _onBlur = new EventEmitter<void>();
  public get onBlur(): IEvent<void> { return this._onBlur.event; }
  private _onA11yCharEmitter = new EventEmitter<string>();
  public get onA11yChar(): IEvent<string> { return this._onA11yCharEmitter.event; }
  private _onA11yTabEmitter = new EventEmitter<number>();
  public get onA11yTab(): IEvent<number> { return this._onA11yTabEmitter.event; }

  /**
   * Creates a new `Terminal` object.
   *
   * @param options An object containing a set of options, the available options are:
   *   - `cursorBlink` (boolean): Whether the terminal cursor blinks
   *   - `cols` (number): The number of columns of the terminal (horizontal size)
   *   - `rows` (number): The number of rows of the terminal (vertical size)
   *
   * @public
   * @class Xterm Xterm
   * @alias module:xterm/src/xterm
   */
  constructor(
    options: ITerminalOptions = {}
  ) {
    super(options);

    this._setup();

    this.linkifier = this._instantiationService.createInstance(Linkifier);
    this.linkifier2 = this.register(this._instantiationService.createInstance(Linkifier2));

    // Setup InputHandler listeners
    this.register(this._inputHandler.onRequestBell(() => this.bell()));
    this.register(this._inputHandler.onRequestRefreshRows((start, end) => this.refresh(start, end)));
    this.register(this._inputHandler.onRequestReset(() => this.reset()));
    this.register(this._inputHandler.onRequestWindowsOptionsReport(type => this._reportWindowsOptions(type)));
    this.register(this._inputHandler.onAnsiColorChange((event) => this._changeAnsiColor(event)));
    this.register(forwardEvent(this._inputHandler.onCursorMove, this._onCursorMove));
    this.register(forwardEvent(this._inputHandler.onTitleChange, this._onTitleChange));
    this.register(forwardEvent(this._inputHandler.onA11yChar, this._onA11yCharEmitter));
    this.register(forwardEvent(this._inputHandler.onA11yTab, this._onA11yTabEmitter));

    // Setup listeners
    this.register(this._bufferService.onResize(e => this._afterResize(e.cols, e.rows)));
  }

  private _changeAnsiColor(event: IAnsiColorChangeEvent): void {
    if (!this._colorManager) { return; }

    for (const ansiColor of event.colors) {
      const color = rgba.toColor(ansiColor.red, ansiColor.green, ansiColor.blue);

      this._colorManager!.colors.ansi[ansiColor.colorIndex] = color;
    }

    this._renderService?.setColors(this._colorManager!.colors);
    this.viewport?.onThemeChange(this._colorManager!.colors);
  }

  public dispose(): void {
    if (this._isDisposed) {
      return;
    }
    super.dispose();
    this._renderService?.dispose();
    this._customKeyEventHandler = undefined;
    this.write = () => { };
    this.element?.parentNode?.removeChild(this.element);
  }

  protected _setup(): void {
    super._setup();

    this._customKeyEventHandler = undefined;
  }

  /**
   * Convenience property to active buffer.
   */
  public get buffer(): IBuffer {
    return this.buffers.active;
  }

  /**
   * Focus the terminal. Delegates focus handling to the terminal's DOM element.
   */
  public focus(): void {
    if (this.textarea) {
      this.textarea.focus({ preventScroll: true });
    }
  }

  protected _updateOptions(key: string): void {
    super._updateOptions(key);

    // TODO: These listeners should be owned by individual components
    switch (key) {
      case 'fontFamily':
      case 'fontSize':
        // When the font changes the size of the cells may change which requires a renderer clear
        this._renderService?.clear();
        this._charSizeService?.measure();
        break;
      case 'cursorBlink':
      case 'cursorStyle':
        // The DOM renderer needs a row refresh to update the cursor styles
        this.refresh(this.buffer.y, this.buffer.y);
        break;
      case 'drawBoldTextInBrightColors':
      case 'letterSpacing':
      case 'lineHeight':
      case 'fontWeight':
      case 'fontWeightBold':
      case 'minimumContrastRatio':
        // When the font changes the size of the cells may change which requires a renderer clear
        if (this._renderService) {
          this._renderService.clear();
          this._renderService.onResize(this.cols, this.rows);
          this.refresh(0, this.rows - 1);
        }
        break;
      case 'rendererType':
        if (this._renderService) {
          this._renderService.setRenderer(this._createRenderer());
          this._renderService.onResize(this.cols, this.rows);
        }
        break;
      case 'scrollback':
        this.viewport?.syncScrollArea();
        break;
      case 'screenReaderMode':
        if (this.optionsService.options.screenReaderMode) {
          if (!this._accessibilityManager && this._renderService) {
            this._accessibilityManager = new AccessibilityManager(this, this._renderService);
          }
        } else {
          this._accessibilityManager?.dispose();
          this._accessibilityManager = undefined;
        }
        break;
      case 'tabStopWidth': this.buffers.setupTabStops(); break;
      case 'theme':
        this._setTheme(this.optionsService.options.theme);
        break;
      case 'allowTransparency':
        if (this._colorManager) {
          this._colorManager.allowTransparency = this.optionsService.options.allowTransparency;
        }
        break;
    }
  }

  /**
   * Binds the desired focus behavior on a given terminal object.
   */
  private _onTextAreaFocus(ev: KeyboardEvent): void {
    if (this._coreService.decPrivateModes.sendFocus) {
      this._coreService.triggerDataEvent(C0.ESC + '[I');
    }
    this.updateCursorStyle(ev);
    this.element!.classList.add('focus');
    this._showCursor();
    this._onFocus.fire();
  }

  /**
   * Blur the terminal, calling the blur function on the terminal's underlying
   * textarea.
   */
  public blur(): void {
    return this.textarea?.blur();
  }

  /**
   * Binds the desired blur behavior on a given terminal object.
   */
  private _onTextAreaBlur(): void {
    // Text can safely be removed on blur. Doing it earlier could interfere with
    // screen readers reading it out.
    this.textarea!.value = '';
    this.refresh(this.buffer.y, this.buffer.y);
    if (this._coreService.decPrivateModes.sendFocus) {
      this._coreService.triggerDataEvent(C0.ESC + '[O');
    }
    this.element!.classList.remove('focus');
    this._onBlur.fire();
  }

  private _syncTextArea(): void {
    if (!this.textarea || !this.buffer.isCursorInViewport || this._compositionHelper!.isComposing || !this._renderService) {
      return;
    }
    const cursorY = this.buffer.ybase + this.buffer.y;
    const bufferLine = this.buffer.lines.get(cursorY);
    if (!bufferLine) {
      return;
    }
    const cursorX = Math.min(this.buffer.x, this.cols - 1);
    const cellHeight = this._renderService.dimensions.actualCellHeight;
    const width = bufferLine.getWidth(cursorX);
    const cellWidth = this._renderService.dimensions.actualCellWidth * width;
    const cursorTop = this.buffer.y * this._renderService.dimensions.actualCellHeight;
    const cursorLeft = cursorX * this._renderService.dimensions.actualCellWidth;

    // Sync the textarea to the exact position of the composition view so the IME knows where the
    // text is.
    this.textarea.style.left = cursorLeft + 'px';
    this.textarea.style.top = cursorTop + 'px';
    this.textarea.style.width = cellWidth + 'px';
    this.textarea.style.height = cellHeight + 'px';
    this.textarea.style.lineHeight = cellHeight + 'px';
    this.textarea.style.zIndex = '-5';
  }

  /**
   * Initialize default behavior
   */
  private _initGlobal(): void {
    this._bindKeys();

    // Bind clipboard functionality
    this.register(addDisposableDomListener(this.element!, 'copy', (event: ClipboardEvent) => {
      // If mouse events are active it means the selection manager is disabled and
      // copy should be handled by the host program.
      if (!this.hasSelection()) {
        return;
      }
      copyHandler(event, this._selectionService!);
    }));
    const pasteHandlerWrapper = (event: ClipboardEvent): void => handlePasteEvent(event, this.textarea!, this._coreService);
    this.register(addDisposableDomListener(this.textarea!, 'paste', pasteHandlerWrapper));
    this.register(addDisposableDomListener(this.element!, 'paste', pasteHandlerWrapper));

    // Handle right click context menus
    if (Browser.isFirefox) {
      // Firefox doesn't appear to fire the contextmenu event on right click
      this.register(addDisposableDomListener(this.element!, 'mousedown', (event: MouseEvent) => {
        if (event.button === 2) {
          rightClickHandler(event, this.textarea!, this.screenElement!, this._selectionService!, this.options.rightClickSelectsWord);
        }
      }));
    } else {
      this.register(addDisposableDomListener(this.element!, 'contextmenu', (event: MouseEvent) => {
        rightClickHandler(event, this.textarea!, this.screenElement!, this._selectionService!, this.options.rightClickSelectsWord);
      }));
    }

    // Move the textarea under the cursor when middle clicking on Linux to ensure
    // middle click to paste selection works. This only appears to work in Chrome
    // at the time is writing.
    if (Browser.isLinux) {
      // Use auxclick event over mousedown the latter doesn't seem to work. Note
      // that the regular click event doesn't fire for the middle mouse button.
      this.register(addDisposableDomListener(this.element!, 'auxclick', (event: MouseEvent) => {
        if (event.button === 1) {
          moveTextAreaUnderMouseCursor(event, this.textarea!, this.screenElement!);
        }
      }));
    }
  }

  /**
   * Apply key handling to the terminal
   */
  private _bindKeys(): void {
    this.register(addDisposableDomListener(this.textarea!, 'keyup', (ev: KeyboardEvent) => this._keyUp(ev), true));
    this.register(addDisposableDomListener(this.textarea!, 'keydown', (ev: KeyboardEvent) => this._keyDown(ev), true));
    this.register(addDisposableDomListener(this.textarea!, 'keypress', (ev: KeyboardEvent) => this._keyPress(ev), true));
    this.register(addDisposableDomListener(this.textarea!, 'compositionstart', () => this._compositionHelper!.compositionstart()));
    this.register(addDisposableDomListener(this.textarea!, 'compositionupdate', (e: CompositionEvent) => this._compositionHelper!.compositionupdate(e)));
    this.register(addDisposableDomListener(this.textarea!, 'compositionend', () => this._compositionHelper!.compositionend()));
    this.register(this.onRender(() => this._compositionHelper!.updateCompositionElements()));
    this.register(this.onRender(e => this._queueLinkification(e.start, e.end)));
  }

  /**
   * Opens the terminal within an element.
   *
   * @param parent The element to create the terminal within.
   */
  public open(parent: HTMLElement): void {
    if (!parent) {
      throw new Error('Terminal requires a parent element.');
    }

    if (!parent.isConnected) {
      this._logService.debug('Terminal.open was called on an element that was not attached to the DOM');
    }

    this._document = parent.ownerDocument!;

    // Create main element container
    this.element = this._document.createElement('div');
    this.element.dir = 'ltr';   // xterm.css assumes LTR
    this.element.classList.add('terminal');
    this.element.classList.add('xterm');
    this.element.setAttribute('tabindex', '0');
    this.element.setAttribute('role', 'document');
    parent.appendChild(this.element);

    // Performance: Use a document fragment to build the terminal
    // viewport and helper elements detached from the DOM
    const fragment = document.createDocumentFragment();
    this._viewportElement = document.createElement('div');
    this._viewportElement.classList.add('xterm-viewport');
    fragment.appendChild(this._viewportElement);
    this._viewportScrollArea = document.createElement('div');
    this._viewportScrollArea.classList.add('xterm-scroll-area');
    this._viewportElement.appendChild(this._viewportScrollArea);

    this.screenElement = document.createElement('div');
    this.screenElement.classList.add('xterm-screen');
    // Create the container that will hold helpers like the textarea for
    // capturing DOM Events. Then produce the helpers.
    this._helperContainer = document.createElement('div');
    this._helperContainer.classList.add('xterm-helpers');
    this.screenElement.appendChild(this._helperContainer);
    fragment.appendChild(this.screenElement);

    this.textarea = document.createElement('textarea');
    this.textarea.classList.add('xterm-helper-textarea');
    this.textarea.setAttribute('aria-label', Strings.promptLabel);
    this.textarea.setAttribute('aria-multiline', 'false');
    this.textarea.setAttribute('autocorrect', 'off');
    this.textarea.setAttribute('autocapitalize', 'off');
    this.textarea.setAttribute('spellcheck', 'false');
    this.textarea.tabIndex = 0;
    this.register(addDisposableDomListener(this.textarea, 'focus', (ev: KeyboardEvent) => this._onTextAreaFocus(ev)));
    this.register(addDisposableDomListener(this.textarea, 'blur', () => this._onTextAreaBlur()));
    this._helperContainer.appendChild(this.textarea);

    const coreBrowserService = this._instantiationService.createInstance(CoreBrowserService, this.textarea);
    this._instantiationService.setService(ICoreBrowserService, coreBrowserService);

    this._charSizeService = this._instantiationService.createInstance(CharSizeService, this._document, this._helperContainer);
    this._instantiationService.setService(ICharSizeService, this._charSizeService);

    this._theme = this.options.theme || this._theme;
    this._colorManager = new ColorManager(document, this.options.allowTransparency);
    this.register(this.optionsService.onOptionChange(e => this._colorManager!.onOptionsChange(e)));
    this._colorManager.setTheme(this._theme);

    this._characterJoinerService = this._instantiationService.createInstance(CharacterJoinerService);
    this._instantiationService.setService(ICharacterJoinerService, this._characterJoinerService);

    const renderer = this._createRenderer();
    this._renderService = this.register(this._instantiationService.createInstance(RenderService, renderer, this.rows, this.screenElement));
    this._instantiationService.setService(IRenderService, this._renderService);
    this.register(this._renderService.onRenderedBufferChange(e => this._onRender.fire(e)));
    this.onResize(e => this._renderService!.resize(e.cols, e.rows));

    this._compositionView = document.createElement('div');
    this._compositionView.classList.add('composition-view');
    this._compositionHelper = this._instantiationService.createInstance(CompositionHelper, this.textarea, this._compositionView);
    this._helperContainer.appendChild(this._compositionView);

    // Performance: Add viewport and helper elements from the fragment
    this.element.appendChild(fragment);

    this._soundService = this._instantiationService.createInstance(SoundService);
    this._instantiationService.setService(ISoundService, this._soundService);
    this._mouseService = this._instantiationService.createInstance(MouseService);
    this._instantiationService.setService(IMouseService, this._mouseService);

    this.viewport = this._instantiationService.createInstance(Viewport,
      (amount: number) => this.scrollLines(amount, true, ScrollSource.VIEWPORT),
      this._viewportElement,
      this._viewportScrollArea
    );
    this.viewport.onThemeChange(this._colorManager.colors);
    this.register(this._inputHandler.onRequestSyncScrollBar(() => this.viewport!.syncScrollArea()));
    this.register(this.viewport);

    this.register(this.onCursorMove(() => {
      this._renderService!.onCursorMove();
      this._syncTextArea();
    }));
    this.register(this.onResize(() => this._renderService!.onResize(this.cols, this.rows)));
    this.register(this.onBlur(() => this._renderService!.onBlur()));
    this.register(this.onFocus(() => this._renderService!.onFocus()));
    this.register(this._renderService.onDimensionsChange(() => this.viewport!.syncScrollArea()));

    this._selectionService = this.register(this._instantiationService.createInstance(SelectionService,
      this.element,
      this.screenElement,
      this.linkifier2
    ));
    this._instantiationService.setService(ISelectionService, this._selectionService);
    this.register(this._selectionService.onRequestScrollLines(e => this.scrollLines(e.amount, e.suppressScrollEvent)));
    this.register(this._selectionService.onSelectionChange(() => this._onSelectionChange.fire()));
    this.register(this._selectionService.onRequestRedraw(e => this._renderService!.onSelectionChanged(e.start, e.end, e.columnSelectMode)));
    this.register(this._selectionService.onLinuxMouseSelection(text => {
      // If there's a new selection, put it into the textarea, focus and select it
      // in order to register it as a selection on the OS. This event is fired
      // only on Linux to enable middle click to paste selection.
      this.textarea!.value = text;
      this.textarea!.focus();
      this.textarea!.select();
    }));
    this.register(this._onScroll.event(ev => {
      this.viewport!.syncScrollArea();
      this._selectionService!.refresh();
    }));
    this.register(addDisposableDomListener(this._viewportElement, 'scroll', () => this._selectionService!.refresh()));

    this._mouseZoneManager = this._instantiationService.createInstance(MouseZoneManager, this.element, this.screenElement);
    this.register(this._mouseZoneManager);
    this.register(this.onScroll(() => this._mouseZoneManager!.clearAll()));
    this.linkifier.attachToDom(this.element, this._mouseZoneManager);
    this.linkifier2.attachToDom(this.element, this._mouseService, this._renderService);

    // This event listener must be registered aftre MouseZoneManager is created
    this.register(addDisposableDomListener(this.element, 'mousedown', (e: MouseEvent) => this._selectionService!.onMouseDown(e)));

    // apply mouse event classes set by escape codes before terminal was attached
    if (this._coreMouseService.areMouseEventsActive) {
      this._selectionService.disable();
      this.element.classList.add('enable-mouse-events');
    } else {
      this._selectionService.enable();
    }

    if (this.options.screenReaderMode) {
      // Note that this must be done *after* the renderer is created in order to
      // ensure the correct order of the dprchange event
      this._accessibilityManager = new AccessibilityManager(this, this._renderService);
    }

    // Measure the character size
    this._charSizeService.measure();

    // Setup loop that draws to screen
    this.refresh(0, this.rows - 1);

    // Initialize global actions that need to be taken on the document.
    this._initGlobal();

    // Listen for mouse events and translate
    // them into terminal mouse protocols.
    this.bindMouse();
  }

  private _createRenderer(): IRenderer {
    switch (this.options.rendererType) {
      case 'canvas': return this._instantiationService.createInstance(Renderer, this._colorManager!.colors, this.screenElement!, this.linkifier, this.linkifier2);
      case 'dom': return this._instantiationService.createInstance(DomRenderer, this._colorManager!.colors, this.element!, this.screenElement!, this._viewportElement!, this.linkifier, this.linkifier2);
      default: throw new Error(`Unrecognized rendererType "${this.options.rendererType}"`);
    }
  }

  /**
   * Sets the theme on the renderer. The renderer must have been initialized.
   * @param theme The theme to set.
   */
  private _setTheme(theme: ITheme): void {
    this._theme = theme;
    this._colorManager?.setTheme(theme);
    this._renderService?.setColors(this._colorManager!.colors);
    this.viewport?.onThemeChange(this._colorManager!.colors);
  }

  /**
   * Bind certain mouse events to the terminal.
   * By default only 3 button + wheel up/down is ativated. For higher buttons
   * no mouse report will be created. Typically the standard actions will be active.
   *
   * There are several reasons not to enable support for higher buttons/wheel:
   * - Button 4 and 5 are typically used for history back and forward navigation,
   *   there is no straight forward way to supress/intercept those standard actions.
   * - Support for higher buttons does not work in some platform/browser combinations.
   * - Left/right wheel was not tested.
   * - Emulators vary in mouse button support, typically only 3 buttons and
   *   wheel up/down work reliable.
   *
   * TODO: Move mouse event code into its own file.
   */
  public bindMouse(): void {
    const self = this;
    const el = this.element!;

    // send event to CoreMouseService
    function sendEvent(ev: MouseEvent | WheelEvent): boolean {
      // get mouse coordinates
      const pos = self._mouseService!.getRawByteCoords(ev, self.screenElement!, self.cols, self.rows);
      if (!pos) {
        return false;
      }

      let but: CoreMouseButton;
      let action: CoreMouseAction | undefined;
      switch ((ev as any).overrideType || ev.type) {
        case 'mousemove':
          action = CoreMouseAction.MOVE;
          if (ev.buttons === undefined) {
            // buttons is not supported on macOS, try to get a value from button instead
            but = CoreMouseButton.NONE;
            if (ev.button !== undefined) {
              but = ev.button < 3 ? ev.button : CoreMouseButton.NONE;
            }
          } else {
            // according to MDN buttons only reports up to button 5 (AUX2)
            but = ev.buttons & 1 ? CoreMouseButton.LEFT :
              ev.buttons & 4 ? CoreMouseButton.MIDDLE :
                ev.buttons & 2 ? CoreMouseButton.RIGHT :
                  CoreMouseButton.NONE; // fallback to NONE
          }
          break;
        case 'mouseup':
          action = CoreMouseAction.UP;
          but = ev.button < 3 ? ev.button : CoreMouseButton.NONE;
          break;
        case 'mousedown':
          action = CoreMouseAction.DOWN;
          but = ev.button < 3 ? ev.button : CoreMouseButton.NONE;
          break;
        case 'wheel':
          // only UP/DOWN wheel events are respected
          if ((ev as WheelEvent).deltaY !== 0) {
            action = (ev as WheelEvent).deltaY < 0 ? CoreMouseAction.UP : CoreMouseAction.DOWN;
          }
          but = CoreMouseButton.WHEEL;
          break;
        default:
          // dont handle other event types by accident
          return false;
      }

      // exit if we cannot determine valid button/action values
      // do nothing for higher buttons than wheel
      if (action === undefined || but === undefined || but > CoreMouseButton.WHEEL) {
        return false;
      }

      return self._coreMouseService.triggerMouseEvent({
        col: pos.x - 33, // FIXME: why -33 here?
        row: pos.y - 33,
        button: but,
        action,
        ctrl: ev.ctrlKey,
        alt: ev.altKey,
        shift: ev.shiftKey
      });
    }

    /**
     * Event listener state handling.
     * We listen to the onProtocolChange event of CoreMouseService and put
     * requested listeners in `requestedEvents`. With this the listeners
     * have all bits to do the event listener juggling.
     * Note: 'mousedown' currently is "always on" and not managed
     * by onProtocolChange.
     */
    const requestedEvents: { [key: string]: ((ev: Event) => void) | null } = {
      mouseup: null,
      wheel: null,
      mousedrag: null,
      mousemove: null
    };
    const eventListeners: { [key: string]: (ev: any) => void | boolean } = {
      mouseup: (ev: MouseEvent) => {
        sendEvent(ev);
        if (!ev.buttons) {
          // if no other button is held remove global handlers
          this._document!.removeEventListener('mouseup', requestedEvents.mouseup!);
          if (requestedEvents.mousedrag) {
            this._document!.removeEventListener('mousemove', requestedEvents.mousedrag);
          }
        }
        return this.cancel(ev);
      },
      wheel: (ev: WheelEvent) => {
        sendEvent(ev);
        ev.preventDefault();
        return this.cancel(ev);
      },
      mousedrag: (ev: MouseEvent) => {
        // deal only with move while a button is held
        if (ev.buttons) {
          sendEvent(ev);
        }
      },
      mousemove: (ev: MouseEvent) => {
        // deal only with move without any button
        if (!ev.buttons) {
          sendEvent(ev);
        }
      }
    };
    this.register(this._coreMouseService.onProtocolChange(events => {
      // apply global changes on events
      if (events) {
        if (this.optionsService.options.logLevel === 'debug') {
          this._logService.debug('Binding to mouse events:', this._coreMouseService.explainEvents(events));
        }
        this.element!.classList.add('enable-mouse-events');
        this._selectionService!.disable();
      } else {
        this._logService.debug('Unbinding from mouse events.');
        this.element!.classList.remove('enable-mouse-events');
        this._selectionService!.enable();
      }

      // add/remove handlers from requestedEvents

      if (!(events & CoreMouseEventType.MOVE)) {
        el.removeEventListener('mousemove', requestedEvents.mousemove!);
        requestedEvents.mousemove = null;
      } else if (!requestedEvents.mousemove) {
        el.addEventListener('mousemove', eventListeners.mousemove);
        requestedEvents.mousemove = eventListeners.mousemove;
      }

      if (!(events & CoreMouseEventType.WHEEL)) {
        el.removeEventListener('wheel', requestedEvents.wheel!);
        requestedEvents.wheel = null;
      } else if (!requestedEvents.wheel) {
        el.addEventListener('wheel', eventListeners.wheel, { passive: false });
        requestedEvents.wheel = eventListeners.wheel;
      }

      if (!(events & CoreMouseEventType.UP)) {
        this._document!.removeEventListener('mouseup', requestedEvents.mouseup!);
        requestedEvents.mouseup = null;
      } else if (!requestedEvents.mouseup) {
        requestedEvents.mouseup = eventListeners.mouseup;
      }

      if (!(events & CoreMouseEventType.DRAG)) {
        this._document!.removeEventListener('mousemove', requestedEvents.mousedrag!);
        requestedEvents.mousedrag = null;
      } else if (!requestedEvents.mousedrag) {
        requestedEvents.mousedrag = eventListeners.mousedrag;
      }
    }));
    // force initial onProtocolChange so we dont miss early mouse requests
    this._coreMouseService.activeProtocol = this._coreMouseService.activeProtocol;

    /**
     * "Always on" event listeners.
     */
    this.register(addDisposableDomListener(el, 'mousedown', (ev: MouseEvent) => {
      ev.preventDefault();
      this.focus();

      // Don't send the mouse button to the pty if mouse events are disabled or
      // if the selection manager is having selection forced (ie. a modifier is
      // held).
      if (!this._coreMouseService.areMouseEventsActive || this._selectionService!.shouldForceSelection(ev)) {
        return;
      }

      sendEvent(ev);

      // Register additional global handlers which should keep reporting outside
      // of the terminal element.
      // Note: Other emulators also do this for 'mousedown' while a button
      // is held, we currently limit 'mousedown' to the terminal only.
      if (requestedEvents.mouseup) {
        this._document!.addEventListener('mouseup', requestedEvents.mouseup);
      }
      if (requestedEvents.mousedrag) {
        this._document!.addEventListener('mousemove', requestedEvents.mousedrag);
      }

      return this.cancel(ev);
    }));

    this.register(addDisposableDomListener(el, 'wheel', (ev: WheelEvent) => {
      if (!requestedEvents.wheel) {
        // Convert wheel events into up/down events when the buffer does not have scrollback, this
        // enables scrolling in apps hosted in the alt buffer such as vim or tmux.
        if (!this.buffer.hasScrollback) {
          const amount = this.viewport!.getLinesScrolled(ev);

          // Do nothing if there's no vertical scroll
          if (amount === 0) {
            return;
          }

          // Construct and send sequences
          const sequence = C0.ESC + (this._coreService.decPrivateModes.applicationCursorKeys ? 'O' : '[') + (ev.deltaY < 0 ? 'A' : 'B');
          let data = '';
          for (let i = 0; i < Math.abs(amount); i++) {
            data += sequence;
          }
          this._coreService.triggerDataEvent(data, true);
        }
        return;
      }
    }, { passive: true }));

    // allow wheel scrolling in
    // the shell for example
    this.register(addDisposableDomListener(el, 'wheel', (ev: WheelEvent) => {
      if (requestedEvents.wheel) return;
      if (!this.viewport!.onWheel(ev)) {
        return this.cancel(ev);
      }
    }, { passive: false }));

    this.register(addDisposableDomListener(el, 'touchstart', (ev: TouchEvent) => {
      if (this._coreMouseService.areMouseEventsActive) return;
      this.viewport!.onTouchStart(ev);
      return this.cancel(ev);
    }, { passive: true }));

    this.register(addDisposableDomListener(el, 'touchmove', (ev: TouchEvent) => {
      if (this._coreMouseService.areMouseEventsActive) return;
      if (!this.viewport!.onTouchMove(ev)) {
        return this.cancel(ev);
      }
    }, { passive: false }));
  }


  /**
   * Tells the renderer to refresh terminal content between two rows (inclusive) at the next
   * opportunity.
   * @param start The row to start from (between 0 and this.rows - 1).
   * @param end The row to end at (between start and this.rows - 1).
   */
  public refresh(start: number, end: number): void {
    this._renderService?.refreshRows(start, end);
  }

  /**
   * Queues linkification for the specified rows.
   * @param start The row to start from (between 0 and this.rows - 1).
   * @param end The row to end at (between start and this.rows - 1).
   */
  private _queueLinkification(start: number, end: number): void {
    this.linkifier?.linkifyRows(start, end);
  }

  /**
   * Change the cursor style for different selection modes
   */
  public updateCursorStyle(ev: KeyboardEvent): void {
    if (this._selectionService?.shouldColumnSelect(ev)) {
      this.element!.classList.add('column-select');
    } else {
      this.element!.classList.remove('column-select');
    }
  }

  /**
   * Display the cursor element
   */
  private _showCursor(): void {
    if (!this._coreService.isCursorInitialized) {
      this._coreService.isCursorInitialized = true;
      this.refresh(this.buffer.y, this.buffer.y);
    }
  }

  public scrollLines(disp: number, suppressScrollEvent?: boolean, source = ScrollSource.TERMINAL): void {
    super.scrollLines(disp, suppressScrollEvent, source);
    this.refresh(0, this.rows - 1);
  }

  public paste(data: string): void {
    paste(data, this.textarea!, this._coreService);
  }

  /**
   * Attaches a custom key event handler which is run before keys are processed,
   * giving consumers of xterm.js ultimate control as to what keys should be
   * processed by the terminal and what keys should not.
   * @param customKeyEventHandler The custom KeyboardEvent handler to attach.
   * This is a function that takes a KeyboardEvent, allowing consumers to stop
   * propagation and/or prevent the default action. The function returns whether
   * the event should be processed by xterm.js.
   */
  public attachCustomKeyEventHandler(customKeyEventHandler: CustomKeyEventHandler): void {
    this._customKeyEventHandler = customKeyEventHandler;
  }

  /**
   * Registers a link matcher, allowing custom link patterns to be matched and
   * handled.
   * @param regex The regular expression to search for, specifically
   * this searches the textContent of the rows. You will want to use \s to match
   * a space ' ' character for example.
   * @param handler The callback when the link is called.
   * @param options Options for the link matcher.
   * @return The ID of the new matcher, this can be used to deregister.
   */
  public registerLinkMatcher(regex: RegExp, handler: LinkMatcherHandler, options?: ILinkMatcherOptions): number {
    const matcherId = this.linkifier.registerLinkMatcher(regex, handler, options);
    this.refresh(0, this.rows - 1);
    return matcherId;
  }

  /**
   * Deregisters a link matcher if it has been registered.
   * @param matcherId The link matcher's ID (returned after register)
   */
  public deregisterLinkMatcher(matcherId: number): void {
    if (this.linkifier.deregisterLinkMatcher(matcherId)) {
      this.refresh(0, this.rows - 1);
    }
  }

  public registerLinkProvider(linkProvider: ILinkProvider): IDisposable {
    return this.linkifier2.registerLinkProvider(linkProvider);
  }

  public registerCharacterJoiner(handler: CharacterJoinerHandler): number {
    if (!this._characterJoinerService) {
      throw new Error('Terminal must be opened first');
    }
    const joinerId = this._characterJoinerService.register(handler);
    this.refresh(0, this.rows - 1);
    return joinerId;
  }

  public deregisterCharacterJoiner(joinerId: number): void {
    if (!this._characterJoinerService) {
      throw new Error('Terminal must be opened first');
    }
    if (this._characterJoinerService.deregister(joinerId)) {
      this.refresh(0, this.rows - 1);
    }
  }

  public get markers(): IMarker[] {
    return this.buffer.markers;
  }

  public addMarker(cursorYOffset: number): IMarker | undefined {
    // Disallow markers on the alt buffer
    if (this.buffer !== this.buffers.normal) {
      return;
    }

    return this.buffer.addMarker(this.buffer.ybase + this.buffer.y + cursorYOffset);
  }

  /**
   * Gets whether the terminal has an active selection.
   */
  public hasSelection(): boolean {
    return this._selectionService ? this._selectionService.hasSelection : false;
  }

  /**
   * Selects text within the terminal.
   * @param column The column the selection starts at..
   * @param row The row the selection starts at.
   * @param length The length of the selection.
   */
  public select(column: number, row: number, length: number): void {
    this._selectionService!.setSelection(column, row, length);
  }

  /**
   * Gets the terminal's current selection, this is useful for implementing copy
   * behavior outside of xterm.js.
   */
  public getSelection(): string {
    return this._selectionService ? this._selectionService.selectionText : '';
  }

  public getSelectionPosition(): ISelectionPosition | undefined {
    if (!this._selectionService || !this._selectionService.hasSelection) {
      return undefined;
    }

    return {
      startColumn: this._selectionService.selectionStart![0],
      startRow: this._selectionService.selectionStart![1],
      endColumn: this._selectionService.selectionEnd![0],
      endRow: this._selectionService.selectionEnd![1]
    };
  }

  /**
   * Clears the current terminal selection.
   */
  public clearSelection(): void {
    this._selectionService?.clearSelection();
  }

  /**
   * Selects all text within the terminal.
   */
  public selectAll(): void {
    this._selectionService?.selectAll();
  }

  public selectLines(start: number, end: number): void {
    this._selectionService?.selectLines(start, end);
  }

  /**
   * Handle a keydown event
   * Key Resources:
   *   - https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
   * @param ev The keydown event to be handled.
   */
  protected _keyDown(event: KeyboardEvent): boolean | undefined {
    this._keyDownHandled = false;

    if (this._customKeyEventHandler && this._customKeyEventHandler(event) === false) {
      return false;
    }

    if (!this._compositionHelper!.keydown(event)) {
      if (this.buffer.ybase !== this.buffer.ydisp) {
        this._bufferService.scrollToBottom();
      }
      return false;
    }

    const result = evaluateKeyboardEvent(event, this._coreService.decPrivateModes.applicationCursorKeys, this.browser.isMac, this.options.macOptionIsMeta);

    this.updateCursorStyle(event);

    if (result.type === KeyboardResultType.PAGE_DOWN || result.type === KeyboardResultType.PAGE_UP) {
      const scrollCount = this.rows - 1;
      this.scrollLines(result.type === KeyboardResultType.PAGE_UP ? -scrollCount : scrollCount);
      return this.cancel(event, true);
    }

    if (result.type === KeyboardResultType.SELECT_ALL) {
      this.selectAll();
    }

    if (this._isThirdLevelShift(this.browser, event)) {
      return true;
    }

    if (result.cancel) {
      // The event is canceled at the end already, is this necessary?
      this.cancel(event, true);
    }

    if (!result.key) {
      return true;
    }

    // If ctrl+c or enter is being sent, clear out the textarea. This is done so that screen readers
    // will announce deleted characters. This will not work 100% of the time but it should cover
    // most scenarios.
    if (result.key === C0.ETX || result.key === C0.CR) {
      this.textarea!.value = '';
    }

    this._onKey.fire({ key: result.key, domEvent: event });
    this._showCursor();
    this._coreService.triggerDataEvent(result.key, true);

    // Cancel events when not in screen reader mode so events don't get bubbled up and handled by
    // other listeners. When screen reader mode is enabled, this could cause issues if the event
    // is handled at a higher level, this is a compromise in order to echo keys to the screen
    // reader.
    if (!this.optionsService.options.screenReaderMode) {
      return this.cancel(event, true);
    }

    this._keyDownHandled = true;
  }

  private _isThirdLevelShift(browser: IBrowser, ev: IKeyboardEvent): boolean {
    const thirdLevelKey =
      (browser.isMac && !this.options.macOptionIsMeta && ev.altKey && !ev.ctrlKey && !ev.metaKey) ||
      (browser.isWindows && ev.altKey && ev.ctrlKey && !ev.metaKey);

    if (ev.type === 'keypress') {
      return thirdLevelKey;
    }

    // Don't invoke for arrows, pageDown, home, backspace, etc. (on non-keypress events)
    return thirdLevelKey && (!ev.keyCode || ev.keyCode > 47);
  }

  protected _keyUp(ev: KeyboardEvent): void {
    if (this._customKeyEventHandler && this._customKeyEventHandler(ev) === false) {
      return;
    }

    if (!wasModifierKeyOnlyEvent(ev)) {
      this.focus();
    }

    this.updateCursorStyle(ev);
  }

  /**
   * Handle a keypress event.
   * Key Resources:
   *   - https://developer.mozilla.org/en-US/docs/DOM/KeyboardEvent
   * @param ev The keypress event to be handled.
   */
  protected _keyPress(ev: KeyboardEvent): boolean {
    let key;

    if (this._keyDownHandled) {
      return false;
    }

    if (this._customKeyEventHandler && this._customKeyEventHandler(ev) === false) {
      return false;
    }

    this.cancel(ev);

    if (ev.charCode) {
      key = ev.charCode;
    } else if (ev.which === null || ev.which === undefined) {
      key = ev.keyCode;
    } else if (ev.which !== 0 && ev.charCode !== 0) {
      key = ev.which;
    } else {
      return false;
    }

    if (!key || (
      (ev.altKey || ev.ctrlKey || ev.metaKey) && !this._isThirdLevelShift(this.browser, ev)
    )) {
      return false;
    }

    key = String.fromCharCode(key);

    this._onKey.fire({ key, domEvent: ev });
    this._showCursor();
    this._coreService.triggerDataEvent(key, true);

    return true;
  }

  /**
   * Ring the bell.
   * Note: We could do sweet things with webaudio here
   */
  public bell(): void {
    if (this._soundBell()) {
      this._soundService?.playBellSound();
    }

    this._onBell.fire();

    // if (this._visualBell()) {
    //   this.element.classList.add('visual-bell-active');
    //   clearTimeout(this._visualBellTimer);
    //   this._visualBellTimer = window.setTimeout(() => {
    //     this.element.classList.remove('visual-bell-active');
    //   }, 200);
    // }
  }

  /**
   * Resizes the terminal.
   *
   * @param x The number of columns to resize to.
   * @param y The number of rows to resize to.
   */
  public resize(x: number, y: number): void {
    if (x === this.cols && y === this.rows) {
      // Check if we still need to measure the char size (fixes #785).
      if (this._charSizeService && !this._charSizeService.hasValidSize) {
        this._charSizeService.measure();
      }
      return;
    }

    super.resize(x, y);
  }

  private _afterResize(x: number, y: number): void {
    this._charSizeService?.measure();

    // Sync the scroll area to make sure scroll events don't fire and scroll the viewport to an
    // invalid location
    this.viewport?.syncScrollArea(true);
  }

  /**
   * Clear the entire buffer, making the prompt line the new first line.
   */
  public clear(): void {
    if (this.buffer.ybase === 0 && this.buffer.y === 0) {
      // Don't clear if it's already clear
      return;
    }
    this.buffer.lines.set(0, this.buffer.lines.get(this.buffer.ybase + this.buffer.y)!);
    this.buffer.lines.length = 1;
    this.buffer.ydisp = 0;
    this.buffer.ybase = 0;
    this.buffer.y = 0;
    for (let i = 1; i < this.rows; i++) {
      this.buffer.lines.push(this.buffer.getBlankLine(DEFAULT_ATTR_DATA));
    }
    this.refresh(0, this.rows - 1);
    this._onScroll.fire({ position: this.buffer.ydisp, source: ScrollSource.TERMINAL });
  }

  /**
   * Reset terminal.
   * Note: Calling this directly from JS is synchronous but does not clear
   * input buffers and does not reset the parser, thus the terminal will
   * continue to apply pending input data.
   * If you need in band reset (synchronous with input data) consider
   * using DECSTR (soft reset, CSI ! p) or RIS instead (hard reset, ESC c).
   */
  public reset(): void {
    /**
     * Since _setup handles a full terminal creation, we have to carry forward
     * a few things that should not reset.
     */
    this.options.rows = this.rows;
    this.options.cols = this.cols;
    const customKeyEventHandler = this._customKeyEventHandler;

    this._setup();
    super.reset();
    this._selectionService?.reset();

    // reattach
    this._customKeyEventHandler = customKeyEventHandler;

    // do a full screen refresh
    this.refresh(0, this.rows - 1);
    this.viewport?.syncScrollArea();
  }

  private _reportWindowsOptions(type: WindowsOptionsReportType): void {
    if (!this._renderService) {
      return;
    }

    switch (type) {
      case WindowsOptionsReportType.GET_WIN_SIZE_PIXELS:
        const canvasWidth = this._renderService.dimensions.scaledCanvasWidth.toFixed(0);
        const canvasHeight = this._renderService.dimensions.scaledCanvasHeight.toFixed(0);
        this._coreService.triggerDataEvent(`${C0.ESC}[4;${canvasHeight};${canvasWidth}t`);
        break;
      case WindowsOptionsReportType.GET_CELL_SIZE_PIXELS:
        const cellWidth = this._renderService.dimensions.scaledCellWidth.toFixed(0);
        const cellHeight = this._renderService.dimensions.scaledCellHeight.toFixed(0);
        this._coreService.triggerDataEvent(`${C0.ESC}[6;${cellHeight};${cellWidth}t`);
        break;
    }
  }

  // TODO: Remove cancel function and cancelEvents option
  public cancel(ev: Event, force?: boolean): boolean | undefined {
    if (!this.options.cancelEvents && !force) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    return false;
  }

  private _visualBell(): boolean {
    return false;
    // return this.options.bellStyle === 'visual' ||
    //     this.options.bellStyle === 'both';
  }

  private _soundBell(): boolean {
    return this.options.bellStyle === 'sound';
    // return this.options.bellStyle === 'sound' ||
    //     this.options.bellStyle === 'both';
  }
}

/**
 * Helpers
 */

function wasModifierKeyOnlyEvent(ev: KeyboardEvent): boolean {
  return ev.keyCode === 16 || // Shift
    ev.keyCode === 17 || // Ctrl
    ev.keyCode === 18; // Alt
}
