/**
 * Copyright (c) 2017 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { assert } from 'chai';
import { SelectionService, SelectionMode } from './SelectionService';
import { SelectionModel } from 'browser/selection/SelectionModel';
import { IBufferLine } from 'common/Types';
import { MockBufferService, MockOptionsService, MockCoreService } from 'common/TestUtils.test';
import { BufferLine } from 'common/buffer/BufferLine';
import { IBufferService, IOptionsService } from 'common/services/Services';
import { MockMouseService, MockRenderService } from 'browser/TestUtils.test';
import { CellData } from 'common/buffer/CellData';
import { IBuffer } from 'common/buffer/Types';
import { IRenderService } from 'browser/services/Services';

class TestSelectionService extends SelectionService {
  constructor(
    bufferService: IBufferService,
    optionsService: IOptionsService,
    renderService: IRenderService
  ) {
    super(null!, null!, null!, bufferService, new MockCoreService(), new MockMouseService(), optionsService, renderService);
  }

  public get model(): SelectionModel { return this._model; }

  public set selectionMode(mode: SelectionMode) { this._activeSelectionMode = mode; }

  public selectLineAt(line: number): void { this._selectLineAt(line); }
  public selectWordAt(coords: [number, number]): void { this._selectWordAt(coords, true); }
  public areCoordsInSelection(coords: [number, number], start: [number, number], end: [number, number]): boolean { return this._areCoordsInSelection(coords, start, end); }

  // Disable DOM interaction
  public enable(): void {}
  public disable(): void {}
  public refresh(): void {}
}

describe('SelectionService', () => {
  let buffer: IBuffer;
  let bufferService: IBufferService;
  let optionsService: IOptionsService;
  let selectionService: TestSelectionService;

  beforeEach(() => {
    optionsService = new MockOptionsService();
    bufferService = new MockBufferService(20, 20, optionsService);
    buffer = bufferService.buffer;
    const renderService = new MockRenderService();
    renderService.dimensions.canvasHeight = 10 * 20;
    renderService.dimensions.canvasWidth = 10 * 20;
    selectionService = new TestSelectionService(bufferService, optionsService, renderService);
  });

  function stringToRow(text: string): IBufferLine {
    const result = new BufferLine(text.length);
    for (let i = 0; i < text.length; i++) {
      result.setCell(i, CellData.fromCharData([0, text.charAt(i), 1, text.charCodeAt(i)]));
    }
    return result;
  }

  function stringArrayToRow(chars: string[]): IBufferLine {
    const line = new BufferLine(chars.length);
    chars.map((c, idx) => line.setCell(idx, CellData.fromCharData([0, c, 1, c.charCodeAt(0)])));
    return line;
  }

  describe('_selectWordAt', () => {
    it('should expand selection for normal width chars', () => {
      buffer.lines.set(0, stringToRow('foo bar'));
      selectionService.selectWordAt([0, 0]);
      assert.equal(selectionService.selectionText, 'foo');
      selectionService.selectWordAt([1, 0]);
      assert.equal(selectionService.selectionText, 'foo');
      selectionService.selectWordAt([2, 0]);
      assert.equal(selectionService.selectionText, 'foo');
      selectionService.selectWordAt([3, 0]);
      assert.equal(selectionService.selectionText, ' ');
      selectionService.selectWordAt([4, 0]);
      assert.equal(selectionService.selectionText, 'bar');
      selectionService.selectWordAt([5, 0]);
      assert.equal(selectionService.selectionText, 'bar');
      selectionService.selectWordAt([6, 0]);
      assert.equal(selectionService.selectionText, 'bar');
    });
    it('should expand selection for whitespace', () => {
      buffer.lines.set(0, stringToRow('a   b'));
      selectionService.selectWordAt([0, 0]);
      assert.equal(selectionService.selectionText, 'a');
      selectionService.selectWordAt([1, 0]);
      assert.equal(selectionService.selectionText, '   ');
      selectionService.selectWordAt([2, 0]);
      assert.equal(selectionService.selectionText, '   ');
      selectionService.selectWordAt([3, 0]);
      assert.equal(selectionService.selectionText, '   ');
      selectionService.selectWordAt([4, 0]);
      assert.equal(selectionService.selectionText, 'b');
    });
    it('should expand selection for wide characters', () => {
      // Wide characters use a special format
      const data: [number, string, number, number][] = [
        [0, '中', 2, '中'.charCodeAt(0)],
        [0, '', 0, 0],
        [0, '文', 2, '文'.charCodeAt(0)],
        [0, '', 0, 0],
        [0, ' ', 1, ' '.charCodeAt(0)],
        [0, 'a', 1, 'a'.charCodeAt(0)],
        [0, '中', 2, '中'.charCodeAt(0)],
        [0, '', 0, 0],
        [0, '文', 2, '文'.charCodeAt(0)],
        [0, '', 0, ''.charCodeAt(0)],
        [0, 'b', 1, 'b'.charCodeAt(0)],
        [0, ' ', 1, ' '.charCodeAt(0)],
        [0, 'f', 1, 'f'.charCodeAt(0)],
        [0, 'o', 1, 'o'.charCodeAt(0)],
        [0, 'o', 1, 'o'.charCodeAt(0)]
      ];
      const line = new BufferLine(data.length);
      for (let i = 0; i < data.length; ++i) line.setCell(i, CellData.fromCharData(data[i]));
      buffer.lines.set(0, line);
      // Ensure wide characters take up 2 columns
      selectionService.selectWordAt([0, 0]);
      assert.equal(selectionService.selectionText, '中文');
      selectionService.selectWordAt([1, 0]);
      assert.equal(selectionService.selectionText, '中文');
      selectionService.selectWordAt([2, 0]);
      assert.equal(selectionService.selectionText, '中文');
      selectionService.selectWordAt([3, 0]);
      assert.equal(selectionService.selectionText, '中文');
      selectionService.selectWordAt([4, 0]);
      assert.equal(selectionService.selectionText, ' ');
      // Ensure wide characters work when wrapped in normal width characters
      selectionService.selectWordAt([5, 0]);
      assert.equal(selectionService.selectionText, 'a中文b');
      selectionService.selectWordAt([6, 0]);
      assert.equal(selectionService.selectionText, 'a中文b');
      selectionService.selectWordAt([7, 0]);
      assert.equal(selectionService.selectionText, 'a中文b');
      selectionService.selectWordAt([8, 0]);
      assert.equal(selectionService.selectionText, 'a中文b');
      selectionService.selectWordAt([9, 0]);
      assert.equal(selectionService.selectionText, 'a中文b');
      selectionService.selectWordAt([10, 0]);
      assert.equal(selectionService.selectionText, 'a中文b');
      selectionService.selectWordAt([11, 0]);
      assert.equal(selectionService.selectionText, ' ');
      // Ensure normal width characters work fine in a line containing wide characters
      selectionService.selectWordAt([12, 0]);
      assert.equal(selectionService.selectionText, 'foo');
      selectionService.selectWordAt([13, 0]);
      assert.equal(selectionService.selectionText, 'foo');
      selectionService.selectWordAt([14, 0]);
      assert.equal(selectionService.selectionText, 'foo');
    });
    it('should select up to non-path characters that are commonly adjacent to paths', () => {
      buffer.lines.set(0, stringToRow('(cd)[ef]{gh}\'ij"'));
      selectionService.selectWordAt([0, 0]);
      assert.equal(selectionService.selectionText, '(cd');
      selectionService.selectWordAt([1, 0]);
      assert.equal(selectionService.selectionText, 'cd');
      selectionService.selectWordAt([2, 0]);
      assert.equal(selectionService.selectionText, 'cd');
      selectionService.selectWordAt([3, 0]);
      assert.equal(selectionService.selectionText, 'cd)');
      selectionService.selectWordAt([4, 0]);
      assert.equal(selectionService.selectionText, '[ef');
      selectionService.selectWordAt([5, 0]);
      assert.equal(selectionService.selectionText, 'ef');
      selectionService.selectWordAt([6, 0]);
      assert.equal(selectionService.selectionText, 'ef');
      selectionService.selectWordAt([7, 0]);
      assert.equal(selectionService.selectionText, 'ef]');
      selectionService.selectWordAt([8, 0]);
      assert.equal(selectionService.selectionText, '{gh');
      selectionService.selectWordAt([9, 0]);
      assert.equal(selectionService.selectionText, 'gh');
      selectionService.selectWordAt([10, 0]);
      assert.equal(selectionService.selectionText, 'gh');
      selectionService.selectWordAt([11, 0]);
      assert.equal(selectionService.selectionText, 'gh}');
      selectionService.selectWordAt([12, 0]);
      assert.equal(selectionService.selectionText, '\'ij');
      selectionService.selectWordAt([13, 0]);
      assert.equal(selectionService.selectionText, 'ij');
      selectionService.selectWordAt([14, 0]);
      assert.equal(selectionService.selectionText, 'ij');
      selectionService.selectWordAt([15, 0]);
      assert.equal(selectionService.selectionText, 'ij"');
    });
    it('should expand upwards or downards for wrapped lines', () => {
      buffer.lines.set(0, stringToRow('                 foo'));
      buffer.lines.set(1, stringToRow('bar                 '));
      buffer.lines.get(1)!.isWrapped = true;
      selectionService.selectWordAt([1, 1]);
      assert.equal(selectionService.selectionText, 'foobar');
      selectionService.model.clearSelection();
      selectionService.selectWordAt([18, 0]);
      assert.equal(selectionService.selectionText, 'foobar');
    });
    it('should expand both upwards and downwards for word wrapped over many lines', () => {
      const expectedText = 'fooaaaaaaaaaaaaaaaaaaaabbbbbbbbbbbbbbbbbbbbccccccccccccccccccccbar';
      buffer.lines.set(0, stringToRow('                 foo'));
      buffer.lines.set(1, stringToRow('aaaaaaaaaaaaaaaaaaaa'));
      buffer.lines.set(2, stringToRow('bbbbbbbbbbbbbbbbbbbb'));
      buffer.lines.set(3, stringToRow('cccccccccccccccccccc'));
      buffer.lines.set(4, stringToRow('bar                 '));
      buffer.lines.get(1)!.isWrapped = true;
      buffer.lines.get(2)!.isWrapped = true;
      buffer.lines.get(3)!.isWrapped = true;
      buffer.lines.get(4)!.isWrapped = true;
      selectionService.selectWordAt([18, 0]);
      assert.equal(selectionService.selectionText, expectedText);
      selectionService.model.clearSelection();
      selectionService.selectWordAt([10, 1]);
      assert.equal(selectionService.selectionText, expectedText);
      selectionService.model.clearSelection();
      selectionService.selectWordAt([10, 2]);
      assert.equal(selectionService.selectionText, expectedText);
      selectionService.model.clearSelection();
      selectionService.selectWordAt([10, 3]);
      assert.equal(selectionService.selectionText, expectedText);
      selectionService.model.clearSelection();
      selectionService.selectWordAt([1, 4]);
      assert.equal(selectionService.selectionText, expectedText);
    });
    describe('emoji', () => {
      it('should treat a single emoji as a word when wrapped in spaces', () => {
        buffer.lines.set(0, stringToRow(' ⚽ a')); // The a is here to prevent the space being trimmed in selectionText
        selectionService.selectWordAt([0, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([1, 0]);
        assert.equal(selectionService.selectionText, '⚽');
        selectionService.selectWordAt([2, 0]);
        assert.equal(selectionService.selectionText, ' ');
      });
      it('should treat multiple emojis as a word when wrapped in spaces', () => {
        buffer.lines.set(0, stringToRow(' ⚽⚽ a')); // The a is here to prevent the space being trimmed in selectionText
        selectionService.selectWordAt([0, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([1, 0]);
        assert.equal(selectionService.selectionText, '⚽⚽');
        selectionService.selectWordAt([2, 0]);
        assert.equal(selectionService.selectionText, '⚽⚽');
        selectionService.selectWordAt([3, 0]);
        assert.equal(selectionService.selectionText, ' ');
      });
      it('should treat emojis using the zero-width-joiner as a single word', () => {
        // Note that the first 3 emojis include the invisible ZWJ char
        buffer.lines.set(0, stringArrayToRow([
          ' ', '👨‍', '👩‍', '👧‍', '👦', ' ', 'a'
        ])); // The a is here to prevent the space being trimmed in selectionText
        selectionService.selectWordAt([0, 0]);
        assert.equal(selectionService.selectionText, ' ');
        // ZWJ emojis do not combine in the terminal so the family emoji used here consumed 4 cells
        // The selection text should retain ZWJ chars despite not combining on the terminal
        selectionService.selectWordAt([1, 0]);
        assert.equal(selectionService.selectionText, '👨‍👩‍👧‍👦');
        selectionService.selectWordAt([2, 0]);
        assert.equal(selectionService.selectionText, '👨‍👩‍👧‍👦');
        selectionService.selectWordAt([3, 0]);
        assert.equal(selectionService.selectionText, '👨‍👩‍👧‍👦');
        selectionService.selectWordAt([4, 0]);
        assert.equal(selectionService.selectionText, '👨‍👩‍👧‍👦');
        selectionService.selectWordAt([5, 0]);
        assert.equal(selectionService.selectionText, ' ');
      });
      it('should treat emojis and characters joined together as a word', () => {
        buffer.lines.set(0, stringToRow(' ⚽ab cd⚽ ef⚽gh')); // The a is here to prevent the space being trimmed in selectionText
        selectionService.selectWordAt([0, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([1, 0]);
        assert.equal(selectionService.selectionText, '⚽ab');
        selectionService.selectWordAt([2, 0]);
        assert.equal(selectionService.selectionText, '⚽ab');
        selectionService.selectWordAt([3, 0]);
        assert.equal(selectionService.selectionText, '⚽ab');
        selectionService.selectWordAt([4, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([5, 0]);
        assert.equal(selectionService.selectionText, 'cd⚽');
        selectionService.selectWordAt([6, 0]);
        assert.equal(selectionService.selectionText, 'cd⚽');
        selectionService.selectWordAt([7, 0]);
        assert.equal(selectionService.selectionText, 'cd⚽');
        selectionService.selectWordAt([8, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([9, 0]);
        assert.equal(selectionService.selectionText, 'ef⚽gh');
        selectionService.selectWordAt([10, 0]);
        assert.equal(selectionService.selectionText, 'ef⚽gh');
        selectionService.selectWordAt([11, 0]);
        assert.equal(selectionService.selectionText, 'ef⚽gh');
        selectionService.selectWordAt([12, 0]);
        assert.equal(selectionService.selectionText, 'ef⚽gh');
        selectionService.selectWordAt([13, 0]);
        assert.equal(selectionService.selectionText, 'ef⚽gh');
      });
      it('should treat complex emojis and characters joined together as a word', () => {
        // This emoji is the flag for England and is made up of: 1F3F4 E0067 E0062 E0065 E006E E0067 E007F
        buffer.lines.set(0, stringArrayToRow([
          ' ', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'a', 'b', ' ', 'c', 'd', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', ' ', 'e', 'f', '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'g', 'h', ' ', 'a'
        ])); // The a is here to prevent the space being trimmed in selectionText
        selectionService.selectWordAt([0, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([1, 0]);
        assert.equal(selectionService.selectionText, '🏴󠁧󠁢󠁥󠁮󠁧󠁿ab');
        selectionService.selectWordAt([2, 0]);
        assert.equal(selectionService.selectionText, '🏴󠁧󠁢󠁥󠁮󠁧󠁿ab');
        selectionService.selectWordAt([3, 0]);
        assert.equal(selectionService.selectionText, '🏴󠁧󠁢󠁥󠁮󠁧󠁿ab');
        selectionService.selectWordAt([4, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([5, 0]);
        assert.equal(selectionService.selectionText, 'cd🏴󠁧󠁢󠁥󠁮󠁧󠁿');
        selectionService.selectWordAt([6, 0]);
        assert.equal(selectionService.selectionText, 'cd🏴󠁧󠁢󠁥󠁮󠁧󠁿');
        selectionService.selectWordAt([7, 0]);
        assert.equal(selectionService.selectionText, 'cd🏴󠁧󠁢󠁥󠁮󠁧󠁿');
        selectionService.selectWordAt([8, 0]);
        assert.equal(selectionService.selectionText, ' ');
        selectionService.selectWordAt([9, 0]);
        assert.equal(selectionService.selectionText, 'ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
        selectionService.selectWordAt([10, 0]);
        assert.equal(selectionService.selectionText, 'ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
        selectionService.selectWordAt([11, 0]);
        assert.equal(selectionService.selectionText, 'ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
        selectionService.selectWordAt([12, 0]);
        assert.equal(selectionService.selectionText, 'ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
        selectionService.selectWordAt([13, 0]);
        assert.equal(selectionService.selectionText, 'ef🏴󠁧󠁢󠁥󠁮󠁧󠁿gh');
      });
    });
  });

  describe('_selectLineAt', () => {
    it('should select the entire line', () => {
      buffer.lines.set(0, stringToRow('foo bar'));
      selectionService.selectLineAt(0);
      assert.equal(selectionService.selectionText, 'foo bar', 'The selected text is correct');
      assert.deepEqual(selectionService.model.finalSelectionStart, [0, 0]);
      assert.deepEqual(selectionService.model.finalSelectionEnd, [bufferService.cols, 0], 'The actual selection spans the entire column');
    });
    it('should select the entire wrapped line', () => {
      buffer.lines.set(0, stringToRow('foo'));
      const line2 = stringToRow('bar');
      line2.isWrapped = true;
      buffer.lines.set(1, line2);
      selectionService.selectLineAt(0);
      assert.equal(selectionService.selectionText, 'foobar', 'The selected text is correct');
      assert.deepEqual(selectionService.model.finalSelectionStart, [0, 0]);
      assert.deepEqual(selectionService.model.finalSelectionEnd, [bufferService.cols, 1], 'The actual selection spans the entire column');
    });
  });

  describe('selectAll', () => {
    it('should select the entire buffer, beyond the viewport', () => {
      bufferService.resize(20, 5);
      buffer.lines.set(0, stringToRow('1'));
      buffer.lines.set(1, stringToRow('2'));
      buffer.lines.set(2, stringToRow('3'));
      buffer.lines.set(3, stringToRow('4'));
      buffer.lines.set(4, stringToRow('5'));
      selectionService.selectAll();
      assert.equal(selectionService.selectionText, '1\n2\n3\n4\n5');
    });
  });

  describe('selectLines', () => {
    it('should select a single line', () => {
      buffer.lines.length = 3;
      buffer.lines.set(0, stringToRow('1'));
      buffer.lines.set(1, stringToRow('2'));
      buffer.lines.set(2, stringToRow('3'));
      selectionService.selectLines(1, 1);
      assert.deepEqual(selectionService.model.finalSelectionStart, [0, 1]);
      assert.deepEqual(selectionService.model.finalSelectionEnd, [bufferService.cols, 1]);
    });
    it('should select multiple lines', () => {
      buffer.lines.length = 5;
      buffer.lines.set(0, stringToRow('1'));
      buffer.lines.set(1, stringToRow('2'));
      buffer.lines.set(2, stringToRow('3'));
      buffer.lines.set(3, stringToRow('4'));
      buffer.lines.set(4, stringToRow('5'));
      selectionService.selectLines(1, 3);
      assert.deepEqual(selectionService.model.finalSelectionStart, [0, 1]);
      assert.deepEqual(selectionService.model.finalSelectionEnd, [bufferService.cols, 3]);
    });
    it('should select the to the start when requesting a negative row', () => {
      buffer.lines.length = 2;
      buffer.lines.set(0, stringToRow('1'));
      buffer.lines.set(1, stringToRow('2'));
      selectionService.selectLines(-1, 0);
      assert.deepEqual(selectionService.model.finalSelectionStart, [0, 0]);
      assert.deepEqual(selectionService.model.finalSelectionEnd, [bufferService.cols, 0]);
    });
    it('should select the to the end when requesting beyond the final row', () => {
      buffer.lines.length = 2;
      buffer.lines.set(0, stringToRow('1'));
      buffer.lines.set(1, stringToRow('2'));
      selectionService.selectLines(1, 2);
      assert.deepEqual(selectionService.model.finalSelectionStart, [0, 1]);
      assert.deepEqual(selectionService.model.finalSelectionEnd, [bufferService.cols, 1]);
    });
  });

  describe('hasSelection', () => {
    it('should return whether there is a selection', () => {
      selectionService.model.selectionStart = [0, 0];
      selectionService.model.selectionStartLength = 0;
      assert.equal(selectionService.hasSelection, false);
      selectionService.model.selectionEnd = [0, 0];
      assert.equal(selectionService.hasSelection, false);
      selectionService.model.selectionEnd = [1, 0];
      assert.equal(selectionService.hasSelection, true);
      selectionService.model.selectionEnd = [0, 1];
      assert.equal(selectionService.hasSelection, true);
      selectionService.model.selectionEnd = [1, 1];
      assert.equal(selectionService.hasSelection, true);
    });
  });

  describe('column selection', () => {
    it('should select a column of text', () => {
      buffer.lines.length = 3;
      buffer.lines.set(0, stringToRow('abcdefghij'));
      buffer.lines.set(1, stringToRow('klmnopqrst'));
      buffer.lines.set(2, stringToRow('uvwxyz'));

      selectionService.selectionMode = SelectionMode.COLUMN;
      selectionService.model.selectionStart = [2, 0];
      selectionService.model.selectionEnd = [4, 2];

      assert.equal(selectionService.selectionText, 'cd\nmn\nwx');
    });

    it('should select a column of text without chopping up double width characters', () => {
      buffer.lines.length = 3;
      buffer.lines.set(0, stringToRow('a'));
      buffer.lines.set(1, stringToRow('語'));
      buffer.lines.set(2, stringToRow('b'));

      selectionService.selectionMode = SelectionMode.COLUMN;
      selectionService.model.selectionStart = [0, 0];
      selectionService.model.selectionEnd = [1, 2];

      assert.equal(selectionService.selectionText, 'a\n語\nb');
    });

    it('should select a column of text with single character emojis', () => {
      buffer.lines.length = 3;
      buffer.lines.set(0, stringToRow('a'));
      buffer.lines.set(1, stringToRow('☃'));
      buffer.lines.set(2, stringToRow('c'));

      selectionService.selectionMode = SelectionMode.COLUMN;
      selectionService.model.selectionStart = [0, 0];
      selectionService.model.selectionEnd = [1, 2];

      assert.equal(selectionService.selectionText, 'a\n☃\nc');
    });

    it('should select a column of text with double character emojis', () => {
      // TODO the case this is testing works for me in the demo webapp,
      // but doing it programmatically fails.
      buffer.lines.length = 3;
      buffer.lines.set(0, stringToRow('a '));
      buffer.lines.set(1, stringArrayToRow(['😁', ' ']));
      buffer.lines.set(2, stringToRow('c '));

      selectionService.selectionMode = SelectionMode.COLUMN;
      selectionService.model.selectionStart = [0, 0];
      selectionService.model.selectionEnd = [1, 2];

      assert.equal(selectionService.selectionText, 'a\n😁\nc');
    });
  });

  describe('_areCoordsInSelection', () => {
    it('should return whether coords are in the selection', () => {
      assert.isFalse(selectionService.areCoordsInSelection([0, 0], [2, 0], [2, 1]));
      assert.isFalse(selectionService.areCoordsInSelection([1, 0], [2, 0], [2, 1]));
      assert.isTrue(selectionService.areCoordsInSelection([2, 0], [2, 0], [2, 1]));
      assert.isTrue(selectionService.areCoordsInSelection([10, 0], [2, 0], [2, 1]));
      assert.isTrue(selectionService.areCoordsInSelection([0, 1], [2, 0], [2, 1]));
      assert.isTrue(selectionService.areCoordsInSelection([1, 1], [2, 0], [2, 1]));
      assert.isFalse(selectionService.areCoordsInSelection([2, 1], [2, 0], [2, 1]));
    });
  });

  describe('resize', () => {
    it('should not change selection', () => {
      buffer.lines.set(0, stringToRow('a   b'));
      selectionService.selectWordAt([4, 0]);
      selectionService.resize(50, 50);
      assert.deepEqual(selectionService.model.selectionStart, [4, 0]);
      assert.deepEqual(selectionService.model.selectionEnd, [5, 0]);
    });

    it('should change selection', () => {
      buffer.lines.set(0, stringToRow('a   b'));
      selectionService.selectWordAt([4, 0]);
      selectionService.resize(2, 2);
      assert.deepEqual(selectionService.model.selectionStart, [0, 2]);
      assert.deepEqual(selectionService.model.selectionEnd, [1, 2]);
    });

    it('wrapped line', () => {
      buffer.lines.set(0, stringToRow('abcdefghij'));
      selectionService.selectWordAt([4, 0]);
      selectionService.resize(2, 2);
      assert.deepEqual(selectionService.model.selectionStart, [0, 0]);
      assert.deepEqual(selectionService.model.selectionEnd, [0, 5]);
    });

    it('unwrapped line', () => {
      buffer.lines.set(0, stringToRow('abcdefghij'));
      buffer.lines.set(1, stringToRow('klmnopqrst'));
      selectionService.model.selectionStart = [0, 0];
      selectionService.model.selectionEnd = [10, 1];
      selectionService.resize(2, 2);
      assert.deepEqual(selectionService.model.selectionStart, [0, 0]);
      assert.deepEqual(selectionService.model.selectionEnd, [0, 6]);
    });

    it('should select multiple lines', () => {
      buffer.lines.length = 5;
      buffer.lines.set(0, stringToRow('1'));
      buffer.lines.set(1, stringToRow('2'));
      buffer.lines.set(2, stringToRow('3'));
      buffer.lines.set(3, stringToRow('4'));
      buffer.lines.set(4, stringToRow('5'));
      selectionService.selectLines(1, 3);
      selectionService.resize(50, 50);
      assert.deepEqual(selectionService.model.selectionStart, [0, 1]);
      assert.deepEqual(selectionService.model.selectionEnd, [bufferService.cols, 3]);
    });
  });
});

