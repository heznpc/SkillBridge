/** Real content scripts in two tabs share one service-worker record writer. */
const { test, expect } = require('@playwright/test');
const { launchExtension, closeExtension, evalInContentWorld } = require('./helpers/extension');
const { registerStubs, startFixtureServer, stopFixtureServer } = require('./helpers/network-stubs');

test('two tabs preserve feedback, bookmarks and notes through concurrent create/update/delete', async () => {
  const fixture = await startFixtureServer();
  const ext = await launchExtension();
  try {
    await registerStubs(ext.context);
    const urls = [`${fixture.baseUrl}/lesson?tab=A`, `${fixture.baseUrl}/lesson?tab=B`];
    const pages = await Promise.all(
      urls.map(async (url) => {
        const page = await ext.context.newPage();
        await page.goto(url);
        await expect.poll(async () => (await evalInContentWorld(ext.context, 'snapshot', null, url))?.sb).toBe(true);
        return page;
      }),
    );
    const request = (tab, collection, operation) =>
      evalInContentWorld(ext.context, 'learningRecordRequest', { collection, operation }, urls[tab]);
    // Reproduce the reported sequence through the actual Reports action.
    const feedback = await Promise.all(
      urls.map((url, i) =>
        evalInContentWorld(
          ext.context,
          'recordFeedback',
          {
            pair: { originalText: `Source ${i}`, translatedText: `번역 ${i}`, selectedText: `번역 ${i}` },
            signal: 'positive',
          },
          url,
        ),
      ),
    );
    expect((await request(0, 'reports', { operation: 'list' })).records).toHaveLength(2);
    expect(new Set(feedback.map((row) => row.recordId)).size).toBe(2);
    // A malformed edit must be refused at the actual runtime-message boundary;
    // acknowledging it would let the next read silently discard the report.
    const malformed = await request(1, 'reports', {
      operation: 'update',
      recordId: feedback[0].recordId,
      expectedRevision: feedback[0].revision,
      patch: { selectedText: null },
    });
    expect(malformed).toMatchObject({ ok: false, code: 'INVALID' });
    expect((await request(0, 'reports', { operation: 'list' })).records).toHaveLength(2);

    for (const collection of ['reports', 'bookmarks', 'notes']) {
      const created =
        collection === 'reports'
          ? feedback
          : await Promise.all(
              urls.map((url, i) =>
                request(i, collection, {
                  operation: 'create',
                  record: {
                    url,
                    title: `Tab ${i}`,
                    ...(collection === 'notes' ? { text: `Note ${i}` } : { scrollY: i * 100 }),
                    ts: Date.now(),
                  },
                }).then((response) => response.record),
              ),
            );
      const updated = await Promise.all(
        created.map((row, i) =>
          request(i, collection, {
            operation: 'update',
            recordId: row.recordId,
            expectedRevision: row.revision,
            patch:
              collection === 'notes'
                ? { text: `Edited ${i}` }
                : collection === 'bookmarks'
                  ? { scrollY: 500 + i }
                  : { correction: `Correction ${i}` },
          }),
        ),
      );
      const afterEdits = await request(1, collection, { operation: 'list' });
      expect(afterEdits.records).toHaveLength(2);
      expect(afterEdits.records.every((row) => row.revision === 2)).toBe(true);
      // Stale editing cannot overwrite the other tab's more recent edit.
      expect(
        await request(1, collection, {
          operation: 'update',
          recordId: created[0].recordId,
          expectedRevision: 1,
          patch: { title: 'stale' },
        }),
      ).toMatchObject({ ok: false, code: 'CONFLICT' });
      await request(0, collection, { operation: 'delete', recordId: updated[0].record.recordId, expectedRevision: 2 });
      const remaining = await request(1, collection, { operation: 'list' });
      expect(remaining.records.map((row) => row.recordId)).toEqual([updated[1].record.recordId]);
      await pages[1].reload();
      await expect.poll(async () => (await evalInContentWorld(ext.context, 'snapshot', null, urls[1]))?.sb).toBe(true);
      expect((await request(1, collection, { operation: 'list' })).records).toHaveLength(1);
      await request(1, collection, { operation: 'delete', recordId: updated[1].record.recordId, expectedRevision: 2 });
      expect((await request(0, collection, { operation: 'list' })).records).toHaveLength(0);
    }
  } finally {
    await closeExtension(ext);
    await stopFixtureServer(fixture.server);
  }
});
