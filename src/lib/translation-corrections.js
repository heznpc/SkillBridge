// @ts-check
/** Only reviewed local corrections for an exact source/language pair apply. */
/* global module */
(function () {
  'use strict';
  /** @param {import('../types/learning-records').RecordData[]} records */
  function createIndex(records) {
    /** @type {Map<string, string>} */
    const entries = new Map();
    const ordered = records
      .slice()
      .sort((a, b) => Number(a.correctionAppliedAt || 0) - Number(b.correctionAppliedAt || 0));
    for (const record of ordered) {
      if (
        record.reportSchemaVersion !== 1 ||
        record.capture !== 'selection' ||
        record.correctionStatus !== 'applied' ||
        !record.originalText?.trim() ||
        !record.correction?.trim() ||
        !record.lang ||
        record.lang === 'en'
      )
        continue;
      entries.set(JSON.stringify([record.originalText.trim(), record.lang]), record.correction.trim());
    }
    return {
      /** @param {string} original @param {string} lang */
      lookup: (original, lang) => entries.get(JSON.stringify([original.trim(), lang])) || null,
      fingerprint: JSON.stringify([...entries].sort(([a], [b]) => a.localeCompare(b))),
    };
  }
  const api = { createIndex };
  Object.assign(globalThis, { SB_TRANSLATION_CORRECTIONS: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
