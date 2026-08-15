import { useState } from "react";
import { useLocation } from "wouter";
import { useT, LOCALES, type Locale } from "@/lib/i18n";
import { useSeo } from "@/hooks/useSeo";
import { SiteFooter } from "@/components/hiq/SiteFooter";

// RANKUE 소개(About) — 공개·다국어 페이지. SEO/AEO/GEO 대상 마케팅 콘텐츠.
// 핵심 메시지 = "손안의 당구 점수판"(스마트폰으로 간편 점수 기록). RP 레이팅 같은 용어는 헤드라인에서 배제.

import { ABOUT_CONTENT as CONTENT } from "@shared/aboutContent";

// 문안 7개 언어는 shared/aboutContent.ts 가 정본이다 — 서버 프리렌더(server/prerender.ts)가
// 같은 객체를 렌더하므로, 여기에 문안을 다시 적으면 봇/사용자 출력이 갈라져 클로킹이 된다.

// About 전용 확장 언어(앱 UI는 5개, 소개 페이지는 ja·zh 마케팅 번역 포함)
const ABOUT_LOCALES: { code: string; label: string }[] = [
  ...LOCALES,
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
];
const ABOUT_CODES = new Set(ABOUT_LOCALES.map((l) => l.code));

export default function About() {
  const { locale, setLocale } = useT();
  const [, setLocation] = useLocation();

  // 소개 페이지 표시 언어: URL ?lang=(7개) 우선, 없으면 앱 로케일
  const [view, setView] = useState<string>(() => {
    try {
      const p = new URLSearchParams(window.location.search).get("lang");
      if (p && ABOUT_CODES.has(p)) return p;
    } catch { /* ignore */ }
    return locale;
  });

  const chooseLang = (code: string) => {
    setView(code);
    if (["ko", "en", "vi", "tr", "es"].includes(code)) setLocale(code as Locale); // 앱 지원 언어면 전역 동기화
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("lang", code);
      window.history.replaceState(null, "", url.toString());
    } catch { /* ignore */ }
  };

  const c = CONTENT[view] ?? CONTENT.ko;

  useSeo({
    title: c.metaTitle,
    description: c.metaDesc,
    // 언어판은 자기 URL 을 self-canonical 해야 한다. 전부 "/about" 을 가리키면 구글이
    // 6개 언어판을 "ko판의 중복"으로 보고 통째로 색인에서 뺀다.
    // server/prerender.ts 의 canonical 규칙과 **같아야** 한다(다르면 봇이 본 값과 어긋난다).
    path: view === "ko" ? "/about" : `/about?lang=${view}`,
    locale: view,
    image: "https://www.rankue.co.kr/og.png",
  });

  return (
    <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
      <div className="mx-auto max-w-2xl px-5 py-12">
        {/* 언어 선택 */}
        <div className="flex items-center gap-2 flex-wrap mb-8" aria-label={c.langLabel}>
          {ABOUT_LOCALES.map((l) => (
            <button
              key={l.code}
              onClick={() => chooseLang(l.code)}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-full transition-colors ${
                view === l.code ? "bg-brand text-white" : "bg-black/[0.05] text-black/55 hover:bg-black/[0.08]"
              }`}
            >
              {l.label}
            </button>
          ))}
        </div>

        {/* Hero */}
        <header className="mb-12">
          <img src="/icon-192.png" alt="RANKUE" className="w-16 h-16 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.08)] mb-5" />
          <h1 className="text-[32px] font-bold tracking-tight leading-tight">{c.h1}</h1>
          <p className="text-[15px] font-semibold text-brand mt-2">{c.tagline}</p>
          <p className="text-[15px] text-black/70 leading-relaxed mt-4">{c.intro}</p>
        </header>

        {/* What */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-3">{c.whatTitle}</h2>
          <p className="text-[15px] text-black/70 leading-relaxed">{c.whatBody}</p>
        </section>

        {/* Features */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-4">{c.featuresTitle}</h2>
          <div className="grid gap-3">
            {c.features.map((f) => (
              <article key={f.name} className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <h3 className="text-[15px] font-bold text-ink-1">{f.name}</h3>
                <p className="text-[13.5px] text-black/60 leading-relaxed mt-1">{f.desc}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Why */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-3">{c.whyTitle}</h2>
          <p className="text-[15px] text-black/70 leading-relaxed">{c.whyBody}</p>
        </section>

        {/* How */}
        <section className="mb-11">
          <h2 className="text-[20px] font-bold tracking-tight mb-4">{c.howTitle}</h2>
          <ol className="space-y-2.5">
            {c.how.map((step, i) => (
              <li key={i} className="flex gap-3 text-[15px] text-black/70 leading-relaxed">
                <span className="shrink-0 w-6 h-6 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </section>

        {/* FAQ */}
        <section className="mb-12">
          <h2 className="text-[20px] font-bold tracking-tight mb-4">{c.faqTitle}</h2>
          <div className="space-y-2.5">
            {c.faq.map((item) => (
              <details key={item.q} className="bg-white rounded-2xl p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <summary className="text-[15px] font-bold text-ink-1 cursor-pointer list-none">{item.q}</summary>
                <p className="text-[14px] text-black/65 leading-relaxed mt-2">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-3xl bg-brand p-7 text-center shadow-[0_8px_24px_rgba(0,98,65,0.20)] mb-10">
          <h2 className="text-[20px] font-bold text-white">{c.ctaTitle}</h2>
          <p className="text-[14px] text-white/85 mt-2">{c.ctaBody}</p>
          <button
            onClick={() => setLocation("/")}
            className="mt-5 inline-flex h-11 px-7 items-center justify-center rounded-full bg-white text-brand text-[14px] font-bold active:scale-[0.98] transition-transform"
          >
            {c.home}
          </button>
        </section>

        {/* Footer links — 기존 지원·개인정보 링크는 SiteFooter 안에 그대로 있고,
            거기에 스토어 링크(사용자·크롤러 모두가 보는)가 더해진다. */}
        <SiteFooter />
      </div>
    </div>
  );
}
