/**
 * 내 근처의 산(2026-10-13 오너: "홈에 내 근처 기능으로 근처 산 · 근처 명산 2개 이쁘게 카드로",
 * "근처 맛집이나 가까운 골프장처럼 내 근처를 시각화해서 어떤 산인지 보이면 좋겠네").
 *
 * 동그란 판 가운데가 나, 위가 북 — 가까운 산을 방향과 거리대로 놓는다(명산은 크게 · 짙게, 오른 산은 깃발). 그 아래 카드 둘: 가장 가까운 산 · 가장 가까운 명산.
 * **내 위치는 이 기기 밖으로 나가지 않는다** — 산의 자리 표를 받아 여기서 고른다(shared/hikingNear). 기기에 적어 두는 것도 '켰다'는 표시 하나뿐.
 * 위치를 먼저 묻지 않는다: 단추를 눌렀을 때만 묻고, 한 번 켠 뒤에는 묻지 않고 받을 수 있을 때만 받는다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { getDevicePosition } from "@/hooks/useNativeBridge";
import { hikingMountainPath } from "@shared/hikingMountains";
import { compass8, nearKmText, nearRadiusKm, nearSpot, nearestMountains, type MountainPoint, type NearMountain } from "@shared/hikingNear";
import { HkSection } from "./HikingShell";
import { MountainPatch } from "../stamps/MountainPatch";
import { hikingCover } from "../theme";
import type { MountainSummary } from "../lib/api";

export const HIKING_POINTS_KEY = ["/api/hiq/hiking/points"] as const;
const KEY = "rankue_hk_near";
const wasOn = (): boolean => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const remember = (): void => { try { localStorage.setItem(KEY, "1"); } catch { /* 이번 화면에서만 */ } };

type Phase = "off" | "locating" | "on" | "denied" | "failed";
/** 판에 놓는 산의 수 — 가까운 산 일곱 + 가까운 명산 셋(겹치면 한 번) */
const MAP_NEAR = 7, MAP_FAMOUS = 3;

const heightText = (h: number | null) => (h != null ? `${Math.round(h).toLocaleString("en-US")}m` : "");

export function NearMe({ famous, done }: {
    /** 명산의 목록(허브가 준 것) — 카드의 와펜 · 권역 색을 여기서 찾는다 */
    famous: readonly MountainSummary[];
    done?: ReadonlySet<string>;
}) {
    const [phase, setPhase] = useState<Phase>("off");
    const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
    const points = useQuery<{ points: MountainPoint[] }>({ queryKey: HIKING_POINTS_KEY, enabled: !!me, staleTime: 60 * 60_000 }).data?.points;

    const locate = useCallback(async (prompt: boolean) => {
        setPhase((p) => (p === "on" ? p : "locating"));
        const r = await getDevicePosition({ prompt, highAccuracy: false, timeoutMs: 9000, maximumAgeMs: 5 * 60_000 });
        if (r.status === "granted") { setMe({ lat: r.fix.lat, lng: r.fix.lng }); setPhase("on"); remember(); }
        else if (r.status === "denied") setPhase("denied");
        // 묻지 않고 받으려다 못 받은 것(prompt) — 조용히 처음 모습으로 돌아간다
        else setPhase(prompt ? "failed" : "off");
    }, []);
    // 한 번 켠 사람은 다시 묻지 않고 받는다(권한이 살아 있을 때만 받아진다)
    useEffect(() => { if (wasOn()) void locate(false); }, [locate]);

    const bySlug = useMemo(() => new Map(famous.map((m) => [m.slug, m])), [famous]);
    const near = useMemo(() => (me && points ? nearestMountains(points, me, { limit: MAP_NEAR }) : []), [me, points]);
    const nearFamous = useMemo(() => (me && points ? nearestMountains(points, me, { limit: MAP_FAMOUS, famousOnly: true }) : []), [me, points]);
    const onMap = useMemo(() => {
        const seen = new Set<string>();
        return [...near, ...nearFamous].filter((m) => (seen.has(m.slug) ? false : (seen.add(m.slug), true)));
    }, [near, nearFamous]);
    const isDone = (m: NearMountain) => { const f = bySlug.get(m.slug); return !!f && !!done?.has(f.id); };

    const first = near[0], firstFamous = nearFamous.find((m) => m.slug !== first?.slug) ?? nearFamous[0];
    const loading = phase === "locating" || (phase === "on" && !points);

    return (
        <HkSection title="내 근처의 산" aside={phase === "on" && first ? `가장 가까운 산까지 ${nearKmText(first.km)}` : "가까운 산 · 가까운 명산"}>
            <div data-testid="hk-near" data-phase={loading ? "loading" : phase}>
                {phase === "on" && points && onMap.length > 0 ? (
                    <>
                        <NearDial items={onMap} done={isDone} />
                        <div className="mt-2.5 grid grid-cols-2 gap-2.5">
                            {first && <NearCard kind="가까운 산" m={first} info={bySlug.get(first.slug)} done={isDone(first)} />}
                            {firstFamous && <NearCard kind="가까운 명산" m={firstFamous} info={bySlug.get(firstFamous.slug)} done={isDone(firstFamous)} />}
                        </div>
                        <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">가운데가 지금 자리, 위쪽이 북쪽이에요. 직선 거리라 길로 가면 더 멀어요. 내 위치는 이 기기에서만 써요.</p>
                    </>
                ) : phase === "on" && points ? (
                    <p className="rounded-2xl bg-[#FFFFFF0A] px-4 py-6 text-center text-[14px] text-[#F4EFE399] break-keep" data-testid="hk-near-none">근처에서 산을 찾지 못했어요. 전국의 산은 아래 '산' 탭에서 볼 수 있어요.</p>
                ) : loading ? (
                    <div className="h-[168px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />
                ) : (
                    <div className="flex items-center gap-4 rounded-2xl px-4 py-4" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                        <DialMark />
                        <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-semibold text-[#F4EFE3] break-keep">{phase === "denied" ? "위치를 쓸 수 없어요" : phase === "failed" ? "위치를 받지 못했어요" : "지금 자리에서 가까운 산"}</p>
                            <p className="mt-0.5 text-[13px] leading-snug text-[#F4EFE399] break-keep">
                                {phase === "denied" ? "기기 설정에서 위치를 허용하면 가까운 산과 명산을 보여 드려요."
                                    : phase === "failed" ? "하늘이 트인 곳에서 다시 눌러 보세요."
                                    : "어느 쪽으로 얼마나 가면 어떤 산이 있는지 한눈에 보여 드려요."}
                            </p>
                            {phase !== "denied" && (
                                <button type="button" onClick={() => void locate(true)} data-track-as="hiking-near-on" data-testid="hk-near-on"
                                    className="mt-2.5 h-10 rounded-full bg-[#F28C6A] px-4 text-[14px] font-semibold text-[#2A1208] active:bg-[#E67C59]">내 근처 산 보기</button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </HkSection>
    );
}

/** 안내 카드의 작은 그림 — 동그란 판과 산 셋 */
function DialMark() {
    return (
        <svg viewBox="0 0 64 64" width="64" height="64" className="shrink-0" aria-hidden>
            <circle cx="32" cy="32" r="30" fill="#F4EFE3" />
            <circle cx="32" cy="32" r="19" fill="none" stroke="#1F556040" strokeDasharray="2 3" />
            <path d="M14 26 l6 -9 l6 9 Z" fill="#1F5560" /><path d="M40 20 l5 -7 l5 7 Z" fill="#7FA39A" /><path d="M41 49 l6 -9 l6 9 Z" fill="#1F5560" />
            <circle cx="32" cy="32" r="5" fill="#F28C6A" stroke="#FFFFFF" strokeWidth="2" />
        </svg>
    );
}

const VB = { w: 340, h: 300 }, C = { x: 170, y: 152 }, R = 118;

/** 동그란 판 — 가운데가 나, 위가 북. 산은 방향과 거리대로, 이름은 겹치지 않는 것만 단다 */
function NearDial({ items, done }: { items: readonly NearMountain[]; done: (m: NearMountain) => boolean }) {
    const [, setLocation] = useLocation();
    const radius = nearRadiusKm(items.map((m) => m.km));
    const spots = useMemo(() => {
        const out = items.map((m) => { const [x, y] = nearSpot(m, radius); return { m, x: C.x + x * R, y: C.y + y * R }; });
        // 이름 칸이 겹치면 먼 쪽의 이름을 뺀다(가까운 산 · 명산이 먼저) — 산 그림은 다 그린다
        const boxes: { x0: number; x1: number; y0: number; y1: number }[] = [];
        const order = [...out].sort((a, b) => Number(b.m.famous) - Number(a.m.famous) || a.m.km - b.m.km);
        const labelled = new Map<string, { anchor: "start" | "end"; tx: number }>();
        for (const s of order) {
            const w = s.m.name.length * 13.5 + 6, left = s.x > C.x + R * 0.45;
            const tx = left ? s.x - 11 : s.x + 11;
            const box = { x0: left ? tx - w : tx, x1: left ? tx : tx + w, y0: s.y - 14, y1: s.y + 5 };
            if (box.x0 < 2 || box.x1 > VB.w - 2) continue;
            if (boxes.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
            boxes.push(box); labelled.set(s.m.slug, { anchor: left ? "end" : "start", tx });
        }
        return out.sort((a, b) => a.y - b.y).map((s) => ({ ...s, label: labelled.get(s.m.slug) }));
    }, [items, radius]);
    return (
        <svg viewBox={`0 0 ${VB.w} ${VB.h}`} role="img" aria-label={`내 근처의 산 ${items.length}곳`} style={{ display: "block", width: "100%", background: "#F4EFE3", borderRadius: 18 }} data-testid="hk-near-dial" data-radius={radius}>
            <defs>
                <pattern id="hk-near-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><path d="M0 0 V5" stroke="#1F556012" strokeWidth="1.4" /></pattern>
            </defs>
            <circle cx={C.x} cy={C.y} r={R + 14} fill="#E4E9CF" />
            <circle cx={C.x} cy={C.y} r={R + 14} fill="url(#hk-near-hatch)" />
            <circle cx={C.x} cy={C.y} r={R} fill="none" stroke="#0E2A3340" strokeWidth="1" />
            <circle cx={C.x} cy={C.y} r={R / 2} fill="none" stroke="#0E2A3330" strokeWidth="1" strokeDasharray="3 4" />
            <path d={`M${C.x} ${C.y - R - 14} V${C.y + R + 14} M${C.x - R - 14} ${C.y} H${C.x + R + 14}`} stroke="#0E2A3314" strokeWidth="1" />
            {/* 북쪽 표시 · 눈금의 거리 */}
            <path d={`M${C.x} ${C.y - R - 22} l5 9 h-10 Z`} fill="#0E2A33" />
            <text x={C.x + 9} y={C.y - R - 13} fontSize="12.5" fontWeight="600" fill="#0E2A33">북</text>
            <text x={C.x + 4} y={C.y + R / 2 - 4} fontSize="12" fill="#0E2A3399">{nearKmText(radius / 2)}</text>
            <text x={C.x + 4} y={C.y + R - 4} fontSize="12" fill="#0E2A3399">{nearKmText(radius)}</text>
            {spots.map((s) => {
                const size = (s.m.famous ? 8.5 : 6) * (0.85 + Math.min(1, (s.m.heightM ?? 300) / 1500) * 0.5);
                const got = done(s.m);
                const fill = got ? "#F28C6A" : s.m.kfs ? "#1F5560" : s.m.famous ? "#4E8A86" : "#8FAE9F";
                return (
                    <g key={s.m.slug} transform={`translate(${s.x.toFixed(1)} ${s.y.toFixed(1)})`} onClick={() => setLocation(hikingMountainPath(s.m.slug))} style={{ cursor: "pointer" }} data-near={s.m.slug}>
                        <circle r="17" fill="transparent" />
                        <path d={`M${-size} 2 L0 ${2 - size * 1.3} L${size} 2 Z`} fill={fill} stroke="#0E2A33" strokeWidth="0.9" strokeLinejoin="round" />
                        {(s.m.heightM ?? 0) >= 1000 && <path d={`M${-size * 0.32} ${2 - size * 0.88} L0 ${2 - size * 1.3} L${size * 0.32} ${2 - size * 0.88} L${size * 0.1} ${2 - size * 1} L${-size * 0.1} ${2 - size * 0.86} Z`} fill="#FFF6E3" />}
                        {got && (<><path d={`M0 ${2 - size * 1.3} V${2 - size * 2.2}`} stroke="#0E2A33" strokeWidth="1" /><path d={`M0 ${2 - size * 2.2} l${size * 0.75} ${size * 0.24} l${-size * 0.75} ${size * 0.26} Z`} fill="#F28C6A" stroke="#0E2A33" strokeWidth="0.6" /></>)}
                    </g>
                );
            })}
            <g pointerEvents="none">
                {spots.filter((s) => s.label).map((s) => (
                    <text key={`n:${s.m.slug}`} x={s.label!.tx} y={s.y} textAnchor={s.label!.anchor} fontSize="13.5" fontWeight="600" fill="#0E2A33" stroke="#F4EFE3" strokeWidth="3.2" paintOrder="stroke">{s.m.name}</text>
                ))}
            </g>
            {/* 나 */}
            <circle cx={C.x} cy={C.y} r="13" fill="#F28C6A" opacity="0.22" />
            <circle cx={C.x} cy={C.y} r="6" fill="#F28C6A" stroke="#FFFFFF" strokeWidth="2.2" />
        </svg>
    );
}

/** 카드 하나 — 100대 명산이면 그 산의 와펜, 아니면 산 그림 */
function NearCard({ kind, m, info, done }: { kind: string; m: NearMountain; info?: MountainSummary; done: boolean }) {
    const facts = [heightText(m.heightM), m.courses > 0 ? `코스 ${m.courses}개` : ""].filter(Boolean).join(" · ");
    return (
        <Link href={hikingMountainPath(m.slug)} className="block overflow-hidden rounded-2xl active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid={`hk-near-card-${m.famous ? "famous" : "any"}`} data-track-as="hiking-near-card">
            <span className="relative flex h-[96px] items-end justify-center overflow-hidden" style={{ background: "#0E2A33" }}>
                {/* 그 산이 있는 권역의 표지 그림 — 그 산의 사진이 아니라 장식이다 */}
                <img src={hikingCover(m.region)} alt="" loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: m.famous ? "50% 55%" : "50% 72%" }} />
                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2659,#0B1F2600 45%,#0E2A33F2)" }} aria-hidden />
                {info && m.kfs && <MountainPatch id={info.id} region={info.region} size={62} earned={done} preview className="relative mb-1.5" />}
                <span className="absolute left-2.5 top-2.5 rounded-full bg-[#0B1F26CC] px-2 py-1 text-[12px] leading-none text-[#F6D9A8]">{kind}</span>
                {done && <span className="absolute right-2.5 top-2.5 rounded-full bg-[#F28C6A] px-2 py-1 text-[12px] font-semibold leading-none text-[#2A1208]">오른 산</span>}
            </span>
            <span className="block px-3 pb-3 pt-2.5">
                <span className="block truncate text-[16px] font-semibold text-[#F4EFE3]">{m.name}</span>
                <span className="mt-0.5 block truncate text-[13px] tabular-nums text-[#F6D9A8]">{compass8(m.bearing)}쪽 {nearKmText(m.km)}</span>
                <span className="mt-0.5 block truncate text-[12.5px] tabular-nums text-[#F4EFE399]">{facts || (m.kfs ? "산림청 100대 명산" : m.famous ? "명산" : "산")}</span>
            </span>
        </Link>
    );
}

export default NearMe;
