import { useSeo } from "@/hooks/useSeo";
import { SiteFooter } from "@/components/hiq/SiteFooter";
import { isNativeApp } from "@/lib/nativeBridge";
import { APP_STORE_URL, PLAY_STORE_URL, playLink, appStoreLink } from "@shared/appLinks";
import { LANDING_FEATURES } from "@shared/landingContent";
import {
    APP_PAGE_META,
    APP_PAGE_EXTRAS,
    APP_PAGE_FAQS,
    APP_PAGE_STEPS,
    appPageJsonLd,
} from "@shared/appPageContent";

// /app — 앱 다운로드 랜딩.
//
// 두 가지 일을 한다:
//   1) "랭큐 앱 다운로드"류 검색으로 들어온 사람을 스토어로 보낸다.
//   2) 우리 사이트의 색인 자산을 Play·App Store 페이지로 흘려보낸다 — 스토어 페이지는
//      구글 웹 검색에 색인되는 웹페이지이고, 여기 링크는 크롤러도 본다
//      (server/prerender.ts 의 /app 핸들러가 같은 문안·같은 링크를 HTML 로 낸다).
//
// 문안은 shared/appPageContent.ts + shared/landingContent.ts 가 정본이다. 여기에 문구를
// 다시 적으면 봇이 본 내용과 사람이 본 내용이 갈려 클로킹이 된다.
// 디자인은 marketing-landing.tsx 의 언어(크림 배경 #f2f0eb · 흰 카드 · brand 초록)를 그대로 쓴다.

const ORIGIN = "https://www.rankue.co.kr";
// useSeo 의 의존성 배열에 들어가므로 렌더마다 새로 만들지 않는다.
const PAGE_LD = appPageJsonLd(ORIGIN, [PLAY_STORE_URL, APP_STORE_URL]);

export default function AppLanding() {
    useSeo({
        title: APP_PAGE_META.title,
        description: APP_PAGE_META.desc,
        path: "/app",
        locale: "ko",
        image: `${ORIGIN}/og.png`,
        jsonLd: PAGE_LD,
    });

    // 네이티브 앱 안에서는 스토어 버튼을 감춘다 — 이미 앱을 쓰는 사람이고,
    // 애플 심사 지침이 앱 안에서 다른 모바일 플랫폼 언급을 막는다.
    const inApp = isNativeApp();
    const play = playLink("app_page");
    const ios = appStoreLink("app_page");

    return (
        <div className="min-h-screen w-full bg-[#f2f0eb] text-ink-1 font-sans">
            <div className="mx-auto max-w-4xl px-6 pb-4 pt-12 md:pt-16">
                {/* 히어로 */}
                <header>
                    <p className="text-[13px] font-semibold tracking-wide text-brand">
                        {APP_PAGE_META.kicker}
                    </p>
                    <h1 className="mt-3 break-keep text-[32px] font-bold leading-[1.15] tracking-tight md:text-[42px]">
                        {APP_PAGE_META.h1}
                    </h1>
                    <p className="mt-4 max-w-[36rem] break-keep text-[15px] font-medium leading-relaxed text-ink-3 md:text-[16.5px]">
                        {APP_PAGE_META.lead}
                    </p>

                    {!inApp && (play || ios) && (
                        <div className="mt-7 flex max-w-md flex-col gap-2.5 sm:flex-row">
                            {play && (
                                <a
                                    href={play}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex h-12 shrink-0 items-center justify-center rounded-2xl bg-[#1c1c1f] text-[14.5px] font-bold text-white transition-transform active:scale-[0.98] sm:flex-1"
                                >
                                    Google Play
                                </a>
                            )}
                            {ios && (
                                <a
                                    href={ios}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex h-12 shrink-0 items-center justify-center rounded-2xl bg-black/[0.05] text-[14.5px] font-bold text-ink-1 transition-transform active:scale-[0.98] sm:flex-1"
                                >
                                    App Store
                                </a>
                            )}
                        </div>
                    )}

                    <p className="mt-3 text-[12.5px] font-medium text-ink-4">
                        설치 없이 웹에서 먼저 써보려면 <a href="/" className="font-semibold text-brand hover:underline">랭큐 홈</a>에서 바로 시작하세요.
                    </p>

                    {/* 키 비주얼 — 홈에서 쓰는 배너를 그대로 재사용한다(새 에셋을 만들지 않는다) */}
                    <img
                        src="/hero-banner.jpg"
                        alt="랭큐 RANKUE — 당구 점수판·매칭·랭킹 앱"
                        width={1600}
                        height={900}
                        loading="lazy"
                        decoding="async"
                        className="mt-9 w-full rounded-2xl"
                    />
                </header>

                {/* 기능 — 정본은 shared/landingContent.ts */}
                <section className="mt-12 md:mt-16">
                    <h2 className="text-[22px] font-bold tracking-tight md:text-[26px]">앱에서 할 수 있는 것</h2>
                    <div className="mt-6 grid gap-3 md:grid-cols-2 md:gap-4">
                        {LANDING_FEATURES.map((f) => (
                            <article
                                key={f.name}
                                className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:p-6"
                            >
                                <h3 className="text-[16px] font-bold text-ink-1">{f.name}</h3>
                                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">{f.desc}</p>
                            </article>
                        ))}
                    </div>
                </section>

                {/* 앱에서만 더해지는 것 */}
                <section className="mt-12 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:mt-16 md:p-10">
                    <h2 className="text-[20px] font-bold tracking-tight md:text-[24px]">웹에서도 되지만, 앱이면 더 편한 것</h2>
                    <ul className="mt-5 grid gap-2.5 md:grid-cols-3">
                        {APP_PAGE_EXTRAS.map((e) => (
                            <li key={e.name} className="rounded-2xl bg-black/[0.03] px-5 py-4">
                                <p className="text-[14.5px] font-bold text-ink-1">{e.name}</p>
                                <p className="mt-0.5 text-[13px] font-medium leading-relaxed text-ink-3">{e.desc}</p>
                            </li>
                        ))}
                    </ul>
                </section>

                {/* 설치 후 순서 */}
                <section className="mt-12 md:mt-16">
                    <h2 className="text-[22px] font-bold tracking-tight md:text-[26px]">설치하고 첫 경기까지</h2>
                    <ol className="mt-5 space-y-2.5">
                        {APP_PAGE_STEPS.map((s, i) => (
                            <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-ink-3">
                                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand text-[12.5px] font-bold text-white">
                                    {i + 1}
                                </span>
                                <span>{s}</span>
                            </li>
                        ))}
                    </ol>
                </section>

                {/* FAQ */}
                <section className="mt-12 md:mt-16">
                    <h2 className="text-[22px] font-bold tracking-tight md:text-[26px]">자주 묻는 질문</h2>
                    <div className="mt-6 grid gap-3 md:grid-cols-2 md:gap-4">
                        {APP_PAGE_FAQS.map((f) => (
                            <article
                                key={f.q}
                                className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:p-6"
                            >
                                <h3 className="text-[15.5px] font-bold leading-snug text-ink-1">{f.q}</h3>
                                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{f.a}</p>
                            </article>
                        ))}
                    </div>
                    <p className="mt-4 text-[12.5px] font-medium text-ink-4">
                        계정 삭제 절차는 <a href="/account-delete" className="font-semibold text-brand hover:underline">계정 삭제 안내</a>에 정리돼 있습니다.
                    </p>
                </section>

                <SiteFooter />
            </div>
        </div>
    );
}
