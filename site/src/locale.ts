import { buildInfo } from './data/build-info';

export type Locale = (typeof buildInfo.supportedLanguages)[number]['code'];
export const locales: Locale[] = ['en', ...buildInfo.supportedLanguages.map(({ code }) => code).filter((code) => code !== 'en')];
export const languageNames = Object.fromEntries(buildInfo.supportedLanguages.map(({ code, label }) => [code, label])) as Record<Locale, string>;

export function isLocale(value: string): value is Locale {
  return locales.some((locale) => locale === value);
}

export function localePath(locale: Locale, base: string) {
  const root = base.endsWith('/') ? base : `${base}/`;
  return locale === 'en' ? root : `${root}${locale}/`;
}

export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const tag = language.toLowerCase();
    const exact = locales.find((locale) => locale.toLowerCase() === tag);
    if (exact) return exact;
    if (/^zh(?:-|$)/.test(tag)) return /-(tw|hk|mo|hant)(-|$)/.test(tag) ? 'zh-TW' : 'zh-CN';
    const primary = tag.split('-')[0];
    if (primary === 'nb' || primary === 'nn') return 'no';
    if (primary === 'fil') return 'tl';
    if (isLocale(primary)) return primary;
  }
  return 'en';
}

export function direction(locale: Locale) {
  return locale === 'ar' || locale === 'he' ? 'rtl' : 'ltr';
}

export function formatText(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => String(values[key] ?? token));
}
