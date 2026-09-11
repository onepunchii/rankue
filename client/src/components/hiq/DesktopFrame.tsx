import { iosStoreUrl, androidStoreUrl } from "@shared/appLinks";
import type { ReactNode } from "react";
import { Link } from "wouter";
import { Capacitor } from "@capacitor/core";
import { QRCodeSVG } from "qrcode.react";
import { LANDING_CREW, LANDING_FEATURES, LANDING_META } from "@shared/landingContent";
import { useSport } from "@/contexts/SportContext";

/**
 * 데스크탑 전용 "껍데기".
 *
 * 앱 화면(대시보드·크루·기록·랭킹·친구·메뉴 …)은 375~430px 폰 기준으로 그려져 있어
 * 1440px 모니터에서 그대로 펼치면 카드·문장이 가로로 늘어져 읽기 힘들다.
 * 그래서 lg(1024px) 이상에서만 본문을 프레임 폭(--rk-frame-w, 448px)으로 가운데 고정하고,
 * xl(1280px) 이상에서 남는 좌우 여백에 랭큐 콘텐츠를 채운다.
 *
 * 설계 원칙 — 아래 넷은 절대 깨지 않는다.
 *  1. lg 미만(모바일·태블릿)에서는 클래스가 하나도 걸리지 않는다. 바깥 <div> 하나만 늘어난
 *     순수 통과(pass-through)라 기존 레이아웃과 픽셀 단위로 동일하다.
 *  2. 테두리(border)와 backdrop blur 를 쓰지 않는다. 층은 **그림자로만** 만든다.
 *  3. 이 컴포넌트와 그 조상에는 transform/filter/perspective/contain 을 절대 주지 않는다.
 *     그중 하나라도 걸리면 자손의 `position: fixed` 기준이 뷰포트에서 이 요소로 바뀌어
 *     하단 네비게이션·모달·토스트가 통째로 어긋난다.
 *  4. 사이드 패널의 이미지는 <img> 대신 CSS background-image 로 넣는다. display:none 인
 *     <img src> 는 브라우저가 그래도 받아오지만 background-image 는 받지 않는다 —
 *     모바일 사용자가 보지도 못할 배너를 내려받는 낭비를 막는다.
 *
 * 하단 네비게이션(HiqNavigation)은 `fixed bottom-0 left-0 right-0` 라 뷰포트를 가로지른다.
 * 다만 DOM 조상은 여전히 이 프레임이므로 index.css 의 `.rk-frame .bottom-navigation-container`
 * 규칙이 프레임 안에서 렌더될 때만 폭을 접어 가로 정렬을 맞춘다(설계 원칙 3번이 전제다).
 */
export function DesktopFrame({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
    // 골프 모드면 좌우 패널도 골프로(2026-09-10 오너: "골프 모드에서는 골프 느낌, 골프 내용으로").
    // 바탕색은 index.css 골프 토큰(--rk-frame-outer)이 맡고, 여기서는 내용만 바꾼다. 당구 패널은 손대지 않는다.
    // 훅은 아래 조건부 return 보다 먼저 불러야 한다.
    const { currentSport } = useSport();
    const golf = currentSport === "GOLF";
    // 네이티브 앱(Capacitor)은 그 자체가 이미 '기기 화면'이다. 태블릿 앱이 1024px을 넘겨
    // 사이드가 튀어나오면 어색하므로 껍데기를 아예 씌우지 않고 그대로 통과시킨다.
    if (Capacitor.isNativePlatform()) return <>{children}</>;

    // wide: 데이터 표 성격 페이지(세계랭킹·선수·PBA)는 448px가 답답하다 — 중앙 720px,
    // 사이드 패널 없이. --rk-frame-w 변수를 이 서브트리에서 덮어써 index.css 의
    // 고정 요소 폭 보정(FAB·하단 네비)도 함께 따라온다.
    return (
        <div
            className="lg:flex lg:justify-center lg:gap-7 xl:gap-9 lg:min-h-[100dvh] lg:bg-[var(--rk-frame-outer)]"
            style={wide ? ({ "--rk-frame-w": "720px" } as React.CSSProperties) : undefined}
        >
            {!wide && (golf ? <GolfSideLeft /> : <SideLeft />)}
            {/* 앱 본체. rk-frame 클래스는 index.css 의 하단 네비 보정이 잡는 훅이기도 하다. */}
            <div className="rk-frame w-full lg:w-[var(--rk-frame-w)] lg:shrink-0 lg:bg-surface-0 lg:shadow-[var(--rk-frame-shadow)]">
                {children}
            </div>
            {!wide && (golf ? <GolfSideRight /> : <SideRight />)}
        </div>
    );
}

/* ────────────────────────────────────────────────────────────────────────────
   좌: 브랜드 — 랭큐가 무엇인지
   ──────────────────────────────────────────────────────────────────────────── */

function SideLeft() {
    return (
        <aside
            className="rk-no-safe hidden xl:flex xl:flex-col self-start sticky top-0 h-[100dvh] w-[352px] 2xl:w-[400px] shrink-0 overflow-y-auto scrollbar-hide py-12 pl-2"
            aria-label="랭큐 소개"
        >
            <Link href="/dashboard" className="flex items-center gap-2.5 group" aria-label="랭큐 홈">
                <img
                    src="/icon-192.png"
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="w-10 h-10 rounded-[13px] shadow-[var(--shadow-card)]"
                />
                <span className="text-[16px] font-bold tracking-[-0.02em] text-ink-1">
                    RANKUE
                    <span className="ml-1.5 text-[13px] font-semibold text-ink-3">랭큐</span>
                </span>
            </Link>

            <h2 className="mt-9 text-[34px] 2xl:text-[38px] font-extrabold leading-[1.12] tracking-[-0.035em] text-ink-1">
                손안의
                <br />
                <span className="text-brand">당구 점수판</span>
            </h2>
            <p className="mt-4 text-[14px] leading-[1.7] text-ink-2 break-keep">{LANDING_META.lead}</p>

            {/* 브랜드 키 비주얼. <img> 가 아니라 배경으로 넣어야 모바일에서 안 받아온다. */}
            <div
                className="mt-7 w-full aspect-[16/9] rounded-[14px] bg-cover bg-center shadow-[var(--shadow-card)]"
                style={{ backgroundImage: "url('/hero-banner.jpg')" }}
                role="img"
                aria-label="당구대 위의 랭큐 점수판"
            />

            <ul className="mt-7 space-y-2.5">
                {LEFT_FEATURES.map((f) => (
                    <li key={f.name} className="rk-card p-4 flex items-start gap-3">
                        <span className="shrink-0 mt-0.5 w-8 h-8 rounded-[10px] bg-brand/10 text-brand flex items-center justify-center">
                            {FEATURE_ICON[f.name]}
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[13.5px] font-bold tracking-[-0.01em] text-ink-1">
                                {f.name}
                            </span>
                            <span className="block mt-1 text-[12.5px] leading-[1.6] text-ink-3 break-keep">
                                {f.desc}
                            </span>
                        </span>
                    </li>
                ))}
            </ul>

            <p className="mt-8 text-[11.5px] leading-[1.7] text-ink-4">
                3쿠션 · 4구 당구 점수판 · 무료
                <br />© RANKUE
            </p>
        </aside>
    );
}

/* ────────────────────────────────────────────────────────────────────────────
   우: 커뮤니티 · 바로가기 · 폰으로 이어쓰기
   ──────────────────────────────────────────────────────────────────────────── */

function SideRight() {
    return (
        <aside
            className="rk-no-safe hidden xl:flex xl:flex-col gap-4 self-start sticky top-0 h-[100dvh] w-[352px] 2xl:w-[400px] shrink-0 overflow-y-auto scrollbar-hide py-12 pr-2"
            aria-label="랭큐 크루와 바로가기"
        >
            {/* 크루 — 랭큐의 당구 커뮤니티 */}
            <section className="rounded-[18px] bg-[var(--house-green)] text-white p-6 shadow-[var(--shadow-card)]">
                <p className="text-[11px] font-bold tracking-[0.12em] text-white/55">CREW</p>
                <h3 className="mt-2 text-[20px] font-bold leading-[1.3] tracking-[-0.02em] break-keep">
                    {LANDING_CREW.title}
                </h3>
                <p className="mt-2.5 text-[13px] leading-[1.65] text-white/70 break-keep">
                    {LANDING_CREW.desc}
                </p>
                <ul className="mt-5 space-y-3">
                    {LANDING_CREW.items.map((it) => (
                        <li key={it.t} className="flex items-start gap-2.5">
                            <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full bg-white/45 shrink-0" />
                            <span className="min-w-0">
                                <span className="block text-[13.5px] font-semibold">{it.t}</span>
                                <span className="block text-[12.5px] leading-[1.55] text-white/60 break-keep">
                                    {it.d}
                                </span>
                            </span>
                        </li>
                    ))}
                </ul>
                <Link
                    href="/club"
                    className="mt-6 inline-flex items-center gap-1.5 h-10 px-5 rounded-pill bg-white text-[var(--house-green)] text-[13.5px] font-bold"
                >
                    크루 둘러보기
                    <Chevron />
                </Link>
            </section>

            {/* 하단 네비에 없는 화면들 — 데스크탑에 남는 자리를 실제 길잡이로 쓴다 */}
            <nav className="rk-card p-5" aria-label="바로가기">
                <p className="text-[12px] font-bold tracking-[0.08em] text-ink-4">바로가기</p>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                    {SHORTCUTS.map((s) => (
                        <li key={s.href}>
                            <Link
                                href={s.href}
                                className="flex flex-col justify-center h-[62px] px-3.5 rounded-[12px] bg-[var(--surface-3)]"
                            >
                                <span className="text-[13.5px] font-semibold text-ink-1">{s.label}</span>
                                <span className="mt-0.5 text-[11.5px] text-ink-3">{s.sub}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            {/* 데스크탑에서 보고 있는 사람을 폰으로 넘겨주는 다리 */}
            <section className="rk-card p-5 flex items-center gap-4">
                <span className="shrink-0 p-2 rounded-[12px] bg-white shadow-[var(--shadow-card)]">
                    <QRCodeSVG value={SITE_URL} size={76} level="M" bgColor="#ffffff" fgColor="#1E3932" />
                </span>
                <span className="min-w-0">
                    <span className="block text-[14px] font-bold tracking-[-0.01em] text-ink-1">
                        폰으로 이어서
                    </span>
                    <span className="block mt-1 text-[12px] leading-[1.55] text-ink-3 break-keep">
                        점수판은 폰에서 씁니다. QR을 찍어 바로 여세요.
                    </span>
                    <span className="mt-2.5 flex gap-1.5">
                        <a
                            href={STORE_IOS}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center h-7 px-3 rounded-pill bg-[var(--surface-3)] text-[11.5px] font-semibold text-ink-2"
                        >
                            App Store
                        </a>
                        <a
                            href={STORE_ANDROID}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center h-7 px-3 rounded-pill bg-[var(--surface-3)] text-[11.5px] font-semibold text-ink-2"
                        >
                            Google Play
                        </a>
                    </span>
                </span>
            </section>

            <p className="mt-auto pt-6 text-[11.5px] leading-[1.7] text-ink-4">
                점수는 터치로만 올리세요. 이닝과 평균(에버리지), 하이런은 랭큐가 셉니다.
            </p>
        </aside>
    );
}

/* ────────────────────────────────────────────────────────────────────────────
   골프 모드 패널 — 골프 홈과 같은 톤(검정 바탕 · 라임 강조 · 영문 대문자 머리말).
   **지금 앱에 있는 기능만** 적는다: 랭큐 매치(같이 쓰는 스코어카드·게임 점수 계산), 조인·부킹, 골프 패스포트,
   코스 가이드, 랭큐 프로암(준비 중), 크루 채팅에 올리는 부킹 카드. 없는 기능을 약속하지 않는다.
   당구 패널(SideLeft/SideRight)과 마크업을 공유하지 않는다 — 당구 화면이 한 픽셀도 바뀌면 안 된다.
   ──────────────────────────────────────────────────────────────────────────── */

function GolfSideLeft() {
    return (
        <aside
            className="rk-no-safe hidden xl:flex xl:flex-col self-start sticky top-0 h-[100dvh] w-[352px] 2xl:w-[400px] shrink-0 overflow-y-auto scrollbar-hide py-12 pl-2"
            aria-label="랭큐 골프 소개"
        >
            <Link href="/dashboard" className="flex items-center gap-2.5 group" aria-label="랭큐 홈">
                <img
                    src="/icon-192.png"
                    alt=""
                    width={40}
                    height={40}
                    loading="lazy"
                    decoding="async"
                    className="w-10 h-10 rounded-[13px]"
                />
                <span className="text-[16px] font-bold tracking-[-0.02em] text-ink-1">
                    RANKUE
                    <span className="ml-1.5 text-[13px] font-semibold text-ink-3">골프</span>
                </span>
            </Link>

            <p className="mt-9 inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.24em] text-brand">
                <span aria-hidden className="w-1.5 h-1.5 rounded-full bg-brand" />
                GOLF MODE
            </p>
            <h2 className="mt-3 text-[32px] 2xl:text-[36px] font-extrabold leading-[1.15] tracking-[-0.035em] text-ink-1">
                스코어는 랭큐가,
                <br />
                <span className="text-brand">라운드는 크루와</span>
            </h2>
            <p className="mt-4 text-[14px] leading-[1.7] text-ink-2 break-keep">
                홀마다 타수만 누르세요. 합계와 순위는 랭큐가 맞춥니다. 긴급티·조인으로 빈자리를 채우고, 크루와 함께 기록을 쌓아요.
            </p>

            <GolfHero />

            <ul className="mt-7 space-y-2.5">
                {GOLF_FEATURES.map((f) => (
                    <li key={f.name} className="rk-card p-4 flex items-start gap-3">
                        <span className="shrink-0 mt-0.5 w-8 h-8 rounded-[10px] bg-brand/15 text-brand flex items-center justify-center">
                            {f.icon}
                        </span>
                        <span className="min-w-0">
                            <span className="flex items-center gap-2">
                                <span className="text-[13.5px] font-bold tracking-[-0.01em] text-ink-1">{f.name}</span>
                                {f.soon && (
                                    <span className="text-[10.5px] font-bold text-ink-3 rounded-pill bg-[var(--surface-3)] px-2 py-0.5">준비 중</span>
                                )}
                            </span>
                            <span className="block mt-1 text-[12.5px] leading-[1.6] text-ink-3 break-keep">{f.desc}</span>
                        </span>
                    </li>
                ))}
            </ul>

            <p className="mt-8 text-[11.5px] leading-[1.7] text-ink-4">
                골프 스코어 · 조인 · 크루 · 무료
                <br />© RANKUE
            </p>
        </aside>
    );
}

/** 그린·깃대·공 — 골프 이미지 파일이 없어서 그림으로 그린다. 인라인 SVG 라 모바일에서 따로 내려받지 않는다(원칙 4). */
function GolfHero() {
    const lime = { fill: "rgb(var(--brand))" } as React.CSSProperties;
    return (
        <div className="mt-7 w-full aspect-[16/9] rounded-[14px] bg-surface-1 overflow-hidden relative" role="img" aria-label="그린 위의 깃대와 공">
            <svg viewBox="0 0 320 180" className="absolute inset-0 w-full h-full" aria-hidden>
                <ellipse cx="188" cy="140" rx="156" ry="34" style={lime} opacity="0.08" />
                <ellipse cx="188" cy="140" rx="108" ry="23" style={lime} opacity="0.12" />
                <ellipse cx="188" cy="140" rx="60" ry="13" style={lime} opacity="0.2" />
                <ellipse cx="206" cy="140" rx="7" ry="2.6" fill="#050605" />
                <line x1="206" y1="139" x2="206" y2="46" stroke="rgba(255,255,255,0.85)" strokeWidth="2" strokeLinecap="round" />
                <path d="M207 48 L244 59 L207 70 Z" style={lime} />
                <path d="M156 141 Q180 135 200 139" stroke="rgba(255,255,255,0.32)" strokeWidth="1.5" strokeDasharray="3 4" fill="none" strokeLinecap="round" />
                <ellipse cx="148" cy="149" rx="8" ry="2.4" fill="#000" opacity="0.5" />
                <circle cx="148" cy="142" r="7" fill="#ffffff" />
            </svg>
            <div className="absolute left-5 top-4">
                <p className="text-[10px] font-bold tracking-[0.3em] text-brand">RANKUE GOLF</p>
                <p className="mt-1 text-[15px] font-bold text-ink-1">크루 · 조인 · 스코어</p>
            </div>
        </div>
    );
}

function GolfSideRight() {
    return (
        <aside
            className="rk-no-safe hidden xl:flex xl:flex-col gap-4 self-start sticky top-0 h-[100dvh] w-[352px] 2xl:w-[400px] shrink-0 overflow-y-auto scrollbar-hide py-12 pr-2"
            aria-label="골프 크루와 바로가기"
        >
            {/* 크루 — 골프도 크루가 중심(2026-09 오너 방침) */}
            <section className="rk-card p-6">
                <p className="text-[11px] font-bold tracking-[0.24em] text-brand">CREW</p>
                <h3 className="mt-2 text-[20px] font-bold leading-[1.3] tracking-[-0.02em] text-ink-1 break-keep">
                    혼자 치지 말고, 골프 크루에서
                </h3>
                <p className="mt-2.5 text-[13px] leading-[1.65] text-ink-3 break-keep">
                    크루는 랭큐의 골프 동호회입니다. 마음 맞는 사람들과 라운드를 잡고, 조인과 스코어를 크루 안에서 나눕니다.
                </p>
                <ul className="mt-5 space-y-3">
                    {GOLF_CREW_ITEMS.map((it) => (
                        <li key={it.t} className="flex items-start gap-2.5">
                            <span aria-hidden className="mt-[7px] w-1.5 h-1.5 rounded-full bg-brand shrink-0" />
                            <span className="min-w-0">
                                <span className="block text-[13.5px] font-semibold text-ink-1">{it.t}</span>
                                <span className="block text-[12.5px] leading-[1.55] text-ink-3 break-keep">{it.d}</span>
                            </span>
                        </li>
                    ))}
                </ul>
                <Link
                    href="/club"
                    className="mt-6 inline-flex items-center gap-1.5 h-10 px-5 rounded-pill bg-brand text-brand-fg text-[13.5px] font-bold"
                >
                    골프 크루 둘러보기
                    <Chevron />
                </Link>
            </section>

            {/* 골프 하단 네비(홈·크루·조인·라운드·전체)에 없는 화면만 */}
            <nav className="rk-card p-5" aria-label="골프 바로가기">
                <p className="text-[12px] font-bold tracking-[0.08em] text-ink-4">바로가기</p>
                <ul className="mt-3 grid grid-cols-2 gap-2">
                    {GOLF_SHORTCUTS.map((s) => (
                        <li key={s.href}>
                            <Link
                                href={s.href}
                                className="flex flex-col justify-center h-[62px] px-3.5 rounded-[12px] bg-[var(--surface-3)]"
                            >
                                <span className="text-[13.5px] font-semibold text-ink-1">{s.label}</span>
                                <span className="mt-0.5 text-[11.5px] text-ink-3">{s.sub}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            </nav>

            <section className="rk-card p-5 flex items-center gap-4">
                <span className="shrink-0 p-2 rounded-[12px] bg-white">
                    <QRCodeSVG value={SITE_URL} size={76} level="M" bgColor="#ffffff" fgColor="#0a0a0a" />
                </span>
                <span className="min-w-0">
                    <span className="block text-[14px] font-bold tracking-[-0.01em] text-ink-1">폰으로 이어서</span>
                    <span className="block mt-1 text-[12px] leading-[1.55] text-ink-3 break-keep">
                        스코어카드는 필드에서 폰으로 씁니다. QR을 찍어 바로 여세요.
                    </span>
                    <span className="mt-2.5 flex gap-1.5">
                        <a href={STORE_IOS} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-7 px-3 rounded-pill bg-[var(--surface-3)] text-[11.5px] font-semibold text-ink-2">App Store</a>
                        <a href={STORE_ANDROID} target="_blank" rel="noopener noreferrer" className="inline-flex items-center h-7 px-3 rounded-pill bg-[var(--surface-3)] text-[11.5px] font-semibold text-ink-2">Google Play</a>
                    </span>
                </span>
            </section>

            <p className="mt-auto pt-6 text-[11.5px] leading-[1.7] text-ink-4">
                타수는 홀마다 터치로 올리세요. 합계와 순위는 랭큐가 셉니다.
            </p>
        </aside>
    );
}

const GOLF_FEATURES: { name: string; desc: string; icon: ReactNode; soon?: boolean }[] = [
    {
        name: "랭큐 매치",
        desc: "동반자와 한 스코어카드를 같이 봅니다. 방장이 적은 타수가 모두의 폰에 그대로 보여요.",
        icon: (<Ico><rect x="4" y="3.5" width="16" height="17" rx="2.5" /><path d="M4 9h16M4 14.5h16M10 3.5v17" /></Ico>),
    },
    {
        name: "조인 · 부킹",
        desc: "긴급티와 특가 티타임, 빈자리 조인을 한곳에서 찾고 바로 신청합니다.",
        icon: (<Ico><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></Ico>),
    },
    {
        name: "골프 패스포트",
        desc: "다녀온 골프장을 도장처럼 모아요. 코스 가이드도 함께 봅니다.",
        icon: (<Ico><rect x="5" y="3" width="14" height="18" rx="2.5" /><circle cx="12" cy="11" r="3.2" /><path d="M9 17h6" /></Ico>),
    },
    {
        name: "랭큐 프로암",
        desc: "프로와 한 조로 치는 크루 대회입니다.",
        icon: (<Ico><path d="M8 4h8v5a4 4 0 0 1-8 0V4Z" /><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7" /></Ico>),
        soon: true,
    },
];

const GOLF_CREW_ITEMS: { t: string; d: string }[] = [
    { t: "크루 만들기 · 가입", d: "지역으로 골프 동호회를 찾아 신청" },
    { t: "조인 공유", d: "잡은 티타임을 크루 채팅에 카드로 올려요" },
    { t: "사진첩 · 채팅", d: "라운드 사진과 대화가 크루 안에 쌓입니다" },
];

// 골프 하단 네비(홈·크루·조인·라운드·전체)에 **없는** 화면만.
const GOLF_SHORTCUTS: { href: string; label: string; sub: string }[] = [
    { href: "/golf/passport", label: "골프 패스포트", sub: "도장깨기 · 가이드" },
    { href: "/golf/ranking", label: "코스 가이드", sub: "명문 코스 리서치" },
    { href: "/golf/proam", label: "랭큐 프로암", sub: "준비 중" },
    { href: "/golf/membership", label: "회원권 시세", sub: "시세 · 코스 정보" },
];

/* ────────────────────────────────────────────────────────────────────────────
   상수 · 아이콘
   ──────────────────────────────────────────────────────────────────────────── */

const SITE_URL = "https://www.rankue.co.kr/";

// 설치 배너(HiqInstallBanner)·랜딩과 같은 스토어 링크. utm 만 이 패널용으로 구분한다.
const STORE_IOS = iosStoreUrl("desktop_side_panel");
const STORE_ANDROID = androidStoreUrl("desktop_side_panel");

// 하단 네비(홈·크루·친구·기록·메뉴)에 **없는** 화면만 골랐다. 있는 걸 또 놓으면 중복이다.
const SHORTCUTS: { href: string; label: string; sub: string }[] = [
    { href: "/ranking", label: "랭킹", sub: "매장 · 전국 순위" },
    { href: "/stores", label: "매장 찾기", sub: "가까운 당구장" },
    { href: "/world-ranking", label: "세계 랭킹", sub: "UMB 공식 순위" },
    { href: "/about", label: "랭큐 소개", sub: "무엇을 하는 앱인지" },
];

function Chevron() {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5" aria-hidden>
            <path d="m9 6 6 6-6 6" />
        </svg>
    );
}

function Ico({ children }: { children: ReactNode }) {
    return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="w-[18px] h-[18px]" aria-hidden>
            {children}
        </svg>
    );
}

// 랜딩(marketing-landing.tsx)과 같은 획으로 그린 아이콘. 이름을 키로 잡아
// shared/landingContent.ts 의 배열 순서가 바뀌어도 짝이 어긋나지 않는다.
const FEATURE_ICON: Record<string, ReactNode> = {
    "손안의 점수판": (
        <Ico>
            <rect x="3" y="4" width="18" height="16" rx="2.5" />
            <path d="M12 4v16M6.5 9.5h2M15.5 9.5h2M6.5 14.5h2M15.5 14.5h2" />
        </Ico>
    ),
    "당구 매칭 대결": (
        <Ico>
            <circle cx="7.5" cy="8" r="3" />
            <circle cx="16.5" cy="16" r="3" />
            <path d="M12.5 7.5h5.5v4M11.5 16.5H6v-4" />
        </Ico>
    ),
    "경기 기록": (
        <Ico>
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 1.8" />
        </Ico>
    ),
    "크루(당구 동호회)": (
        <Ico>
            <circle cx="9" cy="8.5" r="3" />
            <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
            <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c1.9.6 3.2 2.3 3.2 4.6" />
        </Ico>
    ),
    "시뮬레이터": (
        <Ico>
            <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
            <circle cx="9" cy="12" r="1.6" />
            <path d="M13 13.6 19 9" />
        </Ico>
    ),
    "당구 랭킹": (
        <Ico>
            <path d="M5 20V11M12 20V4.5M19 20v-6" />
            <path d="M3 20h18" />
        </Ico>
    ),
};

// 크루는 오른쪽 패널이 통째로 맡으므로 왼쪽에서는 뺀다.
// 문안이 바뀌어 이름이 안 맞으면 앞 4개로 물러선다 — 패널이 비는 것보다 낫다.
const LEFT_FEATURE_NAMES = ["손안의 점수판", "당구 매칭 대결", "경기 기록", "당구 랭킹"];
const LEFT_FEATURES = (() => {
    const picked = LANDING_FEATURES.filter((f) => LEFT_FEATURE_NAMES.includes(f.name));
    return picked.length > 0 ? picked : LANDING_FEATURES.slice(0, 4);
})();
