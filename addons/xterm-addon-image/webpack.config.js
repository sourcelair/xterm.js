/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

const path = require('path');

const addonName = 'ImageAddon';
const mainFile = 'xterm-addon-image.js';
const mainFileWorker = 'xterm-addon-image-worker.js';
const workerName = 'main';

const addon = {
  entry: `./out/${addonName}.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: mainFile,
    path: path.resolve('./lib'),
    library: addonName,
    libraryTarget: 'umd'
  },
  mode: 'production'
};

// worker target bundled as ./lib/xterm-addon-image-worker.js
const worker = {
  entry: `./out-worker/${workerName}.js`,
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.js$/,
        use: ["source-map-loader"],
        enforce: "pre",
        exclude: /node_modules/
      }
    ]
  },
  output: {
    filename: mainFileWorker,
    path: path.resolve('./lib'),
    libraryTarget: 'umd'
  },
  mode: 'production'
};

module.exports = [addon, worker];
