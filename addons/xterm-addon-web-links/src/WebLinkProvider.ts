/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

import { ILinkProvider, IBufferCellPosition, ILink, Terminal } from 'xterm';

export class WebLinkProvider implements ILinkProvider {

  constructor(
    private readonly _terminal: Terminal,
    private readonly _regex: RegExp,
    private readonly _handler: (event: MouseEvent, uri: string) => void
  ) {

  }

  public provideLink(position: IBufferCellPosition, callback: (link: ILink | undefined) => void): void {
    callback(LinkComputer.computeLink(position, this._regex, this._terminal, this._handler));
  }
}

export class LinkComputer {
  public static computeLink(position: IBufferCellPosition, regex: RegExp, terminal: Terminal, handler: (event: MouseEvent, uri: string) => void): ILink | undefined {
    const rex = new RegExp(regex.source, (regex.flags || '') + 'g');

    const [line, startLineIndex] = LinkComputer._translateBufferLineToStringWithWrap(position.y - 1, false, terminal);

    let match;
    let stringIndex = -1;

    while ((match = rex.exec(line)) !== null) {
      const text = match[1];
      if (!text) {
        // something matched but does not comply with the given matchIndex
        // since this is most likely a bug the regex itself we simply do nothing here
        console.log('match found without corresponding matchIndex');
        break;
      }

      // Get index, match.index is for the outer match which includes negated chars
      // therefore we cannot use match.index directly, instead we search the position
      // of the match group in text again
      // also correct regex and string search offsets for the next loop run
      stringIndex = line.indexOf(text, stringIndex + 1);
      rex.lastIndex = stringIndex + text.length;
      if (stringIndex < 0) {
        // invalid stringIndex (should not have happened)
        break;
      }

      let endX = stringIndex + text.length;
      let endY = startLineIndex + 1;

      while (endX > terminal.cols) {
        endX -= terminal.cols;
        endY++;
      }

      const range = {
        start: {
          x: stringIndex + 1,
          y: startLineIndex + 1
        },
        end: {
          x: endX,
          y: endY
        }
      };

      return { ranges: [range], text, activate: handler };
    }
  }

  /**
   * Gets the entire line for the buffer line
   * @param line The line being translated.
   * @param trimRight Whether to trim whitespace to the right.
   * @param terminal The terminal
   */
  private static _translateBufferLineToStringWithWrap(lineIndex: number, trimRight: boolean, terminal: Terminal): [string, number] {
    let lineString = '';
    let lineWrapsToNext: boolean;
    let prevLinesToWrap: boolean;

    do {
      const line = terminal.buffer.active.getLine(lineIndex);
      if (!line) {
        break;
      }

      if (line.isWrapped) {
        lineIndex--;
      }

      prevLinesToWrap = line.isWrapped;
    } while (prevLinesToWrap);

    const startLineIndex = lineIndex;

    do {
      const nextLine = terminal.buffer.active.getLine(lineIndex + 1);
      lineWrapsToNext = nextLine ? nextLine.isWrapped : false;
      const line = terminal.buffer.active.getLine(lineIndex);
      if (!line) {
        break;
      }
      lineString += line.translateToString(!lineWrapsToNext && trimRight).substring(0, terminal.cols);
      lineIndex++;
    } while (lineWrapsToNext);

    return [lineString, startLineIndex];
  }
}
