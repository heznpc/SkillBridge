/**
 * @jest-environment jsdom
 */

/* global describe, test, expect, beforeEach, afterEach, jest */

const fs = require('fs');
const path = require('path');
const { readProductionSource } = require('./helpers/production-source');

const ROOT = path.join(__dirname, '..');
const read = (...parts) => fs.readFileSync(path.join(ROOT, ...parts), 'utf8');
const popupSource = readProductionSource('src', 'popup', 'popup.js');
const popupDocument = new DOMParser().parseFromString(read('src', 'popup', 'popup.html'), 'text/html');
const constants = new Function(
  `${read('src', 'shared', 'runtime-constants.js')}
   ${read('src', 'lib', 'selectors.js')}
   ${read('src', 'lib', 'constants.js')}
   return {
     SKILLBRIDGE_MODEL_LABELS, POPUP_LABELS, MENU_LABELS, COMMENT_TRANSLATE_LABELS,
     ENGINE_LABELS, REFINE_LABELS, PREMIUM_LANGUAGES, PREMIUM_LANGUAGE_CODES,
     AVAILABLE_LANGUAGES
   };`,
)();

function createChrome(initial = {}, { permissionGranted = false, probeResult = { status: 'ok' } } = {}) {
  const store = { targetLanguage: 'en', autoTranslate: false, ...initial };
  const get = jest.fn((keys, callback) => {
    const names = Array.isArray(keys) ? keys : [keys];
    const result = Object.fromEntries(names.filter((key) => key in store).map((key) => [key, store[key]]));
    if (callback) {
      callback(result);
      return undefined;
    }
    return Promise.resolve(result);
  });
  const set = jest.fn((values, callback) => {
    Object.assign(store, values);
    callback?.();
    return Promise.resolve();
  });
  return {
    chrome: {
      tabs: {
        query: jest.fn().mockResolvedValue([{ id: 7, url: 'https://anthropic.skilljar.com/lesson' }]),
        sendMessage: jest.fn((_tabId, _message, callback) => callback?.({ ready: true })),
      },
      runtime: {
        lastError: null,
        sendMessage: jest.fn().mockResolvedValue(probeResult),
      },
      storage: { local: { get, set } },
      permissions: { request: jest.fn().mockResolvedValue(permissionGranted) },
    },
    store,
  };
}

async function settlePopup() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

function loadPopup(chrome) {
  document.body.innerHTML = popupDocument.body.innerHTML;
  const names = ['chrome', ...Object.keys(constants)];
  const values = [chrome, ...Object.values(constants)];
  // A real popup document initializes once. Do not retain earlier fixtures'
  // ready listeners (and their chrome mocks) on jsdom's shared document.
  const addListener = document.addEventListener.bind(document);
  const registration = jest.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    addListener(type, listener, type === 'DOMContentLoaded' ? { once: true } : options);
  });
  try {
    new Function(...names, popupSource)(...values);
  } finally {
    registration.mockRestore();
  }
  document.dispatchEvent(new document.defaultView.Event('DOMContentLoaded'));
}

describe('popup local-engine permission flow', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    Object.defineProperty(globalThis, '__SKILLBRIDGE_AI_GATEWAY_ENABLED__', {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    delete globalThis.__SKILLBRIDGE_AI_GATEWAY_ENABLED__;
    document.body.innerHTML = '';
  });

  test.each([
    ['cloud', 'cloud'],
    ['off', 'off'],
  ])('reverts to the previous %s engine and never probes localhost', async (initialEngine, expectedEngine) => {
    const { chrome, store } = createChrome({ sb_ai_engine: initialEngine });
    loadPopup(chrome);
    await settlePopup();

    const engine = document.getElementById('engine-select');
    expect(engine.value).toBe(initialEngine);
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['http://localhost/*', 'http://127.0.0.1/*'],
    });
    expect(engine.value).toBe(expectedEngine);
    expect(store.sb_ai_engine).toBe(expectedEngine);
    expect(document.getElementById('local-config').style.display).toBe('none');
    expect(document.getElementById('local-status').textContent).toBe('');
    expect(document.getElementById('status').textContent).toBe(constants.ENGINE_LABELS.permDenied.en);
    expect(document.getElementById('status').className).toBe('status error');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('a granted selection probes the engine and re-renders its live status after a language change', async () => {
    const { chrome, store } = createChrome(
      { sb_ai_engine: 'cloud' },
      { permissionGranted: true, probeResult: { status: 'ok', models: ['fixture-model'] } },
    );
    loadPopup(chrome);
    await settlePopup();

    const engine = document.getElementById('engine-select');
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();

    expect(chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['http://localhost/*', 'http://127.0.0.1/*'],
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({ type: 'CHECK_LOCAL_ENGINE', baseUrl: undefined });
    expect(store.sb_ai_engine).toBe('local');
    expect(document.getElementById('local-status').textContent).toBe(constants.ENGINE_LABELS.statusOk.en);

    const language = document.getElementById('lang-select');
    language.value = 'ko';
    language.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();

    expect(document.getElementById('local-status').textContent).toBe(constants.ENGINE_LABELS.statusOk.ko);
  });

  test.each([false, true])('a stale permission result (%s) cannot replace a later off selection', async (granted) => {
    const { chrome, store } = createChrome({ sb_ai_engine: 'cloud' });
    let release;
    chrome.permissions.request.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    loadPopup(chrome);
    await settlePopup();
    const engine = document.getElementById('engine-select');
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    engine.value = 'off';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    release(granted);
    await settlePopup();
    expect(engine.value).toBe('off');
    expect(store.sb_ai_engine).toBe('off');
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  test('a pending rollback write cannot overtake a later off selection', async () => {
    const { chrome, store } = createChrome({ sb_ai_engine: 'cloud' });
    loadPopup(chrome);
    await settlePopup();
    let release;
    chrome.storage.local.set.mockImplementation((values) => {
      if (values.sb_ai_engine === 'cloud') {
        return new Promise((resolve) => {
          release = () => {
            Object.assign(store, values);
            resolve();
          };
        });
      }
      Object.assign(store, values);
      return Promise.resolve();
    });
    const engine = document.getElementById('engine-select');
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();
    expect(release).toBeDefined();
    engine.value = 'off';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    release();
    await settlePopup();
    expect(engine.value).toBe('off');
    expect(store.sb_ai_engine).toBe('off');
  });

  test('an old localhost probe cannot overwrite the result for a new base URL', async () => {
    const { chrome } = createChrome({ sb_ai_engine: 'cloud' }, { permissionGranted: true });
    let release;
    chrome.runtime.sendMessage.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    loadPopup(chrome);
    await settlePopup();
    const engine = document.getElementById('engine-select');
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();
    const base = document.getElementById('local-base-input');
    base.value = 'http://localhost:9999';
    base.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();
    release({ status: 'unreachable' });
    await settlePopup();
    expect(document.getElementById('local-status').textContent).toBe(constants.ENGINE_LABELS.statusOk.en);
  });

  test('reselecting local during a denied rollback preserves the previous off choice', async () => {
    const { chrome, store } = createChrome({ sb_ai_engine: 'off' });
    loadPopup(chrome);
    await settlePopup();
    let release;
    chrome.storage.local.set.mockImplementation((values) => {
      if (values.sb_ai_engine === 'off' && !release) {
        return new Promise((resolve) => {
          release = () => {
            Object.assign(store, values);
            resolve();
          };
        });
      }
      Object.assign(store, values);
      return Promise.resolve();
    });
    const engine = document.getElementById('engine-select');
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();
    expect(engine.value).toBe('off');
    expect(release).toBeDefined();
    engine.value = 'local';
    engine.dispatchEvent(new document.defaultView.Event('change'));
    await settlePopup();
    release();
    await settlePopup();
    expect(engine.value).toBe('off');
    expect(store.sb_ai_engine).toBe('off');
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith({ sb_ai_engine: 'cloud' });
  });
});
