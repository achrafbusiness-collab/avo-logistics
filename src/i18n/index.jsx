import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { appClient } from "@/api/appClient";
import de from "@/locales/de.json";
import en from "@/locales/en.json";
import es from "@/locales/es.json";
import ar from "@/locales/ar.json";

const dictionaries = { de, en, es, ar };
export const SUPPORTED_LANGUAGES = Object.keys(dictionaries);
export const FALLBACK_LANGUAGE = "de";
const LOCALE_MAP = {
  de: "de-DE",
  en: "en-GB",
  es: "es-ES",
  ar: "ar",
};

const I18nContext = createContext({
  language: FALLBACK_LANGUAGE,
  dir: "ltr",
  t: (key) => key,
  getValue: () => null,
  setLanguage: async () => {},
  formatDate: () => "",
  formatDateTime: () => "",
  formatTime: () => "",
  formatNumber: () => "",
});

const getNestedValue = (source, key) => {
  if (!source || !key) return undefined;
  return key.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), source);
};

const normalizeLanguage = (value) => {
  if (!value || typeof value !== "string") return null;
  const lower = value.toLowerCase();
  if (lower.startsWith("de")) return "de";
  if (lower.startsWith("en")) return "en";
  if (lower.startsWith("es")) return "es";
  if (lower.startsWith("ar")) return "ar";
  if (SUPPORTED_LANGUAGES.includes(lower)) return lower;
  return null;
};

const detectBrowserLanguage = () => {
  if (typeof navigator === "undefined") return null;
  const candidates = [navigator.language, ...(navigator.languages || [])].filter(Boolean);
  for (const candidate of candidates) {
    const normalized = normalizeLanguage(candidate);
    if (normalized) return normalized;
  }
  return null;
};

const interpolate = (template, vars) => {
  if (!vars) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (vars[key] === undefined || vars[key] === null) return match;
    return String(vars[key]);
  });
};

export function I18nProvider({ children }) {
  const [language, setLanguageState] = useState(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem("avo-driver-language") : null;
    return normalizeLanguage(stored) || FALLBACK_LANGUAGE;
  });

  useEffect(() => {
    document.documentElement.setAttribute("lang", LOCALE_MAP[language] || language);
    window.localStorage.setItem("avo-driver-language", language);
  }, [language]);

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      let selected = language;
      try {
        const currentUser = await appClient.auth.getCurrentUser();
        const profileLanguage = normalizeLanguage(currentUser?.language);
        if (profileLanguage) {
          selected = profileLanguage;
        } else {
          const detected = detectBrowserLanguage();
          if (detected) {
            selected = detected;
          }
          if (currentUser?.id) {
            await supabase.from("profiles").update({ language: selected }).eq("id", currentUser.id);
          }
        }
      } catch (error) {
        console.warn("Language bootstrap failed", error);
      }
      if (mounted) {
        setLanguageState(selected);
      }
    };
    init();
    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = useCallback(async (nextLanguage) => {
    const normalized = normalizeLanguage(nextLanguage) || FALLBACK_LANGUAGE;
    setLanguageState(normalized);
    try {
      const { data } = await supabase.auth.getSession();
      const user = data?.session?.user;
      if (user?.id) {
        await supabase.from("profiles").update({ language: normalized }).eq("id", user.id);
      }
    } catch (error) {
      console.warn("Language persist failed", error);
    }
  }, []);

  const getValue = useCallback(
    (key) => {
      const primary = getNestedValue(dictionaries[language], key);
      if (primary !== undefined) return primary;
      const fallback = getNestedValue(dictionaries[FALLBACK_LANGUAGE], key);
      return fallback !== undefined ? fallback : null;
    },
    [language]
  );

  const t = useCallback(
    (key, vars) => {
      const value = getValue(key);
      if (typeof value === "string") {
        return interpolate(value, vars);
      }
      if (value === null || value === undefined) return key;
      return String(value);
    },
    [getValue]
  );

  const formatDate = useCallback(
    (date, options) => {
      if (!date) return "";
      const parsed = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(parsed.getTime())) return "";
      const formatter = new Intl.DateTimeFormat(LOCALE_MAP[language] || language, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        ...options,
      });
      return formatter.format(parsed);
    },
    [language]
  );

  const formatTime = useCallback(
    (date, options) => {
      if (!date) return "";
      const parsed = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(parsed.getTime())) return "";
      const formatter = new Intl.DateTimeFormat(LOCALE_MAP[language] || language, {
        hour: "2-digit",
        minute: "2-digit",
        ...options,
      });
      return formatter.format(parsed);
    },
    [language]
  );

  const formatDateTime = useCallback(
    (date, options) => {
      if (!date) return "";
      const parsed = date instanceof Date ? date : new Date(date);
      if (Number.isNaN(parsed.getTime())) return "";
      const formatter = new Intl.DateTimeFormat(LOCALE_MAP[language] || language, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        ...options,
      });
      return formatter.format(parsed);
    },
    [language]
  );

  const formatNumber = useCallback(
    (value, options) => {
      if (value === null || value === undefined || value === "") return "";
      const formatter = new Intl.NumberFormat(LOCALE_MAP[language] || language, options);
      return formatter.format(value);
    },
    [language]
  );

  const contextValue = useMemo(
    () => ({
      language,
      dir: language === "ar" ? "rtl" : "ltr",
      t,
      getValue,
      setLanguage,
      formatDate,
      formatDateTime,
      formatTime,
      formatNumber,
    }),
    [formatDate, formatDateTime, formatNumber, formatTime, getValue, language, setLanguage, t]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
