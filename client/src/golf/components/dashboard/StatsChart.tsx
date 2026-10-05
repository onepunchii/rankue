import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import { LucideChevronRight } from "lucide-react";
import { Link } from "wouter";
import { SampleBadge } from "@/components/hiq/GuestGate";

/**
 * 스코어 트렌드 — 홈의 라운드 기록 **입구**다(2026-09-23).
 *
 * 예전엔 그냥 그림이었다. 오른쪽에 화살표가 하나 있었지만 text-white/20 짜리 장식이었고 onClick 이 없어서
 * 눌러도 아무 일이 없었다. 그런데 하단 탭의 '라운드'(/history)가 '내 예약'으로 바뀌면서 이 카드가
 * 라운드 기록으로 가는 **주 입구**가 됐다 — 누를 수 있다는 걸 알려야 한다.
 *
 * 카드 전체가 눌린다(MyCrewCard 와 같은 문법). 화살표만 노리게 하면 375px 에서 아무도 못 누른다.
 * 기록이 하나도 없어도 들어간다 — 빈 /history 는 "아직 기록이 없어요"를 말해 주는 화면이고,
 * 못 들어가게 막으면 첫 라운드를 올릴 방법을 찾을 데가 없다.
 *
 * 예시(sample, 2026-10-05 오너 결정: "홈을 비로그인에 다 열고, 가입 안 한 사람에겐 예시로 보여 준다") —
 * 비로그인 골프 홈은 shared/guestSample 의 숫자로 이 카드를 그린다. 그때는 ① 제목 줄에 "예시" 표시가 붙고
 * ② 카드가 **링크가 아니다**. 방문자에게 /history 는 로그인 안내 한 장이라, 그래프를 눌렀다가 거기 떨어지면 막다른 길이다
 * (가입으로 가는 길은 핸디캡 숫자 아래의 한 줄이 맡는다). 회원은 sample 을 주지 않으므로 예전 그대로다.
 */

interface StatsChartProps {
    recentScores: { id: number; score: number }[];
    stats: {
        bestScore: number;
        totalRounds: number;
        avgScore: string | number;
    };
    /** 예시 숫자를 그리는 중인가 — true 면 "예시" 표시를 붙이고 링크로 만들지 않는다 */
    sample?: boolean;
}

export function StatsChart({ recentScores, stats, sample = false }: StatsChartProps) {
    const body = (
        <>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 px-2">
                <h2 className="text-lg font-semibold text-white">Score Trend</h2>
                {sample ? (
                    <SampleBadge tone="dark" />
                ) : (
                    <span className="flex items-center gap-1 text-[12px] font-medium text-white/45 group-hover:text-white transition-colors">
                        기록 보기
                        <LucideChevronRight className="w-4 h-4" />
                    </span>
                )}
            </div>

            <div className="bg-white/[0.03] border border-white/5 rounded-[2rem] p-6 backdrop-blur-sm transition-colors group-active:bg-white/[0.06]">
                {/* Graph */}
                <div className="h-32 w-full mb-6">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={recentScores}>
                            <defs>
                                <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#64DD17" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#64DD17" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <YAxis hide domain={['dataMin - 5', 'dataMax + 5']} />
                            <Area
                                type="monotone"
                                dataKey="score"
                                stroke="#64DD17"
                                strokeWidth={3}
                                fillOpacity={1}
                                fill="url(#colorScore)"
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                {/* Key Stats Grid */}
                <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-4">
                    {/* 1. Best Score */}
                    <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-white/40 uppercase mb-1 tracking-wider">Best Score</span>
                        <span className="text-xl font-black text-white">
                            {stats.bestScore} <span className="text-xs text-[#64DD17] font-bold">타</span>
                        </span>
                    </div>

                    {/* 2. Avg Score (Most Important) */}
                    <div className="flex flex-col items-center relative">
                        {/* Dividers */}
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-px h-8 bg-white/10" />

                        <span className="text-[9px] font-bold text-white/40 uppercase mb-1 tracking-wider">핸디캡 (HDCP)</span>
                        <span className="text-xl font-black text-[#64DD17]">
                            {stats.avgScore}
                        </span>
                    </div>

                    {/* 3. Total Rounds (Activity) */}
                    <div className="flex flex-col items-center">
                        <span className="text-[9px] font-bold text-white/40 uppercase mb-1 tracking-wider">Rounds</span>
                        <span className="text-xl font-black text-white">
                            {stats.totalRounds} <span className="text-xs text-white/40 font-bold">회</span>
                        </span>
                    </div>
                </div>
            </div>
        </>
    );

    // 예시는 눌리지 않는 카드다 — 같은 자리·같은 여백, 링크만 아니다
    if (sample) return <div className="block mb-4 relative z-10">{body}</div>;

    return (
        <Link href="/history" className="block mb-4 relative z-10 group" aria-label="라운드 기록 보기">
            {body}
        </Link>
    );
}
