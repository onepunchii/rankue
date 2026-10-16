/**
 * 초대 링크로 들어온 첫 화면 /i/:code(2026-10-16 오너: "해당 큐대로 친구초대 하기 버튼으로 해당 url 로 누가 들어와서 가입하면").
 * 로그인 없이 열린다. 들어오자마자 이 기기에 초대 표시를 남기고(lib — readInviteMark), 가입 · 로그인하면 InviteClaimer 가 서버에 낸다.
 *  - 위: 핫핑크 만화 판 — "OO님이 초대했어요" · 초대한 사람의 대표 큐(없으면 말랑 큐볼)
 *  - 가운데: 가입하면 받는 환영 초크 · 랭큐 한 줄 소개 · 초대 코드(앱을 깔고 앱에서 가입할 때 넣는다)
 *  - 아래: '가입하고 환영 초크 받기'(가입 팝업). 이미 회원이면 '큐 케이스 보기'
 * 봇(카톡 미리보기)에게는 server/prerender 의 /i/:code 가 제목 · 그림을 준다.
 */
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { caseImage, caseItem, type CaseLocale } from "@shared/cueCase";
import { cleanInviteCode } from "@shared/invite";
import { fetchInviteCard, inviteCardKey, writeInviteMark } from "@/components/hiq/invite/inviteApi";

const LOCALES: readonly CaseLocale[] = ["ko", "en", "es", "vi", "tr"];
const INK = "#1A0B14";

export default function InvitePage() {
    const { t, locale } = useT();
    const l: CaseLocale = (LOCALES as readonly string[]).includes(locale) ? (locale as CaseLocale) : "en";
    const params = useParams<{ code: string }>();
    const code = cleanInviteCode(params.code);
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const q = useQuery({ queryKey: inviteCardKey(code ?? ""), queryFn: () => fetchInviteCard(code!), enabled: !!code, retry: false, staleTime: 5 * 60_000 });
    useEffect(() => { if (code) writeInviteMark(code); }, [code]);
    useEffect(() => { document.title = q.data ? t("inv.cardTitle").replace("{name}", q.data.name) : "RANKUE"; }, [q.data, t]);

    const hero = (q.data?.hero ? caseItem(q.data.hero) : null) ?? caseItem("cue-lt-inv-jelly")!;
    const gift = caseItem("chalk-welcome")!;
    const bad = !code || q.isError;

    return (
        <div className="relative min-h-[100dvh] overflow-hidden" style={{ background: "linear-gradient(180deg, #FF4FA3 0%, #FF2E8A 55%, #C2187A 100%)", color: INK, paddingTop: "env(safe-area-inset-top)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }} data-testid="invite-page">
            {/* 망점 */}
            <div aria-hidden className="pointer-events-none absolute inset-0 opacity-[0.16]" style={{ backgroundImage: "radial-gradient(#FFFFFF 2.4px, transparent 2.6px)", backgroundSize: "22px 22px" }} />
            <div className="relative mx-auto w-full max-w-[440px] px-5">
                <header className="flex h-14 items-center gap-2">
                    <img src="/icon-192.png" alt="" width={28} height={28} className="h-7 w-7 rounded-lg" style={{ boxShadow: `0 0 0 2px ${INK}` }} />
                    <span className="text-[15px] font-bold tracking-[0.08em] text-white">RANKUE</span>
                </header>

                {bad ? (
                    <div className="mt-24 rounded-[26px] bg-white px-5 py-7 text-center" style={{ boxShadow: `0 6px 0 ${INK}`, border: `3px solid ${INK}` }} data-testid="invite-bad">
                        <p className="text-[18px] font-bold">{t("inv.landBad")}</p>
                        <button type="button" onClick={() => setLocation("/")} className="mt-5 h-12 w-full rounded-full text-[15px] font-bold text-white" style={{ background: INK }}>{t("inv.landBrowse")}</button>
                    </div>
                ) : (
                    <>
                        {/* 별 터짐 + 제목 */}
                        <div className="relative mt-6 flex min-h-[150px] items-center justify-center">
                            <svg aria-hidden viewBox="-200 -90 400 180" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
                                <polygon points={Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2, r = i % 2 ? 165 : 196; return `${(Math.cos(a) * r).toFixed(1)},${(Math.sin(a) * r * 0.42).toFixed(1)}`; }).join(" ")} fill="#FFE14D" stroke={INK} strokeWidth="5" strokeLinejoin="round" />
                            </svg>
                            <h1 className="relative px-10 text-center text-[27px] font-bold leading-tight tracking-tight break-keep" style={{ color: "#FFFFFF", WebkitTextStroke: `1.4px ${INK}`, paintOrder: "stroke fill", textShadow: `0 3px 0 ${INK}` }} data-testid="invite-title">
                                {q.data ? t("inv.landTitle").replace("{name}", q.data.name) : "…"}
                            </h1>
                        </div>

                        {/* 초대한 사람의 대표 큐 */}
                        <div className="cue-case mt-5 rounded-[28px] px-4 pb-4 pt-3.5" style={{ background: "#14102A", border: `3px solid ${INK}`, boxShadow: `0 6px 0 ${INK}` }}>
                            <p className="text-center text-[12.5px] font-semibold text-white/70">{q.data ? t("inv.landHero").replace("{name}", q.data.name) : ""}</p>
                            <span className="cc-slot mt-2 block"><img src={caseImage(hero)} alt={hero.name[l]} className="cc-own" draggable={false} data-testid="invite-hero" /></span>
                            <p className="mt-2 text-center text-[13px] font-semibold text-white">{hero.name[l]}</p>
                        </div>

                        {/* 환영 초크 + 소개 */}
                        <div className="mt-5 flex items-center gap-3 rounded-[24px] bg-white px-4 py-3.5" style={{ border: `3px solid ${INK}`, boxShadow: `0 6px 0 ${INK}` }}>
                            <img src={caseImage(gift)} alt="" width={84} height={84} className="h-[84px] w-[84px] shrink-0 -rotate-6 object-contain" draggable={false} />
                            <div className="min-w-0">
                                <p className="text-[12.5px] font-bold text-[#C2187A]">{t("inv.landGift")}</p>
                                <p className="text-[17px] font-bold">{gift.name[l]}</p>
                                <p className="mt-1 text-[12.5px] leading-relaxed text-[#5A2A46] break-keep">{t("inv.landDesc")}</p>
                            </div>
                        </div>

                        {code && (
                            <p className="mt-4 text-center text-[13px] font-semibold text-white" data-testid="invite-code">
                                {t("inv.cardCode")} <span className="rk-num ml-1 rounded-md px-2 py-0.5 text-[16px] tracking-[0.2em]" style={{ background: INK }}>{code}</span>
                            </p>
                        )}

                        <div className="mt-5">
                            {!isLoading && !member && (
                                <button type="button" onClick={() => goLogin(setLocation, "/cue-case")} className="h-14 w-full rounded-full text-[16px] font-bold" style={{ background: "#FFE14D", color: INK, border: `3px solid ${INK}`, boxShadow: `0 5px 0 ${INK}` }} data-testid="invite-join">
                                    {t("inv.landCta")}
                                </button>
                            )}
                            {member && (
                                <div className="rounded-[22px] bg-white/90 px-4 py-4 text-center" style={{ border: `3px solid ${INK}` }} data-testid="invite-member">
                                    <p className="text-[15px] font-bold">{t("inv.landMember")}</p>
                                    <p className="mt-1 text-[12.5px] leading-relaxed text-[#5A2A46] break-keep">{t("inv.landMemberDesc")}</p>
                                    <button type="button" onClick={() => setLocation("/cue-case")} className="mt-3 h-12 w-full rounded-full text-[15px] font-bold text-white" style={{ background: INK }}>{t("inv.landOpenCase")}</button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
