import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const moduleUrl = pathToFileURL(path.resolve('src/config/runtimeConfig.js')).href;

globalThis.window = {
  localStorage: {
    getItem: () => null
  }
};

const { runtimeConfig } = await import(moduleUrl);
assert.equal(runtimeConfig.useGas, true, '未設定時は GAS を使用する既定値にする');
console.log('runtimeConfig default useGas test passed');
