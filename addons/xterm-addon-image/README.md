## xterm-addon-image

Image output in xterm.js.

⚠️ This is an experimental addon that is still under construction. ⚠️


### Install

```bash
npm install --save xterm-addon-image
```

### Usage

```ts
import { Terminal } from 'xterm';
import { ImageAddon, IImageAddonOptions } from 'xterm-addon-image';

// customize as needed
const customSettings: IImageAddonOptions = {
  workerPath: '/path/to/xterm-addon-image-worker.js',
  sixelSupport: true,
  ...
}

// initialization
const terminal = new Terminal();
const imageAddon = new ImageAddon(customSettings);
terminal.loadAddon(imageAddon);

// when done
imageAddon.dispose();
```

### General Notes

- The image decoding is done with a worker, therefore the addon will only work, if you expose the worker file as well, which is distributed under `lib/xterm-addon-image-worker.js`. To customize the worker path, set `workerPath` in the constructor options to your needs (default is `'/workers/xterm-addon-image-worker.js'`).

- By default the addon will activate these `windowOptions` reports on the terminal:
  - getWinSizePixels (CSI 14 t)
  - getCellSizePixels (CSI 16 t)
  - getWinSizeChars (CSI 18 t)
  
  to help applications getting useful terminal metrics for their image preparations. Set `enableSizeReports` in the constructor options to `false`, if you dont want the addon to alter these terminal settings. This is especially useful, if you have very strict security needs not allowing any terminal reports, or deal with `windowOptions` by other means.


### Operation Modes

- **SIXEL Support**  
  Set by default, change it with `{sixelSupport: true}`.

- **Scrolling On | Off**  
  By default scrolling is on, thus an image will advance the cursor at the bottom if needed.
  The cursor will move with the image and be placed either right to the image or in the next line
  (see cursor positioning).

  If scrolling is off, the image gets painted from the top left of the current viewport
  and might be truncated if the image exceeds the viewport size.
  The cursor position does not change.

  You can customize this behavior with the constructor option `{sixelScrolling: false}`
  or with `DECSET 80` (on, binary: `\x1b [ ? 80 h`) and
  `DECRST 80` (off, binary: `\x1b [ ? 80 l`) during runtime.

- **Cursor Positioning**  
  If scrolling is set, the cursor will be placed at the beginning of the next row by default.
  You can change this behavior with the following terminal sequences:
  - `DECSET 8452` (binary: `\x1b [ ? 8452 h`)  
    For images not overflowing to the right, the cursor will move to the next right cell of the last image cell.
    Images overflowing to the right, move the cursor to the next line.
    Same as the constructor option `{cursorRight: true}`.

  - `DECRST 8452` (binary: `\x1b [ ? 8452 l`)  
    Always moves the cursor to the next line (default). Same as the constructor option `{cursorRight: false}`.

  - `DECSET 7730` (binary: `\x1b [ ? 7730 h`)  
    Move the cursor on the next line to the image start offset instead of the beginning.
    This setting only applies if the cursor will wrap to the next line (thus never for scrolling off,
    for `DECSET 8452` only after overflowing images). Same as the constructor option `{cursorBelow: true}`.

  - `DECRST 7730` (binary: `\x1b [ ? 7730 l`)  
    Keep the cursor on the next line at the beginning (default). Same as the constructor option `{cursorBelow: false}`.

- **SIXEL Palette Handling**  
  By default the addon limits the palette size to 256 registers (as demanded by the DEC specification).
  The limit can be increased to a maximum of 65536 registers (via `sixelPaletteLimit`).

  SIXEL images are initialized with their own private palette derived from the default palette
  (default `{sixelDefaultPalette: 'ANSI256'}`). Support for non-private palette is currently broken
  and falls back to private palette mode.

  Note that the underlying SIXEL library currently handles palette colors in *printer mode*, thus color changes are applied immediately at SIXEL cursor position, but never backwards for earlier pixels of the same color register. While this makes the SIXEL processing much faster and more flexible (in fact one can use more colors than given by the palette limit by dynamically redefining them), it is technically incompatible to older VTs, where a color change would always change earlier pixels (*terminal mode*). Practically it makes no difference for fully pre-quantitized images, still a future version may provide a dedicated *terminal mode* setting, to be more in line with old VTs.

- **SIXEL Raster Attributes Handling**  
  If raster attributes were found in the SIXEL data (level 2), the image will always be limited to the given height/width extend. We deviate here from the specification on purpose, as it allows several processing optimizations. For level 1 SIXEL data without any raster attributes the image can freely grow in width and height up to the last data byte, which has a much higher processing penalty. In general encoding libraries should not created level 1 data anymore and not produce pixel information beyond the announced height/width extend. Both is discouraged by the >30 years old specification.

  Currently the SIXEL implementation of the addon does not take custom pixel sizes into account, a SIXEL pixel will map 1:1 to a screen pixel.

### Storage and Drawing Settings

The internal storage holds images up to `storageLimit` (in MB, calculated as 4-channel RBGA unpacked, default 100 MB). Once hit images get evicted by FIFO rules. Furthermore images on the alternate buffer will always be erased on buffer changes.

The addon exposes two properties to interact with the storage limits at runtime:
- `storageLimit`  
  Change the value to your needs at runtime. This is especially useful, if you have multiple terminal
  instances running, that all add to one upper memory limit.
- `storageUsage`  
  Inspect the current memory usage of the image storage.

By default the addon will show a placeholder pattern for evicted images that are still part
of the terminal (e.g. in the scrollback). The pattern can be deactivated by toggling `showPlaceholder`.

### Image Data Retrieval

The addon provides the following API endpoints to retrieve raw image data as canvas:

- `getImageAtBufferCell(x: number, y: number): HTMLCanvasElement | undefined`  
  Returns the canvas containing the original image data (not resized) at the given buffer position.
  The buffer position is the 0-based absolute index (including scrollback at top).

- `extractTileAtBufferCell(x: number, y: number): HTMLCanvasElement | undefined`  
  Returns a canvas containing the actual single tile image data (maybe resized) at the given buffer position.
  The buffer position is the 0-based absolute index (including scrollback at top).
  Note that the canvas gets created and data copied over for every call, thus it is not suitable for performance critical actions.

### Memory Usage

The addon does most image processing in Javascript and therefore can occupy a rather big amount of memory. To get an idea where the memory gets eaten, lets look at the data flow and processing steps:
- Incomming image data chunk at `term.write` (terminal)  
  `term.write` might stock up incoming chunks. To circumvent this, you will need proper flow control (see xterm.js docs). Note that with image output it is more likely to run into this issue, as it can create lots of MBs in very short time.
- Sequence Parser (terminal)  
  The parser operates on a buffer containing up to 2^17 codepoints (~0.5 MB).
- Sequence Handler - Chunk Processing (addon / mainthread)  
  Image data chunks are copied over and sent to the decoder worker as transferables with `postMessage`. To avoid a data congestion at the message port, allowed SIXEL data is hard limited by `sixelSizeLimit` (default 25 MB). The transport chunks are pooled, the pool cache may hold up to ~6 MB during active data transmission.
- Image Decoder (addon / worker)  
  The decoder works chunkwise allocating memory as needed. The allowed image size gets restricted by `pixelLimit` (default 16M pixels), the decoder holds 2 pixel buffers at maximum during decoding (RGBA, ~128 MB for 16M pixels).
  After decoding the final pixel buffer is transferred back to the sequence handler.
- Sequence Handler - Image Finalization (addon / mainthread)  
  The pixel data gets written to a canvas of the same size (~64 MB for 16M pixels) and added to the storage. The pixel buffer is sent back to the worker to be used for the next image.
- Image Storage (addon / mainthread)  
  The image storage implements a FIFO cache, that will remove old images, if a new one arrives and `storageLimit` is hit (default 128 MB). The storage holds a canvas with the original image, and may additionally hold resized versions of images after a font rescaling. Both are accounted in `storageUsage` as a rough estimation of _pixels x 4 channels_.

Following the steps above, a rough estimation of maximum memory usage by the addon can be calculated with these formulas (in bytes):
```typescript
// storage alone
const storageBytes = storageUsage * storageLimit * 1024 * 1024;
// decoding alone
const decodingBytes = sixelSizeLimit + 2 * (pixelLimit * 4);

// totals
// inactive decoding
const totalInactive = storageBytes;
// active decoding
const totalActive = storageBytes + decodingBytes;
```

Note that browsers have offloading tricks for rarely touched memory segments, esp. `storageBytes` might not directly translate into real memory usage. Usage peaks will happen during active decoding of multiple big images due to the need of 2 full pixel buffers at the same time, which cannot be offloaded. Thus you may want to keep an eye on `pixelLimit` under limited memory conditions.  
Further note that the formulas above do not respect the Javascript object's overhead. Compared to the raw buffer needs the book keeping by these objects is rather small (<<5%).

_Why should I care about memory usage at all?_  
Well you don't have to, and it probably will just work fine with the addon defaults. But for bigger integrations, where much more data is held in the Javascript context (like multiple terminals on one page), it is likely to hit the engine's memory limit sooner or later under decoding and/or storage pressure.

_How can I adjust the memory usage?_  
- `pixelLimit`  
  A constructor settings, thus you would have to anticipate, whether (multiple) terminals in your page gonna do lots of concurrent decoding. Since this is normally not the case and the memory usage is only temporarily peaking, a rather high value should work even with multiple terminals in one page.
- `storageLimit`  
  A constructor and a runtime setting. In conjunction with `storageUsage` you can do runtime checks and adjust the limit to your needs. If you have to lower the limit below the current usage, images will be removed and may turn into a placeholder in the terminal's scrollback (if `showPlaceholder` is set). When adjusting keep in mind to leave enough room for memory peaking for decoding.
- `sixelSizeLimit`  
  A constructor setting. This has only a small direct impact on peaking memory during decoding. It still will avoid processing of overly big or broken sequences at an earlier phase, thus may stop the decoder from entering its memory intensive task for potentially invalid data.