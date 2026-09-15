#!/usr/bin/env node
const path = require('path');
const { exportApprovedEvidence } = require('take-a-repo');
const root = path.resolve(__dirname, '..');
const result = exportApprovedEvidence({
  outDir: path.join(root, 'store-assets/evidence'),
  root,
  receipt: 'store-assets/capture-assets.json',
  mappings: [
    { asset: 'skillbridge:description', destination: 'store-assets/description.md' },
    { asset: 'skillbridge:promo-tile-440x280', destination: 'store-assets/promo-tile-440x280.png' },
    { asset: 'skillbridge:translate', destination: 'site/public/images/lesson-translated.png' },
    ...['translate', 'multilingual', 'tutor', 'records', 'review', 'exam', 'proctored'].map((id) => ({
      asset: `skillbridge:${id}`,
      destination: `store-assets/${id}.png`,
    })),
    { asset: 'deliverable:skillbridge-hero', destination: 'store-assets/skillbridge-demo.mp4' },
  ],
});
console.log(JSON.stringify(result, null, 2));
