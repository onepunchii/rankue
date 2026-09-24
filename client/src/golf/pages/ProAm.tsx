import { useLocation } from "wouter";
import { LucideTrophy, LucideUsers, LucideCalendarDays } from "@/lib/icons";
import { GolfBackButton } from "@/golf/components/common/GolfBackButton";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";

/**
 * 랭큐 프로암 — 홈 네 번째 자리(예전 회원권 거래소).
 *
 * 아직 응모를 열지 않는다. 프로암은 자리를 누가 대는지가 전부이고 그게 정해지기 전에
 * 응모 화면부터 만들면 껍데기만 남는다(2026-09-09 오너와 정리). 지금은 무엇인지 설명하고,
 * 크루 성적이 왜 필요한지 이어 준다 — 응모가 열리면 크루 기록이 우선권의 근거가 된다.
 */
export default function ProAm() {
    const [, setLocation] = useLocation();
    return (
        <div className="min-h-screen bg-[#0A0A0A] text-white pb-nav font-sans">
            <div className="sticky top-0 z-40 bg-[#0A0A0A]/90 backdrop-blur-2xl border-b border-white/5">
                <div className="px-5 h-16 flex items-center gap-3">
                    <GolfBackButton onClick={() => setLocation("/dashboard")} label="뒤로" />
                    <h1 className="text-[17px] font-bold">랭큐 프로암</h1>
                </div>
            </div>

            <div className="px-5 pt-8">
                <div className="rounded-[1.5rem] border border-[#64DD17]/25 bg-[#64DD17]/[0.06] p-6">
                    <span className="inline-flex items-center h-7 px-3 rounded-full bg-[#64DD17] text-[#0A0A0A] text-[12px] font-black">준비 중</span>
                    <h2 className="mt-4 text-[22px] font-extrabold leading-snug">프로와 한 조로<br />라운드하는 자리</h2>
                    <p className="mt-3 text-[13.5px] font-medium text-white/60 leading-relaxed">
                        응모가 열리면 여기에서 신청합니다. 자리가 적은 만큼 크루 성적과 참여도가 우선권의 기준이 됩니다.
                    </p>
                </div>

                <ul className="mt-8 space-y-3">
                    {[
                        { icon: LucideUsers, title: "크루 단위로 응모", desc: "혼자가 아니라 크루로 신청합니다" },
                        { icon: LucideTrophy, title: "기록이 곧 순번", desc: "라운드를 남긴 크루가 먼저입니다" },
                        { icon: LucideCalendarDays, title: "열리면 알려드립니다", desc: "응모 기간에 맞춰 알림이 갑니다" },
                    ].map((row) => (
                        <li key={row.title} className="flex items-center gap-4 rounded-[1.25rem] bg-white/[0.04] border border-white/10 p-4">
                            <span className="w-11 h-11 shrink-0 rounded-2xl bg-[#64DD17]/12 flex items-center justify-center">
                                <row.icon className="w-5 h-5 text-[#64DD17]" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-[15px] font-bold">{row.title}</span>
                                <span className="block text-[12.5px] font-medium text-white/55 mt-0.5">{row.desc}</span>
                            </span>
                        </li>
                    ))}
                </ul>

                <button
                    onClick={() => setLocation("/club")}
                    className="mt-8 w-full h-13 py-4 rounded-2xl bg-[#64DD17] text-[#0A0A0A] text-[15px] font-black active:scale-[0.99] transition-transform"
                >
                    크루부터 만들기
                </button>
            </div>

            <HiqNavigation />
        </div>
    );
}
