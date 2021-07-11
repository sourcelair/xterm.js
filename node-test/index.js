import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const xterm = require('xterm-core');

console.log('Creating xterm-core terminal...');
const terminal = new xterm.Terminal();
console.log('Writing `ls` to terminal...')
terminal.write('ls', () => {
  const bufferLine = terminal.buffer.normal.getLine(terminal.buffer.normal.cursorY);
  const contents = bufferLine.translateToString();
  console.log(`Contents of terminal active buffer are: ${contents}`); // ls
});
