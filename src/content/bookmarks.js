/**
 * SkillBridge — Bookmarks panel (lesson + scroll-position bookmarks).
 *
 * Native Academy only bookmarks whole courses and offers no list view.
 * This adds per-lesson, per-position bookmarks: mark the current lesson at
 * the current scroll position, see them all in a sidebar sub-panel, and jump
 * back (best-effort scroll restore via sessionStorage across the navigation).
 *
 * Local-only: state lives in `chrome.storage.local` under `sb_bookmarks`.
 * No server, no sync (device-local by design).
 *
 * Loaded after chat-subpanels.js (provides `_sb._chat.state` + `closeSubPanel`)
 * and parallels chat-history.js / chat-flashcards.js. The sidebar "bookmark"
 * button (sidebar-chat.js) calls `_sb._chat.toggleBookmarksPanel`.
 */

(function () {
  'use strict';

  const sb = window._sb;
  if (!sb) {
    console.warn('[SkillBridge] bookmarks: _sb not ready');
    return;
  }
  if (!sb._chat || !sb._chat.state || !sb._chat.openSubPanel) {
    console.warn('[SkillBridge] bookmarks: _sb._chat not ready (chat-subpanels.js missing?)');
    return;
  }
  const records = sb.records;
  if (!records) return;
  const RESTORE_KEY = 'sb_bookmark_restore';

  let bookmarks = [];

  // ============================================================
  // SCROLL RESTORE (runs once on load if we navigated here from a bookmark)
  // ============================================================

  try {
    const raw = window.sessionStorage.getItem(RESTORE_KEY);
    if (raw) {
      window.sessionStorage.removeItem(RESTORE_KEY);
      const r = JSON.parse(raw);
      if (r && r.url === location.href && typeof r.scrollY === 'number') {
        // Wait for content (and translation) to settle before scrolling.
        setTimeout(() => window.scrollTo({ top: r.scrollY, behavior: 'smooth' }), 700);
      }
    }
  } catch (_e) {
    /* sessionStorage unavailable or malformed — ignore */
  }

  // ============================================================
  // PERSISTENCE (chrome.storage.local)
  // ============================================================

  records.subscribe('bookmarks', (snapshot) => {
    bookmarks = snapshot.records;
    renderList();
  });
  function loadBookmarks() {
    return records.refresh('bookmarks').catch((error) => sb.showRecordError(error, sb.$id('si18n-bm-list')));
  }

  /** True when `b` bookmarks the page we are on, on either platform. */
  function isCurrent(b) {
    if (!sb.identity) return b.url === location.href;
    return sb.identity.recordIdentity(b) === sb.identity.identityOf(location);
  }

  async function addCurrent() {
    const url = location.href;
    const title = (document.title || '').trim() || sb.$('h1')?.textContent?.trim() || url;
    const existing = bookmarks.find(isCurrent);
    const entry = { url, title, scrollY: Math.round(window.scrollY), ts: Date.now() };
    const record = sb.identity ? sb.identity.stamp(entry, url) : entry;
    try {
      await records.request(
        'bookmarks',
        existing
          ? { operation: 'update', recordId: existing.recordId, expectedRevision: existing.revision, patch: record }
          : { operation: 'create', record },
      );
    } catch (error) {
      sb.showRecordError(error, sb.$id('si18n-bm-list'));
    }
  }

  function removeRecord(target) {
    return records
      .request('bookmarks', { operation: 'delete', recordId: target.recordId, expectedRevision: target.revision })
      .catch((error) => sb.showRecordError(error, sb.$id('si18n-bm-list')));
  }

  function openBookmark(i) {
    const b = bookmarks[i];
    if (!b) return;
    // The same lesson on the platform the learner is browsing now, when the
    // identity table knows it; the bookmark's own URL otherwise.
    const target = (sb.identity ? sb.identity.openUrlFor(b, location) : b.url) || b.url;
    try {
      // Keyed to the URL we are actually navigating to, so the scroll restore
      // on arrival still recognises the page.
      window.sessionStorage.setItem(RESTORE_KEY, JSON.stringify({ url: target, scrollY: b.scrollY }));
    } catch (_e) {
      /* ignore — navigation still works, just without scroll restore */
    }
    if (isCurrent(b)) {
      window.scrollTo({ top: b.scrollY, behavior: 'smooth' });
    } else if (/^https?:/i.test(target)) {
      // Match the https-only gate the dashboard open handler already applies, so
      // a dangerous-scheme URL can never reach location.href even if a future
      // write path (import/sync) ever populates sb_bookmarks from elsewhere.
      location.href = target;
    }
  }

  // ============================================================
  // PANEL
  // ============================================================

  function toggleBookmarksPanel() {
    const opened = sb._chat.openSubPanel(
      'bookmarks',
      `
      <div class="si18n-history-header">
        <button class="si18n-history-back" id="si18n-bm-back" aria-label="${sb.t(A11Y_LABELS.backToSidebar)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg></button>
        <span class="si18n-history-title">${sb.t(BOOKMARK_LABELS.title)}</span>
        <button class="si18n-history-clear" id="si18n-bm-add" title="${sb.t(BOOKMARK_LABELS.addThis)}"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
      </div>
      <div class="si18n-history-list" id="si18n-bm-list"></div>
    `,
      () => {
        sb.$id('si18n-bm-back')?.addEventListener('click', () => sb._chat.closeSubPanel());
        sb.$id('si18n-bm-add')?.addEventListener('click', addCurrent);
      },
    );
    if (!opened) return;
    loadBookmarks();
  }

  function rowsHTML() {
    if (bookmarks.length === 0) {
      return `<div class="si18n-history-empty">${sb.t(BOOKMARK_LABELS.empty)}</div>`;
    }
    return bookmarks
      .map(
        (b, i) => `
      <div class="si18n-bm-item">
        <button class="si18n-bm-open" data-i="${i}" title="${sb.escapeHtml(b.url)}">
          <span class="si18n-bm-title">${sb.escapeHtml(b.title)}</span>
        </button>
        <button class="si18n-bm-remove" data-i="${i}" aria-label="${sb.t(BOOKMARK_LABELS.remove)}">&times;</button>
      </div>`,
      )
      .join('');
  }

  function renderList() {
    const list = sb.$id('si18n-bm-list');
    if (!list) return;
    list.replaceChildren();
    list.insertAdjacentHTML('afterbegin', rowsHTML());
    list
      .querySelectorAll('.si18n-bm-open')
      .forEach((el) => el.addEventListener('click', () => openBookmark(Number(el.dataset.i))));
    list.querySelectorAll('.si18n-bm-remove').forEach((el) => {
      const target = bookmarks[Number(el.dataset.i)];
      el.addEventListener('click', () => removeRecord(target));
    });
  }

  // ============================================================
  // EXPORT
  // ============================================================

  sb.toggleBookmarksPanel = toggleBookmarksPanel;
  sb._chat.toggleBookmarksPanel = toggleBookmarksPanel;
  sb.registerModule?.('bookmarks');
})();
