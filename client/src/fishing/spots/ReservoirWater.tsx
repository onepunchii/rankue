/**
 * 이 저수지 물높이(2026-10-19) — 저수지 낚시터 페이지. 붕어 낚시꾼이 나가기 전에 보는 것: 지금 얼마나 찼나, 이레 동안 오르나 빠지나.
 * 그림은 저수지 단면 한 장(왼쪽 비탈 · 바닥 · 오른쪽 둑) — 물이 저수율만큼 차고, 이레 전 물높이를 점선으로. 아래는 날마다의 막대.
 * 자료: 한국농어촌공사 저수지 수위(GET /api/hiq/fishing/spots/:id/water — 이름이 같은 저수지가 있을 때만). 저수율은 물의 양이지 조황이 아니다.
 */
import { useQuery } from "@tanstack/react-query";
import { FISHING_COLORS as C } from "@shared/fishing";
import { RESERVOIR_SOURCE, reservoirTrend, type ReservoirView } from "@shared/fishingReservoir";

const WATER = "#4B9CC6";
const W = 300, H = 112;
// 단면 — 왼쪽 비탈(완만) · 바닥 · 오른쪽 둑(가파르고 위가 평평)
const TOP = 14, BOTTOM = 96;
const BASIN = `M0,${TOP} C40,${TOP + 6} 70,${BOTTOM - 10} 104,${BOTTOM} L222,${BOTTOM} L262,${TOP} L300,${TOP}`;
const yOf = (rate: number) => BOTTOM - (BOTTOM - TOP) * Math.min(1, Math.max(0, rate / 100));

export function ReservoirWater({ spotId }: { spotId: string }) {
    const { data: v } = useQuery<ReservoirView | null>({ queryKey: [`/api/hiq/fishing/spots/${spotId}/water`], staleTime: 30 * 60_000, retry: false });
    if (!v || !v.days.length) return null;
    const first = v.days[0];
    const trend = reservoirTrend(v.delta);
    const y = yOf(v.rate), y0 = yOf(first.rate);
    const md = (iso: string) => `${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일`;
    // 막대는 이레 사이의 차이가 보이게 그 범위로(0~100 이면 71.6 · 73.3 이 같은 키다)
    const rates = v.days.map((d) => d.rate);
    const lo = Math.min(...rates) - 2, hi = Math.max(...rates) + 0.5;
    const barH = (r: number) => Math.round(8 + ((r - lo) / Math.max(1, hi - lo)) * 26);
    const name = /저수지$/.test(v.name) ? v.name : `${v.name}저수지`;
    return (
        <section className="px-5 pt-7" data-testid="spot-water">
            <div className="mb-2.5 flex items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-semibold">이 저수지 물높이</h2>
                <span className="shrink-0 text-[12.5px] tabular-nums" style={{ color: C.dim }}>{name} · {md(v.asOf)}</span>
            </div>
            <div className="overflow-hidden rounded-2xl" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                <div className="flex items-end justify-between gap-3 px-4 pt-3.5">
                    <p className="text-[34px] font-semibold leading-none tracking-tight tabular-nums">{v.rate}<span className="ml-0.5 text-[17px]" style={{ color: C.soft }}>%</span></p>
                    <span className="mb-1 rounded-full px-2.5 py-1 text-[12.5px] font-semibold tabular-nums"
                        style={trend === "오르는 중" ? { background: "#4B9CC633", color: "#9FD3EE" } : trend === "빠지는 중" ? { background: "#F4A96326", color: C.brand } : { background: "#FFFFFF14", color: C.soft }}>
                        {trend} {v.delta > 0 ? "+" : ""}{v.delta}%p
                    </span>
                </div>
                <p className="px-4 pt-1 text-[12.5px]" style={{ color: C.dim }}>가득 찬 때가 100 · 변화는 {md(first.day)}과 견준 것</p>
                {/* 단면 */}
                <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 block h-auto w-full" role="img" aria-label={`${name} 저수율 ${v.rate}%, ${trend}`}>
                    <defs>
                        {/* 물은 단면 선 위(움푹한 곳)에만 */}
                        <clipPath id={`basin-${spotId}`}><path d={`${BASIN} L300,0 L0,0 Z`} /></clipPath>
                        <linearGradient id={`water-${spotId}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0" stopColor={WATER} stopOpacity="0.75" />
                            <stop offset="1" stopColor="#1F4F6B" stopOpacity="0.9" />
                        </linearGradient>
                    </defs>
                    <g clipPath={`url(#basin-${spotId})`}>
                        <rect x="0" y={y} width={W} height={H - y} fill={`url(#water-${spotId})`} />
                        {/* 물결 두 줄 */}
                        <path d={`M0,${y + 7} q12,-3 24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0`} fill="none" stroke="#FFFFFF33" strokeWidth="1" />
                        <path d={`M12,${y + 15} q12,-3 24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0 t24,0`} fill="none" stroke="#FFFFFF1F" strokeWidth="1" />
                        <line x1="0" y1={y} x2={W} y2={y} stroke="#BFE3F5" strokeWidth="1.5" />
                    </g>
                    {/* 땅 — 단면 선 아래는 흙(옅게), 선은 먹선 */}
                    <path d={`${BASIN} L300,${H} L0,${H} Z`} fill="#F3ECDD0F" />
                    <path d={BASIN} fill="none" stroke="#F3ECDD8C" strokeWidth="1.6" strokeLinejoin="round" />
                    {/* 이레 전 */}
                    {Math.abs(y0 - y) >= 2 && (
                        <g>
                            <line x1="104" y1={y0} x2="232" y2={y0} stroke="#F3ECDDB3" strokeWidth="1" strokeDasharray="3 3" />
                            <text x="108" y={y0 + (y0 > y ? 12 : -4)} fontSize="12" fill="#F3ECDDB3">이레 전 {first.rate}%</text>
                        </g>
                    )}
                    {/* 가득 */}
                    <line x1="262" y1={TOP} x2="300" y2={TOP} stroke="#F3ECDD8C" strokeWidth="1.6" />
                    <text x="296" y={TOP - 3} fontSize="12" textAnchor="end" fill="#F3ECDD80">가득</text>
                </svg>
                {/* 날마다 */}
                <div className="flex items-end gap-1 px-4 pb-3 pt-2" aria-hidden>
                    {v.days.map((d, i) => (
                        <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
                            <span className="w-full max-w-[22px] rounded-t-[4px]" style={{ height: barH(d.rate), background: i === v.days.length - 1 ? WATER : "#4B9CC659" }} />
                            <span className="text-[12px] tabular-nums leading-none" style={{ color: i === v.days.length - 1 ? C.soft : C.dim }}>{Number(d.day.slice(8, 10))}</span>
                        </div>
                    ))}
                </div>
            </div>
            <p className="mt-2 text-[12px] [word-break:keep-all]" style={{ color: C.dim }}>{RESERVOIR_SOURCE} 저수지 수위 · 물의 양이지 조황이 아니에요.</p>
        </section>
    );
}
