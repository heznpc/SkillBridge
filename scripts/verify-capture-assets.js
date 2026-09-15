#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { verifyExportedEvidence } = require('take-a-repo');
const root = path.resolve(__dirname, '..');
const receipt = 'store-assets/capture-assets.json';
if (fs.existsSync(path.join(root, receipt))) {
  const result = verifyExportedEvidence({ root, receipt });
  console.log(`Approved capture assets verified: ${result.runId}`);
} else {
  console.log('Landing uses historical assets; no take-a-repo candidate has been approved/applied.');
}
