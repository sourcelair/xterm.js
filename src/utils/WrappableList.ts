import { CircularList } from './CircularList';
import { RowData } from '../Types';

function fastForeach(array, fn) {
  let i = 0;
  let len = array.length;
  for (i; i < len; i++) {
    fn(array[i], i, array);
  }
}

function trimmedLength(line, min) {
  let i = line.length - 1;
  for (i; i >= 0; i--) {
    if (line[i] && line[i][1] !== null) {
      break;
    }
  }

  if (i >= min) {
    i++;
  }

  return i;
}

function chunkArray(chunkSize, array) {
  let temparray = [];
  let i = 0;
  let j = array.length;
  for (i; i < j; i += chunkSize) {
    temparray.push(array.slice(i, i + chunkSize));
  }

  return temparray;
}

export class WrappableList extends CircularList<RowData> {
  private _wrappedLineIncrement: number[] = [];
  public wrappedLines: number[] = [];

  constructor(maxLength: number) {
    super(maxLength);
  }

  public push(value: RowData): void {
    // Need to make sure wrappedlines move when CircularList wraps around, but without increasing
    // the time complexity of `push`. We push the number of `wrappedLines` that should be
    // incremented so that it can be calculated later.
    if (this._length + 1 === this.maxLength) {
      this._wrappedLineIncrement.push(this.wrappedLines.length);
    }
    super.push(value);
  }

  public addWrappedLine(row: number): void {
    this.wrappedLines.push(row);
  }

  // Adjusts `wrappedLines` using `_wrappedLineIncrement`
  private _adjustWrappedLines(): void {
    fastForeach(this._wrappedLineIncrement, (end) => {
      let i = 0;
      for (i; i < end; i++) {
        this.wrappedLines[i] -= 1;
      }
    });
    this._wrappedLineIncrement = [];
  }

  private _numArrayToObject(array: number[]) {
    let i = 0;
    let len = array.length;
    let returnObject = {};
    for (i; i < len; i++) {
      returnObject[array[i]] = null;
    }
    return returnObject;
  }

  /**
   * Reflow lines to a new max width.
   * A record of which lines are wrapped is stored in `wrappedLines` and is used to join and split
   * lines correctly.
   */
  public reflow(width: number): void {
    const temp = [];
    const tempWrapped = [];
    const skip = [];
    const wrappedLines = this.wrappedLines;

    this._adjustWrappedLines();
    // Using in index accessor is much quicker when we need to calculate previouslyWrapped many times
    const wrappedLinesObject = this._numArrayToObject(this.wrappedLines);
    const previouslyWrapped = (i) => wrappedLinesObject[i] !== undefined;

    const concatWrapped = (line, index) => {
      let next = index;
      while (previouslyWrapped(next)) {
        next++;
        skip.push(next);
        line = line.concat(this.get(next));
      }
      return line;
    };

    const reflowLine = (line, index) => {
      if (line && skip.indexOf(index) === -1) {

        line = concatWrapped(line, index);

        const trim = trimmedLength(line, width);
        if (trim > width) {
          fastForeach(chunkArray(width, line.slice(0, trim)), (chunk, i, chunks) => {
            temp.push(chunk);
            if (i < chunks.length - 1) {
              tempWrapped.push(temp.length - 1);
            }
          });
        } else {
          temp.push(line.slice(0, width));
        }
      }
    };

    this.forEach(reflowLine);

    // Reset the list internals using the reflowed lines
    const scrollback = temp.length > this.maxLength ? temp.length : this.maxLength;
    this._length = temp.length;
    this._array = temp;
    this._array.length = scrollback;
    this.wrappedLines = tempWrapped;
    this._startIndex = 0;
  }
}
