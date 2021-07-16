/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ICharAtlasConfig } from './Types';
import { DIM_OPACITY } from 'browser/renderer/atlas/Constants';
import { IRasterizedGlyph, IRasterizedGlyphSet } from '../Types';
import { DEFAULT_COLOR, Attributes } from 'common/buffer/Constants';
import { throwIfFalsy } from '../WebglUtils';
import { IColor } from 'browser/Types';
import { IDisposable } from 'xterm';
import { AttributeData } from 'common/buffer/AttributeData';
import { channels, rgba } from 'browser/Color';

// In practice we're probably never going to exhaust a texture this large. For debugging purposes,
// however, it can be useful to set this to a really tiny value, to verify that LRU eviction works.
const TEXTURE_WIDTH = 1024;
const TEXTURE_HEIGHT = 1024;

/**
 * The amount of the texture to be filled before throwing it away and starting
 * again. Since the throw away and individual glyph draws don't cost too much,
 * this prevent juggling multiple textures in the GL context.
 */
const TEXTURE_CAPACITY = Math.floor(TEXTURE_HEIGHT * 0.8);

const TRANSPARENT_COLOR = {
  css: 'rgba(0, 0, 0, 0)',
  rgba: 0
};

/**
 * A shared object which is used to draw nothing for a particular cell.
 */
const NULL_RASTERIZED_GLYPH: IRasterizedGlyph = {
  offset: { x: 0, y: 0 },
  texturePosition: { x: 0, y: 0 },
  texturePositionClipSpace: { x: 0, y: 0 },
  size: { x: 0, y: 0 },
  sizeClipSpace: { x: 0, y: 0 }
};

const TMP_CANVAS_GLYPH_PADDING = 2;

export class WebglCharAtlas implements IDisposable {
  private _didWarmUp: boolean = false;

  private _cacheMap: { [code: number]: IRasterizedGlyphSet } = {};
  private _cacheMapCombined: { [chars: string]: IRasterizedGlyphSet } = {};

  // The texture that the atlas is drawn to
  public cacheCanvas: HTMLCanvasElement;
  private _cacheCtx: CanvasRenderingContext2D;

  private _tmpCanvas: HTMLCanvasElement;
  // A temporary context that glyphs are drawn to before being transfered to the atlas.
  private _tmpCtx: CanvasRenderingContext2D;

  // Since glyphs are expected to be around the same height, the packing
  // strategy used it to fill a row with glyphs while keeping track of the
  // tallest glyph in the row. Once the row is full a new row is started at
  // (0,lastRow+lastRowTallestGlyph).
  private _currentRowY: number = 0;
  private _currentRowX: number = 0;
  private _currentRowHeight: number = 0;

  public hasCanvasChanged = false;

  private _workAttributeData: AttributeData = new AttributeData();

  constructor(
    document: Document,
    private _config: ICharAtlasConfig
  ) {
    this.cacheCanvas = document.createElement('canvas');
    this.cacheCanvas.width = TEXTURE_WIDTH;
    this.cacheCanvas.height = TEXTURE_HEIGHT;
    // The canvas needs alpha because we use clearColor to convert the background color to alpha.
    // It might also contain some characters with transparent backgrounds if allowTransparency is
    // set.
    this._cacheCtx = throwIfFalsy(this.cacheCanvas.getContext('2d', { alpha: true }));

    this._tmpCanvas = document.createElement('canvas');
    this._tmpCanvas.width = this._config.scaledCharWidth * 4 + TMP_CANVAS_GLYPH_PADDING * 2;
    this._tmpCanvas.height = this._config.scaledCharHeight + TMP_CANVAS_GLYPH_PADDING * 2;
    this._tmpCtx = throwIfFalsy(this._tmpCanvas.getContext('2d', { alpha: this._config.allowTransparency }));
  }

  public dispose(): void {
    if (this.cacheCanvas.parentElement) {
      this.cacheCanvas.parentElement.removeChild(this.cacheCanvas);
    }
  }

  public warmUp(): void {
    if (!this._didWarmUp) {
      this._doWarmUp();
      this._didWarmUp = true;
    }
  }

  private _doWarmUp(): void {
    // Pre-fill with ASCII 33-126
    for (let i = 33; i < 126; i++) {
      const rasterizedGlyph = this._drawToCache(i, DEFAULT_COLOR, DEFAULT_COLOR);
      this._cacheMap[i] = {
        [DEFAULT_COLOR]: {
          [DEFAULT_COLOR]: rasterizedGlyph
        }
      };
    }
  }

  public beginFrame(): boolean {
    if (this._currentRowY > TEXTURE_CAPACITY) {
      this.clearTexture();
      this.warmUp();
      return true;
    }
    return false;
  }

  public clearTexture(): void {
    if (this._currentRowX === 0 && this._currentRowY === 0) {
      return;
    }
    this._cacheCtx.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    this._cacheMap = {};
    this._cacheMapCombined = {};
    this._currentRowHeight = 0;
    this._currentRowX = 0;
    this._currentRowY = 0;
    this._didWarmUp = false;
  }

  public getRasterizedGlyphCombinedChar(chars: string, bg: number, fg: number): IRasterizedGlyph {
    let rasterizedGlyphSet = this._cacheMapCombined[chars];
    if (!rasterizedGlyphSet) {
      rasterizedGlyphSet = {};
      this._cacheMapCombined[chars] = rasterizedGlyphSet;
    }
    let rasterizedGlyph: IRasterizedGlyph | undefined;
    const rasterizedGlyphSetBg = rasterizedGlyphSet[bg];
    if (rasterizedGlyphSetBg) {
      rasterizedGlyph = rasterizedGlyphSetBg[fg];
    }
    if (!rasterizedGlyph) {
      rasterizedGlyph = this._drawToCache(chars, bg, fg);
      if (!rasterizedGlyphSet[bg]) {
        rasterizedGlyphSet[bg] = {};
      }
      rasterizedGlyphSet[bg]![fg] = rasterizedGlyph;
    }
    return rasterizedGlyph;
  }

  /**
   * Gets the glyphs texture coords, drawing the texture if it's not already
   */
  public getRasterizedGlyph(code: number, bg: number, fg: number): IRasterizedGlyph {
    let rasterizedGlyphSet = this._cacheMap[code];
    if (!rasterizedGlyphSet) {
      rasterizedGlyphSet = {};
      this._cacheMap[code] = rasterizedGlyphSet;
    }
    let rasterizedGlyph: IRasterizedGlyph | undefined;
    const rasterizedGlyphSetBg = rasterizedGlyphSet[bg];
    if (rasterizedGlyphSetBg) {
      rasterizedGlyph = rasterizedGlyphSetBg[fg];
    }
    if (!rasterizedGlyph) {
      rasterizedGlyph = this._drawToCache(code, bg, fg);
      if (!rasterizedGlyphSet[bg]) {
        rasterizedGlyphSet[bg] = {};
      }
      rasterizedGlyphSet[bg]![fg] = rasterizedGlyph;
    }
    return rasterizedGlyph;
  }

  private _getColorFromAnsiIndex(idx: number): IColor {
    if (idx >= this._config.colors.ansi.length) {
      throw new Error('No color found for idx ' + idx);
    }
    return this._config.colors.ansi[idx];
  }

  private _getBackgroundColor(bgColorMode: number, bgColor: number, inverse: boolean): IColor {
    if (this._config.allowTransparency) {
      // The background color might have some transparency, so we need to render it as fully
      // transparent in the atlas. Otherwise we'd end up drawing the transparent background twice
      // around the anti-aliased edges of the glyph, and it would look too dark.
      return TRANSPARENT_COLOR;
    }

    switch (bgColorMode) {
      case Attributes.CM_P16:
      case Attributes.CM_P256:
        return this._getColorFromAnsiIndex(bgColor);
      case Attributes.CM_RGB:
        const arr = AttributeData.toColorRGB(bgColor);
        // TODO: This object creation is slow
        return {
          rgba: bgColor << 8,
          css: `#${toPaddedHex(arr[0])}${toPaddedHex(arr[1])}${toPaddedHex(arr[2])}`
        };
      case Attributes.CM_DEFAULT:
      default:
        if (inverse) {
          return this._config.colors.foreground;
        }
        return this._config.colors.background;
    }
  }

  private _getForegroundCss(bg: number, bgColorMode: number, bgColor: number, fg: number, fgColorMode: number, fgColor: number, inverse: boolean, bold: boolean): string {
    const minimumContrastCss = this._getMinimumContrastCss(bg, bgColorMode, bgColor, fg, fgColorMode, fgColor, inverse, bold);
    if (minimumContrastCss) {
      return minimumContrastCss;
    }

    switch (fgColorMode) {
      case Attributes.CM_P16:
      case Attributes.CM_P256:
        if (this._config.drawBoldTextInBrightColors && bold && fgColor < 8) {
          fgColor += 8;
        }
        return this._getColorFromAnsiIndex(fgColor).css;
      case Attributes.CM_RGB:
        const arr = AttributeData.toColorRGB(fgColor);
        return channels.toCss(arr[0], arr[1], arr[2]);
      case Attributes.CM_DEFAULT:
      default:
        if (inverse) {
          const bg = this._config.colors.background.css;
          if (bg.length === 9) {
            // Remove bg alpha channel if present
            return bg.substr(0, 7);
          }
          return bg;
        }
        return this._config.colors.foreground.css;
    }
  }

  private _resolveBackgroundRgba(bgColorMode: number, bgColor: number, inverse: boolean): number {
    switch (bgColorMode) {
      case Attributes.CM_P16:
      case Attributes.CM_P256:
        return this._getColorFromAnsiIndex(bgColor).rgba;
      case Attributes.CM_RGB:
        return bgColor << 8;
      case Attributes.CM_DEFAULT:
      default:
        if (inverse) {
          return this._config.colors.foreground.rgba;
        }
        return this._config.colors.background.rgba;
    }
  }

  private _resolveForegroundRgba(fgColorMode: number, fgColor: number, inverse: boolean, bold: boolean): number {
    switch (fgColorMode) {
      case Attributes.CM_P16:
      case Attributes.CM_P256:
        if (this._config.drawBoldTextInBrightColors && bold && fgColor < 8) {
          fgColor += 8;
        }
        return this._getColorFromAnsiIndex(fgColor).rgba;
      case Attributes.CM_RGB:
        return fgColor << 8;
      case Attributes.CM_DEFAULT:
      default:
        if (inverse) {
          return this._config.colors.background.rgba;
        }
        return this._config.colors.foreground.rgba;
    }
  }

  private _getMinimumContrastCss(bg: number, bgColorMode: number, bgColor: number, fg: number, fgColorMode: number, fgColor: number, inverse: boolean, bold: boolean): string | undefined {
    if (this._config.minimumContrastRatio === 1) {
      return undefined;
    }

    // Try get from cache first
    const adjustedColor = this._config.colors.contrastCache.getCss(bg, fg);
    if (adjustedColor !== undefined) {
      return adjustedColor || undefined;
    }

    const bgRgba = this._resolveBackgroundRgba(bgColorMode, bgColor, inverse);
    const fgRgba = this._resolveForegroundRgba(fgColorMode, fgColor, inverse, bold);
    const result = rgba.ensureContrastRatio(bgRgba, fgRgba, this._config.minimumContrastRatio);

    if (!result) {
      this._config.colors.contrastCache.setCss(bg, fg, null);
      return undefined;
    }

    const css = channels.toCss(
      (result >> 24) & 0xFF,
      (result >> 16) & 0xFF,
      (result >> 8) & 0xFF
    );
    this._config.colors.contrastCache.setCss(bg, fg, css);

    return css;
  }

  private _drawToCache(code: number, bg: number, fg: number): IRasterizedGlyph;
  private _drawToCache(chars: string, bg: number, fg: number): IRasterizedGlyph;
  private _drawToCache(codeOrChars: number | string, bg: number, fg: number): IRasterizedGlyph {
    const chars = typeof codeOrChars === 'number' ? String.fromCharCode(codeOrChars) : codeOrChars;

    this.hasCanvasChanged = true;

    // Allow 1 cell width per character, with a minimum of 2 (CJK), plus some padding. This is used
    // to draw the glyph to the canvas as well as to restrict the bounding box search to ensure
    // giant ligatures (eg. =====>) don't impact overall performance.
    const allowedWidth = this._config.scaledCharWidth * Math.max(chars.length, 2) + TMP_CANVAS_GLYPH_PADDING * 2;
    if (this._tmpCanvas.width < allowedWidth) {
      this._tmpCanvas.width = allowedWidth;
    }
    this._tmpCtx.save();

    this._workAttributeData.fg = fg;
    this._workAttributeData.bg = bg;

    const invisible = !!this._workAttributeData.isInvisible();
    if (invisible) {
      return NULL_RASTERIZED_GLYPH;
    }

    const bold = !!this._workAttributeData.isBold();
    const inverse = !!this._workAttributeData.isInverse();
    const dim = !!this._workAttributeData.isDim();
    const italic = !!this._workAttributeData.isItalic();
    const underline = !!this._workAttributeData.isUnderline();
    const strikethrough = !!this._workAttributeData.isStrikethrough();
    let fgColor = this._workAttributeData.getFgColor();
    let fgColorMode = this._workAttributeData.getFgColorMode();
    let bgColor = this._workAttributeData.getBgColor();
    let bgColorMode = this._workAttributeData.getBgColorMode();
    if (inverse) {
      const temp = fgColor;
      fgColor = bgColor;
      bgColor = temp;
      const temp2 = fgColorMode;
      fgColorMode = bgColorMode;
      bgColorMode = temp2;
    }

    // draw the background
    // const backgroundColor = this._getBackgroundColor(bgColorMode, bgColor, inverse);
    // Use a 'copy' composite operation to clear any existing glyph out of _tmpCtxWithAlpha, regardless of
    // transparency in backgroundColor
    // this._tmpCtx.globalCompositeOperation = 'copy';
    // this._tmpCtx.fillStyle = backgroundColor.css + '00';
    // this._tmpCtx.fillRect(0, 0, this._tmpCanvas.width, this._tmpCanvas.height);

    this._tmpCtx.clearRect(0, 0, this._tmpCanvas.width, this._tmpCanvas.height);
    this._tmpCtx.globalCompositeOperation = 'source-over';

    // draw the foreground/glyph
    const fontWeight = bold ? this._config.fontWeightBold : this._config.fontWeight;
    const fontStyle = italic ? 'italic' : '';
    this._tmpCtx.font =
      `${fontStyle} ${fontWeight} ${this._config.fontSize * this._config.devicePixelRatio}px ${this._config.fontFamily}`;
    this._tmpCtx.textBaseline = 'ideographic';

    this._tmpCtx.fillStyle = this._getForegroundCss(bg, bgColorMode, bgColor, fg, fgColorMode, fgColor, inverse, bold);

    // Apply alpha to dim the character
    if (dim) {
      this._tmpCtx.globalAlpha = DIM_OPACITY;
    }

    const padding = TMP_CANVAS_GLYPH_PADDING;
    const metrics = this._tmpCtx.measureText(chars);

    // Draw the character
    this._tmpCtx.fillText(chars, padding, padding + this._config.scaledCharHeight);

    // Draw underline and strikethrough
    if (underline || strikethrough) {
      const lineWidth = Math.max(1, Math.floor(this._config.fontSize / 10));
      const yOffset = this._tmpCtx.lineWidth % 2 === 1 ? 0.5 : 0; // When the width is odd, draw at 0.5 position
      this._tmpCtx.lineWidth = lineWidth;
      this._tmpCtx.strokeStyle = this._tmpCtx.fillStyle;
      this._tmpCtx.beginPath();
      if (underline) {
        this._tmpCtx.moveTo(padding, padding + this._config.scaledCharHeight - yOffset);
        this._tmpCtx.lineTo(padding + this._config.scaledCharWidth, padding + this._config.scaledCharHeight - yOffset);
      }
      if (strikethrough) {
        this._tmpCtx.moveTo(padding, padding + Math.floor(this._config.scaledCharHeight / 2) - yOffset);
        this._tmpCtx.lineTo(padding + this._config.scaledCharWidth, padding + Math.floor(this._config.scaledCharHeight / 2) - yOffset);
      }
      this._tmpCtx.stroke();
      this._tmpCtx.closePath();
    }

    this._tmpCtx.restore();

    // clear the background from the character to avoid issues with drawing over the previous
    // character if it extends past it's bounds
    const imageData = this._tmpCtx.getImageData(
      0, 0, this._tmpCanvas.width, this._tmpCanvas.height
    );

    // TODO: Support transparency
    // let isEmpty = false;
    // if (!this._config.allowTransparency) {
    //   isEmpty = clearColor(imageData, backgroundColor);
    // }

    // Clear out the background color and determine if the glyph is empty.
    // const isEmpty = clearColor(imageData, backgroundColor);

    // // Handle empty glyphs
    // if (isEmpty) {
    //   return NULL_RASTERIZED_GLYPH;
    // }

    const glyphLeft = Math.floor(-metrics.actualBoundingBoxLeft + padding);
    const glyphTop = Math.floor(-metrics.actualBoundingBoxAscent + padding + this._config.scaledCharHeight);
    const glyphWidth = Math.ceil(metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight);
    const glyphHeight = Math.ceil(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent);

    if (glyphWidth === 0 && glyphHeight === 0) {
      return NULL_RASTERIZED_GLYPH;
    }

    // Check if there is enough room in the current row and go to next if needed
    if (this._currentRowX + Math.max(glyphWidth, this._config.scaledCharWidth) > TEXTURE_WIDTH) {
      this._currentRowX = 0;
      this._currentRowY += this._currentRowHeight;
      this._currentRowHeight = 0;
    }

    // putImageData doesn't do any blending, so it will overwrite any existing cache entry for us
    this._cacheCtx.putImageData(
      imageData,
      this._currentRowX - glyphLeft,
      this._currentRowY - glyphTop,
      glyphLeft,
      glyphTop,
      glyphWidth,
      glyphHeight
    );

    // Record texture position
    const rasterizedGlyph = {
      texturePosition: {
        x: this._currentRowX,
        y: this._currentRowY
      },
      texturePositionClipSpace: {
        x: this._currentRowX / TEXTURE_WIDTH,
        y: this._currentRowY / TEXTURE_HEIGHT
      },
      size: {
        x: glyphWidth,
        y: glyphHeight
      },
      sizeClipSpace: {
        x: glyphWidth / TEXTURE_WIDTH,
        y: glyphHeight / TEXTURE_HEIGHT
      },
      offset: {
        x: Math.floor(-metrics.actualBoundingBoxLeft),
        y: Math.floor(-metrics.actualBoundingBoxAscent + this._config.scaledCharHeight)
      }
    };

    // Update atlas current row
    this._currentRowHeight = Math.max(glyphHeight, this._currentRowHeight);
    this._currentRowX += glyphWidth;

    return rasterizedGlyph;
  }
}

/**
 * Makes a partiicular rgb color in an ImageData completely transparent.
 * @returns True if the result is "empty", meaning all pixels are fully transparent.
 */
function clearColor(imageData: ImageData, color: IColor): boolean {
  let isEmpty = true;
  const r = color.rgba >>> 24;
  const g = color.rgba >>> 16 & 0xFF;
  const b = color.rgba >>> 8 & 0xFF;
  for (let offset = 0; offset < imageData.data.length; offset += 4) {
    if (imageData.data[offset] === r &&
      imageData.data[offset + 1] === g &&
      imageData.data[offset + 2] === b) {
      imageData.data[offset + 3] = 0;
    } else {
      isEmpty = false;
    }
  }
  return isEmpty;
}

function toPaddedHex(c: number): string {
  const s = c.toString(16);
  return s.length < 2 ? '0' + s : s;
}
