Cursory test that 'xterm-core' works:

```
# From root of this repo
npm run compile # Outputs to xterm-core
npx webpack --config core-webpack.config.js # Outputs to lib
cd node-test
npm link ../lib/
node index.js
```