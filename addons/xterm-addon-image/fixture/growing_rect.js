const sixelEncode = require('../node_modules/sixel/lib/SixelEncoder').image2sixel;
const toRGBA8888 = require('../node_modules/sixel/lib/Colors').toRGBA8888;

function createRect(size, color) {
  const pixels = new Uint32Array(size * size);
  pixels.fill(toRGBA8888(...color));
  return sixelEncode(new Uint8ClampedArray(pixels.buffer), size, size);
}

function createRectMinusOne(size, color) {
  const pixels = new Uint32Array(size * size);
  if (size - 1) {
    const sub = new Uint32Array(size - 1);
    sub.fill(toRGBA8888(...color));
    const last = size * (size - 1);
    for (let y = 0; y < last; y += size) {
      pixels.set(sub, y);
    }
  }
  return sixelEncode(new Uint8ClampedArray(pixels.buffer), size, size);
}

async function main() {
  // clear + cursor and sixelScrolling off
  process.stdout.write('\x1b[2J\x1b[?25;80l');

  for (let i = 1; i < 300; ++i) {
    await new Promise(res => setTimeout(() => {
      process.stdout.write(createRect(i, [0, 255, 0]));
      res();
    }, 5));
  }
  for (let i = 299; i >= 1; --i) {
    await new Promise(res => setTimeout(() => {
      process.stdout.write(createRectMinusOne(i, [0, 255, 0]));
      res();
    }, 5));
  }

  // re-enable cursor and sixel scrolling
  process.stdout.write('\x1b[2J\x1b[?25;80h');
}

main();
