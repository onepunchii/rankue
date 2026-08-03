import { useEffect } from "react";

// SPA 라우트/언어 전환 시 <head> 메타를 갱신한다. Google 등 JS 렌더링 크롤러가
// 페이지별·언어별 title/description/canonical/OG를 정확히 읽게 하기 위함.
const ORIGIN = "https://www.rankue.co.kr";
const OG_LOCALE: Record<string, string> = {
  ko: "ko_KR", en: "en_US", vi: "vi_VN", tr: "tr_TR", es: "es_ES", ja: "ja_JP", zh: "zh_CN",
};

interface SeoOptions {
  title: string;
  description: string;
  path: string; // 예: "/about"
  locale?: string;
  image?: string;
  jsonLd?: object | null; // 페이지별 구조화데이터(LocalBusiness 등)
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

const PAGE_LD_ID = "page-jsonld";

// null 을 허용한다: 서버 데이터가 도착해야 제목을 정할 수 있는 페이지(/club/:id 등)가
// 훅을 조건부로 호출하지 않고도 "아직 정할 수 없음"을 표현할 수 있게 하기 위함이다.
// 그동안에는 client/index.html 의 기본 메타가 그대로 유지된다.
export function useSeo(opts: SeoOptions | null) {
  const { title, description, path, locale = "ko", image, jsonLd } = opts ?? ({} as Partial<SeoOptions>);
  useEffect(() => {
    if (!title || !description || !path) return;
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

    // 페이지별 JSON-LD 주입 (라우트 이탈 시 제거)
    const existing = document.getElementById(PAGE_LD_ID);
    if (existing) existing.remove();
    if (jsonLd) {
      const s = document.createElement("script");
      s.type = "application/ld+json";
      s.id = PAGE_LD_ID;
      s.textContent = JSON.stringify(jsonLd);
      document.head.appendChild(s);
    }
    return () => {
      document.getElementById(PAGE_LD_ID)?.remove();
    };
  }, [title, description, path, locale, image, jsonLd]);
}
