/**
 * 지금 산 위(2026-10-17) — 산림청 산악기상관측소가 10분마다 잰 기온을 산마다 점으로(이름 + 시군이 맞는 산만, shared/hikingMountObs summitsNow).
 * 종이 지도(내 산 지도와 같은 결) 위에 기온 색의 점, 옆에 가장 추운 산 · 바람이 가장 센 산 · 가장 따뜻한 산. 누르면 그 산으로.
 * 어림이 아니라 잰 값이다 — 관측소가 없는 산은 점이 없다(빈 곳을 채우지 않는다). 받아 온 것이 없으면 그리지 않는다.
 * ⚠️ 리터럴 색만.
 */
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { latLngToOutline } from "@/golf/lib/koreaOutline";
import { hikingMountainPath } from "@shared/hikingMountains";
import { tempColor, windDirKo, type SummitNow } from "@shared/hikingMountObs";
import { HkSection } from "./HikingShell";

const LAND = Object.values(KOREA_MAP_PATHS);
/** 뭍만 — 울릉 칸과 바다 여백을 덜어 낸 상자 */
const VIEW = { x: 52, y: 20, w: 400, h: 620 };
const hm = (iso: string) => { const k = new Date(Date.parse(iso) + 9 * 3600_000); return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`; };

function Pick({ tag, row, value, tone, sub }: { tag: string; row: SummitNow; value: string; tone: string; /** 값 옆의 작은 글 — 없으면 높이 */ sub?: string | null }) {
    return (
        <Link href={hikingMountainPath(row.slug)} className="block rounded-xl px-3 py-2.5 active:opacity-80" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="summits-now-pick">
            <p className="flex items-center gap-1.5 text-[12px] text-[#F4EFE399]">
                {/* 지도의 같은 색 고리 — 어느 점인지 */}
                <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ boxShadow: `0 0 0 2px ${tone}` }} />
                <span className="min-w-0 truncate">{tag}</span>
            </p>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-[#F4EFE3]">{row.name}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[19px] font-semibold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
                {sub ? <span className="truncate text-[12px] text-[#F4EFE399]">{sub}</span> : row.heightM != null && <span className="text-[12px] tabular-nums text-[#F4EFE366]">{row.heightM.toLocaleString("ko-KR")}m</span>}
            </p>
        </Link>
    );
}

export function SummitsNow() {
    const { data } = useQuery<{ at: string; rows: SummitNow[] } | null>({ queryKey: ["/api/hiq/hiking/summits-now"], staleTime: 5 * 60_000 });
    const rows = Array.isArray(data?.rows) ? data!.rows.filter((r) => r.temp != null) : [];
    if (rows.length < 10) return null;
    const byTemp = [...rows].sort((a, b) => a.temp! - b.temp!);
    const cold = byTemp[0], warm = byTemp[byTemp.length - 1];
    const windy = [...rows].filter((r) => r.wind != null).sort((a, b) => b.wind! - a.wind!)[0] ?? null;
    const lo = Math.floor(cold.temp!), hi = Math.ceil(warm.temp!);
    // 낮은 기온이 위에 오게 — 추운 점이 따뜻한 점에 가려지지 않게 따뜻한 것부터 그린다
    const drawn = [...byTemp].reverse();
    // 고리 색 = 옆 칸의 색(가장 추운 산 · 바람이 가장 센 산 · 가장 따뜻한 산)
    const TONE = { cold: "#3D7FB8", windy: "#B88A2E", warm: "#D9663F" } as const;
    const ring = new Map<string, string>([[warm.slug, TONE.warm], ...(windy ? [[windy.slug, TONE.windy] as [string, string]] : []), [cold.slug, TONE.cold]]);
    return (
        <HkSection title="지금 산 위" aside={`${hm(data!.at)} · ${rows.length}곳에서 잰 기온`}>
            <div className="grid grid-cols-[1.25fr_1fr] gap-2.5" data-testid="summits-now">
                <div className="overflow-hidden rounded-2xl" style={{ background: "#F4EFE3" }}>
                    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block w-full" role="img" aria-label={`산 위 기온 지도 — ${lo}°에서 ${hi}°`}>
                        <defs>
                            <pattern id="sn-wave" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F556026" strokeWidth="1" /></pattern>
                        </defs>
                        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#sn-wave)" />
                        <g fill="#C9D2B4" opacity="0.5" transform="translate(2.5 3)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                        <g fill="#E6EAD2" stroke="#0E2A3340" strokeWidth={0.8} strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                        {drawn.map((r) => {
                            const [x, y] = latLngToOutline(r.lat, r.lng);
                            const on = ring.get(r.slug);
                            return (
                                <g key={r.slug}>
                                    {on && <circle cx={x} cy={y} r={18} fill="none" stroke={on} strokeWidth={4} />}
                                    <circle cx={x} cy={y} r={on ? 11 : 8.5} fill={tempColor(r.temp!)} stroke="#0E2A33A6" strokeWidth={1.4} />
                                </g>
                            );
                        })}
                    </svg>
                    {/* 기온 띠 — 지금 값의 낮은 쪽~높은 쪽(지도 아래 — 제주의 점을 가리지 않게) */}
                    <div className="border-t px-2.5 pb-2 pt-1.5" style={{ borderColor: "#0E2A331F" }}>
                        <div className="h-1.5 rounded-full" style={{ background: `linear-gradient(90deg,${[0, 0.25, 0.5, 0.75, 1].map((k) => tempColor(lo + (hi - lo) * k)).join(",")})` }} aria-hidden />
                        <div className="mt-1 flex justify-between text-[12px] tabular-nums text-[#0E2A33B3]"><span>{lo}°</span><span>{hi}°</span></div>
                    </div>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                    <Pick tag="가장 추운 산" row={cold} value={`${cold.temp!.toFixed(1)}°`} tone="#8EC5FF" />
                    {windy && windy.wind! > 0 && <Pick tag="바람이 가장 센 산" row={windy} value={`${windy.wind!.toFixed(1)}m/s`} tone="#F6D9A8" sub={windDirKo(windy.windDir)} />}
                    <Pick tag="가장 따뜻한 산" row={warm} value={`${warm.temp!.toFixed(1)}°`} tone="#F28C6A" />
                </div>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-[#F4EFE366] break-keep">산림청 산악기상관측소가 10분마다 잰 값이에요. 관측소 이름과 시군이 맞는 산에만 점을 찍어요 — 점이 없는 산은 관측소가 없는 곳이에요.</p>
        </HkSection>
    );
}
