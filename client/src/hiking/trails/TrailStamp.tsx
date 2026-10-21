/**
 * 코리아둘레길 코스 도장(2026-10-21) — 도장 그림(TrailStampSeal) · 코스 화면의 도장 칸(TrailStampCard) · 내 도장 읽기(useMyTrails).
 *
 * 규칙(shared/trailStamps): 코스의 한쪽 끝에서 '여기 왔어요'(출발 확인) → 반대쪽 끝에서 36시간 안에 한 번 더 = 그 코스 도장.
 * 어느 쪽에서 출발해도 된다. 순환 코스는 같은 자리에서 시간이 지난 뒤 한 번 더. **좌표는 저장하지 않는다**(서버가 거리만 잰다).
 * 도장 그림은 우리 SVG — 길의 잉크 색 두 겹 테 · 위 아치에 길 이름 · 가운데 코스 번호 · 아래 아치에 '코리아둘레길' · 길의 무늬(바다 물결 · 접경 능선).
 * ⚠️ 리터럴 색만(등산의 색). 글자는 12px 이상.
 */
import { useId, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { getDevicePosition } from "@/hooks/useNativeBridge";
import { useAuth } from "@/hooks/useAuth";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { goLogin } from "@/components/hiq/LoginGate";
import { LucideLocateFixed, LucideShare2 } from "@/lib/icons";
import type { TrailCourseDetail, TrailRouteId } from "@shared/koreaTrails";
import { TRAIL_END_RADIUS_M, TRAIL_PAIR_WINDOW_H, isLoopCourse, trailHalfLine } from "@shared/trailStamps";
import { stampDate } from "../lib/date";
import { TRAIL_ME_KEY, type MyTrails } from "./api";
import { TrailStampShareSheet } from "./TrailStampShare";

/** 종이 위에서 읽히는 길의 잉크(길의 화면 색은 밝아서 종이에 흐리다) */
export const TRAIL_INK: Record<TrailRouteId, string> = { haeparang: "#1F5F99", namparang: "#B04A28", seohaerang: "#8A5A0A", dmz: "#2C6B47" };
const ROUTE_SHORT: Record<TrailRouteId, string> = { haeparang: "해파랑길", namparang: "남파랑길", seohaerang: "서해랑길", dmz: "DMZ 평화의 길" };

/** 내 코스 도장 — 등산 회원일 때만 묻는다(아니면 undefined) */
export function useMyTrails(): MyTrails | undefined {
    const can = useHikingAccess();
    return useQuery<MyTrails>({ queryKey: TRAIL_ME_KEY, enabled: can, staleTime: 30_000 }).data;
}

/** 도장 그림 — earned 면 또렷이, half 면 반쯤(출발만 확인), 아니면 흐린 점선 */
export function TrailStampSeal({ route, label, state, size = 112 }: { route: TrailRouteId; label: string; state: "none" | "half" | "done"; size?: number }) {
    const ink = TRAIL_INK[route];
    const id = useId().replace(/:/g, "");
    const r = 46;
    const big = label.length <= 2 ? 30 : label.length <= 4 ? 24 : 18;
    const motif = route === "dmz"
        ? "M30 66 L38 60 L44 64 L50 57 L56 63 L62 59 L70 66" // 접경의 능선
        : "M30 64 q5 -5 10 0 t10 0 t10 0 t10 0"; // 바다 물결
    const faded = state === "none";
    return (
        <svg viewBox="0 0 100 100" width={size} height={size} role="img" aria-label={`${ROUTE_SHORT[route]} ${label} 도장${state === "done" ? "" : state === "half" ? " — 출발 확인" : " — 아직"}`}
            style={{ opacity: faded ? 0.38 : 1, transform: state === "done" ? "rotate(-8deg)" : undefined }} data-testid="trail-stamp-seal" data-state={state}>
            <defs>
                <path id={`top${id}`} d="M 18 50 A 32 32 0 0 1 82 50" />
                <path id={`bot${id}`} d="M 16 50 A 34 34 0 0 0 84 50" />
            </defs>
            <circle cx="50" cy="50" r={r} fill="none" stroke={ink} strokeWidth={state === "done" ? 3.2 : 2} strokeDasharray={faded ? "4 3" : undefined} />
            <circle cx="50" cy="50" r={r - 5} fill="none" stroke={ink} strokeWidth="1.1" strokeDasharray={state === "half" ? "3 3" : faded ? "2 3" : undefined} />
            <text fontSize="10.5" fontWeight="700" fill={ink} letterSpacing="1.5"><textPath href={`#top${id}`} startOffset="50%" textAnchor="middle">{ROUTE_SHORT[route]}</textPath></text>
            <text fontSize="7.5" fontWeight="600" fill={ink} letterSpacing="2.2"><textPath href={`#bot${id}`} startOffset="50%" textAnchor="middle">코리아둘레길</textPath></text>
            <text x="50" y="52" fontSize={big} fontWeight="800" fill={ink} textAnchor="middle" style={{ fontVariantNumeric: "tabular-nums" }}>{label}</text>
            <path d={motif} fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity={state === "half" ? 0.55 : 1} />
            {state === "done" && <circle cx="50" cy="50" r={r} fill={ink} opacity="0.05" />}
        </svg>
    );
}

interface CheckResult { state: "far" | "half" | "done"; reason: string; hint: string | null; end: "start" | "end" | null; at?: string; stamped: boolean; startedAt?: string }

/** 코스 화면의 도장 칸 — 회원은 확인 단추, 방문자는 가입 안내. 등산이 막힌 회원(한국어가 아닌 화면)에게는 그리지 않는다 */
export function TrailStampCard({ c }: { c: TrailCourseDetail }) {
    const { member, isLoading } = useAuth();
    const can = useHikingAccess();
    const my = useMyTrails();
    const qc = useQueryClient();
    const [, setLocation] = useLocation();
    const [msg, setMsg] = useState<{ tone: "ok" | "warn"; text: string } | null>(null);
    const [sharing, setSharing] = useState(false);
    const route = c.route as TrailRouteId;
    const label = c.key;
    const loop = isLoopCourse(c);
    const stamp = my?.stamps.find((s) => s.courseId === c.id);
    const open = my?.open.find((o) => o.courseId === c.id);
    const openFresh = open && Date.now() - Date.parse(open.at) < TRAIL_PAIR_WINDOW_H * 3_600_000 ? open : undefined;
    const state: "none" | "half" | "done" = stamp ? "done" : openFresh ? "half" : "none";

    const check = useMutation({
        mutationFn: async (): Promise<CheckResult | { denied: true }> => {
            const pos = await getDevicePosition({ prompt: true, highAccuracy: true, timeoutMs: 15000, maximumAgeMs: 0 });
            if (pos.status !== "granted") return { denied: true };
            return apiRequest(`/api/hiq/trails/${encodeURIComponent(c.route)}/${encodeURIComponent(c.key)}/check`, { method: "POST", body: JSON.stringify({ lat: pos.fix.lat, lng: pos.fix.lng, accuracy: pos.fix.accuracy }) });
        },
        onSuccess: (r) => {
            if ("denied" in r) { setMsg({ tone: "warn", text: "위치를 쓸 수 없어요. 설정에서 위치를 허용한 뒤 다시 눌러 주세요." }); return; }
            if (r.state === "far") { setMsg({ tone: "warn", text: r.hint ?? `코스의 시작이나 끝 ${TRAIL_END_RADIUS_M}m 안에서 눌러 주세요.` }); return; }
            const where = r.end === "start" ? c.startName ?? "코스 시작" : c.endName ?? "코스 끝";
            if (r.state === "done") setMsg({ tone: "ok", text: r.stamped ? `${where} 도착 — ${ROUTE_SHORT[route]} ${label}코스 도장이 찍혔어요.` : "이미 받은 도장이에요." });
            else setMsg({ tone: "ok", text: `${where}에서 출발을 확인했어요.` });
            qc.invalidateQueries({ queryKey: TRAIL_ME_KEY });
        },
        onError: (e: unknown) => setMsg({ tone: "warn", text: /429|너무 많이/.test(String((e as Error)?.message ?? e)) ? "오늘은 확인을 너무 많이 했어요. 내일 다시 눌러 주세요." : "지금은 확인하지 못했어요. 통신이 되는 곳에서 다시 눌러 주세요." }),
    });

    if (isLoading) return null;
    if (member && !can) return null;
    const how = loop
        ? "출발할 때 한 번, 한 바퀴 돌아와 같은 자리에서 한 번 더 '여기 왔어요'를 누르면 이 코스 도장이에요."
        : `코스의 한쪽 끝에서 '여기 왔어요', 반대쪽 끝에서 ${TRAIL_PAIR_WINDOW_H}시간 안에 한 번 더 누르면 이 코스 도장이에요. 어느 쪽에서 출발해도 돼요.`;
    const line = stamp
        ? `${stampDate(new Date(stamp.doneAt))}에 걸었어요 · ${stamp.firstEnd === "start" ? c.startName ?? "시작" : c.endName ?? "끝"}에서 출발`
        : openFresh ? trailHalfLine({ start: c.start, end: c.end, loop, minutes: c.minutes, startName: c.startName, endName: c.endName }, { end: openFresh.end, atMs: Date.parse(openFresh.at) }, Date.now()) : how;

    return (
        <div className="mt-4 overflow-hidden rounded-2xl bg-[#F4EFE3] text-[#0E2A33]" data-testid="trail-stamp-card" data-state={state}>
            <div className="flex items-center gap-4 px-4 pb-3 pt-4">
                <TrailStampSeal route={route} label={label} state={state} />
                <div className="min-w-0 flex-1">
                    <p className="text-[12.5px] font-semibold" style={{ color: TRAIL_INK[route] }}>코스 도장</p>
                    <p className="mt-0.5 text-[17px] font-semibold leading-snug">{state === "done" ? "도장을 받았어요" : state === "half" ? "출발 확인 — 반대쪽 끝에서 한 번 더" : `${ROUTE_SHORT[route]} ${label}코스`}</p>
                    <p className="mt-1 text-[13px] leading-snug text-[#0E2A33B3] break-keep" data-testid="trail-stamp-line">{line}</p>
                </div>
            </div>
            <div className="px-4 pb-3.5">
                {!member ? (
                    <button type="button" onClick={() => goLogin(setLocation)} data-track-as="trail-stamp-join" data-testid="trail-stamp-join"
                        className="flex h-12 w-full items-center justify-center rounded-xl bg-[#0E2A33] text-[15px] font-semibold text-[#F4EFE3] active:bg-[#16404D]">
                        가입하고 코스 도장 모으기
                    </button>
                ) : state !== "done" ? (
                    <button type="button" disabled={check.isPending} onClick={() => { setMsg(null); check.mutate(); }} data-track-as="trail-stamp-check" data-testid="trail-stamp-check"
                        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-[#0E2A33] text-[15px] font-semibold text-[#F4EFE3] active:bg-[#16404D] disabled:opacity-50">
                        <LucideLocateFixed className="h-4 w-4" aria-hidden />{check.isPending ? "위치를 확인하는 중…" : state === "half" ? "도착했어요 — 위치 확인" : "여기 왔어요 — 위치 확인"}
                    </button>
                ) : (
                    // 도장 카드 공유 — 걸은 날 · 코스가 적힌 카드(서명된 주소, 30일)
                    <button type="button" onClick={() => setSharing(true)} data-track-as="trail-stamp-share-open" data-testid="trail-stamp-share"
                        className="flex h-12 w-full items-center justify-center gap-1.5 rounded-xl bg-[#0E2A33] text-[15px] font-semibold text-[#F4EFE3] active:bg-[#16404D]">
                        <LucideShare2 weight="bold" className="h-4 w-4" aria-hidden />도장 카드 공유
                    </button>
                )}
                {stamp && <TrailStampShareSheet open={sharing} onClose={() => setSharing(false)} route={c.route} courseKey={c.key} title={`${ROUTE_SHORT[route]} ${label}코스`} />}
                {msg && <p className="mt-2 text-[13.5px] leading-snug break-keep" style={{ color: msg.tone === "ok" ? "#2F6A0C" : "#A14A1E" }} role="status" data-testid="trail-stamp-msg">{msg.text}</p>}
                {member && <p className="mt-2 text-[12px] leading-snug text-[#0E2A33A6] break-keep">위치는 코스 끝까지의 거리를 재는 데만 쓰고 저장하지 않아요.</p>}
            </div>
        </div>
    );
}
