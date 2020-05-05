/**
 * Copyright (c) 2020 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { assert } from 'chai';
import { IBufferService } from 'common/services/Services';
import { Linkifier2 } from 'browser/Linkifier2';
import { MockBufferService } from 'common/TestUtils.test';
import { ILink } from 'browser/Types';

class TestLinkifier2 extends Linkifier2 {
  protected _currentLinkState = {
    decorations: {
      underline: true,
      pointerCursor: true
    },
    isHovered: true
  };

  constructor(bufferService: IBufferService) {
    super(bufferService);
  }

  public linkHover(element: HTMLElement, link: ILink, event: MouseEvent): void {
    this._linkHover(element, link, event);
  }

  public linkLeave(element: HTMLElement, link: ILink, event: MouseEvent): void {
    this._linkLeave(element, link, event);
  }
}

describe('Linkifier2', () => {
  let bufferService: IBufferService;
  let linkifier: TestLinkifier2;

  beforeEach(() => {
    bufferService = new MockBufferService(100, 10);
    linkifier = new TestLinkifier2(bufferService);
  });

  const link: ILink = {
    text: 'foo',
    ranges: [{
      start: {
        x: 5,
        y: 1
      },
      end: {
        x: 7,
        y: 1
      }
    }],
    activate: () => { }
  };

  it('onShowLinkUnderline event range is correct', done => {
    linkifier.onShowLinkUnderline(e => {
      assert.equal(link.ranges[0].start.x - 1, e.x1);
      assert.equal(link.ranges[0].start.y - 1, e.y1);
      assert.equal(link.ranges[0].end.x, e.x2);
      assert.equal(link.ranges[0].end.y - 1, e.y2);

      done();
    });

    linkifier.linkHover({ classList: { add: () => { } } } as any, link, {} as any);
  });

  it('onHideLinkUnderline event range is correct', done => {
    linkifier.onHideLinkUnderline(e => {
      assert.equal(link.ranges[0].start.x - 1, e.x1);
      assert.equal(link.ranges[0].start.y - 1, e.y1);
      assert.equal(link.ranges[0].end.x, e.x2);
      assert.equal(link.ranges[0].end.y - 1, e.y2);

      done();
    });

    linkifier.linkLeave({ classList: { add: () => { } } } as any, link, {} as any);
  });

});
