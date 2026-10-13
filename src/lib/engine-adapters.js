/** Existing engine boundaries. Selection and consent remain with the caller. */
/* global module */
(function () {
  'use strict';

  function createGoogleAdapter({ sendMessage, getContracts, getProtectedTerms, reportAvailability }) {
    return {
      async translate(text, targetLang, options = {}) {
        try {
          const pt = options.protectedTerms !== undefined ? options.protectedTerms : getProtectedTerms(targetLang);
          const masked = pt?.maskProtectedTerms ? pt.maskProtectedTerms(text.trim()) : null;
          const contracts = getContracts();
          const response = await sendMessage(
            contracts.singleRequest(masked?.tokens.length ? masked.text : text.trim(), targetLang),
          );
          const translated = contracts.singleResponse(response);
          if (translated) {
            reportAvailability(true, 'single');
            if (!masked?.tokens.length) return translated;
            try {
              return pt.unmaskProtectedTerms(translated, masked);
            } catch (err) {
              console.warn('[SkillBridge] Protected-term unmask failed:', err.message);
              return null;
            }
          }
          reportAvailability(false, 'single');
          return null;
        } catch (err) {
          console.warn('[SkillBridge] Google Translate failed:', err.message);
          reportAvailability(false, 'single');
          return null;
        }
      },

      async translateBatch(texts, targetLang, options = {}) {
        try {
          const pt = options.protectedTerms !== undefined ? options.protectedTerms : getProtectedTerms(targetLang);
          const trimmed = texts.map((text) => text.trim());
          // Masks belong to individual entries, including their token indices.
          const masks = pt?.maskProtectedTerms ? trimmed.map((text) => pt.maskProtectedTerms(text)) : null;
          const contracts = getContracts();
          const response = await sendMessage(
            contracts.batchRequest(
              masks ? masks.map((mask, i) => (mask.tokens.length ? mask.text : trimmed[i])) : trimmed,
              targetLang,
            ),
          );
          const translations = contracts.batchResponse(response, texts.length);
          if (translations) {
            reportAvailability(true, 'batch');
            if (!masks) return translations;
            return translations.map((translated, i) => {
              if (!masks[i].tokens.length) return translated;
              try {
                return pt.unmaskProtectedTerms(translated, masks[i]) ?? texts[i];
              } catch (err) {
                console.warn('[SkillBridge] Protected-term batch unmask failed:', err.message);
                return texts[i];
              }
            });
          }
          reportAvailability(false, 'batch');
          return texts;
        } catch (err) {
          console.warn('[SkillBridge] Google Translate batch failed:', err.message);
          reportAvailability(false, 'batch');
          return texts;
        }
      },
    };
  }

  // The existing Port owners retain cancellation, reconnect and watchdog state.
  // These adapters pass request options through without choosing another engine.
  // Stream transports call options.assertCurrent, when present, after async
  // setup/reconnect and immediately before sending the request to their model.
  function createLocalAdapter({ stream }) {
    return { stream: ({ prompt, onChunk, options = {} }) => stream(prompt, onChunk, options) };
  }

  function createCloudAdapter({ stream }) {
    return {
      stream: ({ prompt, targetLang, onChunk, options = {} }) => stream(prompt, targetLang, onChunk, options),
    };
  }

  const api = { createGoogleAdapter, createLocalAdapter, createCloudAdapter };
  globalThis.SB_ENGINE_ADAPTERS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
