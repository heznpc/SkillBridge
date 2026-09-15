#!/usr/bin/env node
// Compatibility entrypoint; all captures use the evidence pipeline.
const { runTakeARepo } = require('./run-take-a-repo');
console.error('Deprecated: use scripts/run-take-a-repo.js');
process.exitCode = runTakeARepo();
