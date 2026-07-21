/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// 랭큐 i18n — mapix 구조 이식(클라이언트 사전 + 언어별 동적 로드).
// 감지 우선순위: URL ?lang= → 저장된 선택 → 기기(브라우저) 언어 → 영어.
// 3쿠션 강국 기준 1차 언어: ko(원본)·en·vi(베트남)·tr(터키)·es(스페인·중남미)

export type Locale = "ko" | "en" | "vi" | "tr" | "es";
export const LOCALES: { code: Locale; label: string }[] = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "vi", label: "Tiếng Việt" },
  { code: "tr", label: "Türkçe" },
  { code: "es", label: "Español" },
];

export type Dict = Record<string, string>;

// 한국어는 UI 원문 그대로(사전 불필요) — 키가 없으면 ko 폴백 문자열을 그대로 출력
import { ko } from "./ko";

const LOADERS: Record<Exclude<Locale, "ko">, () => Promise<{ default: Dict }>> = {
  en: () => import("./en"),
  vi: () => import("./vi"),
  tr: () => import("./tr"),
  es: () => import("./es"),
};

const VALID = new Set<Locale>(["ko", "en", "vi", "tr", "es"]);
const STORAGE = "rankue-locale";

/** 기기(브라우저) 언어 → 지원 로케일. 미지원 언어는 영어. */
export function detectLocale(): Locale {
  if (typeof navigator === "undefined") return "ko";
  const l = (navigator.language || "").toLowerCase();
  if (l.startsWith("ko")) return "ko";
  if (l.startsWith("vi")) return "vi";
  if (l.startsWith("tr")) return "tr";
  if (l.startsWith("es")) return "es";
  return "en";
}

type Ctx = { locale: Locale; t: (key: string) => string; setLocale: (l: Locale) => void };
const I18nCtx = createContext<Ctx>({ locale: "ko", t: (k) => ko[k] ?? k, setLocale: () => {} });

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("ko");
  const [dicts, setDicts] = useState<Partial<Record<Locale, Dict>>>({ ko });
  const dictsRef = useRef(dicts);
  dictsRef.current = dicts;

  const ensure = useCallback(async (l: Locale, attempt = 0) => {
    if (l === "ko" || dictsRef.current[l]) return;
    try {
      const m = await LOADERS[l]();
      setDicts((prev) => (prev[l] ? prev : { ...prev, [l]: m.default }));
    } catch {
      if (attempt < 3) setTimeout(() => ensure(l, attempt + 1), 1500 * (attempt + 1));
    }
  }, []);

  useEffect(() => {
    let target: Locale;
    let fromUrl: string | null = null;
    try { fromUrl = new URLSearchParams(window.location.search).get("lang"); } catch { /* ignore */ }
    if (fromUrl && VALID.has(fromUrl as Locale)) {
      target = fromUrl as Locale;
      try { localStorage.setItem(STORAGE, target); } catch { /* ignore */ }
    } else {
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORAGE); } catch { /* ignore */ }
      target = saved && VALID.has(saved as Locale) ? (saved as Locale) : detectLocale();
    }
    setLocaleState(target);
    void ensure(target);
  }, [ensure]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try { localStorage.setItem(STORAGE, l); } catch { /* ignore */ }
    void ensure(l);
  }, [ensure]);

  const t = useCallback((key: string): string => {
    if (locale === "ko") return ko[key] ?? key;
    return dictsRef.current[locale]?.[key] ?? ko[key] ?? key;
  }, [locale, dicts]); // eslint-disable-line react-hooks/exhaustive-deps

  return <I18nCtx.Provider value={{ locale, t, setLocale }}>{children}</I18nCtx.Provider>;
}

export function useT() {
  return useContext(I18nCtx);
}
