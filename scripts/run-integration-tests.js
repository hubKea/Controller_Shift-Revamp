#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const jestExecutable = path.resolve(__dirname, '..', 'node_modules', 'jest', 'bin', 'jest.js');
const additionalArgs = process.argv.slice(2);

const child = spawn(
  process.execPath,
  ['--experimental-vm-modules', jestExecutable, 'tests/integration', ...additionalArgs],
  {
    stdio: 'inherit',
    env: process.env,
  }
);

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
