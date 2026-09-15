#!/usr/bin/env node
// Compatibility: never encode a prior demo with the current version label.
process.exitCode = require('./run-take-a-repo').runTakeARepo();
