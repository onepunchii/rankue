/**
 * 지금 산 위(2026-10-17) — 산림청 산악기상관측소가 10분마다 잰 기온을 산마다 점으로(이름 + 시군이 맞는 산만, shared/hikingMountObs summitsNow).
 * 종이 지도(내 산 지도와 같은 결) 위에 기온 색의 점, 옆에 가장 추운 산 · 바람이 가장 센 산 · 가장 따뜻한 산. 누르면 그 산으로.
 * 어림이 아니라 잰 값이다 — 관측소가 없는 산은 점이 없다(빈 곳을 채우지 않는다). 받아 온 것이 없으면 그리지 않는다.
 * ⚠️ 리터럴 색만.
 */
import { useMemo } from "react";
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

type PickKind = "cold" | "windy" | "warm";
/** 고른 산의 표 — 눈송이 · 바람 · 해(지도의 배지와 옆 칸이 같은 그림) */
function PickIcon({ kind, color, size = 14 }: { kind: PickKind; color: string; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden fill="none" stroke={color} strokeWidth={1.7} strokeLinecap="round">
            {kind === "cold" && <><path d="M8 1.5v13M2.4 4.75l11.2 6.5M2.4 11.25l11.2-6.5" /><path d="M6 2.8 8 4.5l2-1.7M6 13.2 8 11.5l2 1.7" /></>}
            {kind === "windy" && <><path d="M1.5 5.5h8.5a2 2 0 1 0-2-2" /><path d="M1.5 9h11a2 2 0 1 1-2 2" /><path d="M1.5 12.5h5" /></>}
            {kind === "warm" && <><circle cx="8" cy="8" r="3" fill={color} stroke="none" /><path d="M8 1.2v1.8M8 13v1.8M1.2 8H3M13 8h1.8M3.2 3.2l1.3 1.3M11.5 11.5l1.3 1.3M3.2 12.8l1.3-1.3M11.5 4.5l1.3-1.3" /></>}
        </svg>
    );
}

function Pick({ kind, tag, row, value, tone, sub }: { kind: PickKind; tag: string; row: SummitNow; value: string; tone: string; /** 값 옆의 작은 글 — 없으면 높이 */ sub?: string | null }) {
    return (
        <Link href={hikingMountainPath(row.slug)} className="relative block overflow-hidden rounded-xl px-3 py-2.5 active:opacity-80" style={{ background: `linear-gradient(135deg, ${tone}1F 0%, #FFFFFF0A 60%)`, boxShadow: `inset 0 0 0 1px ${tone}33` }} data-testid="summits-now-pick">
            <p className="flex items-center gap-1.5 text-[12px] text-[#F4EFE3B3]">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: `${tone}26` }}><PickIcon kind={kind} color={tone} size={12} /></span>
                <span className="min-w-0 truncate">{tag}</span>
            </p>
            <p className="mt-1 truncate text-[14px] font-semibold text-[#F4EFE3]">{row.name}</p>
            <p className="mt-0.5 flex items-baseline gap-1.5">
                <span className="text-[20px] font-semibold tabular-nums leading-none" style={{ color: tone }}>{value}</span>
                {sub ? <span className="truncate text-[12px] text-[#F4EFE399]">{sub}</span> : row.heightM != null && <span className="text-[12px] tabular-nums text-[#F4EFE399]">{row.heightM.toLocaleString("ko-KR")}m</span>}
            </p>
        </Link>
    );
}

/**
 * 기온 칠 — 잰 값을 거리로 섞은 어림(가까운 관측소일수록 무겁게). 관측소에서 REACH 칸(≈25km) 밖은 칠하지 않는다 — 모르는 곳을 지어 칠하지 않게.
 * 화면에서만 그린다(캔버스 → 그림 한 장). 뭍의 윤곽선으로 오려 낸다.
 */
const REACH = 36;
const hexRgb = (h: string): [number, number, number] => { const n = parseInt(h.replace("#", ""), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
function heatUrl(pts: readonly { x: number; y: number; t: number }[]): string | null {
    if (typeof document === "undefined" || !pts.length) return null;
    const W = 150, H = Math.round((W * VIEW.h) / VIEW.w);
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"); if (!g) return null;
    const img = g.createImageData(W, H);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const x = VIEW.x + ((i + 0.5) / W) * VIEW.w, y = VIEW.y + ((j + 0.5) / H) * VIEW.h;
        let ws = 0, vs = 0, near = Infinity;
        for (const p of pts) {
            const d2 = (p.x - x) ** 2 + (p.y - y) ** 2;
            if (d2 > REACH * REACH) continue;
            near = Math.min(near, d2);
            const w = 1 / (d2 + 9); ws += w; vs += w * p.t;
        }
        if (!ws) continue;
        const [r, gg, b] = hexRgb(tempColor(vs / ws));
        const k = (j * W + i) * 4;
        img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b;
        // 관측소에서 멀어질수록 옅게
        img.data[k + 3] = Math.round(250 * Math.max(0.55, 1 - (Math.sqrt(near) / REACH) * 0.6));
    }
    g.putImageData(img, 0, 0);
    return c.toDataURL("image/png");
}

export function SummitsNow() {
    const { data } = useQuery<{ at: string; rows: SummitNow[] } | null>({ queryKey: ["/api/hiq/hiking/summits-now"], staleTime: 5 * 60_000 });
    const rows = Array.isArray(data?.rows) ? data!.rows.filter((r) => r.temp != null) : [];
    // 기온 칠 — 받은 값이 바뀔 때만 다시 그린다
    const heat = useMemo(() => heatUrl(rows.map((r) => { const [x, y] = latLngToOutline(r.lat, r.lng); return { x, y, t: r.temp! }; })), [data?.at, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps
    if (rows.length < 10) return null;
    const byTemp = [...rows].sort((a, b) => a.temp! - b.temp!);
    const cold = byTemp[0], warm = byTemp[byTemp.length - 1];
    const windy = [...rows].filter((r) => r.wind != null).sort((a, b) => b.wind! - a.wind!)[0] ?? null;
    const lo = Math.floor(cold.temp!), hi = Math.ceil(warm.temp!);
    // 낮은 기온이 위에 오게 — 추운 점이 따뜻한 점에 가려지지 않게 따뜻한 것부터 그린다
    const drawn = [...byTemp].reverse();
    // 고리 색 = 옆 칸의 색(가장 추운 산 · 바람이 가장 센 산 · 가장 따뜻한 산)
    const TONE = { cold: "#3D7FB8", windy: "#B88A2E", warm: "#D9663F" } as const;
    const picks: { kind: PickKind; row: SummitNow; tone: string }[] = [
        { kind: "cold", row: cold, tone: TONE.cold },
        ...(windy && windy.wind! > 0 ? [{ kind: "windy" as const, row: windy, tone: TONE.windy }] : []),
        { kind: "warm", row: warm, tone: TONE.warm },
    ];
    const pickSlugs = new Set(picks.map((p) => p.row.slug));
    return (
        <HkSection title="지금 산 위" aside={`${hm(data!.at)} · ${rows.length}곳에서 잰 기온`}>
            <div className="grid grid-cols-[1.25fr_1fr] gap-2.5" data-testid="summits-now">
                <div className="overflow-hidden rounded-2xl" style={{ background: "#F4EFE3" }}>
                    <svg viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} className="block w-full" role="img" aria-label={`산 위 기온 지도 — ${lo}°에서 ${hi}°`}>
                        <defs>
                            <pattern id="sn-wave" width="26" height="12" patternUnits="userSpaceOnUse"><path d="M0 6 q6.5 -5 13 0 t13 0" fill="none" stroke="#1F556026" strokeWidth="1" /></pattern>
                        </defs>
                        <rect x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} fill="url(#sn-wave)" />
                        <clipPath id="sn-land">{LAND.map((d, i) => <path key={i} d={d} />)}</clipPath>
                        <g fill="#C9D2B4" opacity="0.5" transform="translate(2.5 3)">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                        <g fill="#E6EAD2">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                        {/* 일기도처럼 — 잰 기온을 섞어 뭍 위에 칠한다(관측소 가까이만) */}
                        {heat && <image href={heat} x={VIEW.x} y={VIEW.y} width={VIEW.w} height={VIEW.h} preserveAspectRatio="none" clipPath="url(#sn-land)" style={{ imageRendering: "auto" }} />}
                        <g fill="none" stroke="#0E2A3366" strokeWidth={0.8} strokeLinejoin="round">{LAND.map((d, i) => <path key={i} d={d} />)}</g>
                        {/* 관측소 — 작은 점 */}
                        <g>{drawn.filter((r) => !pickSlugs.has(r.slug)).map((r) => { const [x, y] = latLngToOutline(r.lat, r.lng); return <circle key={r.slug} cx={x} cy={y} r={4.2} fill={tempColor(r.temp!)} stroke="#0E2A33CC" strokeWidth={1.3} />; })}</g>
                        {/* 고른 세 산 — 배지(옆 칸과 같은 그림) */}
                        {picks.map((p) => {
                            const [x, y] = latLngToOutline(p.row.lat, p.row.lng);
                            return (
                                <g key={p.kind} transform={`translate(${x} ${y})`} data-testid={`summits-now-badge-${p.kind}`}>
                                    <circle r={17} fill="#0E2A33" opacity={0.18} transform="translate(1.5 2.5)" />
                                    <circle r={16} fill="#FBF7EE" stroke={p.tone} strokeWidth={3.2} />
                                    <g transform="translate(-10 -10)"><PickIcon kind={p.kind} color={p.tone} size={20} /></g>
                                </g>
                            );
                        })}
                        {/* 기온 띠 — 동해 바다 위에 */}
                        <g transform={`translate(${VIEW.x + VIEW.w - 118} ${VIEW.y + VIEW.h - 58})`}>
                            <rect x={-8} y={-22} width={120} height={52} rx={10} fill="#F4EFE3E6" />
                            <defs><linearGradient id="sn-bar" x1="0" x2="1">{[0, 0.25, 0.5, 0.75, 1].map((k) => <stop key={k} offset={k} stopColor={tempColor(lo + (hi - lo) * k)} />)}</linearGradient></defs>
                            <rect x={0} y={-6} width={104} height={9} rx={4.5} fill="url(#sn-bar)" />
                            <text x={0} y={22} fontSize={17} fill="#0E2A33B3" className="tabular-nums">{lo}°</text>
                            <text x={104} y={22} fontSize={17} fill="#0E2A33B3" textAnchor="end" className="tabular-nums">{hi}°</text>
                        </g>
                    </svg>
                </div>
                <div className="flex min-w-0 flex-col gap-2">
                    {picks.map((p) => (
                        <Pick key={p.kind} kind={p.kind} row={p.row} tone={p.kind === "cold" ? "#8EC5FF" : p.kind === "windy" ? "#F6D9A8" : "#F28C6A"}
                            tag={p.kind === "cold" ? "가장 추운 산" : p.kind === "windy" ? "바람이 가장 센 산" : "가장 따뜻한 산"}
                            value={p.kind === "windy" ? `${p.row.wind!.toFixed(1)}m/s` : `${p.row.temp!.toFixed(1)}°`}
                            sub={p.kind === "windy" ? windDirKo(p.row.windDir) : undefined} />
                    ))}
                </div>
            </div>
            <p className="mt-2 text-[12px] leading-snug text-[#F4EFE399] break-keep">산림청 산악기상관측소가 10분마다 잰 값이에요. 관측소 이름과 시군이 맞는 산에만 점을 찍어요 — 점이 없는 산은 관측소가 없는 곳이에요.</p>
        </HkSection>
    );
}
