/**
 * 전국 당구장 지도(2026-10-17) — 당구대를 위에서 내려다본 모습: 나무 레일 · 다이아몬드 표시 · 쿠션 · 펠트.
 * 펠트 위에 우리나라 윤곽선을 분필 선처럼 긋고, 매장 디렉터리 1,199곳을 공 하나씩으로 찍는다(shared/storeDots).
 * 캐롬(대대 · 중대)이 우리 당구라 포켓은 없다. 다이아몬드는 긴 레일 일곱 · 짧은 레일 셋(실제 대대의 표시 자리).
 *
 *   StoreTableMap     매장 찾기 화면 — 세로 당구대. 시도를 누르면 그 지역만(다시 누르면 전체). 고른 지역의 공은 노란 공.
 *   StoreTableBanner  당구 홈 '둘러보기' — 가로 당구대. 왼쪽 글 · 오른쪽 지도, 누르면 매장 찾기.
 *
 * 윤곽선 자료는 출처 기록이 없어 **화면에만** 쓴다(golf/lib/koreaOutline 머리말 — 서버가 그리는 카드에는 싣지 않는다).
 * 점은 지어내지 않는다 — 받은 것이 없으면 지도 대신 아무것도 그리지 않는다(빈 당구대를 '0곳'처럼 보이게 두지 않는다).
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { OUTLINE_TO_STORE_REGION, storeRegionCounts, unpackStoreDots, type StoreDot } from "@shared/storeDots";

export const STORE_DOTS_KEY = ["/api/hiq/listings/dots"] as const;
export function useStoreDots() {
    const q = useQuery<unknown>({ queryKey: STORE_DOTS_KEY, staleTime: 30 * 60_000 });
    const dots = useMemo(() => unpackStoreDots(q.data), [q.data]);
    return { dots, isLoading: q.isLoading };
}

const LAND = Object.entries(KOREA_MAP_PATHS);
/** 뭍만 — 울릉 칸과 바다 여백을 덜어 낸 틀(지금 산 위 지도와 같은 틀) */
const VIEW = { x: 52, y: 20, w: 400, h: 620 };
const FELT = "radial-gradient(ellipse 85% 60% at 50% 32%, #18875A 0%, #0F6E4A 48%, #0A5134 100%)";
const RAIL = "linear-gradient(150deg, #7A4E2B 0%, #5A381E 38%, #3E2614 72%, #2C1A0D 100%)";
const IVORY = "#F6F1E3", YELLOW = "#F4C542";

/** 레일의 다이아몬드 — 긴 쪽 일곱(1/8 … 7/8) · 짧은 쪽 셋(1/4 · 2/4 · 3/4) */
function Diamonds({ portrait, rail }: { portrait: boolean; rail: number }) {
    const long = [1, 2, 3, 4, 5, 6, 7].map((k) => `${(k / 8) * 100}%`);
    const short = [1, 2, 3].map((k) => `${(k / 4) * 100}%`);
    const d = (key: string, style: React.CSSProperties) => (
        <span key={key} aria-hidden className="absolute h-[6px] w-[6px] rotate-45 rounded-[1px]" style={{ background: "#EFE6CF", boxShadow: "0 0 0 0.5px #00000040, 0 1px 1px #00000055", marginLeft: -3, marginTop: -3, ...style }} />
    );
    const c = rail / 2;
    const [side, end] = portrait ? [long, short] : [short, long];
    return (
        <>
            {side.map((y, i) => d(`l${i}`, { left: c, top: y }))}
            {side.map((y, i) => d(`r${i}`, { right: c - 3, top: y, marginLeft: 0 }))}
            {end.map((x, i) => d(`t${i}`, { top: c, left: x }))}
            {end.map((x, i) => d(`b${i}`, { bottom: c - 3, left: x, marginTop: 0 }))}
        </>
    );
}

/** 당구대 껍데기 — 레일(나무) · 쿠션(진녹) · 펠트 */
function Table({ portrait, rail = 12, children, className = "" }: { portrait: boolean; rail?: number; children: React.ReactNode; className?: string }) {
    return (
        <div className={`relative rounded-[24px] ${className}`} style={{ background: RAIL, padding: rail, boxShadow: "0 10px 22px rgba(30,18,8,0.28), inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -2px 0 rgba(0,0,0,0.25)" }}>
            <Diamonds portrait={portrait} rail={rail} />
            <div className="rounded-[14px] p-[4px]" style={{ background: "#0A3D28", boxShadow: "inset 0 2px 4px rgba(0,0,0,0.45)" }}>
                <div className="relative h-full overflow-hidden rounded-[11px]" style={{ background: FELT }}>{children}</div>
            </div>
        </div>
    );
}

/** 펠트 위의 지도 — 분필 선 윤곽 · 공 그림자 · 공 */
function FeltMap({ dots, region, onPick, r = 3.1, label }: { dots: readonly StoreDot[]; region?: string; onPick?: (region: string) => void; r?: number; label: string }) {
    const pts = useMemo(() => dots.map((d) => ({ d, xy: latLngToOutline(d.lat, d.lng) })), [dots]);
    const on = (d: StoreDot) => !!region && d.region === region;
    return (
        <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block h-full w-full" role="img" aria-label={label}>
            <g strokeLinejoin="round">
                {LAND.map(([id, path]) => {
                    const name = OUTLINE_TO_STORE_REGION[id];
                    const sel = !!region && name === region;
                    return (
                        <path key={id} d={path} fill={sel ? "#F4C5422E" : "#FFFFFF12"} stroke={sel ? YELLOW : "#FFFFFF3D"} strokeWidth={sel ? 1.6 : 0.9}
                            onClick={onPick && name ? () => onPick(sel ? "" : name) : undefined}
                            style={onPick ? { cursor: "pointer" } : undefined}
                            data-region={name} />
                    );
                })}
            </g>
            {/* 공 그림자 — 등이 위에 있다 */}
            <g fill="#00000040" pointerEvents="none">
                {pts.map(({ d, xy }, i) => <circle key={i} cx={xy[0] + 1.1} cy={xy[1] + 1.5} r={on(d) ? r + 0.5 : r} opacity={region && !on(d) ? 0.4 : 1} />)}
            </g>
            <g pointerEvents="none">
                {pts.map(({ d, xy }, i) => (
                    <circle key={i} cx={xy[0]} cy={xy[1]} r={on(d) ? r + 0.5 : r}
                        fill={on(d) ? YELLOW : IVORY} stroke="#0A3D28" strokeWidth={0.55}
                        opacity={region && !on(d) ? 0.32 : 0.95} />
                ))}
            </g>
        </svg>
    );
}

/** 매장 찾기 — 세로 당구대 + 옆의 지역별 막대(지도의 범례이자 고르기). 시도나 줄을 누르면 그 지역(onPick("") = 전체).
 *  폭 360 에서 지도를 꽉 채우면 높이가 500px 을 넘어 목록이 첫 화면에서 사라졌다 — 지도는 57%, 옆에 지역별 일곱 줄. */
export function StoreTableMap({ region, onPick, copy }: {
    region: string;
    onPick: (region: string) => void;
    copy: { all: (n: number) => string; inRegion: (r: string, n: number) => string; legend: string; hint: string; byRegion: string; others: (n: number) => string };
}) {
    const { dots } = useStoreDots();
    const counts = useMemo(() => storeRegionCounts(dots), [dots]);
    if (dots.length < 50) return null;
    const n = region ? counts.find((c) => c.region === region)?.count ?? 0 : dots.length;
    const head = region ? copy.inRegion(region, n) : copy.all(dots.length);
    const TOP = 7;
    // 고른 지역이 일곱 줄 밖이면 마지막 줄을 그 지역으로 — 고른 것이 늘 보이게
    const top = counts.slice(0, TOP);
    const picked = region && !top.some((c) => c.region === region) ? counts.find((c) => c.region === region) : undefined;
    const rows = picked ? [...top.slice(0, TOP - 1), picked] : top;
    const rest = dots.length - rows.reduce((a, c) => a + c.count, 0);
    const max = counts[0]?.count ?? 1;
    return (
        <div className="mb-4" data-testid="store-table-map">
            <div className="flex items-start gap-3">
                <Table portrait rail={9} className="w-[57%] max-w-[300px] shrink-0">
                    <div className="relative" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
                        <FeltMap dots={dots} region={region} onPick={onPick} r={4.4} label={head} />
                        {/* 지금 보는 범위 — 펠트 위의 작은 패 */}
                        <span className="pointer-events-none absolute left-1.5 top-1.5 rounded-full px-2 py-0.5 text-[12px] font-bold tabular-nums" style={{ background: "#062B1CCC", color: region ? YELLOW : IVORY, boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="store-table-head">{head}</span>
                    </div>
                </Table>
                <div className="min-w-0 flex-1 pt-0.5">
                    <p className="mb-1.5 text-[12px] font-semibold text-black/45">{copy.byRegion}</p>
                    <ol className="space-y-1">
                        {rows.map((c) => {
                            const sel = c.region === region;
                            return (
                                <li key={c.region}>
                                    <button type="button" onClick={() => onPick(sel ? "" : c.region)} aria-pressed={sel} className="block w-full rounded-lg px-1.5 py-1 text-left active:bg-black/[0.04]" style={sel ? { background: "#F4C54229" } : undefined} data-testid="store-table-row">
                                        <span className="flex items-baseline justify-between gap-1.5">
                                            <span className={`truncate text-[13px] ${sel ? "font-bold text-ink-1" : "font-semibold text-ink-2"}`}>{c.region}</span>
                                            <span className="shrink-0 text-[12.5px] font-bold tabular-nums text-ink-1">{c.count.toLocaleString()}</span>
                                        </span>
                                        <span className="mt-1 block h-[5px] overflow-hidden rounded-full bg-black/[0.06]" aria-hidden>
                                            <span className="block h-full rounded-full" style={{ width: `${Math.max(4, (c.count / max) * 100)}%`, background: sel ? "#D9A514" : "#0F6E4A" }} />
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                    {rest > 0 && <p className="mt-1.5 px-1.5 text-[12px] font-medium text-black/45 tabular-nums">{copy.others(rest)}</p>}
                </div>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[12px] font-medium text-black/45">
                {/* 범례 — 펠트 한 조각 위의 공 하나(밝은 바탕에서 빈 동그라미로 읽히지 않게) */}
                <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px]" style={{ background: "#0F6E4A" }} aria-hidden>
                    <span className="h-[6px] w-[6px] rounded-full" style={{ background: IVORY }} />
                </span>
                <span className="break-keep">{copy.legend} · {copy.hint}</span>
            </p>
        </div>
    );
}

/** 당구 홈 '둘러보기' — 가로 당구대. 왼쪽 글 · 오른쪽 지도 */
export function StoreTableBanner({ onOpen, copy }: { onOpen: () => void; copy: { title: string; count: (n: number) => string; sub: string; cta: string } }) {
    const { dots, isLoading } = useStoreDots();
    if (!isLoading && dots.length < 50) return null;
    return (
        <button type="button" onClick={onOpen} className="block w-full text-left active:scale-[0.99] transition-transform" data-testid="store-table-banner" data-track-as="홈 전국 당구장 지도">
            <Table portrait={false} rail={11}>
                <div className="flex h-[212px] items-stretch">
                    <div className="relative flex min-w-0 flex-1 flex-col justify-between py-4 pl-4 pr-1">
                        <div>
                            <p className="text-[13px] font-semibold" style={{ color: "#F6F1E3B3" }}>{copy.title}</p>
                            <p className="mt-0.5 text-[30px] font-bold leading-none tracking-tight tabular-nums" style={{ color: IVORY }}>
                                {dots.length ? copy.count(dots.length) : <span className="inline-block h-[30px] w-24 animate-pulse rounded-md bg-white/10 align-middle" />}
                            </p>
                            <p className="mt-2 text-[12.5px] leading-snug break-keep" style={{ color: "#F6F1E3B3" }}>{copy.sub}</p>
                        </div>
                        <span className="inline-flex h-9 w-fit items-center gap-1 rounded-full px-3.5 text-[13px] font-bold" style={{ background: IVORY, color: "#0A3D28", boxShadow: "0 2px 0 #00000033" }}>{copy.cta} <span aria-hidden>→</span></span>
                        {/* 공 둘 — 장식(캐롬의 노란 공 · 빨간 공) */}
                        <span aria-hidden className="pointer-events-none absolute bottom-4 right-3 flex gap-1.5">
                            <span className="h-[14px] w-[14px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #FFF6C8 0%, #F4C542 45%, #B88A12 100%)", boxShadow: "1px 2px 2px #00000055" }} />
                            <span className="h-[14px] w-[14px] rounded-full" style={{ background: "radial-gradient(circle at 35% 30%, #FFB4A8 0%, #D8352A 45%, #8C1810 100%)", boxShadow: "1px 2px 2px #00000055" }} />
                        </span>
                    </div>
                    <div className="h-full shrink-0 py-1.5 pr-1.5" style={{ aspectRatio: `${VIEW.w} / ${VIEW.h}` }}>
                        {dots.length > 0 && <FeltMap dots={dots} r={4.2} label={copy.count(dots.length)} />}
                    </div>
                </div>
            </Table>
        </button>
    );
}
