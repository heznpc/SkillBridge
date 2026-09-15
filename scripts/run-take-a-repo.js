#!/usr/bin/env node

'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { createBrowserLaunchEnv } = require('./lib/browser-launch-env');

const ROOT = path.resolve(__dirname, '..');

function resolveTakeARepoCli() {
  const packageEntry = require.resolve('take-a-repo');
  const packageRoot = path.resolve(path.dirname(packageEntry), '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.['take-a-repo'];
  if (!bin) throw new Error('The installed take-a-repo package has no take-a-repo CLI');
  const cliPath = path.resolve(packageRoot, bin);
  if (!fs.existsSync(cliPath)) throw new Error(`Cannot find the take-a-repo CLI at ${cliPath}`);
  return cliPath;
}

function runTakeARepo({
  argv = process.argv.slice(2),
  baseEnv = process.env,
  cwd = ROOT,
  cliPath = resolveTakeARepoCli(),
  spawn = spawnSync,
} = {}) {
  const headed = argv.includes('--headed');
  const forwardedArgs = argv.filter((arg) => arg !== '--headed');
  const env = createBrowserLaunchEnv(baseEnv, { headed, headedVariable: 'TAKE_A_REPO_HEADED' });
  const result = spawn(process.execPath, [cliPath, ...forwardedArgs], {
    cwd,
    env,
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`take-a-repo stopped with signal ${result.signal}`);
  return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
  try {
    process.exitCode = runTakeARepo();
  } catch (err) {
    console.error(`take-a-repo launcher failed: ${err.message}`);
    process.exitCode = 1;
  }
}

module.exports = { resolveTakeARepoCli, runTakeARepo };
