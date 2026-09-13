const { createStore } = require('../src/shared/learning-records');
const { createClient } = require('../src/lib/learning-record-client');
const { createIndex } = require('../src/lib/translation-corrections');

const clone = (value) => JSON.parse(JSON.stringify(value));
function harness(initial = {}, options = {}) {
  const state = clone(initial);
  let number = 0;
  let fail = false;
  const adapter = {
    get: async (keys) => Object.fromEntries(keys.filter((key) => key in state).map((key) => [key, clone(state[key])])),
    set: async (data) => {
      if (fail) throw new Error('disk unavailable');
      Object.assign(state, clone(data));
    },
  };
  const store = createStore(adapter, { makeId: () => `record-${++number}`, ...options });
  const client = () => createClient({ send: store.dispatch, makeId: () => `request-${++number}` });
  return {
    state,
    adapter,
    store,
    client,
    setFailure: (value) => {
      fail = value;
    },
  };
}
const note = (url, text) => ({ url: `https://academy.claude.com/courses/course/${url}`, text, title: url });
const report = (correction = '교정문') => ({
  url: 'https://academy.claude.com/courses/course/lesson',
  reportSchemaVersion: 1,
  capture: 'selection',
  signal: 'negative',
  originalText: 'An exact source.',
  translatedText: '원래 번역',
  selectedText: '원래 번역',
  correction,
  lang: 'ko',
});

test('independent clients cannot overwrite each other on add, edit, or delete', async () => {
  const h = harness();
  const a = h.client();
  const b = h.client();
  await Promise.all([a.refresh('notes'), b.refresh('notes')]);
  const [one, two] = await Promise.all([
    a.request('notes', { operation: 'create', record: note('one', 'A') }),
    b.request('notes', { operation: 'create', record: note('two', 'B') }),
  ]);
  expect(h.state.sb_notes).toHaveLength(2);
  const [edited] = await Promise.all([
    a.request('notes', {
      operation: 'update',
      recordId: one.record.recordId,
      expectedRevision: 1,
      patch: { text: 'A edited' },
    }),
    b.request('notes', { operation: 'delete', recordId: two.record.recordId, expectedRevision: 1 }),
  ]);
  expect(h.state.sb_notes).toEqual([edited.record]);
  await expect(
    b.request('notes', {
      operation: 'update',
      recordId: one.record.recordId,
      expectedRevision: 1,
      patch: { text: 'stale' },
    }),
  ).rejects.toMatchObject({ code: 'CONFLICT' });
  expect(h.state.sb_notes[0].text).toBe('A edited');
});

test('simultaneous creation for the same lesson preserves the winner and refuses the unseen overwrite', async () => {
  const h = harness();
  const clients = [h.client(), h.client()];
  const results = await Promise.allSettled(
    clients.map((client, i) => client.request('notes', { operation: 'create', record: note('same', `text ${i}`) })),
  );
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(results.find((result) => result.status === 'rejected').reason.code).toBe('CONFLICT');
  expect(h.state.sb_notes).toHaveLength(1);
});

test('an acknowledgement waits for durable storage and failed saves leave both views unchanged', async () => {
  const h = harness();
  const client = h.client();
  const snapshots = [];
  client.subscribe('notes', (snapshot) => snapshots.push(snapshot));
  let release;
  const blocked = createStore({
    get: h.adapter.get,
    set: (data) =>
      new Promise((resolve) => {
        release = async () => {
          await h.adapter.set(data);
          resolve();
        };
      }),
  });
  let answered = false;
  const pending = blocked
    .dispatch({
      type: 'LEARNING_RECORDS',
      collection: 'notes',
      requestId: 'pending-request',
      operation: 'create',
      record: note('one', 'A'),
    })
    .then((response) => {
      answered = true;
      return response;
    });
  for (let i = 0; i < 8; i++) await Promise.resolve();
  expect(answered).toBe(false);
  expect(h.state.sb_notes).toBeUndefined();
  await release();
  expect((await pending).ok).toBe(true);
  await client.refresh('notes');
  h.setFailure(true);
  await expect(client.request('notes', { operation: 'create', record: note('two', 'B') })).rejects.toMatchObject({
    code: 'STORAGE',
  });
  expect(h.state.sb_notes).toHaveLength(1);
  expect(snapshots).toHaveLength(1);
  h.setFailure(false);
  await client.request('notes', { operation: 'create', record: note('two', 'B') });
  expect(h.state.sb_notes).toHaveLength(2);
});

test('replaying an acknowledged mutation after a worker restart does not duplicate it', async () => {
  const h = harness();
  const request = {
    type: 'LEARNING_RECORDS',
    collection: 'notes',
    requestId: 'durable-request',
    operation: 'create',
    record: note('one', 'A'),
  };
  const first = await h.store.dispatch(request);
  const restarted = createStore(h.adapter);
  const replay = await restarted.dispatch(clone(request));
  expect(replay.ok).toBe(true);
  expect(replay.record).toEqual(first.record);
  expect(h.state.sb_notes).toHaveLength(1);
  expect((await restarted.dispatch({ ...request, record: note('other', 'wrong') })).code).toBe('INVALID');
});

test('legacy records receive stable identifiers with an untouched recovery copy', async () => {
  const legacy = [
    note('one', 'old text'),
    { ...note('two', 'another old text'), id: 'canonical-lesson-id', custom: { keep: true } },
  ];
  const h = harness({ sb_notes: legacy });
  const client = h.client();
  const first = await client.refresh('notes');
  const second = await client.refresh('notes');
  expect(first.records).toEqual(second.records);
  expect(new Set(first.records.map((row) => row.recordId)).size).toBe(2);
  expect(first.records[1]).toMatchObject(legacy[1]);
  expect(h.state.sb_learning_record_legacy_backup.notes.records).toEqual(legacy);
});

test('capacity errors never evict an older note and unknown storage is never replaced', async () => {
  const h = harness({}, { limit: 1 });
  const client = h.client();
  await client.request('notes', { operation: 'create', record: note('one', 'keep') });
  await expect(client.request('notes', { operation: 'create', record: note('two', 'new') })).rejects.toMatchObject({
    code: 'LIMIT',
  });
  expect(h.state.sb_notes[0].text).toBe('keep');
  const corrupt = harness({ sb_notes: 'recover me' });
  await expect(corrupt.client().refresh('notes')).rejects.toMatchObject({ code: 'INVALID_STORAGE' });
  expect(corrupt.state.sb_notes).toBe('recover me');
});

test('an older acknowledgement cannot roll a tab back over its newer snapshot', async () => {
  const waiting = [];
  const client = createClient({
    send: (request) => new Promise((resolve) => waiting.push({ request, resolve })),
    makeId: () => `request-${waiting.length}`,
  });
  const versions = [];
  client.subscribe('notes', (snapshot) => versions.push(snapshot.version));
  const first = client.refresh('notes');
  const second = client.refresh('notes');
  waiting[1].resolve({ ok: true, requestId: waiting[1].request.requestId, records: [], record: null, version: 2 });
  await second;
  waiting[0].resolve({ ok: true, requestId: waiting[0].request.requestId, records: [], record: null, version: 1 });
  await first;
  expect(versions).toEqual([2]);
});

test('review, apply, replace and revert keep evidence while the exact matching rule changes', async () => {
  const h = harness();
  const client = h.client();
  const a = (await client.request('reports', { operation: 'create', record: report() })).record;
  expect(createIndex(h.state.sb_term_reports).lookup('An exact source.', 'ko')).toBeNull();
  const applied = (
    await client.request('reports', {
      operation: 'update',
      recordId: a.recordId,
      expectedRevision: 1,
      patch: { correctionStatus: 'applied' },
    })
  ).record;
  expect(createIndex(h.state.sb_term_reports).lookup('An exact source.', 'ko')).toBe('교정문');
  expect(createIndex(h.state.sb_term_reports).lookup('A different source.', 'ko')).toBeNull();
  expect(createIndex(h.state.sb_term_reports).lookup('An exact source.', 'ja')).toBeNull();
  const b = (await client.request('reports', { operation: 'create', record: report('다음 교정문') })).record;
  const next = (
    await client.request('reports', {
      operation: 'update',
      recordId: b.recordId,
      expectedRevision: 1,
      patch: { correctionStatus: 'applied' },
    })
  ).record;
  expect(h.state.sb_term_reports.filter((row) => row.correctionStatus === 'applied')).toHaveLength(1);
  expect(h.state.sb_term_reports.find((row) => row.recordId === applied.recordId).revision).toBe(3);
  await client.request('reports', {
    operation: 'update',
    recordId: next.recordId,
    expectedRevision: 2,
    patch: { correctionStatus: 'reverted' },
  });
  expect(createIndex(h.state.sb_term_reports).lookup('An exact source.', 'ko')).toBeNull();
  expect(h.state.sb_term_reports).toHaveLength(2);
  expect(h.state.sb_term_reports[0].correctionHistory.map((entry) => entry.action)).toEqual(['applied', 'reverted']);
});

test('editing an applied correction requires a new review and manual reports cannot be applied', async () => {
  const h = harness();
  const client = h.client();
  const a = (await client.request('reports', { operation: 'create', record: report() })).record;
  await client.request('reports', {
    operation: 'update',
    recordId: a.recordId,
    expectedRevision: 1,
    patch: { correctionStatus: 'applied' },
  });
  await client.request('reports', {
    operation: 'update',
    recordId: a.recordId,
    expectedRevision: 2,
    patch: { correction: 'Unreviewed replacement' },
  });
  expect(createIndex(h.state.sb_term_reports).lookup('An exact source.', 'ko')).toBeNull();
  await expect(
    client.request('reports', {
      operation: 'create',
      record: { ...report(), capture: 'manual', correctionStatus: 'applied' },
    }),
  ).rejects.toMatchObject({ code: 'INVALID' });
});
