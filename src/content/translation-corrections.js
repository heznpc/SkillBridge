// @ts-check
/** Refresh visible lessons when a reviewed local correction changes in any tab. */
(function () {
  'use strict';
  const sb = /** @type {import('../types/learning-records').CorrectionPage | undefined} */ (Reflect.get(window, '_sb'));
  const core = /** @type {typeof import('../lib/translation-corrections')} */ (
    Reflect.get(globalThis, 'SB_TRANSLATION_CORRECTIONS')
  );
  if (!sb?.records) return;
  let index = core.createIndex([]);
  let pending = false;
  sb.corrections = { lookup: (source, language) => index.lookup(source, language) };
  sb.records.subscribe('reports', (snapshot) => {
    const next = core.createIndex(snapshot.records);
    if (next.fingerprint === index.fingerprint) return;
    index = next;
    if (pending) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      sb.refreshTranslation().catch((error) => console.warn('[SkillBridge] Correction refresh:', error.message));
    });
  });
  sb.registerModule?.('translation-corrections');
})();
