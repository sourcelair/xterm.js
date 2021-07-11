/**
 * Copyright (c) 2019 The xterm.js authors. All rights reserved.
 * @license MIT
 */

const path = require('path');

/**
 * This webpack config does a production build for xterm-core.js. It works by taking the output from tsc
 * (via `yarn watch` or `yarn prebuild`) which are put into `xterm-core/` and webpacks them into a
 * production mode commonjs library module in `lib/`. The aliases are used fix up the absolute paths
 * output by tsc (because of `baseUrl` and `paths` in `tsconfig.json`.
 */
module.exports = {
  entry: './xterm-core/common/public/Terminal.js',
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
      common: path.resolve('./xterm-core/common')
    }
  },
  output: {
    filename: 'xterm-core.js',
    path: path.resolve('./lib'),
    libraryTarget: 'commonjs'
  },
  mode: 'production',
  target: 'node',
};
