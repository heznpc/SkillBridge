/** @jest-environment jsdom */

/* global describe, test, expect, jest */

const fs = require('fs');
const path = require('path');
const { createPageState } = require('../src/lib/runtime-contracts');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'content', 'content.js'), 'utf8');

function extract(name) {
  const start = source.search(new RegExp(`  (?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`Missing production function: ${name}`);
  const end = source.indexOf('\n  }\n', start);
  if (end < 0) throw new Error(`Missing production function end: ${name}`);
  return source.slice(start, end + 4);
}

function harness({ pendingRequests = [] } = {}) {
  const loc = { href: 'https://academy.claude.com/courses/example/lesson' };
  const pageState = createPageState(() => loc.href);
  const dictionaryLoads = [];
  let dictionaryStarted;
  const firstDictionaryLoad = new Promise((resolve) => {
    dictionaryStarted = resolve;
  });
  const translator = {
    staticDict: { Previous: '이전' },
    initializeCache: async () => {},
    initialize: async () => {},
    invalidateStaticTranslations: jest.fn(),
    loadStaticTranslations: jest.fn(
      (lang) =>
        new Promise((resolve, reject) => {
          dictionaryLoads.push({ lang, resolve, reject });
          dictionaryStarted(lang);
        }),
    ),
  };
  const sb = {
    translator,
    hostCaps: {},
    localization: { setTarget: jest.fn() },
    _gt: { gtGeneration: 0, reset: jest.fn(), applyStaticTranslations: jest.fn() },
    invalidateCodeCommentTranslations: jest.fn(),
    updateLocalizedLabels: jest.fn(),
    refreshOfflineBanner: jest.fn(),
    hideTranslationProgress: jest.fn(),
  };
  sb._gt.reset.mockImplementation(() => sb._gt.gtGeneration++);
  const subtitleManager = { setLanguage: jest.fn() };
  const chrome = {
    storage: {
      local: {
        set: jest.fn(),
        get: async () => ({ targetLanguage: 'en', autoTranslate: false, welcomeShown: true }),
      },
    },
  };
  const fakeWindow = { _sb: sb, _protectedTerms: { resetProtectedTerms: jest.fn() } };
  const logs = { warn: jest.fn(), error: jest.fn() };
  const functions = [
    'transitionLanguage',
    'translatePage',
    'switchLanguage',
    'restoreOriginal',
    'scheduleLateTranslation',
    'init',
  ]
    .map(extract)
    .join('\n');
  const timers = [];
  const api = new Function(
    'translator',
    'sb',
    'pageState',
    'subtitleManager',
    'chrome',
    'window',
    'location',
    'setTimeout',
    'pendingRequests',
    'console',
    `let currentLang = 'ko';
     let initStarted = false;
     let isReady = false;
     let isExamPage = false;
     let commentTranslateEnabled = false;
     const isOffline = false;
     const aiGate = { paused: false };
     const assessmentLifecycle = { override: () => false };
     const messageRouter = { drainPendingTranslateRequests: () => pendingRequests };
     function SkilljarTranslator() { return translator; }
     function runActivationCallbacks() {}
     function ensureSubtitleManager() {}
     const originalTexts = new Map();
     const translatedTexts = new Map();
     const originalComments = new Map();
     const domTranslationObserver = { resetPending() {}, observe() {} };
     const SKILLBRIDGE_DELAYS = { LATE_CONTENT: 100 };
     function updateLangClass() {}
     ${functions}
     return { init, transitionLanguage, translatePage, switchLanguage, restoreOriginal, scheduleLateTranslation,
       originalTexts, currentLang: () => currentLang };`,
  )(
    translator,
    sb,
    pageState,
    subtitleManager,
    chrome,
    fakeWindow,
    loc,
    (callback) => timers.push(callback),
    pendingRequests,
    logs,
  );
  return { ...api, sb, translator, dictionaryLoads, firstDictionaryLoad, subtitleManager, chrome, loc, timers, logs };
}

describe('content language transitions', () => {
  test('initialization applies only the latest queued language through the regular transition', async () => {
    const h = harness({
      pendingRequests: [
        { action: 'translatePage', language: 'ko' },
        { action: 'translatePage', language: 'ja' },
      ],
    });
    const initializing = h.init();
    // init catches its own errors. If it exits before reaching the queued
    // translation, fail this assertion instead of waiting for a missing load.
    expect(await Promise.race([h.firstDictionaryLoad, initializing.then(() => null)])).toBe('ja');
    expect(h.dictionaryLoads.map(({ lang }) => lang)).toEqual(['ja']);
    h.dictionaryLoads[0].resolve();
    await initializing;
    expect(h.currentLang()).toBe('ja');
    expect(h.sb.localization.setTarget).toHaveBeenLastCalledWith('ja');
    expect(h.sb._gt.applyStaticTranslations.mock.calls).toEqual([['ja']]);
    expect(h.logs.error).not.toHaveBeenCalled();
  });

  test('startup can load a target without translating and a later popup request loads its own dictionary', async () => {
    const h = harness();
    const initial = h.transitionLanguage('ko', { skipRestore: true, applyTranslations: false });
    h.dictionaryLoads[0].resolve();
    await initial;
    expect(h.sb._gt.applyStaticTranslations).not.toHaveBeenCalled();

    const popup = h.translatePage('ja');
    expect(h.dictionaryLoads.map(({ lang }) => lang)).toEqual(['ko', 'ja']);
    expect(h.sb.localization.setTarget).toHaveBeenLastCalledWith('ja');
    h.dictionaryLoads[1].resolve();
    await popup;
    expect(h.sb._gt.applyStaticTranslations).toHaveBeenCalledWith('ja');
    expect(h.chrome.storage.local.set).not.toHaveBeenCalled();
    expect(h.subtitleManager.setLanguage).not.toHaveBeenCalled();
  });

  test('out-of-order language loads apply only the latest request', async () => {
    const h = harness();
    const older = h.translatePage('ko');
    const newer = h.translatePage('ja');
    h.dictionaryLoads[1].resolve();
    await newer;
    h.dictionaryLoads[0].resolve();
    await older;
    expect(h.currentLang()).toBe('ja');
    expect(h.sb._gt.applyStaticTranslations.mock.calls).toEqual([['ja']]);
  });

  test('English restoration invalidates a pending language load and restores recorded DOM', async () => {
    const h = harness();
    const pending = h.translatePage('ja');
    const translated = document.createElement('p');
    translated.textContent = '번역';
    document.body.appendChild(translated);
    h.originalTexts.set(translated, 'Original');
    await h.translatePage('en');
    h.dictionaryLoads[0].resolve();
    await pending;
    expect(translated.innerHTML).toBe('Original');
    expect(h.currentLang()).toBe('en');
    expect(h.translator.invalidateStaticTranslations).toHaveBeenLastCalledWith('en');
    expect(h.sb.localization.setTarget).toHaveBeenLastCalledWith('en');
    expect(h.sb._gt.applyStaticTranslations).not.toHaveBeenCalled();
    expect(h.sb.invalidateCodeCommentTranslations).toHaveBeenCalled();
  });

  test('switchLanguage retains storage, labels, subtitles and completion callback behavior', async () => {
    const h = harness();
    const onDone = jest.fn();
    const pending = h.switchLanguage('ja', { extraStorage: { welcomeShown: true }, onDone });
    expect(h.chrome.storage.local.set).toHaveBeenCalledWith({
      targetLanguage: 'ja',
      autoTranslate: true,
      welcomeShown: true,
    });
    h.dictionaryLoads[0].resolve();
    await pending;
    expect(h.sb.updateLocalizedLabels).toHaveBeenCalledTimes(1);
    expect(h.subtitleManager.setLanguage).toHaveBeenCalledWith('ja');
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  test('a superseded English switch cannot reset subtitles after a newer target starts', async () => {
    const h = harness();
    const english = h.switchLanguage('en');
    const japanese = h.switchLanguage('ja');
    await english;
    expect(h.subtitleManager.setLanguage).not.toHaveBeenCalled();
    h.dictionaryLoads[0].resolve();
    await japanese;
    expect(h.subtitleManager.setLanguage.mock.calls).toEqual([['ja']]);
  });

  test.each(['language', 'route'])('a delayed DOM pass is dropped after a %s change', async (change) => {
    const h = harness();
    h.scheduleLateTranslation();
    if (change === 'language') await h.translatePage('en');
    else h.loc.href += '/next';
    h.timers[0]();
    expect(h.sb._gt.applyStaticTranslations).not.toHaveBeenCalled();
  });
});
