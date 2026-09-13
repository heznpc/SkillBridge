/** Production queue and client connected through an in-memory Chrome adapter. */
const { createStore } = require('../../src/shared/learning-records');
const { createClient } = require('../../src/lib/learning-record-client');
const feedback = require('../../src/lib/translation-feedback');
function attachLearningRecords(sb, chrome) {
  let ready;
  const store = createStore(
    {
      async get(keys) {
        const data = await new Promise((resolve, reject) =>
          chrome.storage.local.get(keys, (value) =>
            chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve(value),
          ),
        );
        if (!ready) ready = sb.identity?.ready?.() || Promise.resolve();
        await ready;
        return data;
      },
      set: (data) =>
        new Promise((resolve, reject) =>
          chrome.storage.local.set(data, () =>
            chrome.runtime.lastError
              ? reject(new Error(`Term reports write failed: ${chrome.runtime.lastError.message}`))
              : resolve(),
          ),
        ),
    },
    {
      normalize(collection, rows) {
        const normalized =
          collection === 'reports' ? rows.flatMap((row) => feedback.normalizeReports([row]).records) : rows;
        if (!sb.identity) return normalized;
        return normalized.map((row) =>
          collection === 'reports' && row.reportSchemaVersion !== 1 ? row : sb.identity.migrate([row]).records[0],
        );
      },
    },
  );
  sb.records = createClient({ send: store.dispatch });
  sb.showRecordError = (error) => console.warn('[SkillBridge] Term reports storage unavailable:', error.message);
  return store;
}
module.exports = { attachLearningRecords };
