const fs = require('fs');
const http = require('http');
const path = require('path');

const { makePatchedExtension } = require('../../tests/e2e/helpers/extension');
const { registerStubs, GT_KO, buildGTResponse, translateLikeGoogle } = require('../../tests/e2e/helpers/network-stubs');

const FIXTURES = path.join(__dirname, '../../store-assets', 'fixtures');
const LESSON_HTML = fs.readFileSync(path.join(FIXTURES, 'lesson.html'), 'utf8');
const QUIZ_HTML = fs.readFileSync(path.join(FIXTURES, 'quiz.html'), 'utf8');
const FIXTURE_CSP =
  "default-src * data: blob: 'unsafe-eval' 'unsafe-inline'; " +
  "script-src * 'unsafe-eval' 'unsafe-inline' data: blob:; style-src * 'unsafe-inline'";

module.exports = {
  prepareExtension: () => makePatchedExtension(),
  async setup({ context, flags }) {
    // Shared E2E network stubs; makePatchedExtension supplies the Tutor SDK stub.
    await registerStubs(context);

    // Google Translate: deterministic frozen map by default.
    const frozen = { ...require('../../store-assets/fixtures/gt-frozen.ko.json') };
    delete frozen._comment;
    const MAP = { ...GT_KO, ...frozen };
    const recorded = {};
    await context.route('https://translate.googleapis.com/**', async (route) => {
      const request = route.request();
      let q = new URL(request.url()).searchParams.get('q') || '';
      if (request.method() === 'POST') {
        q = new URLSearchParams(request.postData() || '').get('q') || '';
      }
      // URLSearchParams decodes query and form values exactly once.
      const params = new URL(request.url()).searchParams;
      const lang = params.get('tl') || new URLSearchParams(request.postData() || '').get('tl');
      const norm = q.replace(/\s+/g, ' ').trim();
      if (flags && flags.freeze) {
        // Record mode: hit real GT, capture its output, fulfill with the real response.
        const resp = await route.fetch();
        const body = await resp.text();
        try {
          recorded[norm] = JSON.parse(body)[0][0][0];
        } catch (_e) {
          /* leave unrecorded on parse failure */
        }
        return route.fulfill({ response: resp });
      }
      if (flags && flags.liveGt) return route.continue(); // real Google Translate
      // Default: frozen map; unmapped strings fall back to the ORIGINAL text so
      // a forgotten string stays clean English instead of an [UNTRANSLATED]
      // marker. Routed through the shared stub translator so masked requests
      // (brand terms are hidden behind ⟦0⟧ placeholders before they reach GT)
      // resolve against the frozen map and come back with their placeholders
      // intact — otherwise every branded string would look "unmapped" here.
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          buildGTResponse(
            translateLikeGoogle(
              norm,
              lang === 'ja' ? require('../../store-assets/fixtures/gt-frozen.ja.json') : MAP,
              (t) => t,
            ),
          ),
        ),
      });
    });

    // Suppress first-run onboarding so it doesn't obscure scenes (scene 2 shows
    // it explicitly). Pre-seeding storage before any navigation stops the timer.
    const sw = context.serviceWorkers()[0];
    if (sw) {
      try {
        await sw.evaluate(() => chrome.storage.local.set({ welcomeShown: true }));
      } catch (_e) {
        /* SW not ready — the per-scene suppressOnboarding op covers it */
      }
    }

    // Serve the styled store fixtures (quiz path → quiz fixture, else lesson).
    const server = http.createServer((req, res) => {
      const p = (req.url || '/').split('?')[0];
      const isQuiz = /(quiz|exam|assessment)/.test(p);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': FIXTURE_CSP });
      res.end(isQuiz ? QUIZ_HTML : LESSON_HTML);
    });
    const baseUrl = await new Promise((resolve) =>
      server.listen(0, '127.0.0.1', () => resolve(`http://localhost:${server.address().port}`)),
    );

    return {
      env: { baseUrl },
      teardown: async () => {
        if (flags && flags.freeze && Object.keys(recorded).length) {
          fs.writeFileSync(path.join(FIXTURES, 'gt-frozen.ko.json'), JSON.stringify(recorded, null, 2) + '\n');
        }
        await new Promise((r) => server.close(() => r()));
      },
    };
  },
};
