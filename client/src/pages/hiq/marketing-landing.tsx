import { QRCodeSVG } from "qrcode.react";
import { Capacitor } from "@capacitor/core";
import { useSeo } from "@/hooks/useSeo";
import { BilliardBall } from "@/components/hiq/ui/BilliardBall";

// 설치 배너(HiqInstallBanner)와 같은 링크. utm 만 랜딩용으로 구분해 유입 경로를 나눈다.
const STORE_IOS = "https://apps.apple.com/app/id6760333313?ct=web_landing";
const STORE_ANDROID =
    "https://play.google.com/store/apps/details?id=com.rankue.app&referrer=utm_source%3Dweb%26utm_medium%3Dlanding";

// 검색으로 들어온 비로그인 방문자에게 보여주는 마케팅 랜딩.
// 기존 홈(/)은 곧바로 전화번호 입력 폼이라, 랭큐를 모르는 사람이 검색으로 들어오면
// "휴대폰 번호를 입력하세요"만 보고 이탈했다. 그래서 홈을 방문자 유형으로 가른다:
//   앱/로그인 사용자 → 기존 로그인·대시보드 그대로, 검색 방문자 → 이 화면.

const FEATURES = [
    { name: "손안의 점수판", desc: "터치로 점수 기록. 이닝·평균·하이런 자동 계산, 음성 안내, 되돌리기까지." },
    { name: "매칭 대결", desc: "상대와 1:1 경기. 핀(PIN) 코드로 같은 점수판에 함께 입장해요." },
    { name: "경기 기록", desc: "모든 경기를 자동 저장. 전적·평균·하이런을 한눈에." },
    { name: "크루", desc: "당구 동호회를 만들고 가입해 활동·사진·채팅으로 함께 즐기기." },
    { name: "시뮬레이터", desc: "화면 위 가상 당구대에서 혼자 3구·4구 연습." },
    { name: "랭킹", desc: "매장별·전국 3쿠션·4구 순위." },
];

export default function MarketingLanding({ onStart }: { onStart: () => void }) {
    useSeo({
        title: "랭큐 RANKUE · 손안의 당구 점수판",
        description:
            "스마트폰으로 당구 점수를 간편하게 기록하세요. 이닝·평균·하이런 자동 계산, 상대와 매칭, 경기 자동 기록, 매장·전국 랭킹까지. 3쿠션·4구 지원, 무료.",
        path: "/",
        locale: "ko",
        image: "https://www.rankue.co.kr/og.png",
    });

    // 앱 안에서는 스토어 버튼·QR이 무의미하다(이미 설치한 사람이다).
    const isNative = Capacitor.isNativePlatform();

    return (
        <div className="min-h-screen w-full bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] font-sans">
            <div className="mx-auto max-w-lg px-6 pb-16 pt-14">
                {/* Hero */}
                <header className="text-center">
                    <img
                        src="/icon-192.png"
                        alt="랭큐"
                        className="mx-auto h-20 w-20 rounded-3xl shadow-[0_4px_16px_rgba(0,0,0,0.10)]"
                    />
                    <h1 className="mt-6 text-[34px] font-bold leading-tight tracking-tight">
                        손안의 당구 점수판
                    </h1>
                    <p className="mt-3 text-[16px] font-medium leading-relaxed text-black/60">
                        복잡한 계산 없이 터치로 점수를 기록하세요.
                        <br />
                        이닝·평균·하이런은 랭큐가 알아서 세어줍니다.
                    </p>

                    <button
                        onClick={onStart}
                        className="mt-8 h-14 w-full rounded-full bg-brand text-[16px] font-bold text-white shadow-[0_8px_24px_rgba(0,98,65,0.22)] active:scale-[0.98] transition-transform"
                    >
                        바로 시작하기
                    </button>
                    <p className="mt-2.5 text-[12.5px] font-medium text-black/40">
                        설치 없이 웹에서 바로 · 무료
                    </p>
                </header>

                {/* 앱 다운로드 */}
                {!isNative && (
                    <section className="mt-12 rounded-3xl bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                        <h2 className="text-center text-[17px] font-bold">앱으로 더 편하게</h2>
                        <p className="mt-1 text-center text-[13px] font-medium text-black/50">
                            푸시 알림, 음성 안내까지 그대로
                        </p>

                        <div className="mt-5 flex flex-col gap-2.5">
                            <a
                                href={STORE_ANDROID}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-12 items-center justify-center rounded-2xl bg-[#1c1c1f] text-[14.5px] font-bold text-white active:scale-[0.98] transition-transform"
                            >
                                Google Play
                            </a>
                            <a
                                href={STORE_IOS}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex h-12 items-center justify-center rounded-2xl bg-black/[0.05] text-[14.5px] font-bold text-ink-1 active:scale-[0.98] transition-transform"
                            >
                                App Store
                            </a>
                        </div>

                        {/* PC에서 보는 사람을 위한 QR — 폰으로 바로 넘어갈 수 있게 */}
                        <div className="mt-6 hidden flex-col items-center sm:flex">
                            <div className="rounded-2xl bg-white p-3 shadow-[0_1px_2px_rgba(0,0,0,0.06)]">
                                <QRCodeSVG value="https://www.rankue.co.kr" size={116} level="M" />
                            </div>
                            <p className="mt-2.5 text-[12px] font-medium text-black/45">
                                휴대폰으로 스캔하면 바로 열려요
                            </p>
                        </div>
                    </section>
                )}

                {/* 기능 */}
                <section className="mt-12">
                    <h2 className="text-[20px] font-bold tracking-tight">이런 걸 할 수 있어요</h2>
                    <div className="mt-4 grid gap-3">
                        {FEATURES.map((f) => (
                            <article
                                key={f.name}
                                className="rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.05)]"
                            >
                                <h3 className="text-[15px] font-bold text-ink-1">{f.name}</h3>
                                <p className="mt-1 text-[13.5px] leading-relaxed text-black/60">{f.desc}</p>
                            </article>
                        ))}
                    </div>
                </section>

                {/* 종목 */}
                <section className="mt-12 rounded-3xl bg-white p-6 text-center shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                    <h2 className="text-[17px] font-bold">3쿠션 · 4구 모두 지원</h2>
                    <div className="mt-5 flex items-center justify-center gap-8">
                        <div className="flex flex-col items-center gap-2.5">
                            <div className="flex -space-x-1.5">
                                <BilliardBall color="white" size={30} />
                                <BilliardBall color="yellow" size={30} />
                                <BilliardBall color="red" size={30} />
                            </div>
                            <span className="text-[13px] font-bold text-black/55">3쿠션</span>
                        </div>
                        <div className="flex flex-col items-center gap-2.5">
                            <div className="flex -space-x-1.5">
                                <BilliardBall color="white" size={30} />
                                <BilliardBall color="yellow" size={30} />
                                <BilliardBall color="red" size={30} />
                                <BilliardBall color="red" size={30} />
                            </div>
                            <span className="text-[13px] font-bold text-black/55">4구</span>
                        </div>
                    </div>
                </section>

                {/* CTA */}
                <section className="mt-12 rounded-3xl bg-brand p-7 text-center shadow-[0_8px_24px_rgba(0,98,65,0.20)]">
                    <h2 className="text-[20px] font-bold text-white">지금 시작하세요</h2>
                    <p className="mt-2 text-[13.5px] font-medium text-white/80">
                        손안의 당구 점수판, 랭큐
                    </p>
                    <button
                        onClick={onStart}
                        className="mt-5 h-12 w-full rounded-full bg-white text-[15px] font-bold text-brand active:scale-[0.98] transition-transform"
                    >
                        무료로 시작하기
                    </button>
                </section>

                <nav className="mt-10 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] font-medium text-black/45">
                    <a href="/about" className="hover:text-black/70">랭큐 소개</a>
                    <span aria-hidden>·</span>
                    <a href="/stores" className="hover:text-black/70">매장 찾기</a>
                    <span aria-hidden>·</span>
                    <a href="/support" className="hover:text-black/70">고객지원</a>
                    <span aria-hidden>·</span>
                    <a href="/privacy" className="hover:text-black/70">개인정보처리방침</a>
                </nav>
            </div>
        </div>
    );
}
