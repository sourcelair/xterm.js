/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { IAttributeData, IColorRGB, IExtendedAttrs } from 'common/Types';
import { Attributes, FgFlags, BgFlags, UnderlineStyle } from 'common/buffer/Constants';

export class AttributeData implements IAttributeData {
  public static toColorRGB(value: number): IColorRGB {
    return [
      value >>> Attributes.RED_SHIFT & 255,
      value >>> Attributes.GREEN_SHIFT & 255,
      value & 255
    ];
  }

  public static fromColorRGB(value: IColorRGB): number {
    return (value[0] & 255) << Attributes.RED_SHIFT | (value[1] & 255) << Attributes.GREEN_SHIFT | value[2] & 255;
  }

  public clone(): IAttributeData {
    const newObj = new AttributeData();
    newObj.fg = this.fg;
    newObj.bg = this.bg;
    newObj.extended = this.extended.clone();
    return newObj;
  }

  // data
  public fg = 0;
  public bg = 0;
  public extended = new ExtendedAttrs();

  // flags
  public isInverse(): number   { return this.fg & FgFlags.INVERSE; }
  public isBold(): number      { return this.fg & FgFlags.BOLD; }
  public isUnderline(): number { return this.fg & FgFlags.UNDERLINE; }
  public isBlink(): number     { return this.fg & FgFlags.BLINK; }
  public isInvisible(): number { return this.fg & FgFlags.INVISIBLE; }
  public isItalic(): number    { return this.bg & BgFlags.ITALIC; }
  public isDim(): number       { return this.bg & BgFlags.DIM; }

  // color modes
  public getFgColorMode(): number { return this.fg & Attributes.CM_MASK; }
  public getBgColorMode(): number { return this.bg & Attributes.CM_MASK; }
  public isFgRGB(): boolean       { return (this.fg & Attributes.CM_MASK) === Attributes.CM_RGB; }
  public isBgRGB(): boolean       { return (this.bg & Attributes.CM_MASK) === Attributes.CM_RGB; }
  public isFgPalette(): boolean   { return (this.fg & Attributes.CM_MASK) === Attributes.CM_P16 || (this.fg & Attributes.CM_MASK) === Attributes.CM_P256; }
  public isBgPalette(): boolean   { return (this.bg & Attributes.CM_MASK) === Attributes.CM_P16 || (this.bg & Attributes.CM_MASK) === Attributes.CM_P256; }
  public isFgDefault(): boolean   { return (this.fg & Attributes.CM_MASK) === 0; }
  public isBgDefault(): boolean   { return (this.bg & Attributes.CM_MASK) === 0; }
  public isAttributeDefault(): boolean { return this.fg === 0 && this.bg === 0; }

  // colors
  public getFgColor(): number {
    switch (this.fg & Attributes.CM_MASK) {
      case Attributes.CM_P16:
      case Attributes.CM_P256:  return this.fg & Attributes.PCOLOR_MASK;
      case Attributes.CM_RGB:   return this.fg & Attributes.RGB_MASK;
      default:                  return -1;  // CM_DEFAULT defaults to -1
    }
  }
  public getBgColor(): number {
    switch (this.bg & Attributes.CM_MASK) {
      case Attributes.CM_P16:
      case Attributes.CM_P256:  return this.bg & Attributes.PCOLOR_MASK;
      case Attributes.CM_RGB:   return this.bg & Attributes.RGB_MASK;
      default:                  return -1;  // CM_DEFAULT defaults to -1
    }
  }

  // extended attrs
  public hasExtendedAttrs(): number {
    return this.bg & BgFlags.HAS_EXTENDED;
  }
  public updateExtended(): void {
    if (this.extended.isEmpty()) {
      this.bg &= ~BgFlags.HAS_EXTENDED;
    } else {
      this.bg |= BgFlags.HAS_EXTENDED;
    }
  }
  public getUnderlineColor(): number {
    if ((this.bg & BgFlags.HAS_EXTENDED) && ~this.extended.underlineColor) {
      switch (this.extended.underlineColor & Attributes.CM_MASK) {
        case Attributes.CM_P16:
        case Attributes.CM_P256:  return this.extended.underlineColor & Attributes.PCOLOR_MASK;
        case Attributes.CM_RGB:   return this.extended.underlineColor & Attributes.RGB_MASK;
        default:                  return this.getFgColor();
      }
    }
    return this.getFgColor();
  }
  public getUnderlineColorMode(): number {
    return (this.bg & BgFlags.HAS_EXTENDED) && ~this.extended.underlineColor
      ? this.extended.underlineColor & Attributes.CM_MASK
      : this.getFgColorMode();
  }
  public isUnderlineColorRGB(): boolean {
    return (this.bg & BgFlags.HAS_EXTENDED) && ~this.extended.underlineColor
      ? (this.extended.underlineColor & Attributes.CM_MASK) === Attributes.CM_RGB
      : this.isFgRGB();
  }
  public isUnderlineColorPalette(): boolean {
    return (this.bg & BgFlags.HAS_EXTENDED) && ~this.extended.underlineColor
      ? (this.extended.underlineColor & Attributes.CM_MASK) === Attributes.CM_P16
          || (this.extended.underlineColor & Attributes.CM_MASK) === Attributes.CM_P256
      : this.isFgPalette();
  }
  public isUnderlineColorDefault(): boolean {
    return (this.bg & BgFlags.HAS_EXTENDED) && ~this.extended.underlineColor
      ? (this.extended.underlineColor & Attributes.CM_MASK) === 0
      : this.isFgDefault();
  }
  public getUnderlineStyle(): UnderlineStyle {
    return this.fg & FgFlags.UNDERLINE
      ? (this.bg & BgFlags.HAS_EXTENDED ? this.extended.underlineStyle : UnderlineStyle.SINGLE)
      : UnderlineStyle.NONE;
  }
}


/**
 * Extended attributes for a cell.
 * Holds information about different underline styles and color.
 */
export class ExtendedAttrs implements IExtendedAttrs {
  constructor(
    // underline style, NONE is empty
    public underlineStyle: UnderlineStyle = UnderlineStyle.NONE,
    // underline color, -1 is empty (same as FG)
    public underlineColor: number = -1,
    // url hover id, 0 is empty
    public urlId = 0
  ) {}

  public clone(): IExtendedAttrs {
    return new ExtendedAttrs(this.underlineStyle, this.underlineColor, this.urlId);
  }

  /**
   * Convenient method to indicate whether the object holds no additional information,
   * that needs to be persistant in the buffer.
   */
  public isEmpty(): boolean {
    return this.underlineStyle === UnderlineStyle.NONE && !this.urlId;
  }
}
