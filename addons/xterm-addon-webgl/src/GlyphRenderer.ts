/**
 * Copyright (c) 2018 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { createProgram, PROJECTION_MATRIX, throwIfFalsy } from './WebglUtils';
import { WebglCharAtlas } from './atlas/WebglCharAtlas';
import { IWebGL2RenderingContext, IWebGLVertexArrayObject, IRenderModel, IRasterizedGlyph } from './Types';
import { COMBINED_CHAR_BIT_MASK, RENDER_MODEL_INDICIES_PER_CELL, RENDER_MODEL_FG_OFFSET, RENDER_MODEL_BG_OFFSET } from './RenderModel';
import { fill } from 'common/TypedArrayUtils';
import { slice } from './TypedArray';
import { NULL_CELL_CODE, WHITESPACE_CELL_CODE, Attributes, FgFlags } from 'common/buffer/Constants';
import { Terminal, IBufferLine } from 'xterm';
import { IColorSet, IColor } from 'browser/Types';
import { IRenderDimensions } from 'browser/renderer/Types';
import { AttributeData } from 'common/buffer/AttributeData';

interface IVertices {
  attributes: Float32Array;
  /**
   * These buffers are the ones used to bind to WebGL, the reason there are
   * multiple is to allow double buffering to work as you cannot modify the
   * buffer while it's being used by the GPU. Having multiple lets us start
   * working on the next frame.
   */
  attributesBuffers: Float32Array[];
  selectionAttributes: Float32Array;
  count: number;
}

const enum VertexAttribLocations {
  UNIT_QUAD = 0,
  CELL_POSITION = 1,
  OFFSET = 2,
  SIZE = 3,
  TEXCOORD = 4,
  TEXSIZE = 5
}

const vertexShaderSource = `#version 300 es
layout (location = ${VertexAttribLocations.UNIT_QUAD}) in vec2 a_unitquad;
layout (location = ${VertexAttribLocations.CELL_POSITION}) in vec2 a_cellpos;
layout (location = ${VertexAttribLocations.OFFSET}) in vec2 a_offset;
layout (location = ${VertexAttribLocations.SIZE}) in vec2 a_size;
layout (location = ${VertexAttribLocations.TEXCOORD}) in vec2 a_texcoord;
layout (location = ${VertexAttribLocations.TEXSIZE}) in vec2 a_texsize;

uniform mat4 u_projection;
uniform vec2 u_resolution;

out vec2 v_texcoord;

void main() {
  vec2 zeroToOne = (a_offset / u_resolution) + a_cellpos + (a_unitquad * a_size);
  gl_Position = u_projection * vec4(zeroToOne, 0.0, 1.0);
  v_texcoord = a_texcoord + a_unitquad * a_texsize;
}`;

const fragmentShaderSource = `#version 300 es
precision lowp float;

in vec2 v_texcoord;

uniform sampler2D u_texture;

out vec4 outColor;

void main() {
  outColor = texture(u_texture, v_texcoord);
}`;

const INDICES_PER_CELL = 10;
const BYTES_PER_CELL = INDICES_PER_CELL * Float32Array.BYTES_PER_ELEMENT;
const CELL_POSITION_INDICES = 2;

export class GlyphRenderer {
  private _atlas: WebglCharAtlas | undefined;

  private _program: WebGLProgram;
  private _vertexArrayObject: IWebGLVertexArrayObject;
  private _projectionLocation: WebGLUniformLocation;
  private _resolutionLocation: WebGLUniformLocation;
  private _textureLocation: WebGLUniformLocation;
  private _atlasTexture: WebGLTexture;
  private _attributesBuffer: WebGLBuffer;
  private _activeBuffer: number = 0;

  private _vertices: IVertices = {
    count: 0,
    attributes: new Float32Array(0),
    attributesBuffers: [
      new Float32Array(0),
      new Float32Array(0)
    ],
    selectionAttributes: new Float32Array(0)
  };

  constructor(
    private _terminal: Terminal,
    private _colors: IColorSet,
    private _gl: IWebGL2RenderingContext,
    private _dimensions: IRenderDimensions
  ) {
    const gl = this._gl;
    const program = throwIfFalsy(createProgram(gl, vertexShaderSource, fragmentShaderSource));
    this._program = program;

    // Uniform locations
    this._projectionLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_projection'));
    this._resolutionLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_resolution'));
    this._textureLocation = throwIfFalsy(gl.getUniformLocation(this._program, 'u_texture'));

    // Create and set the vertex array object
    this._vertexArrayObject = gl.createVertexArray();
    gl.bindVertexArray(this._vertexArrayObject);

    // Setup a_unitquad, this defines the 4 vertices of a rectangle
    const unitQuadVertices = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
    const unitQuadVerticesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, unitQuadVerticesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, unitQuadVertices, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(VertexAttribLocations.UNIT_QUAD);
    gl.vertexAttribPointer(VertexAttribLocations.UNIT_QUAD, 2, this._gl.FLOAT, false, 0, 0);

    // Setup the unit quad element array buffer, this points to indices in
    // unitQuadVertuces to allow is to draw 2 triangles from the vertices
    const unitQuadElementIndices = new Uint8Array([0, 1, 3, 0, 2, 3]);
    const elementIndicesBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, elementIndicesBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, unitQuadElementIndices, gl.STATIC_DRAW);

    // Setup attributes
    this._attributesBuffer = throwIfFalsy(gl.createBuffer());
    gl.bindBuffer(gl.ARRAY_BUFFER, this._attributesBuffer);
    gl.enableVertexAttribArray(VertexAttribLocations.OFFSET);
    gl.vertexAttribPointer(VertexAttribLocations.OFFSET, 2, gl.FLOAT, false, BYTES_PER_CELL, 0);
    gl.vertexAttribDivisor(VertexAttribLocations.OFFSET, 1);
    gl.enableVertexAttribArray(VertexAttribLocations.SIZE);
    gl.vertexAttribPointer(VertexAttribLocations.SIZE, 2, gl.FLOAT, false, BYTES_PER_CELL, 2 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(VertexAttribLocations.SIZE, 1);
    gl.enableVertexAttribArray(VertexAttribLocations.TEXCOORD);
    gl.vertexAttribPointer(VertexAttribLocations.TEXCOORD, 2, gl.FLOAT, false, BYTES_PER_CELL, 4 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(VertexAttribLocations.TEXCOORD, 1);
    gl.enableVertexAttribArray(VertexAttribLocations.TEXSIZE);
    gl.vertexAttribPointer(VertexAttribLocations.TEXSIZE, 2, gl.FLOAT, false, BYTES_PER_CELL, 6 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(VertexAttribLocations.TEXSIZE, 1);
    gl.enableVertexAttribArray(VertexAttribLocations.CELL_POSITION);
    gl.vertexAttribPointer(VertexAttribLocations.CELL_POSITION, 2, gl.FLOAT, false, BYTES_PER_CELL, 8 * Float32Array.BYTES_PER_ELEMENT);
    gl.vertexAttribDivisor(VertexAttribLocations.CELL_POSITION, 1);

    // Setup empty texture atlas
    this._atlasTexture = throwIfFalsy(gl.createTexture());
    gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Allow drawing of transparent texture
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE);

    // Set viewport
    this.onResize();
  }

  public beginFrame(): boolean {
    return this._atlas ? this._atlas.beginFrame() : true;
  }

  public updateCell(x: number, y: number, code: number, bg: number, fg: number, chars: string): void {
    this._updateCell(this._vertices.attributes, x, y, code, bg, fg, chars);
  }

  private _updateCell(array: Float32Array, x: number, y: number, code: number | undefined, bg: number, fg: number, chars?: string): void {
    const terminal = this._terminal;

    const i = (y * terminal.cols + x) * INDICES_PER_CELL;

    // Exit early if this is a null character, allow space character to continue as it may have
    // underline/strikethrough styles
    if (code === NULL_CELL_CODE || code === undefined/* This is used for the right side of wide chars */) {
      fill(array, 0, i, i + INDICES_PER_CELL - 1 - CELL_POSITION_INDICES);
      return;
    }

    let rasterizedGlyph: IRasterizedGlyph;
    if (!this._atlas) {
      return;
    }
    if (chars && chars.length > 1) {
      rasterizedGlyph = this._atlas.getRasterizedGlyphCombinedChar(chars, bg, fg);
    } else {
      rasterizedGlyph = this._atlas.getRasterizedGlyph(code, bg, fg);
    }

    // Fill empty if no glyph was found
    if (!rasterizedGlyph) {
      fill(array, 0, i, i + INDICES_PER_CELL - 1 - CELL_POSITION_INDICES);
      return;
    }

    // a_origin
    array[i    ] = rasterizedGlyph.offset.x + this._dimensions.scaledCharLeft;
    array[i + 1] = rasterizedGlyph.offset.y + this._dimensions.scaledCharTop;
    // a_size
    array[i + 2] = rasterizedGlyph.size.x / this._dimensions.scaledCanvasWidth;
    array[i + 3] = rasterizedGlyph.size.y / this._dimensions.scaledCanvasHeight;
    // a_texcoord
    array[i + 4] = rasterizedGlyph.texturePositionClipSpace.x;
    array[i + 5] = rasterizedGlyph.texturePositionClipSpace.y;
    // a_texsize
    array[i + 6] = rasterizedGlyph.sizeClipSpace.x;
    array[i + 7] = rasterizedGlyph.sizeClipSpace.y;
    // a_cellpos only changes on resize
  }

  public updateSelection(model: IRenderModel): void {
    const terminal = this._terminal;

    this._vertices.selectionAttributes = slice(this._vertices.attributes, 0);

    const bg = (this._colors.selectionOpaque.rgba >>> 8) | Attributes.CM_RGB;

    if (model.selection.columnSelectMode) {
      const startCol = model.selection.startCol;
      const width = model.selection.endCol - startCol;
      const height = model.selection.viewportCappedEndRow - model.selection.viewportCappedStartRow + 1;
      for (let y = model.selection.viewportCappedStartRow; y < model.selection.viewportCappedStartRow + height; y++) {
        this._updateSelectionRange(startCol, startCol + width, y, model, bg);
      }
    } else {
      // Draw first row
      const startCol = model.selection.viewportStartRow === model.selection.viewportCappedStartRow ? model.selection.startCol : 0;
      const startRowEndCol = model.selection.viewportCappedStartRow === model.selection.viewportCappedEndRow ? model.selection.endCol : terminal.cols;
      this._updateSelectionRange(startCol, startRowEndCol, model.selection.viewportCappedStartRow, model, bg);

      // Draw middle rows
      const middleRowsCount = Math.max(model.selection.viewportCappedEndRow - model.selection.viewportCappedStartRow - 1, 0);
      for (let y = model.selection.viewportCappedStartRow + 1; y <= model.selection.viewportCappedStartRow + middleRowsCount; y++) {
        this._updateSelectionRange(0, startRowEndCol, y, model, bg);
      }

      // Draw final row
      if (model.selection.viewportCappedStartRow !== model.selection.viewportCappedEndRow) {
        // Only draw viewportEndRow if it's not the same as viewportStartRow
        const endCol = model.selection.viewportEndRow === model.selection.viewportCappedEndRow ? model.selection.endCol : terminal.cols;
        this._updateSelectionRange(0, endCol, model.selection.viewportCappedEndRow, model, bg);
      }
    }
  }

  private _updateSelectionRange(startCol: number, endCol: number, y: number, model: IRenderModel, bg: number): void {
    const terminal = this._terminal;
    const row = y + terminal.buffer.active.viewportY;
    let line: IBufferLine | undefined;
    for (let x = startCol; x < endCol; x++) {
      const offset = (y * this._terminal.cols + x) * RENDER_MODEL_INDICIES_PER_CELL;
      const code = model.cells[offset];
      let fg = model.cells[offset + RENDER_MODEL_FG_OFFSET];
      if (fg & FgFlags.INVERSE) {
        const workCell = new AttributeData();
        workCell.fg = fg;
        workCell.bg = model.cells[offset + RENDER_MODEL_BG_OFFSET];
        // Get attributes from fg (excluding inverse) and resolve inverse by pullibng rgb colors
        // from bg. This is needed since the inverse fg color should be based on the original bg
        // color, not on the selection color
        fg &= ~(Attributes.CM_MASK | Attributes.RGB_MASK | FgFlags.INVERSE);
        switch (workCell.getBgColorMode()) {
          case Attributes.CM_P16:
          case Attributes.CM_P256:
            const c = this._getColorFromAnsiIndex(workCell.getBgColor()).rgba;
            fg |= (c >> 8) & Attributes.RED_MASK | (c >> 8) & Attributes.GREEN_MASK | (c >> 8) & Attributes.BLUE_MASK;
          case Attributes.CM_RGB:
            const arr = AttributeData.toColorRGB(workCell.getBgColor());
            fg |= arr[0] << Attributes.RED_SHIFT | arr[1] << Attributes.GREEN_SHIFT | arr[2] << Attributes.BLUE_SHIFT;
          case Attributes.CM_DEFAULT:
          default:
            const c2 = this._colors.background.rgba;
            fg |= (c2 >> 8) & Attributes.RED_MASK | (c2 >> 8) & Attributes.GREEN_MASK | (c2 >> 8) & Attributes.BLUE_MASK;
        }
        fg |= Attributes.CM_RGB;
      }
      if (code & COMBINED_CHAR_BIT_MASK) {
        if (!line) {
          line = terminal.buffer.active.getLine(row);
        }
        const chars = line!.getCell(x)!.getChars();
        this._updateCell(this._vertices.selectionAttributes, x, y, model.cells[offset], bg, fg, chars);
      } else {
        this._updateCell(this._vertices.selectionAttributes, x, y, model.cells[offset], bg, fg);
      }
    }
  }

  private _getColorFromAnsiIndex(idx: number): IColor {
    if (idx >= this._colors.ansi.length) {
      throw new Error('No color found for idx ' + idx);
    }
    return this._colors.ansi[idx];
  }

  public onResize(): void {
    const terminal = this._terminal;
    const gl = this._gl;

    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    // Update vertices
    const newCount = terminal.cols * terminal.rows * INDICES_PER_CELL;
    if (this._vertices.count !== newCount) {
      this._vertices.count = newCount;
      this._vertices.attributes = new Float32Array(newCount);
      for (let i = 0; i < this._vertices.attributesBuffers.length; i++) {
        this._vertices.attributesBuffers[i] = new Float32Array(newCount);
      }

      let i = 0;
      for (let y = 0; y < terminal.rows; y++) {
        for (let x = 0; x < terminal.cols; x++) {
          this._vertices.attributes[i + 8] = x / terminal.cols;
          this._vertices.attributes[i + 9] = y / terminal.rows;
          i += INDICES_PER_CELL;
        }
      }
    }
  }

  public setColors(): void {
  }

  public render(renderModel: IRenderModel, isSelectionVisible: boolean): void {
    if (!this._atlas) {
      return;
    }

    const gl = this._gl;

    gl.useProgram(this._program);
    gl.bindVertexArray(this._vertexArrayObject);

    // Alternate buffers each frame as the active buffer gets locked while it's in use by the GPU
    this._activeBuffer = (this._activeBuffer + 1) % 2;
    const activeBuffer = this._vertices.attributesBuffers[this._activeBuffer];

    // Copy data for each cell of each line up to its line length (the last non-whitespace cell)
    // from the attributes buffer into activeBuffer, which is the one that gets bound to the GPU.
    // The reasons for this are as follows:
    // - So the active buffer can be alternated so we don't get blocked on rendering finishing
    // - To copy either the normal attributes buffer or the selection attributes buffer when there
    //   is a selection
    // - So we don't send vertices for all the line-ending whitespace to the GPU
    let bufferLength = 0;
    for (let y = 0; y < renderModel.lineLengths.length; y++) {
      const si = y * this._terminal.cols * INDICES_PER_CELL;
      const sub = (isSelectionVisible ? this._vertices.selectionAttributes : this._vertices.attributes).subarray(si, si + renderModel.lineLengths[y] * INDICES_PER_CELL);
      activeBuffer.set(sub, bufferLength);
      bufferLength += sub.length;
    }

    // Bind the attributes buffer
    gl.bindBuffer(gl.ARRAY_BUFFER, this._attributesBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, activeBuffer.subarray(0, bufferLength), gl.STREAM_DRAW);

    // Bind the texture atlas if it's changed
    if (this._atlas.hasCanvasChanged) {
      this._atlas.hasCanvasChanged = false;
      gl.uniform1i(this._textureLocation, 0);
      gl.activeTexture(gl.TEXTURE0 + 0);
      gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this._atlas.cacheCanvas);
    }

    // Set uniforms
    gl.uniformMatrix4fv(this._projectionLocation, false, PROJECTION_MATRIX);
    gl.uniform2f(this._resolutionLocation, gl.canvas.width, gl.canvas.height);

    // Draw the viewport
    gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_BYTE, 0, bufferLength / INDICES_PER_CELL);
  }

  public setAtlas(atlas: WebglCharAtlas): void {
    const gl = this._gl;
    this._atlas = atlas;

    gl.bindTexture(gl.TEXTURE_2D, this._atlasTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas.cacheCanvas);
  }

  public setDimensions(dimensions: IRenderDimensions): void {
    this._dimensions = dimensions;
  }
}
