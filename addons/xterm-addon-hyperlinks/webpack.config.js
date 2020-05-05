/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

const path = require('path');

const addonName = 'HyperlinksAddon';
const mainFile = 'xterm-addon-hyperlinks.js';

module.exports = {
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
  resolve: {
    modules: ['./node_modules'],
    extensions: [ '.js' ],
    alias: {
      common: path.resolve('../../out/common')
    }
  },
  output: {
    filename: mainFile,
    path: path.resolve('./lib'),
    library: addonName,
    libraryTarget: 'umd'
  },
  mode: 'production'
};
