const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { buildSync } = require('esbuild');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const bundled = buildSync({
  entryPoints: [path.join(root, 'site/src/locale.ts')],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
}).outputFiles[0].text;
const target = { exports: {} };
new Function('module', 'exports', bundled)(target, target.exports);
const { locales, detectLocale, localePath } = target.exports;
const dictionaries = Object.fromEntries(
  locales.map((locale) => [locale, require(`../site/src/locales/${locale}.json`)]),
);

beforeAll(() => {
  execFileSync('npm', ['run', 'landing:verify'], { cwd: root, stdio: 'pipe', timeout: 30000 });
}, 35000);

test.each(locales)('%s renders translated content, metadata and initial demo without JavaScript', (locale) => {
  const route = locale === 'en' ? '' : locale;
  const html = fs.readFileSync(path.join(root, 'site/dist', route, 'index.html'), 'utf8');
  const { document: doc } = new JSDOM(html).window;
  const copy = dictionaries[locale];
  expect(doc.documentElement.lang).toBe(locale);
  expect(doc.documentElement.dir).toBe(['ar', 'he'].includes(locale) ? 'rtl' : 'ltr');
  expect(doc.title).toBe(copy.meta.title);
  expect(doc.querySelector('meta[name="description"]').content).toBe(copy.meta.description);
  expect(doc.querySelector('meta[property="og:description"]').content).toBe(copy.meta.description);
  expect(doc.querySelector('h1').textContent).toBe(copy.titleLines.join(''));
  expect(doc.querySelector('.opening-copy > p').textContent).toBe(copy.ui.lead);
  expect(doc.querySelector('.feature-header h2').textContent).toBe(copy.ui.featureTitle);
  expect(doc.querySelector('.finish-copy h2').textContent).toBe(copy.ui.finalTitle);
  expect(doc.querySelector('.flow-footer > p').textContent).toBe(copy.ui.footer);
  expect(doc.querySelector('[data-locale-select]').value).toBe(locale);
  expect(doc.querySelector('[data-popup-language]').value).toBe(locale);
  expect(doc.querySelector('[data-preview-title]').textContent).toBe(copy.sample.title);
  expect(doc.querySelector('[data-preview-body]').textContent).toBe(copy.sample.body);
  expect(doc.querySelector('[data-sidebar-toggle]').textContent).toBe(copy.demo.openSidebar);
  expect(doc.querySelector('[data-chat-send]').textContent).toBe(copy.demo.send);
  expect(doc.querySelector('[data-landing]').dataset.copy).toContain(copy.demo.chatReady);
  expect(doc.body.textContent).not.toMatch(/\{(?:version|count|language)\}/);
  if (locale !== 'en') {
    for (const section of ['meta', 'sample']) {
      expect(copy[section]).not.toEqual(dictionaries.en[section]);
    }
    for (const key of ['lead', 'flowLead', 'contextBody', 'featureLead', 'finalBody']) {
      expect(copy.ui[key]).not.toBe(dictionaries.en.ui[key]);
    }
  }
});

test.each([
  [['pt-BR'], 'pt-BR'],
  [['pt-PT'], 'pt'],
  [['zh-Hant-HK'], 'zh-TW'],
  [['zh-HK'], 'zh-TW'],
  [['zh-Hans-SG'], 'zh-CN'],
  [['nb-NO'], 'no'],
  [['fil-PH'], 'tl'],
  [['xx-ZZ', 'fr-CA'], 'fr'],
  [[], 'en'],
])('browser preferences %j resolve to %s', (languages, expected) => {
  expect(detectLocale(languages)).toBe(expected);
});

test('language routes retain deployment base and canonical English root', () => {
  expect(localePath('fr', '/SkillBridge')).toBe('/SkillBridge/fr/');
  expect(localePath('pt-BR', '/SkillBridge/')).toBe('/SkillBridge/pt-BR/');
  expect(localePath('en', '/SkillBridge/')).toBe('/SkillBridge/');
  expect(localePath('ar', '/')).toBe('/ar/');
});
