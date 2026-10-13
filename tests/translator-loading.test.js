/* global describe, test, expect, jest */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');

describe('translator classic-script loading', () => {
  test('manifest loads the dictionary and engine boundaries without CommonJS or test-setup globals', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
    const sources = new Set([
      'src/lib/runtime-contracts.js',
      'src/lib/dictionary-store.js',
      'src/lib/engine-adapters.js',
      'src/lib/translator.js',
    ]);
    const sendMessage = jest.fn(async () => ({ ok: true, translated: 'Bonjour' }));
    const context = vm.createContext({
      window: {},
      console,
      PREMIUM_LANGUAGE_CODES: ['fr'],
      SUPPORTED_LANGUAGE_MAP: { fr: 'French' },
      chrome: { runtime: { sendMessage } },
    });
    for (const source of manifest.content_scripts[0].js.filter((file) => sources.has(file))) {
      vm.runInContext(fs.readFileSync(path.join(ROOT, source), 'utf8'), context, { filename: source });
      // Instantiate at the translator's actual load position, so a missing or
      // later dependency cannot be hidden by the Jest setup module loader.
      if (source === 'src/lib/translator.js') context.translator = new context.window.SkilljarTranslator();
    }

    expect(context.translator).toBeDefined();
    await expect(context.translator.translate('Hello', 'fr')).resolves.toEqual({ text: 'Bonjour', source: 'google' });
    expect(sendMessage).toHaveBeenCalledWith({
      type: 'GOOGLE_TRANSLATE',
      text: 'Hello',
      sourceLang: 'en',
      targetLang: 'fr',
    });
  });
});
