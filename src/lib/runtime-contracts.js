// @ts-check
/** Checked boundaries for translation messages and asynchronous page changes. */
/* global module */
(function () {
  'use strict';
  /** @typedef {{type: 'GOOGLE_TRANSLATE', text: string, targetLang: string, sourceLang: string} | {type: 'GOOGLE_TRANSLATE_BATCH', texts: string[], targetLang: string, sourceLang: string}} TranslationRequest */
  /** @typedef {{readonly href: string, readonly language: string, readonly generation: number}} PageState */
  /** @param {unknown} raw @returns {raw is Record<string, unknown>} */
  const object = (raw) => raw !== null && typeof raw === 'object' && !Array.isArray(raw);
  /** @param {unknown} value @returns {value is string} */
  const language = (value) => typeof value === 'string' && /^[a-z]{2,3}(?:-[A-Za-z]{2,8})?$/.test(value);
  /** @param {unknown} raw @returns {TranslationRequest|null} */
  function translationRequest(raw) {
    if (!object(raw) || !language(raw.targetLang) || (raw.sourceLang != null && !language(raw.sourceLang))) return null;
    const sourceLang = typeof raw.sourceLang === 'string' ? raw.sourceLang : 'en';
    if (raw.type === 'GOOGLE_TRANSLATE' && typeof raw.text === 'string' && raw.text.length <= 100000) {
      return { type: raw.type, text: raw.text, targetLang: raw.targetLang, sourceLang };
    }
    if (
      raw.type === 'GOOGLE_TRANSLATE_BATCH' &&
      Array.isArray(raw.texts) &&
      raw.texts.length <= 500 &&
      raw.texts.every((text) => typeof text === 'string' && text.length <= 100000)
    ) {
      return { type: raw.type, texts: raw.texts, targetLang: raw.targetLang, sourceLang };
    }
    return null;
  }
  /** @param {string} text @param {string} targetLang @returns {TranslationRequest} */
  function singleRequest(text, targetLang) {
    return { type: 'GOOGLE_TRANSLATE', text, targetLang, sourceLang: 'en' };
  }
  /** @param {string[]} texts @param {string} targetLang @returns {TranslationRequest} */
  function batchRequest(texts, targetLang) {
    return { type: 'GOOGLE_TRANSLATE_BATCH', texts, targetLang, sourceLang: 'en' };
  }
  /** @param {unknown} raw @returns {string|null} */
  function singleResponse(raw) {
    return object(raw) && raw.ok === true && typeof raw.translated === 'string' && raw.translated.length > 0
      ? raw.translated
      : null;
  }
  /** @param {unknown} raw @param {number} count @returns {string[]|null} */
  function batchResponse(raw, count) {
    return object(raw) &&
      raw.ok === true &&
      Array.isArray(raw.translations) &&
      raw.translations.length === count &&
      raw.translations.every((text) => typeof text === 'string' && text.length > 0)
      ? raw.translations
      : null;
  }
  /** @param {() => string} readHref */
  function createPageState(readHref) {
    let generation = 0;
    return {
      /** @param {string} target @returns {PageState} */
      begin(target) {
        if (!language(target)) throw new Error('Invalid target language');
        return Object.freeze({ href: readHref(), language: target, generation: ++generation });
      },
      /** @param {PageState} token @param {string} currentLanguage */
      isCurrent(token, currentLanguage) {
        return token.generation === generation && token.href === readHref() && token.language === currentLanguage;
      },
      invalidate() {
        generation += 1;
      },
    };
  }
  const api = { translationRequest, singleRequest, batchRequest, singleResponse, batchResponse, createPageState };
  Object.assign(globalThis, { SB_RUNTIME_CONTRACTS: api });
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
