// @ts-check
/** Connect the small panel record interface to the extension service worker. */
(function () {
  'use strict';
  const sb = /** @type {import('../types/learning-records').RecordPage | undefined} */ (Reflect.get(window, '_sb'));
  if (!sb) return;
  const core = /** @type {typeof import('../lib/learning-record-client')} */ (
    Reflect.get(globalThis, 'SB_LEARNING_RECORD_CLIENT')
  );
  const chromeApi = /** @type {import('../types/learning-records').ChromeRecordsApi} */ (
    Reflect.get(globalThis, 'chrome')
  );
  const client = core.createClient({
    send: (request) =>
      new Promise((resolve, reject) => {
        chromeApi.runtime.sendMessage(request, (response) => {
          const error = chromeApi.runtime.lastError;
          if (error) reject(new Error(error.message));
          else if (!response) reject(new Error('Learning record acknowledgement was lost'));
          else resolve(response);
        });
      }),
  });
  sb.records = client;
  /** @type {Record<string, import('../types/learning-records').Collection>} */
  const collections = { sb_term_reports: 'reports', sb_bookmarks: 'bookmarks', sb_notes: 'notes' };
  chromeApi.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, collection] of Object.entries(collections)) {
      if (changes[key])
        client.refresh(collection).catch((error) => console.warn('[SkillBridge] Record refresh:', error.message));
    }
  });
  sb.showRecordError = (error, host) => {
    console.warn('[SkillBridge] Learning record:', error.message);
    const target = host || sb.$id('si18n-subpanel');
    if (!target) return;
    /** @type {HTMLParagraphElement | null} */
    let message = target.querySelector('p[data-record-error]');
    if (!message) {
      message = document.createElement('p');
      message.dataset.recordError = 'true';
      message.setAttribute('role', 'alert');
      target.prepend(message);
    }
    message.textContent =
      error.code === 'CONFLICT'
        ? sb.t({
            en: 'This record changed in another tab. Your text is still here. Reopen the record to review the latest version before saving.',
            ko: '다른 탭에서 기록이 변경되었습니다. 작성한 내용은 유지됩니다. 기록을 다시 열어 최신 내용을 확인한 뒤 저장해 주세요.',
          })
        : error.code === 'LIMIT'
          ? sb.t({
              en: 'The record limit is full. Export or remove an older record, then save again. Your text is still here.',
              ko: '저장 가능한 기록 수가 가득 찼습니다. 기존 기록을 내보내거나 삭제한 뒤 다시 저장해 주세요. 작성한 내용은 유지됩니다.',
            })
          : sb.t({
              en: 'Could not save. Your text is still here. Please try again.',
              ko: '저장하지 못했습니다. 작성한 내용은 유지됩니다. 다시 시도해 주세요.',
            });
  };
  sb.registerModule?.('learning-records');
})();
