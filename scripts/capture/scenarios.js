const assert = require('node:assert/strict');
const { expect } = require('@playwright/test');
const { evalInContentWorld } = require('../../tests/e2e/helpers/extension');
const LESSON = '/courses/claude-with-the-anthropic-api/lessons/introduction-to-claude';
const ORIGINAL_PARAGRAPHS = [
  'This lesson covers prompt engineering fundamentals and how Claude processes user requests.',
  'Anthropic builds AI tools for developers and researchers.',
  'A prompt is the input you give to Claude. Better prompts produce better responses.',
];
const NOTE = 'Review prompt context and preserve Claude terminology.';
const events = [];
function record(phase, action, detail = {}) {
  events.push({ at: new Date().toISOString(), phase, action, ...detail });
}
async function click(p, selector, demo) {
  record('interaction', 'click', { selector });
  if (demo) await demo.click(selector, { moveMs: 350, beforeMs: 200, holdMs: 300 });
  else await p.locator(selector).click();
}
async function language(p, value, demo) {
  record('interaction', 'select-language', { value });
  if (demo) await demo.select('#si18n-header-lang-select', value, { openMs: 700, holdMs: 400 });
  else {
    await p.locator('#si18n-header-lang-select').selectOption(value);
  }
}
async function open(args, route = LESSON) {
  await args.page.goto(args.baseUrl + route, { waitUntil: 'networkidle' });
  record('interaction', 'navigate', { route });
  await expect(args.page.locator('#si18n-header-lang-select')).toBeVisible();
}
async function korean(args) {
  await open(args);
  await language(args.page, 'en', args.demo);
  await expect(args.page.locator('#lesson-main p')).toHaveText(ORIGINAL_PARAGRAPHS);
  await language(args.page, 'ko', args.demo);
  await expect(args.page.locator('#p-1')).toContainText(/[가-힣]/);
  await expect(args.page.locator('#p-1')).toContainText('Claude');
  await expect(args.page.locator('#p-2')).toContainText(/[가-힣]/);
  await expect(args.page.locator('#p-3')).toContainText(/[가-힣]/);
  record('verification', 'translated-body', {
    paragraphs: await args.page.locator('#lesson-main p').allTextContents(),
  });
}
async function tools(args, target) {
  if (!((await args.page.locator('#skillbridge-sidebar').getAttribute('class')) || '').split(' ').includes('open'))
    await click(args.page, '#skillbridge-fab', args.demo);
  await click(args.page, '#si18n-tools-btn', args.demo);
  await click(args.page, target, args.demo);
}
async function tutor(args) {
  const { page, demo } = args;
  // Actual mouse text selection, followed by the product's selection action.
  await page.locator('#p-1').click({ clickCount: 3 });
  record('interaction', 'select-paragraph', { selector: '#p-1', method: 'triple-click' });
  await click(page, '.si18n-ask-tutor-btn', demo);
  await expect(page.locator('.si18n-chat-quote')).toBeVisible();
  const quote = await page.locator('.si18n-chat-quote').innerText();
  assert.ok(quote.length > 10, 'paragraph quote must reach Tutor composer');
  record('verification', 'selected-quote', { quote });
  await page.locator('#si18n-chat-input').fill('프롬프트가 무엇인가요?');
  record('interaction', 'type-question', { tutor: 'fixed-streaming-stub' });
  await click(page, '#si18n-chat-send', demo);
  await expect(page.locator('.si18n-chat-bot .si18n-chat-bubble').last()).toContainText('입력입니다', {
    timeout: 15000,
  });
}
async function save(args) {
  await tools(args, '#si18n-bm-btn');
  if (!(await args.page.locator('.si18n-bm-open').count())) await click(args.page, '#si18n-bm-add', args.demo);
  await expect(args.page.locator('.si18n-bm-open').first()).toBeVisible();
  await click(args.page, '#si18n-bm-back', args.demo);
  await tools(args, '#si18n-note-btn');
  await click(args.page, '#si18n-note-add', args.demo);
  await args.page.locator('#si18n-note-input').fill(NOTE);
  record('interaction', 'type-note', { text: NOTE });
  await click(args.page, '#si18n-note-save', args.demo);
  await expect(args.page.locator('.si18n-note-preview').first()).toContainText(NOTE);
  record('verification', 'saved-note', { text: NOTE });
}
const scenarios = {
  translate: async (a) => {
    await korean(a);
    await language(a.page, 'en', a.demo);
    await expect(a.page.locator('#lesson-main p')).toHaveText(ORIGINAL_PARAGRAPHS);
    record('verification', 'exact-original-restored', { paragraphs: ORIGINAL_PARAGRAPHS });
    await language(a.page, 'ko', a.demo);
    await expect(a.page.locator('#p-1')).toContainText(/[가-힣]/);
  },
  multilingual: async (a) => {
    await korean(a);
    await language(a.page, 'ja', a.demo);
    await expect(a.page.locator('#p-1')).toContainText('このレッスン');
    await expect(a.page.locator('#p-2')).toContainText('開発');
    await expect(a.page.locator('#p-3')).toContainText('プロンプト');
    for (const id of ['li-1', 'li-2', 'li-3']) await expect(a.page.locator(`#${id}`)).toContainText(/[ぁ-んァ-ン]/);
    await click(a.page, '#skillbridge-fab', a.demo);
    await expect(a.page.locator('#si18n-chat-send')).toHaveText('送信');
    await expect(a.page.locator('#skillbridge-sidebar')).toHaveCSS('opacity', '1');
    record('verification', 'japanese-body-and-ui', {
      paragraphs: await a.page.locator('#lesson-main p').allTextContents(),
      send: await a.page.locator('#si18n-chat-send').innerText(),
    });
  },
  tutor: async (a) => {
    await korean(a);
    await tutor(a);
  },
  records: async (a) => {
    await korean(a);
    await save(a);
    await a.page.goto('about:blank');
    await open(a);
    await tools(a, '#si18n-bm-btn');
    await expect(a.page.locator('.si18n-bm-open').first()).toBeVisible();
    await click(a.page, '#si18n-bm-back', a.demo);
    await tools(a, '#si18n-note-btn');
    await expect(a.page.locator('.si18n-note-preview').first()).toContainText(NOTE);
    record('verification', 'restored-note', { text: await a.page.locator('.si18n-note-preview').first().innerText() });
  },
  review: async (a) => {
    await korean(a);
    await tools(a, '#si18n-fc-btn');
    await expect(a.page.locator('#si18n-fc-card')).toBeVisible();
    const before = await a.page.locator('.si18n-fc-stats').innerText();
    await click(a.page, '#si18n-fc-card', a.demo);
    await expect(a.page.locator('#si18n-fc-card')).toHaveClass(/si18n-card-flipped/);
    await click(a.page, '#si18n-fc-box-up', a.demo);
    await expect(a.page.locator('.si18n-fc-stats')).not.toHaveText(before);
    record('verification', 'flashcard-state-changed', {
      before,
      after: await a.page.locator('.si18n-fc-stats').innerText(),
    });
  },
  exam: async (a) => {
    await open(a, '/quiz');
    await language(a.page, 'en', a.demo);
    const answers = await a.page.locator('.answer-option').allTextContents();
    assert.equal(answers.length, 4);
    record('verification', 'original-quiz-labels', { answers });
    await language(a.page, 'ko', a.demo);
    await expect(a.page.locator('h1')).toContainText(/[가-힣]/);
    assert.deepEqual(await a.page.locator('.answer-option').allTextContents(), answers);
    record('verification', 'quiz-answer-bytes-unchanged', { answers: answers.length, submitted: false });
  },
  proctored: async (a) => {
    // Production builds remove console.info; observe the runtime kill-switch state.
    await a.page.goto(a.baseUrl + '/certification-exam', { waitUntil: 'networkidle' });
    await expect
      .poll(
        async () => {
          const s = await evalInContentWorld(a.context, 'snapshot', null, a.page.url());
          return s?.init === true && s?.sb === null;
        },
        { timeout: 10000 },
      )
      .toBe(true);
    await expect(a.page.locator('#skillbridge-fab')).not.toBeVisible();
    await expect(a.page.locator('#si18n-header-lang-select')).not.toBeVisible();
    record('verification', 'read-certification-disabled-state', {
      internalRead: 'snapshot: initialized sentinel true, product instance absent (early kill switch)',
      submitted: false,
    });
  },
  hero: async (a) => {
    await korean(a);
    await tutor(a);
    await save(a);
  },
};
module.exports = { scenarios, events, record };
