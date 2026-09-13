/** The service worker is the only writer for feedback, bookmarks and notes. */
(function () {
  'use strict';
  const identity = globalThis._sbLessonIdentity;
  const feedback = globalThis._sbTranslationFeedback;
  let resolver = identity.createIdentityResolver(null);
  const ready = fetch(chrome.runtime.getURL('src/shared/canonical-lessons.json'))
    .then((response) => {
      if (!response.ok) throw new Error(`Identity table HTTP ${response.status}`);
      return response.json();
    })
    .then((table) => {
      const candidate = identity.createIdentityResolver(table);
      if (!candidate.validationErrors().length) resolver = candidate;
    })
    .catch((error) => console.warn('[SkillBridge] Learning records retain URL identity:', error.message));

  const store = globalThis.SB_LEARNING_RECORDS.createStore(
    {
      async get(keys) {
        await ready;
        return chrome.storage.local.get(keys);
      },
      set: (data) => chrome.storage.local.set(data),
    },
    {
      normalize(collection, rows) {
        const normalized =
          collection === 'reports' ? rows.flatMap((row) => feedback.normalizeReports([row]).records) : rows;
        return normalized.map((row) => {
          if (collection === 'reports' && row.reportSchemaVersion !== feedback.REPORT_SCHEMA_VERSION) return row;
          return identity.migrateRecords([row], resolver).records[0] || row;
        });
      },
    },
  );
  globalThis.SB_LEARNING_STORE = store;
})();
