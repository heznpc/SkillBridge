const fs = require('fs');
const path = require('path');
const assert = require('node:assert/strict');
const { capture, fingerprintInputs } = require('take-a-repo');
const fixture = require('./fixture');
const { scenarios, events, record } = require('./scenarios');
const root = path.resolve(__dirname, '../..');
const outDir = process.env.TAKE_A_REPO_OUTPUT_DIR;
if (!outDir) throw new Error('Run through take-a-repo; a fresh output directory is required');
const observations = {
  runtimes: [],
  mode: 'deterministic-fixture',
  academy: 'not-executed',
  liveTutor: 'not-executed',
  translation: 'frozen-ko-ja',
  tutor: 'fixed-streaming-stub',
  events,
};
const checks = [];
async function run() {
  const names = Object.keys(scenarios).filter((id) => id !== 'hero');
  const wrap =
    (id, video = false) =>
    async (args) => {
      const start = Date.now();
      record('scenario-start', id, { video });
      await scenarios[id](args);
      if (await args.page.locator('#skillbridge-sidebar.open').count())
        await require('@playwright/test').expect(args.page.locator('#skillbridge-sidebar')).toHaveCSS('opacity', '1');
      await args.page.waitForTimeout(400); // let measured product transitions finish before the capture point
      checks.push({
        id,
        status: 'pass',
        summary: `${id}: visible UI actions and assertions passed on a fixture; no live service claim`,
        assets: ['observations'],
      });
      record('scenario-end', id);
      if (video) await args.page.waitForTimeout(Math.max(1000, 22000 - (Date.now() - start)));
    };
  const result = await capture(
    {
      outDir,
      description: { from: 'store-assets/STORE_LISTING.md' },
      promoTiles: [
        {
          name: 'promo-tile-440x280',
          template: path.join(root, 'store-assets/templates/promo-tile.html'),
          width: 440,
          height: 280,
          replacements: {
            TAGLINE: 'Translate lessons, ask questions, and save study notes.',
            DISCLAIMER: 'Fixture demo · fixed translation and Tutor reply · unofficial',
          },
        },
      ],
      disclaimer: 'FIXTURE DEMO · frozen translation · Tutor stub · not live Academy',
      prepareExtension: async () => {
        const dir = fixture.prepareExtension();
        observations.bundle = fingerprintInputs(root, ['dist/bundled']);
        observations.loadedBundle = fingerprintInputs(dir, fs.readdirSync(dir).sort());
        const productionFiles = new Map(
          observations.bundle.files
            .filter(([, hash]) => hash !== 'directory')
            .map(([file, hash]) => [file.replace(/^dist\/bundled\//, ''), hash]),
        );
        const loadedFiles = new Map(observations.loadedBundle.files.filter(([, hash]) => hash !== 'directory'));
        const changed = [...new Set([...productionFiles.keys(), ...loadedFiles.keys()])]
          .filter((file) => productionFiles.get(file) !== loadedFiles.get(file))
          .sort();
        assert.deepEqual(changed, ['e2e-network-state.js', 'manifest.json', 'src/bridge/puter.js']);
        observations.changedBundleFiles = changed;
        observations.patches = [
          'localhost manifest access',
          'E2E network-state preload',
          'scripting permission for read checks',
          'Puter streaming stub',
        ];
        return dir;
      },
      setup: async (args) => {
        const result = await fixture.setup(args);
        const worker = args.context.serviceWorkers()[0];
        const runtime = await worker.evaluate(() => ({
          version: chrome.runtime.getManifest().version,
          id: chrome.runtime.id,
        }));
        assert.equal(runtime.version, require('../../package.json').version);
        observations.runtimes.push(runtime);
        record('preparation', 'seed-welcomeShown', { internal: 'chrome.storage.local' });
        return result;
      },
      scenes: names.map((id) => ({ name: id, caption: `SkillBridge · ${id} · fixture verification`, run: wrap(id) })),
      demos: ['hero', 'translate', 'multilingual', 'tutor', 'records', 'review', 'exam'].map((id) => ({
        name: `clip-${id}`,
        preset: 'sns-video',
        mp4: true,
        trim: { start: 0, duration: 40 },
        captions: [
          { at: 0, text: `SkillBridge: ${id}`, role: 'result' },
          { at: 18, text: 'Local fixture · fixed translation and Tutor reply', role: 'safety' },
        ],
        captionOptions: { mode: 'static', fontSize: 24 },
        run: wrap(id, true),
      })),
    },
    { cwd: root, json: true, log: (message) => console.error(message) },
  );
  const manifest = JSON.parse(fs.readFileSync(result.manifest, 'utf8'));
  fs.writeFileSync(path.join(outDir, 'observations.json'), JSON.stringify(observations, null, 2));
  const assets = [
    { id: 'observations', path: 'observations.json', mediaType: 'application/json', role: 'check-result' },
  ];
  for (const a of manifest.assets) {
    if (!['image', 'video'].includes(a.type)) continue;
    assets.push({
      id: path.basename(a.outPath, path.extname(a.outPath)) + (a.outPath.endsWith('.mp4') ? '-mp4' : ''),
      path: a.outPath,
      mediaType: a.type === 'image' ? 'image/png' : a.outPath.endsWith('.mp4') ? 'video/mp4' : 'video/webm',
      role: a.type === 'image' ? 'screenshot' : 'recording',
    });
  }
  const storyboard = JSON.parse(fs.readFileSync(path.join(outDir, 'storyboard.json'), 'utf8'));
  assert.ok(
    storyboard.storyboardLint.every((entry) => !entry.warnings?.length),
    'storyboard and runtime caption QA must pass',
  );
  assets.push({ id: 'description', path: 'description.md', mediaType: 'text/markdown', role: 'artifact' });
  for (const id of ['storyboard', 'captions'])
    assets.push({ id, path: `${id}.json`, mediaType: 'application/json', role: 'check-result' });
  checks.push({
    id: 'build-identity',
    status: 'pass',
    summary:
      'Every loaded runtime version matches the package; staged bundle differs from the fresh production bundle only by the three declared fixture files',
    assets: ['observations'],
  });
  const uniqueChecks = [...new Map(checks.map((c) => [c.id, c])).values()];
  fs.writeFileSync(
    path.join(outDir, 'evidence.json'),
    JSON.stringify({ version: 1, assets, checks: uniqueChecks }, null, 2),
  );
}
run().catch((error) => {
  fs.writeFileSync(
    path.join(outDir, 'failed-observations.json'),
    JSON.stringify({ ...observations, error: error.stack }, null, 2),
  );
  console.error(error);
  process.exitCode = 1;
});
