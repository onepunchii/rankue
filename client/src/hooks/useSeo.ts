import { useEffect } from "react";
import type { Locale } from "@/lib/i18n";

// SPA 라우트/언어 전환 시 <head> 메타를 갱신한다. Google 등 JS 렌더링 크롤러가
// 페이지별·언어별 title/description/canonical/OG를 정확히 읽게 하기 위함.
const ORIGIN = "https://www.rankue.co.kr";
const OG_LOCALE: Record<Locale, string> = {
  ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES",
};

interface SeoOptions {
  title: string;
  description: string;
  path: string; // 예: "/about"
  locale?: Locale;
  image?: string;
}

function upsertMeta(attr: "name" | "property", key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content);
}

function upsertLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.setAttribute("rel", rel);
    document.head.appendChild(el);
  }
  el.setAttribute("href", href);
}

export function useSeo({ title, description, path, locale = "ko", image }: SeoOptions) {
  useEffect(() => {
    const url = ORIGIN + path;
    document.title = title;
    upsertMeta("name", "description", description);
    upsertLink("canonical", url);
    upsertMeta("property", "og:title", title);
    upsertMeta("property", "og:description", description);
    upsertMeta("property", "og:url", url);
    upsertMeta("property", "og:locale", OG_LOCALE[locale] ?? "ko_KR");
    upsertMeta("name", "twitter:title", title);
    upsertMeta("name", "twitter:description", description);
    upsertMeta("name", "twitter:url", url);
    if (image) {
      upsertMeta("property", "og:image", image);
      upsertMeta("name", "twitter:image", image);
    }
    document.documentElement.lang = locale;
  }, [title, description, path, locale, image]);
}
