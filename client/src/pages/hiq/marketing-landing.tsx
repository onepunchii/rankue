import type { ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Capacitor } from "@capacitor/core";
import { useSeo } from "@/hooks/useSeo";
import { BilliardBall } from "@/components/hiq/ui/BilliardBall";
import { LANDING_FAQS, LANDING_META } from "@shared/landingContent";

// 설치 배너(HiqInstallBanner)와 같은 링크. utm 만 랜딩용으로 구분해 유입 경로를 나눈다.
const STORE_IOS = "https://apps.apple.com/app/id6760333313?ct=web_landing";
const STORE_ANDROID =
    "https://play.google.com/store/apps/details?id=com.rankue.app&referrer=utm_source%3Dweb%26utm_medium%3Dlanding";

// 검색으로 들어온 비로그인 방문자에게 보여주는 마케팅 랜딩.
// 기존 홈(/)은 곧바로 전화번호 입력 폼이라, 랭큐를 모르는 사람이 검색으로 들어오면
// "휴대폰 번호를 입력하세요"만 보고 이탈했다. 그래서 홈을 방문자 유형으로 가른다:
//   앱/로그인 사용자 → 기존 로그인·대시보드 그대로, 검색 방문자 → 이 화면.
//
// 레이아웃이 두 톤으로 나뉜 이유: 히어로는 브랜드 키 비주얼(hero-banner.png)이 다크라
// 그 위를 다크로 이어 붙이고, 그 아래부터는 앱 본체와 같은 크림(#f2f0eb)으로 전환한다.
// ⚠️ 다크 구간에서는 brand(#006241)가 거의 안 보인다 — emerald-400 계열을 쓴다.

// 24px 스트로크 아이콘. 외부 아이콘 CDN(Font Awesome)에 기대면 CSS 로드 전까지
// 빈 칸이 보이므로 인라인 SVG 로 둔다.
function Ico({ children }: { children: ReactNode }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={1.6}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
        >
            {children}
        </svg>
    );
}

const FEATURES: { name: string; desc: string; icon: ReactNode }[] = [
    {
        name: "손안의 점수판",
        desc: "터치로 점수만 올리면 됩니다. 이닝·평균(에버리지)·하이런을 자동으로 세고 음성으로 알려줘요. 잘못 눌렀으면 되돌리기.",
        icon: (
            <Ico>
                <rect x="3" y="4" width="18" height="16" rx="2.5" />
                <path d="M12 4v16M6.5 9.5h2M15.5 9.5h2M6.5 14.5h2M15.5 14.5h2" />
            </Ico>
        ),
    },
    {
        name: "당구 매칭 대결",
        desc: "상대와 1:1 경기. 핀(PIN) 코드를 입력하면 서로 다른 폰에서 같은 점수판에 함께 들어옵니다.",
        icon: (
            <Ico>
                <circle cx="7.5" cy="8" r="3" />
                <circle cx="16.5" cy="16" r="3" />
                <path d="M12.5 7.5h5.5v4M11.5 16.5H6v-4" />
            </Ico>
        ),
    },
    {
        name: "경기 기록",
        desc: "모든 경기가 자동 저장됩니다. 전적·평균·하이런이 어떻게 달라지는지 한눈에 보며 내 당구 기록을 쌓아가세요.",
        icon: (
            <Ico>
                <circle cx="12" cy="12" r="8.5" />
                <path d="M12 7.5V12l3 1.8" />
            </Ico>
        ),
    },
    {
        name: "크루(당구 동호회)",
        desc: "당구 커뮤니티를 직접 만들거나 가입해서 활동하세요. 크루 사진첩·채팅·크루 랭킹까지 함께 굴러갑니다.",
        icon: (
            <Ico>
                <circle cx="9" cy="8.5" r="3" />
                <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
                <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c1.9.6 3.2 2.3 3.2 4.6" />
            </Ico>
        ),
    },
    {
        name: "시뮬레이터",
        desc: "화면 위 가상 당구대에서 혼자 3구·4구 배치를 그려보고 연습할 수 있어요.",
        icon: (
            <Ico>
                <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
                <circle cx="9" cy="12" r="1.6" />
                <path d="M13 13.6 19 9" />
            </Ico>
        ),
    },
    {
        name: "당구 랭킹",
        desc: "매장별·전국 3쿠션·4구 순위. 자주 가는 당구장에서 내가 몇 등인지 바로 확인합니다.",
        icon: (
            <Ico>
                <path d="M5 20V11M12 20V4.5M19 20v-6" />
                <path d="M3 20h18" />
            </Ico>
        ),
    },
];

// 문답·메타 문안은 shared/landingContent.ts 가 정본이다 — 서버 프리렌더(server/prerender.ts)가
// 같은 객체를 렌더하므로, 여기에 다시 적으면 봇이 본 내용과 사용자가 본 내용이 갈려 클로킹이 된다.
// (구조화데이터에만 있고 화면에 없는 문답도 구글 기준 위반이라 화면에 그대로 노출한다.)
const FAQS = LANDING_FAQS;

const HERO_CHIPS = ["3쿠션 · 4구 지원", "전적 자동 저장", "매장 · 전국 랭킹", "무료"];

export default function MarketingLanding({ onStart }: { onStart: () => void }) {
    useSeo({
        title: LANDING_META.title,
        description: LANDING_META.desc,
        path: "/",
        locale: "ko",
        image: "https://www.rankue.co.kr/og.png",
    });

    // 앱 안에서는 스토어 버튼·QR이 무의미하다(이미 설치한 사람이다).
    const isNative = Capacitor.isNativePlatform();

    const scrollToDownload = () => {
        document.getElementById("download")?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="min-h-screen w-full bg-[#f2f0eb] text-ink-1 font-sans">
            {/* ── 히어로 (다크) ───────────────────────────────────────── */}
            <section className="relative overflow-hidden bg-[#07090a]">
                {/* 배너 뒤 은은한 초록 번짐 — 키 비주얼의 네온이 검은 배경에서 끊겨 보이지 않게 잇는다 */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                        background:
                            "radial-gradient(70% 55% at 72% 32%, rgba(74,222,128,0.16) 0%, rgba(7,9,10,0) 70%)",
                    }}
                />

                {/* 2단 전환은 md(768)가 아니라 lg(1024)에서 한다. md 에서 나누면 한 칸이 336px 뿐이라
                    48px 헤드라인과 CTA 두 개(≈396px)가 칸 밖으로 흘러 이미지와 겹쳤다. */}
                <div className="relative mx-auto max-w-6xl px-6 pb-14 lg:py-20">
                    <div className="lg:grid lg:grid-cols-2 lg:items-center lg:gap-16">
                        {/* 키 비주얼. 로고·태그라인·아이콘이 이미 그려진 완성 아트라 자르지 않고 통째로 쓴다.
                            좁은 화면에서는 폭을 꽉 채우려고 좌우 패딩을 상쇄(-mx-6)한다. */}
                        <div className="relative -mx-6 lg:order-2 lg:mx-0">
                            <img
                                src="/hero-banner.jpg"
                                alt="랭큐 RANKUE — 당구 점수판·매칭·랭킹 앱"
                                width={1600}
                                height={900}
                                loading="eager"
                                decoding="async"
                                className="w-full lg:rounded-2xl"
                            />
                            {/* 세로로 쌓일 때만: 배너 아래를 배경색으로 녹여 바로 밑 문구와 이어 붙인다 */}
                            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#07090a] to-transparent lg:hidden" />
                        </div>

                        <div className="mt-6 text-center lg:order-1 lg:mt-0 lg:text-left">
                            <p className="text-[13px] font-semibold tracking-wide text-emerald-400">
                                3쿠션 · 4구 당구 점수판
                            </p>
                            <h1 className="mt-3 break-keep text-[34px] font-bold leading-[1.15] tracking-tight text-white sm:text-[42px] md:text-[48px]">
                                손안의 당구 점수판
                            </h1>
                            <p className="mx-auto mt-4 max-w-[34rem] break-keep text-[15.5px] font-medium leading-relaxed text-white/70 md:text-[17px] lg:mx-0">
                                복잡한 계산은 랭큐가 합니다. 터치로 점수만 올리면 이닝과 평균(에버리지),
                                하이런까지 알아서 기록돼요.
                            </p>

                            <div className="mx-auto mt-8 flex max-w-md flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center lg:mx-0 lg:justify-start">
                                <button
                                    onClick={onStart}
                                    className="h-14 rounded-full bg-emerald-400 px-8 text-[16px] font-bold text-[#05231a] transition-transform active:scale-[0.98] sm:min-w-[11rem]"
                                >
                                    바로 시작하기
                                </button>
                                {!isNative && (
                                    <button
                                        onClick={scrollToDownload}
                                        className="h-14 rounded-full bg-white/10 px-8 text-[16px] font-bold text-white transition-transform active:scale-[0.98] sm:min-w-[11rem]"
                                    >
                                        앱 다운로드
                                    </button>
                                )}
                            </div>
                            <p className="mt-3 text-[12.5px] font-medium text-white/45">
                                설치 없이 웹에서 바로 · 무료
                            </p>

                            <ul className="mt-8 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                                {HERO_CHIPS.map((c) => (
                                    <li
                                        key={c}
                                        className="rounded-full bg-white/[0.07] px-3.5 py-1.5 text-[12.5px] font-medium text-white/65"
                                    >
                                        {c}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                </div>
            </section>

            {/* ── 본문 (크림) ─────────────────────────────────────────── */}
            <div className="mx-auto max-w-6xl px-6 pb-16 pt-14 md:pt-20">
                {/* 기능 */}
                <section>
                    <h2 className="text-[22px] font-bold tracking-tight md:text-[28px]">
                        이런 걸 할 수 있어요
                    </h2>
                    <p className="mt-2 max-w-[36rem] text-[14.5px] font-medium leading-relaxed text-ink-3">
                        점수판부터 매칭, 기록, 당구 커뮤니티까지 — 당구장에서 필요한 게 한 앱에 모여
                        있습니다.
                    </p>

                    <div className="mt-6 grid gap-3 md:grid-cols-2 md:gap-4 lg:grid-cols-3">
                        {FEATURES.map((f) => (
                            <article
                                key={f.name}
                                className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:p-6"
                            >
                                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand/10 text-brand">
                                    {f.icon}
                                </span>
                                <h3 className="mt-4 text-[16px] font-bold text-ink-1">{f.name}</h3>
                                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-3">
                                    {f.desc}
                                </p>
                            </article>
                        ))}
                    </div>
                </section>

                {/* 종목 */}
                <section className="mt-12 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:mt-16 md:p-10">
                    <div className="md:flex md:items-center md:gap-12">
                        <div className="md:flex-1">
                            <h2 className="break-keep text-[20px] font-bold tracking-tight md:text-[26px]">
                                3쿠션도, 4구도 그대로
                            </h2>
                            <p className="mt-3 break-keep text-[14.5px] font-medium leading-relaxed text-ink-3">
                                종목만 고르면 점수판과 기록 방식이 알아서 맞춰집니다. 3쿠션 에버리지도,
                                4구 전적도 따로 계산기를 두드릴 필요가 없어요.
                            </p>
                        </div>

                        <div className="mt-7 flex items-center justify-center gap-10 md:mt-0 md:gap-12">
                            <div className="flex flex-col items-center gap-3">
                                <div className="flex -space-x-1.5">
                                    <BilliardBall color="white" size={34} />
                                    <BilliardBall color="yellow" size={34} />
                                    <BilliardBall color="red" size={34} />
                                </div>
                                <span className="text-[13px] font-bold text-ink-3">3쿠션</span>
                            </div>
                            <div className="flex flex-col items-center gap-3">
                                <div className="flex -space-x-1.5">
                                    <BilliardBall color="white" size={34} />
                                    <BilliardBall color="yellow" size={34} />
                                    <BilliardBall color="red" size={34} />
                                    <BilliardBall color="red" size={34} />
                                </div>
                                <span className="text-[13px] font-bold text-ink-3">4구</span>
                            </div>
                        </div>
                    </div>
                </section>

                {/* 크루 = 당구 커뮤니티 */}
                <section className="mt-12 overflow-hidden rounded-3xl bg-[#0d1110] p-7 md:mt-16 md:p-10 lg:p-12">
                    <div className="lg:flex lg:items-center lg:gap-14">
                        <div className="lg:flex-1">
                            <p className="text-[13px] font-semibold tracking-wide text-emerald-400">
                                크루
                            </p>
                            <h2 className="mt-2 break-keep text-[22px] font-bold leading-tight tracking-tight text-white md:text-[30px]">
                                혼자 치지 말고, 당구 커뮤니티에서
                            </h2>
                            <p className="mt-4 max-w-[32rem] break-keep text-[14.5px] font-medium leading-relaxed text-white/65">
                                동네 당구 동호회부터 단골 당구장 모임까지, 크루를 만들어 함께 기록을
                                남기세요. 크루 안에서 경기 일정을 잡고 사진과 후기를 나누고, 크루 랭킹으로
                                서로 실력을 겨룹니다.
                            </p>
                        </div>

                        <ul className="mt-7 grid gap-2.5 md:grid-cols-3 lg:mt-0 lg:w-[19rem] lg:shrink-0 lg:grid-cols-1">
                            {[
                                { t: "크루 만들기 · 가입", d: "지역과 종목으로 동호회를 찾아 신청" },
                                { t: "크루 랭킹", d: "멤버들의 전적·에버리지를 한 화면에" },
                                { t: "사진첩 · 채팅", d: "정모 사진과 대화가 크루 안에 쌓입니다" },
                            ].map((i) => (
                                <li key={i.t} className="rounded-2xl bg-white/[0.06] px-5 py-4">
                                    <p className="text-[14.5px] font-bold text-white">{i.t}</p>
                                    <p className="mt-0.5 text-[13px] font-medium text-white/55">{i.d}</p>
                                </li>
                            ))}
                        </ul>
                    </div>
                </section>

                {/* FAQ — 답변엔진(AEO)이 그대로 인용할 수 있게 질문/답을 화면에 노출한다.
                    index.html 의 FAQPage JSON-LD 와 같은 문답을 유지할 것. */}
                <section className="mt-12 md:mt-16">
                    <h2 className="text-[22px] font-bold tracking-tight md:text-[28px]">
                        자주 묻는 질문
                    </h2>
                    <div className="mt-6 grid gap-3 md:grid-cols-2 md:gap-4">
                        {FAQS.map((f) => (
                            <article
                                key={f.q}
                                className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:p-6"
                            >
                                <h3 className="text-[15.5px] font-bold leading-snug text-ink-1">
                                    {f.q}
                                </h3>
                                <p className="mt-2 text-[13.5px] leading-relaxed text-ink-3">{f.a}</p>
                            </article>
                        ))}
                    </div>
                </section>

                {/* 앱 다운로드 */}
                {!isNative && (
                    <section
                        id="download"
                        className="mt-12 scroll-mt-6 rounded-3xl bg-white p-7 shadow-[0_1px_2px_rgba(0,0,0,0.05)] md:mt-16 md:p-10"
                    >
                        <div className="lg:flex lg:items-center lg:gap-12">
                            <img
                                src="/brand-poster.jpg"
                                alt="랭큐 RANKUE 브랜드 포스터"
                                width={800}
                                height={1200}
                                loading="lazy"
                                decoding="async"
                                className="mx-auto mb-7 hidden w-[15rem] rounded-2xl md:block lg:mb-0"
                            />

                            <div className="lg:flex-1">
                                <h2 className="text-center text-[20px] font-bold tracking-tight md:text-[26px] lg:text-left">
                                    앱으로 더 편하게
                                </h2>
                                <p className="mt-2 break-keep text-center text-[14px] font-medium leading-relaxed text-ink-3 lg:text-left">
                                    푸시 알림, 음성 안내까지 그대로. 당구장에서 폰만 세워두면 점수판이
                                    됩니다.
                                </p>

                                <div className="mx-auto mt-6 flex max-w-md flex-col gap-2.5 sm:flex-row lg:mx-0">
                                    <a
                                        href={STORE_ANDROID}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-[#1c1c1f] text-[14.5px] font-bold text-white transition-transform active:scale-[0.98]"
                                    >
                                        Google Play
                                    </a>
                                    <a
                                        href={STORE_IOS}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex h-12 flex-1 items-center justify-center rounded-2xl bg-black/[0.05] text-[14.5px] font-bold text-ink-1 transition-transform active:scale-[0.98]"
                                    >
                                        App Store
                                    </a>
                                </div>

                                {/* PC에서 보는 사람을 위한 QR — 폰으로 바로 넘어갈 수 있게 */}
                                <div className="mt-7 hidden items-center justify-center gap-4 sm:flex lg:justify-start">
                                    <div className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                        <QRCodeSVG value="https://www.rankue.co.kr" size={104} level="M" />
                                    </div>
                                    <p className="text-[13px] font-medium leading-relaxed text-ink-3">
                                        휴대폰으로 스캔하면
                                        <br />
                                        바로 열려요
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>
                )}

                {/* 마무리 CTA */}
                <section className="mt-12 rounded-3xl bg-brand p-8 text-center shadow-[0_8px_24px_rgba(0,98,65,0.20)] md:mt-16 md:p-12">
                    <h2 className="text-[22px] font-bold tracking-tight text-white md:text-[30px]">
                        오늘 친 경기부터 남겨보세요
                    </h2>
                    <p className="mt-2.5 text-[14px] font-medium text-white/75 md:text-[16px]">
                        손안의 당구 점수판, 랭큐
                    </p>
                    <button
                        onClick={onStart}
                        className="mx-auto mt-6 h-14 w-full max-w-sm rounded-full bg-white text-[15.5px] font-bold text-brand transition-transform active:scale-[0.98]"
                    >
                        무료로 시작하기
                    </button>
                </section>

                <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium text-ink-4">
                    <a href="/about" className="hover:text-ink-2">랭큐 소개</a>
                    <span aria-hidden>·</span>
                    <a href="/stores" className="hover:text-ink-2">당구장 찾기</a>
                    <span aria-hidden>·</span>
                    <a href="/support" className="hover:text-ink-2">고객지원</a>
                    <span aria-hidden>·</span>
                    <a href="/privacy" className="hover:text-ink-2">개인정보처리방침</a>
                </nav>
            </div>
        </div>
    );
}
