/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { assert } from 'chai';
import { readFile } from 'fs';
import { resolve } from 'path';
import { openTerminal, writeSync, getBrowserType } from '../../../out-test/api/TestUtils';
import { Browser, Page } from 'playwright';

const APP = 'http://127.0.0.1:3001/test';

let browser: Browser;
let page: Page;
const width = 800;
const height = 600;

describe('Search Tests', function(): void {
  before(async function(): Promise<any> {
    const browserType = getBrowserType();
    browser = await browserType.launch({
      headless: process.argv.includes('--headless')
    });
    page = await (await browser.newContext()).newPage();
    await page.setViewportSize({ width, height });
    await page.goto(APP);
    await openTerminal(page);
    await page.evaluate(`window.search = new SearchAddon();`);
    await page.evaluate(`window.term.loadAddon(window.search);`);
  });

  after(() => {
    browser.close();
  });

  beforeEach(async () => {
    await page.evaluate(`window.term.reset()`);
  });

  it('Simple Search', async () => {
    await writeSync(page, 'dafhdjfldshafhldsahfkjhldhjkftestlhfdsakjfhdjhlfdsjkafhjdlk');
    assert.deepEqual(await page.evaluate(`window.search.findNext('test')`), true);
    assert.deepEqual(await page.evaluate(`window.term.getSelection()`), 'test');
  });

  it('Scrolling Search', async () => {
    let dataString = '';
    for (let i = 0; i < 100; i++) {
      if (i === 52) {
        dataString += '$^1_3{}test$#';
      }
      dataString += makeData(50);
    }
    await writeSync(page, dataString);
    assert.deepEqual(await page.evaluate(`window.search.findNext('$^1_3{}test$#')`), true);
    assert.deepEqual(await page.evaluate(`window.term.getSelection()`), '$^1_3{}test$#');
  });
  it('Incremental Find Previous', async () => {
    await page.evaluate(`window.term.writeln('package.jsonc\\n')`);
    await writeSync(page, 'package.json pack package.lock');
    await page.evaluate(`window.search.findPrevious('pack', {incremental: true})`);
    let line: string = await page.evaluate(`window.term.buffer.active.getLine(window.term.getSelectionPosition().startRow).translateToString()`);
    let selectionPosition: { startColumn: number, startRow: number, endColumn: number, endRow: number } = await page.evaluate(`window.term.getSelectionPosition()`);
    // We look further ahead in the line to ensure that pack was selected from package.lock
    assert.deepEqual(line.substring(selectionPosition.startColumn, selectionPosition.endColumn + 8), 'package.lock');
    await page.evaluate(`window.search.findPrevious('package.j', {incremental: true})`);
    selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
    assert.deepEqual(line.substring(selectionPosition.startColumn, selectionPosition.endColumn + 3), 'package.json');
    await page.evaluate(`window.search.findPrevious('package.jsonc', {incremental: true})`);
    // We have to reevaluate line because it should have switched starting rows at this point
    line = await page.evaluate(`window.term.buffer.active.getLine(window.term.getSelectionPosition().startRow).translateToString()`);
    selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
    assert.deepEqual(line.substring(selectionPosition.startColumn, selectionPosition.endColumn), 'package.jsonc');
  });
  it('Incremental Find Next', async () => {
    await page.evaluate(`window.term.writeln('package.lock pack package.json package.ups\\n')`);
    await writeSync(page, 'package.jsonc');
    await page.evaluate(`window.search.findNext('pack', {incremental: true})`);
    let line: string = await page.evaluate(`window.term.buffer.active.getLine(window.term.getSelectionPosition().startRow).translateToString()`);
    let selectionPosition: { startColumn: number, startRow: number, endColumn: number, endRow: number } = await page.evaluate(`window.term.getSelectionPosition()`);
    // We look further ahead in the line to ensure that pack was selected from package.lock
    assert.deepEqual(line.substring(selectionPosition.startColumn, selectionPosition.endColumn + 8), 'package.lock');
    await page.evaluate(`window.search.findNext('package.j', {incremental: true})`);
    selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
    assert.deepEqual(line.substring(selectionPosition.startColumn, selectionPosition.endColumn + 3), 'package.json');
    await page.evaluate(`window.search.findNext('package.jsonc', {incremental: true})`);
    // We have to reevaluate line because it should have switched starting rows at this point
    line = await page.evaluate(`window.term.buffer.active.getLine(window.term.getSelectionPosition().startRow).translateToString()`);
    selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
    assert.deepEqual(line.substring(selectionPosition.startColumn, selectionPosition.endColumn), 'package.jsonc');
  });
  it('Simple Regex', async () => {
    await writeSync(page, 'abc123defABCD');
    await page.evaluate(`window.search.findNext('[a-z]+', {regex: true})`);
    assert.deepEqual(await page.evaluate(`window.term.getSelection()`), 'abc');
    await page.evaluate(`window.search.findNext('[A-Z]+', {regex: true, caseSensitive: true})`);
    assert.deepEqual(await page.evaluate(`window.term.getSelection()`), 'ABCD');
  });

  it('Search for single result twice should not unselect it', async () => {
    await writeSync(page, 'abc def');
    assert.deepEqual(await page.evaluate(`window.search.findNext('abc')`), true);
    assert.deepEqual(await page.evaluate(`window.term.getSelection()`), 'abc');
    assert.deepEqual(await page.evaluate(`window.search.findNext('abc')`), true);
    assert.deepEqual(await page.evaluate(`window.term.getSelection()`), 'abc');
  });

  describe('Regression tests', () => {
    describe('#2444 wrapped line content not being found', () => {
      let fixture: string;
      before(async () => {
        const rawFixture = await new Promise<Buffer>(r => readFile(resolve(__dirname, '../fixtures/issue-2444'), (err, data) => r(data)));
        if (process.platform === 'win32') {
          fixture = rawFixture.toString()
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
        } else {
          fixture = rawFixture.toString()
            .replace(/\n/g, '\\n\\r');
        }
        fixture = fixture
          .replace(/'/g, '\\\'');
      });
      it('should find all occurrences using findNext', async () => {
        await writeSync(page, fixture);
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        let selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 53, endColumn: 30, endRow: 53 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 76, endColumn: 30, endRow: 76 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 96, endColumn: 30, endRow: 96 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 1, startRow: 114, endColumn: 7, endRow: 114 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 115, endColumn: 17, endRow: 115 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 1, startRow: 126, endColumn: 7, endRow: 126 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 127, endColumn: 17, endRow: 127 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 1, startRow: 135, endColumn: 7, endRow: 135 });
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 136, endColumn: 17, endRow: 136 });
        // Wrap around to first result
        assert.deepEqual(await page.evaluate(`window.search.findNext('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 53, endColumn: 30, endRow: 53 });
      });
      it('should find all occurrences using findPrevious', async () => {
        await writeSync(page, fixture);
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        let selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 136, endColumn: 17, endRow: 136 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 1, startRow: 135, endColumn: 7, endRow: 135 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 127, endColumn: 17, endRow: 127 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 1, startRow: 126, endColumn: 7, endRow: 126 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 115, endColumn: 17, endRow: 115 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 1, startRow: 114, endColumn: 7, endRow: 114 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 96, endColumn: 30, endRow: 96 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 76, endColumn: 30, endRow: 76 });
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 24, startRow: 53, endColumn: 30, endRow: 53 });
        // Wrap around to first result
        assert.deepEqual(await page.evaluate(`window.search.findPrevious('opencv')`), true);
        selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: 11, startRow: 136, endColumn: 17, endRow: 136 });
      });
    });
  });
  describe('#3262 cached data breaking on trim', () => {
    it('should give correct results when a buffer trim occurs', async () => {
      let fixture: string;
      const rawFixture = await new Promise<Buffer>(r => readFile(resolve(__dirname, '../fixtures/issue-3262'), (err, data) => r(data)));
      if (process.platform === 'win32') {
        fixture = rawFixture.toString()
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r');
      } else {
        fixture = rawFixture.toString()
          .replace(/\n/g, '\\n\\r');
      }
      fixture = fixture
        .replace(/'/g, '\\\'');

      await page.evaluate(`window.term.setOption('scrollback', 1)`);
      await page.evaluate(`window.term.resize(80, 20)`);
      await writeSync(page, fixture);
      for (let y = 0; y < 20; y++) {
        assert.deepEqual(await page.evaluate(`window.search.findNext('test')`), true);
        const selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: y * 2, startRow: y, endColumn: y * 2 + 4, endRow: y });
      }
      // Write the fixture again, triggering several trim events
      await writeSync(page, '\\r' + fixture);
      for (let y = 0; y < 20; y++) {
        assert.deepEqual(await page.evaluate(`window.search.findNext('test')`), true);
        const selectionPosition = await page.evaluate(`window.term.getSelectionPosition()`);
        assert.deepEqual(selectionPosition, { startColumn: y * 2, startRow: y, endColumn: y * 2 + 4, endRow: y });
      }
    });
  });
});

function makeData(length: number): string {
  let result = '';
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}
