// ============================================================
// i18n Configuration
//
// Initializes i18next with React bindings and bundled locale
// files. Language selection is stored in settingsStore and
// synced here on change.
// ============================================================

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import zh from "./locales/zh.json";

const resources = {
  en: { translation: en },
  zh: { translation: zh },
};

i18n.use(initReactI18next).init({
  resources,
  lng: "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false, // React already escapes
  },
  react: {
    useSuspense: false, // Avoid suspense boundaries for simple translations
  },
});

/**
 * Change the active language at runtime.
 * Called from settingsStore when the user changes the language preference.
 */
export function changeLanguage(lng: string) {
  i18n.changeLanguage(lng);
}

export default i18n;
