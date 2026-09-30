/**
 * 라운딩 리포트 '홀 기록 통계'(2026-10-01 오너 승인) — 경기 화면 '이 홀 기록' 카드에 적은 것만으로 센다(shared summarizeHoleStats).
 *   평균 퍼트 · 페어웨이 안착률 · 그린 적중률 · OB 횟수. 적은 게 없는 칸은 숨기고, 아무것도 없으면 통째로 없다.
 *   '기록한 N라운드 기준' — 안 적은 홀·라운드는 분모에도 넣지 않는다(안 적은 걸 0 으로 세면 통계가 거짓이 된다).
 * 그림 규칙(dataviz): 큰 숫자는 흰 글자·비례 숫자(tabular 는 줄 맞춤 표에만), 비율은 같은 색조 막대(적중 = 라임, 바탕 = 옅은 라임),
 * 페어웨이는 왼쪽·안착·오른쪽 세 칸을 **실제 방향대로** 놓고 안착만 라임 — 색이 아니라 자리와 글자가 뜻을 말한다.
 * 미스 칸 회색 #6B6B6B 는 타일 바탕(#181818)에서 3:1 을 넘고 라임과 색각 이상 시뮬레이션 ΔE 31(검증 스크립트로 쟀다).
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useMemo, type ReactNode } from "react";
import { summarizeHoleStats, type HoleStatsSummary, type RoundHoleData } from "@shared/golfHoleStats";
import { useMyHoleStatsRounds } from "../hooks/useHoleStats";

const pct = (r: number) => Math.round(r * 100);
const one = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function Tile({ label, value, unit, caption, children }: { label: string; value: string; unit: string; caption: ReactNode; children?: ReactNode }) {
    return (
        <div className="min-w-0 rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] px-4 py-3.5 flex flex-col">
            <p className="text-[12.5px] text-[#FFFFFF99]">{label}</p>
            <p className="mt-1.5 text-[26px] leading-none font-semibold tracking-tight text-[#ffffff]">
                {value}<span className="ml-0.5 text-[13px] font-medium tracking-normal text-[#FFFFFF80]">{unit}</span>
            </p>
            {children && <div className="mt-3">{children}</div>}
            <div className="mt-auto pt-2 text-[12px] text-[#FFFFFF8C] tabular-nums">{caption}</div>
        </div>
    );
}

/** 비율 막대 — 채움 라임, 바탕은 같은 색조의 옅은 단계 */
function Meter({ rate, label }: { rate: number; label: string }) {
    const w = Math.max(0, Math.min(100, rate * 100));
    return (
        <div role="img" aria-label={label} className="h-2 rounded-full bg-[#64DD1729] overflow-hidden">
            <div className="h-full rounded-full bg-[#64DD17]" style={{ width: `${w}%` }} />
        </div>
    );
}

/** 왼쪽 미스 | 안착 | 오른쪽 미스 — 칸 사이 2px 틈(바탕색), 바깥 끝만 둥글게. 0 인 칸은 그리지 않는다 */
function FairwayBar({ left, hit, right }: { left: number; hit: number; right: number }) {
    const total = left + hit + right;
    const segs = ([["L", left, "bg-[#6B6B6B]"], ["H", hit, "bg-[#64DD17]"], ["R", right, "bg-[#6B6B6B]"]] as const).filter(([, n]) => n > 0);
    return (
        <div role="img" aria-label={`왼쪽 미스 ${left}홀 · 안착 ${hit}홀 · 오른쪽 미스 ${right}홀`} className="h-2 flex gap-[2px]">
            {segs.map(([k, n, color], i) => (
                <span
                    key={k}
                    className={`${color} h-full min-w-[4px] ${i === 0 ? "rounded-l-full" : ""} ${i === segs.length - 1 ? "rounded-r-full" : ""}`}
                    style={{ flexGrow: n / total, flexBasis: 0 }}
                />
            ))}
        </div>
    );
}

export function HoleStatsTiles({ summary }: { summary: HoleStatsSummary }) {
    const { putts, fairway, gir, ob } = summary;
    if (summary.rounds === 0 || (!putts && !fairway && !gir && !ob)) return null;
    return (
        <section aria-label="홀 기록 통계">
            <div className="flex items-baseline justify-between mb-2.5">
                <h2 className="text-[17px] font-bold tracking-tight text-[#ffffff]">홀 기록 통계</h2>
                <span className="text-[12.5px] text-[#FFFFFF8C] tabular-nums">기록한 {summary.rounds}라운드 기준</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
                {putts && (
                    <Tile label="평균 퍼트" value={putts.perHole.toFixed(2)} unit="/홀" caption={<>18홀 환산 {one(putts.per18)}</>} />
                )}
                {fairway && (
                    <Tile label="페어웨이 안착률" value={String(pct(fairway.rate))} unit="%"
                        caption={<span className="flex justify-between gap-2"><span>왼쪽 {fairway.left}</span><span>오른쪽 {fairway.right}</span></span>}>
                        <FairwayBar left={fairway.left} hit={fairway.hit} right={fairway.right} />
                    </Tile>
                )}
                {gir && (
                    <Tile label="그린 적중률" value={String(pct(gir.rate))} unit="%" caption={<>{gir.holes}홀 중 {gir.hit}홀</>}>
                        <Meter rate={gir.rate} label={`그린 적중 ${gir.holes}홀 중 ${gir.hit}홀`} />
                    </Tile>
                )}
                {ob && (
                    <Tile label="OB 횟수" value={String(ob.total)} unit="회" caption={<>라운드당 {one(ob.perRound)}</>} />
                )}
            </div>
        </section>
    );
}

const NO_ROUNDS: readonly RoundHoleData[] = [];

/**
 * 라운딩 리포트에 끼우는 한 칸 — 내 기록을 받아 센다. 적은 게 없으면 아무것도 그리지 않는다.
 * historyIds: 리포트가 지금 세는 라운드(기본 공식만, '미인증 포함'이면 전부) — 위 평균과 같은 라운드로 센다(2026-10-01).
 */
export function HoleStatsReport({ historyIds }: { historyIds?: ReadonlySet<string> }) {
    const q = useMyHoleStatsRounds();
    const all = q.data?.rounds ?? NO_ROUNDS;
    const list = useMemo(() => (historyIds ? all.filter((r) => r.historyId != null && historyIds.has(r.historyId)) : all), [all, historyIds]);
    const summary = useMemo(() => summarizeHoleStats(list), [list]);
    return <HoleStatsTiles summary={summary} />;
}
