/* global describe, test, expect, jest */
const { DictionaryStore, emptySnapshot } = require('../src/lib/dictionary-store');

describe('DictionaryStore', () => {
  test('shares only pending loads of the same language', async () => {
    let finish;
    const load = jest.fn(() => new Promise((resolve) => (finish = resolve)));
    const store = new DictionaryStore({ load });
    const first = store.load('ko');
    const second = store.load('ko');
    expect(second).toBe(first);
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    finish({ core: { Hello: '안녕하세요' } });
    const snapshot = await first;
    expect(await second).toBe(snapshot);

    load.mockResolvedValueOnce({ core: { Hello: '새 번역' } });
    expect((await store.load('ko')).entries.Hello).toBe('새 번역');
    expect(load).toHaveBeenCalledTimes(2);
  });

  test('owns immutable dictionary, lowercase and protected-term snapshots', async () => {
    const source = {
      _meta: { language: 'ko' },
      _protected: { Claude: ['클로드'] },
      core: { Hello: '안녕하세요' },
    };
    const store = new DictionaryStore({ load: async () => source });
    const snapshot = await store.load('ko');
    source.core.Hello = 'changed';
    source._protected.Claude.push('changed');
    expect(snapshot).toEqual({
      language: 'ko',
      entries: { Hello: '안녕하세요' },
      lowerEntries: { hello: '안녕하세요' },
      protectedTerms: { Claude: ['클로드'] },
    });
    for (const value of [snapshot, snapshot.entries, snapshot.lowerEntries, snapshot.protectedTerms]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(Object.isFrozen(snapshot.protectedTerms.Claude)).toBe(true);
  });

  test('keeps languages independent and permits retry after a failed load', async () => {
    const load = jest.fn((language) => {
      if (language === 'ko') throw new Error('unavailable');
      return { core: { Hello: 'Hallo' } };
    });
    const store = new DictionaryStore({ load });
    const failed = store.load('ko');
    const dutch = store.load('nl');
    await expect(failed).rejects.toThrow('unavailable');
    await expect(dutch).resolves.toMatchObject({ language: 'nl', entries: { Hello: 'Hallo' } });
    load.mockResolvedValueOnce({ core: { Hello: '안녕하세요' } });
    await expect(store.load('ko')).resolves.toMatchObject({ language: 'ko', entries: { Hello: '안녕하세요' } });
  });

  test('a missing dictionary yields an empty snapshot owned by its requested language', async () => {
    const store = new DictionaryStore({ load: async () => null });
    await expect(store.load('nl')).resolves.toEqual(emptySnapshot('nl'));
    expect(emptySnapshot('ko').protectedTerms).toBe(emptySnapshot('nl').protectedTerms);
  });
});
