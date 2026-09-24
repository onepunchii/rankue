import { LucideFlag } from "@/lib/icons";
import { useLocation } from "wouter";
import { PassportStats } from '@/golf/hooks/usePassportData';

interface Props {
    stats: PassportStats;
}

/**
 * 여권 첫 카드. 예전 값 중 셋이 가짜였다: 제목 '마스터 탐험가'(고정), 분모 '/ 520'(고정),
 * '상위 15%'(정복 수로 지어낸 공식). 유일한 버튼 '기록 동기화' 는 '준비 중' 스캐너로 갔다(2026-09-11).
 *
 * 둘째 판(2026-09-24 오너: "이 디자인도 우리와 잘 맞게 세련되게") — 골프장 상세 머리와 같은 말투로:
 *  - 9~11px 글자·font-black·tracking-tighter 를 걷었다(라벨 12px, 숫자 semibold).
 *  - 라운드 시작은 카드 모서리에 떠 있던 테두리 알약 → 제목 줄 오른쪽 흰 알약 하나.
 *  - 다음 레벨까지 얼마인지 **막대**로 — 서버가 주는 다음 문턱(nextLevelAt)까지 정복 수. 이전 문턱은 모르니 0부터 잰다.
 *  - 숫자 셋은 얇은 세로선으로 나눈 한 띠(세 칸 너비를 똑같이 — 예전엔 셋째 칸만 왼쪽 여백이 달라 줄이 안 맞았다).
 */
export const PassportStatsCard = ({ stats }: Props) => {
    const [, setLocation] = useLocation();
    const toNext = stats.nextLevelAt != null ? Math.max(0, stats.nextLevelAt - stats.conquered) : null;
    const pct = stats.nextLevelAt ? Math.min(100, Math.round((stats.conquered / stats.nextLevelAt) * 100)) : 100;

    const cells: { label: string; value: React.ReactNode }[] = [
        {
            label: "정복한 골프장",
            value: (
                <>
                    <span className="text-[#8BE84A]">{stats.conquered}</span>
                    <span className="ml-1 text-[13px] font-medium text-[#FFFFFF59]">/ {stats.totalCourses.toLocaleString()}</span>
                </>
            ),
        },
        { label: "라운드", value: <>{stats.rounds}<span className="ml-0.5 text-[14px] font-medium text-[#FFFFFF8C]">회</span></> },
        {
            label: "85타 미만",
            value: <><span className="text-[#FFC43D] mr-1">★</span>{stats.starsCollected}</>,
        },
    ];

    return (
        <section className="mb-10 rounded-3xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="h-6 px-2 rounded-md bg-[#FF8A3D26] text-[#FFB27A] text-[12px] font-semibold leading-6 tabular-nums">Lv.{stats.levelNum}</span>
                        {toNext != null && toNext > 0 && (
                            <span className="text-[13px] text-[#FFFFFF8C] tabular-nums">다음 레벨까지 {toNext}곳</span>
                        )}
                    </div>
                    <h2 className="mt-2 text-[26px] leading-tight font-bold tracking-tight text-white break-keep">{stats.level}</h2>
                </div>
                <button
                    type="button"
                    onClick={() => setLocation('/golf/game/new?mode=match')}
                    className="shrink-0 h-10 px-4 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#E85200] shadow-md shadow-[#FF6B00]/20 text-[#ffffff] text-[14px] font-semibold inline-flex items-center gap-1.5 active:opacity-90"
                >
                    {/* 주황 포인트(2026-09-24 오너: 골프 색은 그린 + 주황) — 이 화면의 주 행동 하나에만 */}
                    <LucideFlag weight="fill" className="w-4 h-4" />
                    라운드 시작
                </button>
            </div>

            {stats.nextLevelAt != null && (
                <div className="mt-4">
                    <div className="h-1.5 rounded-full bg-[#FFFFFF14] overflow-hidden" role="progressbar" aria-valuemin={0} aria-valuemax={stats.nextLevelAt} aria-valuenow={stats.conquered} aria-label="다음 레벨까지">
                        <div className="h-full rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#E85200]" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="mt-1.5 text-right text-[12px] text-[#FFFFFF59] tabular-nums">{stats.conquered} / {stats.nextLevelAt}곳</p>
                </div>
            )}

            <div className="mt-4 grid grid-cols-3 rounded-2xl bg-[#FFFFFF06] divide-x divide-[#FFFFFF0F]">
                {cells.map((c) => (
                    <div key={c.label} className="min-w-0 px-3.5 py-3">
                        <p className="text-[12px] text-[#FFFFFF73] truncate">{c.label}</p>
                        <p className="mt-1 text-[20px] leading-none font-semibold text-white tabular-nums whitespace-nowrap">{c.value}</p>
                    </div>
                ))}
            </div>

            {stats.conquered === 0 && (
                <p className="mt-4 text-[13px] text-[#FFFFFF8C] break-keep leading-relaxed">
                    랭큐매치로 18홀을 끝까지 적고 라운드를 끝내면, 그 골프장 도장이 찍혀요.
                </p>
            )}
        </section>
    );
};
