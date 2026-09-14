/**
 * SkillBridge content lifecycle helpers.
 *
 * Loaded before content.js. This file intentionally exposes factory functions
 * instead of touching window._sb so the namespace can still be constructed in
 * one place.
 */

(function () {
  'use strict';

  function createAIGateController({ detectAITrainingContent, warn = console.warn } = {}) {
    let paused = false;
    let verdict = null;

    function evaluate({ logPause = false } = {}) {
      try {
        // `??` (not `||`) so an explicit `{ isAI: false }` is honored. Only a
        // missing detector falls through to the gate-missing default.
        verdict = detectAITrainingContent?.() ?? {
          isAI: true,
          reason: 'gate-missing',
          hits: 0,
        };
        if (verdict.reason === 'gate-missing') {
          warn(
            '[SkillBridge] AI-content gate is not wired (window._sbPlatform missing). ' +
              'Check manifest.content_scripts[].js includes src/lib/platform.js. ' +
              'Failing open: extension will activate as if no gate existed.',
          );
        }
        // Defensive: only an explicit `false` pauses. Future signature drift
        // must not silently pause the extension on real AI pages.
        paused = verdict.isAI === false;
        if (paused && logPause) {
          warn(
            `[SkillBridge] Non-AI Skilljar tenant detected (${verdict.reason}). ` +
              `Extension paused on this site - gated to AI-training content per ` +
              `the standing non-goal "Adding other Skilljar customers". ` +
              `SPA route changes will re-check this gate automatically.`,
          );
        }
      } catch (err) {
        warn('[SkillBridge] AI-content gate failed open:', err?.message);
        paused = false;
        verdict = { isAI: true, reason: 'gate-error', hits: 0 };
      }
      return verdict;
    }

    return {
      evaluate,
      get paused() {
        return paused;
      },
      get verdict() {
        return verdict;
      },
    };
  }

  function createActivationQueue({ isActive, onError = console.warn } = {}) {
    const callbacks = [];

    function whenActive(callback) {
      if (typeof callback !== 'function') return;
      if (isActive?.() !== false) {
        callback();
        return;
      }
      callbacks.push(callback);
    }

    function run() {
      const pending = callbacks.splice(0);
      for (const cb of pending) {
        try {
          cb();
        } catch (err) {
          onError('[SkillBridge] Deferred activation callback failed:', err?.message);
        }
      }
    }

    return { whenActive, run };
  }

  function createRouteController({
    getHref,
    navigationObject = window.navigation,
    scheduleInterval = setInterval,
    cancelInterval = clearInterval,
    addWindowListener = (...args) => window.addEventListener(...args),
    removeWindowListener = (...args) => window.removeEventListener(...args),
    isCertificationHref,
    teardownCertificationSurface,
    evaluateGate,
    isGatePaused,
    isInitStarted,
    init,
    teardownNonAIContentSurface,
    rehydrateAfterGateResume,
    cancelActiveStream,
    reenableAfterCertificationSurface,
    ensureObserver,
    ensureSubtitleManager,
    redetectExamPage,
    redetectPageLocale,
    reapplyTranslations,
    onPageHide,
    logInfo = console.info,
  } = {}) {
    let lastHref = getHref?.() || location.href;
    let started = false;
    let routePoll = null;

    function onRouteChange() {
      const href = getHref?.() || location.href;
      if (href === lastHref) return;
      lastHref = href;

      // Certification pages must win over the generic AI-content gate. They are
      // intentionally non-AI by content, but require the stronger cert teardown.
      if (isCertificationHref?.(href)) {
        teardownCertificationSurface?.();
        logInfo('[SkillBridge] Navigated to certification page - extension disabled.');
        return;
      }

      const wasPaused = !!isGatePaused?.();
      evaluateGate?.({ logPause: true });
      if (isGatePaused?.()) {
        if (!wasPaused && isInitStarted?.()) teardownNonAIContentSurface?.();
        return;
      }
      if (wasPaused && !isInitStarted?.()) {
        init?.();
        return;
      }
      if (wasPaused && isInitStarted?.()) {
        rehydrateAfterGateResume?.();
      }

      cancelActiveStream?.();
      reenableAfterCertificationSurface?.();
      ensureObserver?.();
      ensureSubtitleManager?.();
      redetectExamPage?.();
      // The locale can move with the route on a site that ships official
      // locales (Academy encodes it as the first path segment), and the
      // translation policy depends on it. Re-read before anything decides
      // what to send.
      redetectPageLocale?.();
      reapplyTranslations?.();
    }

    function start() {
      if (started) return;
      started = true;
      addWindowListener('popstate', onRouteChange);
      addWindowListener('hashchange', onRouteChange);
      addWindowListener('pagehide', stop);

      // A content script's History wrapper cannot observe page-world calls.
      // The browser's Navigation event crosses that isolated-world boundary
      // and fires after the URL changes, before the new lesson DOM is ready.
      if (navigationObject?.addEventListener) {
        navigationObject.addEventListener('currententrychange', onRouteChange);
      } else {
        // Older Firefox versions have no Navigation API. Read the shared URL
        // without injecting page-world code or requesting another permission.
        routePoll = scheduleInterval(onRouteChange, 250);
      }
    }

    function stop() {
      if (!started) return;
      started = false;
      removeWindowListener('popstate', onRouteChange);
      removeWindowListener('hashchange', onRouteChange);
      removeWindowListener('pagehide', stop);
      navigationObject?.removeEventListener?.('currententrychange', onRouteChange);
      if (routePoll !== null) cancelInterval(routePoll);
      routePoll = null;
      onPageHide?.();
    }

    return { start, stop, onRouteChange };
  }

  window._sbContentLifecycle = {
    createAIGateController,
    createActivationQueue,
    createRouteController,
  };
})();
