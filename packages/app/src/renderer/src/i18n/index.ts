import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import zh from './locales/zh.json';

export const supportedLanguages = [
  { code: 'en', label: 'English' },
  { code: 'zh', label: '中文' },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]['code'];

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: 'en',
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export async function initI18nLanguage(): Promise<void> {
  try {
    const saved = await window.api.config.get<string>('general.language', 'en');
    if (saved && saved !== i18n.language) {
      await i18n.changeLanguage(saved);
    }
  } catch {
    // fallback to English
  }
}

export default i18n;
