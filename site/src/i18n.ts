import english from './locales/en.json';
import { buildInfo } from './data/build-info';
import { locales, formatText, type Locale } from './locale';

export { locales, localePath, languageNames, direction, type Locale } from './locale';
export type LandingCopy = typeof english;

const modules = import.meta.glob<LandingCopy>('./locales/*.json', { eager: true, import: 'default' });

// Fail the static build on missing copy; an English fallback would hide an unfinished locale.
function assertCopy(reference: unknown, candidate: unknown, path: string): void {
  if (typeof reference === 'string') {
    if (typeof candidate !== 'string' || !candidate.trim()) throw new Error(`Missing landing translation: ${path}`);
    const tokens = (value: string) => JSON.stringify((value.match(/\{\w+\}/g) ?? []).sort());
    if (tokens(reference) !== tokens(candidate)) throw new Error(`Invalid landing placeholders: ${path}`);
    return;
  }
  if (!candidate || typeof candidate !== 'object' || Array.isArray(reference) !== Array.isArray(candidate)) {
    throw new Error(`Invalid landing translation structure: ${path}`);
  }
  const expected = reference as Record<string, unknown>;
  const actual = candidate as Record<string, unknown>;
  if (Object.keys(expected).sort().join('|') !== Object.keys(actual).sort().join('|')) throw new Error(`Mismatched landing keys: ${path}`);
  for (const key of Object.keys(expected)) assertCopy(expected[key], actual[key], `${path}.${key}`);
}

const copy = Object.fromEntries(locales.map((locale) => {
  const translated = modules[`./locales/${locale}.json`];
  assertCopy(english, translated, locale);
  return [locale, translated];
})) as Record<Locale, LandingCopy>;

export function getCopy(locale: Locale): LandingCopy {
  const strings = copy[locale];
  const values = { version: buildInfo.version, count: buildInfo.languageCount };
  return {
    ...strings,
    ui: Object.fromEntries(Object.entries(strings.ui).map(([key, value]) => [key, formatText(value, values)])) as LandingCopy['ui'],
  };
}

// Only lesson samples, not every page's entire dictionary, are shipped for the demo.
export const lessonSamples = Object.fromEntries(locales.map((locale) => [locale, copy[locale].sample])) as Record<Locale, LandingCopy['sample']>;
