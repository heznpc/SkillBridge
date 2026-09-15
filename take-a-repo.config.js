const ids = ['translate', 'multilingual', 'tutor', 'records', 'review', 'exam', 'proctored', 'hero'];
module.exports = {
  build: 'npm run build:bundle',
  outDir: 'store-assets/evidence',
  evidence: {
    version: 1,
    inputs: [
      'src',
      'assets',
      '_locales',
      'manifest.json',
      'package.json',
      'package-lock.json',
      'scripts',
      'tests/e2e/helpers',
      'store-assets/fixtures',
      'store-assets/templates',
      'store-assets/STORE_LISTING.md',
      'take-a-repo.config.js',
      'node_modules/take-a-repo/src',
      'node_modules/take-a-repo/package.json',
    ],
    buildOutputs: ['dist/bundled'],
    producers: [
      { id: 'skillbridge', kind: 'browser', command: ['node', 'scripts/capture/collect.js'], timeoutMs: 600000 },
    ],
    claims: ids.map((id) => ({
      id,
      text: `SkillBridge ${id} — deterministic fixture, frozen translation and Tutor stub only`,
      checks: [`skillbridge:${id}`, 'skillbridge:build-identity'],
    })),
    deliverables: [
      { id: 'verification', kind: 'proof', claims: ids },
      ...ids
        .filter((id) => id !== 'proctored')
        .map((id) => ({
          id: `skillbridge-${id}`,
          kind: 'video',
          source: `skillbridge:clip-${id}`,
          channel: 'x',
          fit: 'contain',
          claims: [id],
        })),
    ],
  },
};
