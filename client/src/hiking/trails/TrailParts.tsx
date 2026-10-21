/**
 * 코리아둘레길 화면의 작은 조각(2026-10-21) — 코스 선 그림(카드 · 목록) · 번호 알약 · 코스 한 줄.
 * 선 그림은 두루누비 GPX 를 줄인 굵은 선(coarse) 그대로 — 위가 북쪽, 위도 36° 코사인으로 가로를 줄여 모양이 눌리지 않게.
 * ⚠️ 리터럴 색만(등산의 색). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { TRAIL_LEVEL_NAME, trailCoursePath, trailRouteOf, trailTimeText, type TrailCourseSummary, type TrailRouteId } from "@shared/koreaTrails";
import { TrailStampSeal } from "./TrailStamp";

/** 코스의 선 — 정한 상자 안에 가운데로. 시작점은 속이 찬 점, 끝점은 고리 */
export function TrailSketch({ coarse, color, w = 96, h = 64, className }: { coarse: readonly (readonly [number, number])[]; color: string; w?: number; h?: number; className?: string }) {
    if (coarse.length < 2) return <span className={className} style={{ width: w, height: h }} aria-hidden />;
    const xs = coarse.map((p) => p[1] * 0.81), ys = coarse.map((p) => -p[0]);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = 8, sw = Math.max(1e-6, x1 - x0), sh = Math.max(1e-6, y1 - y0);
    const s = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
    const ox = (w - sw * s) / 2, oy = (h - sh * s) / 2;
    const pts = coarse.map((_, i) => [ox + (xs[i] - x0) * s, oy + (ys[i] - y0) * s] as const);
    const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const a = pts[0], b = pts[pts.length - 1];
    return (
        <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={className} aria-hidden>
            <path d={d} fill="none" stroke={color} strokeOpacity={0.25} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
            <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <circle cx={a[0]} cy={a[1]} r={3.4} fill={color} />
            <circle cx={b[0]} cy={b[1]} r={3.2} fill="#0B1F26" stroke={color} strokeWidth={1.8} />
        </svg>
    );
}

/** 번호 알약 — 길의 색 위에 '12' · '3-1' */
export function TrailNo({ c, size = 36 }: { c: Pick<TrailCourseSummary, "route" | "key">; size?: number }) {
    const r = trailRouteOf(c.route);
    return (
        <span className="flex shrink-0 items-center justify-center rounded-xl text-[13px] font-semibold tabular-nums" style={{ width: size, height: size, background: r?.color ?? "#F4EFE3", color: "#0B1F26" }}>{c.key}</span>
    );
}

/** 코스 이름에서 길 이름을 뗀 것 — '남파랑길 1코스' → '1코스' */
export const shortCourseName = (c: Pick<TrailCourseSummary, "name" | "route">) => {
    const r = trailRouteOf(c.route);
    return r ? c.name.replace(r.name, "").trim() || c.name : c.name;
};

/** 목록 한 줄 — 번호 · 이름 · 붙은 말(예약노선 · 우회로) · 거리 · 시간 · 난이도 · 선 그림. 내 도장이 있으면 번호 자리에 도장(종이 동그라미 위) */
export function TrailRow({ c, mine = "none" }: { c: TrailCourseSummary; mine?: "none" | "half" | "done" }) {
    const r = trailRouteOf(c.route);
    const bits = [`${c.km}km`, trailTimeText(c.minutes), c.level ? TRAIL_LEVEL_NAME[c.level] : null, c.loop ? "순환" : null].filter(Boolean).join(" · ");
    return (
        <li>
            <Link href={trailCoursePath(c.route, c.key)} className="flex items-center gap-3 py-3 active:opacity-80" data-testid="trail-row">
                {mine === "done"
                    ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#F4EFE3]" data-testid="trail-row-stamp" title="도장을 받은 코스"><TrailStampSeal route={c.route as TrailRouteId} label={c.key} state="done" size={34} /></span>
                    : <TrailNo c={c} />}
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[15.5px] font-semibold text-[#F4EFE3]">{shortCourseName(c)}</span>
                        {c.tags.map((t) => (
                            <span key={t} className="rounded-full px-2 py-0.5 text-[12px] font-medium" style={t.includes("예약") ? { background: "#F28C6A33", color: "#F6B08F" } : { background: "#FFFFFF14", color: "#F4EFE3B3" }}>{t}</span>
                        ))}
                    </span>
                    <span className="mt-0.5 block text-[13px] tabular-nums text-[#F4EFE3B3]">{bits}</span>
                    {mine === "half" && <span className="block text-[12.5px] font-medium text-[#F6D9A8]" data-testid="trail-row-half">출발 확인 — 반대쪽 끝에서 한 번 더</span>}
                    {c.sigun && <span className="block truncate text-[12.5px] text-[#F4EFE380]">{c.sigun}</span>}
                </span>
                <TrailSketch coarse={c.coarse} color={r?.color ?? "#F4EFE3"} w={72} h={52} className="shrink-0" />
                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
            </Link>
        </li>
    );
}
