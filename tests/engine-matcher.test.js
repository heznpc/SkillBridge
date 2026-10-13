/* global describe, test, expect, jest */
const { EngineRegistry, matchEngine, languageMatches, settingsRevision } = require('../src/lib/engine-matcher');

const request = (targetLang, task = 'translation') => ({ sourceLang: 'en', targetLang, task });
const profile = {
  id: 'example-device',
  location: 'device',
  operations: {
    translation: { source: ['en'], target: ['fr', 'ja', 'pt-BR'] },
    explanation: { source: ['en'], target: ['de'] },
  },
};
const ready = { online: false, engines: { 'example-device': { available: true } } };

describe('engine capability matching', () => {
  test('one settings listener tracks language/model/consent changes but ignores unrelated notes', () => {
    let changed;
    const event = {
      addListener: jest.fn((listener) => {
        changed = listener;
      }),
    };
    expect(settingsRevision(event)).toBe(0);
    changed({ sb_local_model: {} }, 'local');
    expect(settingsRevision(event)).toBe(1);
    changed({ sb_refine_consent: {} }, 'local');
    expect(settingsRevision(event)).toBe(2);
    changed({ lessonNotes: {} }, 'local');
    changed({ targetLanguage: {} }, 'sync');
    expect(settingsRevision(event)).toBe(2);
    expect(event.addListener).toHaveBeenCalledTimes(1);
  });

  test('matches the requested language per task without excluding the whole engine', () => {
    expect(matchEngine(profile, request('fr'), ready).status).toBe('ready');
    expect(matchEngine(profile, request('ja'), ready).canAttempt).toBe(true);
    expect(matchEngine(profile, request('de', 'explanation'), ready).canAttempt).toBe(true);
    expect(matchEngine(profile, request('fr', 'explanation'), ready).reasons).toContain('target-unsupported');
    expect(matchEngine(profile, request('ko'), ready).canAttempt).toBe(false);
  });

  test('language support can differ for a model and a source/target pair', () => {
    const engine = { id: 'pair-model', location: 'device', operations: { translation: {} } };
    const environment = {
      engines: {
        'pair-model': {
          available: true,
          operations: { translation: { pairs: [{ source: 'de', target: 'fr' }] } },
        },
      },
    };
    expect(matchEngine(engine, { ...request('fr'), sourceLang: 'de' }, environment).status).toBe('ready');
    expect(matchEngine(engine, request('fr'), environment).reasons).toContain('language-pair-unsupported');
  });

  test('normalizes case and separators without silently losing region or script', () => {
    expect(languageMatches('pt_br', 'pt-BR')).toBe(true);
    expect(languageMatches('zh-TW', 'zh-CN')).toBe(false);
    expect(languageMatches('zh-Hant', 'zh')).toBe(false);
    expect(languageMatches('zh-Hant', 'zh-*')).toBe(true);
    expect(languageMatches('', '*')).toBe(false);
  });

  test('unknown model language support stays visible but is never labelled ready', () => {
    const engine = { id: 'user-model', location: 'loopback', operations: { explanation: {} } };
    for (const language of ['ko', 'ar', 'nl', 'zh-Hant']) {
      const result = matchEngine(engine, request(language, 'explanation'));
      expect(result.status).toBe('unverified');
      expect(result.canAttempt).toBe(true);
      expect(result.reasons).toContain('target-language-unverified');
    }
  });

  test('offline blocks remote work while device and loopback candidates remain usable', () => {
    expect(matchEngine({ ...profile, location: 'remote' }, request('fr'), ready).reasons).toContain('offline');
    expect(matchEngine(profile, request('fr'), ready).canAttempt).toBe(true);
    expect(matchEngine({ ...profile, location: 'loopback' }, request('fr'), ready).canAttempt).toBe(true);
  });

  test.each(['required', 'denied', 'unknown'])('a %s permission never authorizes execution', (permission) => {
    const result = matchEngine({ ...profile, permission: true }, request('fr'), {
      engines: { [profile.id]: { available: true, permission } },
    });
    expect(result.canAttempt).toBe(false);
    expect(result.reasons.join(' ')).toContain('permission');
  });

  test('keeps permission, feature, memory, model and policy failures distinguishable', () => {
    const result = matchEngine({ ...profile, features: ['native-bridge'], minMemoryGB: 8 }, request('fr'), {
      memoryGB: 4,
      engines: {
        [profile.id]: {
          allowed: false,
          available: true,
          model: 'downloadable',
          features: { 'native-bridge': false },
        },
      },
    });
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'policy-blocked',
        'model-not-ready',
        'feature-unavailable:native-bridge',
        'insufficient-memory',
      ]),
    );
  });

  test('off or an unknown selection cannot silently choose another available engine', () => {
    const registry = new EngineRegistry();
    registry.register(profile, { translate: jest.fn() });
    for (const selectedEngine of ['off', 'not-installed']) {
      const result = registry.match({ ...request('fr'), selectedEngine }, ready);
      expect(result.selected).toBeNull();
      expect(result.candidates).toHaveLength(1);
    }
  });

  test('descriptors and each result own immutable snapshots', () => {
    const registry = new EngineRegistry();
    const mutable = { id: 'custom', operations: { translation: { source: ['en'], target: ['fr'] } } };
    registry.register(mutable, {});
    mutable.operations.translation.target.push('ja');
    const old = registry.match(request('fr'));
    expect(registry.match(request('ja')).candidates[0].canAttempt).toBe(false);
    expect(Object.isFrozen(old.request)).toBe(true);
    expect(Object.isFrozen(old.candidates[0].reasons)).toBe(true);
    expect(() => registry.register(mutable, {})).toThrow('already registered');
  });

  test('late observations belong to their request and never replace newer matching state', async () => {
    const registry = new EngineRegistry();
    let finishOld;
    registry.register(profile, {
      inspect: (input) =>
        input.targetLang === 'fr'
          ? new Promise((resolve) => {
              finishOld = resolve;
            })
          : { available: true },
    });
    const old = registry.inspect(request('fr'));
    const current = await registry.inspect(request('ja'));
    expect(current[profile.id].available).toBe(true);
    finishOld({ available: false });
    expect((await old)[profile.id].available).toBe(false);
    expect(current[profile.id].available).toBe(true);
  });

  test('a stalled provider inspection returns unknown evidence without starting its stream', async () => {
    jest.useFakeTimers();
    const registry = new EngineRegistry();
    const stream = jest.fn();
    registry.register(profile, { inspect: () => new Promise(() => {}), stream });
    try {
      const pending = registry.inspect(request('fr'));
      await jest.advanceTimersByTimeAsync(1500);
      expect(await pending).toEqual({ [profile.id]: {} });
      expect(stream).not.toHaveBeenCalled();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
