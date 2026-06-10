import { createI18n } from 'vue-i18n';
import en from './locales/en';
import zh from './locales/zh';

export type AppLocale = 'en' | 'zh';

const LOCALE_STORAGE_KEY = 'exam-system-locale';

function readStoredLocale(): AppLocale {
  const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
  if (stored === 'en' || stored === 'zh') return stored;
  const browser = navigator.language.toLowerCase();
  return browser.startsWith('zh') ? 'zh' : 'en';
}

export function persistLocale(locale: AppLocale) {
  localStorage.setItem(LOCALE_STORAGE_KEY, locale);
}

export const i18n = createI18n({
  legacy: false,
  locale: readStoredLocale(),
  fallbackLocale: 'en',
  messages: { en, zh },
});

export function setAppLocale(locale: AppLocale) {
  i18n.global.locale.value = locale;
  persistLocale(locale);
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
}

setAppLocale(i18n.global.locale.value as AppLocale);
