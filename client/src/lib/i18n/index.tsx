/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// 랭큐 i18n — mapix 구조 이식(클라이언트 사전 + 언어별 동적 로드).
// 감지 우선순위: URL ?lang= → 저장된 선택 → 기기(브라우저) 언어 → 영어.
// 3쿠션 강국 기준 1차 언어: ko(원본)·en·vi(베트남)·tr(터키)·es(스페인·중남미)

export type Locale = "ko" | "en" | "vi" | "tr" | "es";
/** label 은 그 언어의 자기 이름(고르는 사람이 읽을 수 있어야 한다), sub 는 지금 언어로 본 이름의 사전 키. */
export const LOCALES: { code: Locale; label: string; sub: string }[] = [
  { code: "ko", label: "한국어", sub: "lang.ko" },
  { code: "en", label: "English", sub: "lang.en" },
  { code: "vi", label: "Tiếng Việt", sub: "lang.vi" },
  { code: "tr", label: "Türkçe", sub: "lang.tr" },
  { code: "es", label: "Español", sub: "lang.es" },
];

// 훅을 못 쓰는 곳(게스트 닉네임 생성·팀 이름·상금 단위)이 현재 언어를 읽는다. Provider 가 바뀔 때마다 갱신한다.
let currentLocale: Locale = "ko";
export function getLocale(): Locale { return currentLocale; }

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

/** 주소의 ?lang= 이 지원 언어면 그 값, 아니면 null. */
function localeFromUrl(): Locale | null {
  try {
    const v = new URLSearchParams(window.location.search).get("lang");
    return v && VALID.has(v as Locale) ? (v as Locale) : null;
  } catch { return null; }
}

/**
 * 첫 그림에 쓸 언어 — 읽기만 한다(저장은 아래 effect 가 한다). 순서는 위 주석 그대로: URL ?lang= → 저장된 선택 → 기기 언어.
 *
 * 예전에는 "ko" 로 시작하고 붙은 뒤 effect 에서 진짜 언어로 바꿨다. 그래서 다른 언어 회원의 **첫 그림은 늘 한국어 판정**이었고,
 * "한국어 화면에서만"인 것들이 한 번씩 켜졌다 — 2026-10-05 카카오 로그인 검토: 영어·베트남어 회원이 /settings 를 직접 열면
 * 카카오 줄이 한 번 그려지고 카카오 SDK 가 실렸다(자식의 effect 는 그 그림의 값으로 돈다 — 실린 스크립트는 되돌릴 수 없다).
 * 이 앱은 createRoot 만 쓴다(hydrateRoot 없음) — 서버가 그린 것과 맞출 일이 없어 처음부터 진짜 언어로 시작해도 된다.
 * 사전이 아직 안 왔을 때 t() 가 한국어로 떨어지는 것은 예전과 같다.
 */
function resolveInitialLocale(): Locale {
  if (typeof window === "undefined") return "ko";
  const fromUrl = localeFromUrl();
  if (fromUrl) return fromUrl;
  let saved: string | null = null;
  try { saved = localStorage.getItem(STORAGE); } catch { /* ignore */ }
  return saved && VALID.has(saved as Locale) ? (saved as Locale) : detectLocale();
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(resolveInitialLocale);
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

  // 붙을 때 한 번: 부작용만 한다 — ?lang= 으로 온 언어를 저장하고, 첫 언어의 사전을 싣는다(언어 자체는 위에서 이미 정했다).
  useEffect(() => {
    const fromUrl = localeFromUrl();
    if (fromUrl) { try { localStorage.setItem(STORAGE, fromUrl); } catch { /* ignore */ } }
    const target = fromUrl ?? resolveInitialLocale();
    setLocaleState(target);
    void ensure(target);
  }, [ensure]);
  useEffect(() => { currentLocale = locale; document.documentElement.lang = locale; }, [locale]);

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
