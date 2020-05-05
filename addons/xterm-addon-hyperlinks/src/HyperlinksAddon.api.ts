/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { assert } from 'chai';
import { openTerminal, getBrowserType } from '../../../out-test/api/TestUtils';
import { Browser, Page } from 'playwright-core';

const APP = 'http://127.0.0.1:3000/test';

let browser: Browser;
let page: Page;
const width = 800;
const height = 600;

describe('HyperlinksAddon', () => {
  before(async function(): Promise<any> {
    const browserType = getBrowserType();
    browser = await browserType.launch({ dumpio: true,
      headless: process.argv.indexOf('--headless') !== -1
    });
    page = await (await browser.newContext()).newPage();
    await page.setViewportSize({ width, height });
  });

  after(async () => {
    await browser.close();
  });

  beforeEach(async function(): Promise<any> {
    await page.goto(APP);
    await openTerminal(page);
  });

  // TODO: write some tests
});
