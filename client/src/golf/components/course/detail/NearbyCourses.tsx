/**
 * 가까운 골프장(2026-09-24) — 이 골프장을 가운데 둔 작은 지도(방향·거리 그대로) + 번호가 맞는 목록.
 * 지도에는 지명도 타일도 없다: 좌표 두 개의 방향과 거리만 쓴다(지어낸 것이 없다). 지금 글이 있는 곳은 라임.
 * 목록은 진짜 링크(<a>) — 검색 로봇이 골프장끼리 건너다니는 길이기도 하다.
 */
import { CourseLogo } from "../CourseLogo";
import { Link, useLocation } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { cityShort, coursePath, manwonText } from "@shared/golfCourse";
import type { CourseDetail } from "@/golf/lib/courseApi";
import { Card, Section } from "./ui";

type Near = CourseDetail["nearby"][number];

const NICE = [1, 2, 3, 5, 10, 15, 20, 30, 50, 100, 200];
/** 카드 바탕(흰 3% on #0A0A0A) — 고리 글자 뒤를 이 색으로 파내 선이 글자를 가르지 않게 한다 */
const CARD = "#121212";
const LIME = "#64DD17";

/**
 * 둘째 판(2026-09-24 오너: "디자인을 조금 더 디테일하게"):
 *  - 고리 글자(5km·20km)를 고리 **아래쪽 선 위** 바탕색 알약에 얹었다(선이 글자를 가르지 않게) — 번호 점이 글자를 덮던 것(5 가 '5km' 위에)을
 *    글자 자리를 장애물로 넣어 밀어낸다.
 *  - 가운데는 '이 골프장' — 라임 점 + 얇은 고리 + 글자. 북쪽은 고리 위 작은 눈금과 N.
 *  - 번호 점: 글 없는 곳은 짙은 면 + 얇은 테두리, 글 있는 곳은 라임. 둘레에 바탕색 테두리를 둘러 겹쳐도 또렷하게.
 */
function Radar({ lat0, lng0, items }: { lat0: number; lng0: number; items: Near[] }) {
    const [, setLocation] = useLocation();
    const W = 343, H = 244, cx = W / 2, cy = H / 2, R = 106, MR = 11;
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111.32, ky = 110.57;
    const raw = items.map((n, i) => ({ n, i, x: (n.lng! - lng0) * kx, y: (n.lat! - lat0) * ky }));
    const far = Math.max(...raw.map((p) => Math.hypot(p.x, p.y)), 0.5);
    const ring = NICE.find((v) => v >= far) ?? Math.ceil(far);
    const inner = NICE.filter((v) => v <= ring / 3).pop() ?? ring / 3;
    // 거리는 제곱근 눈금 — 가까운 곳이 가운데에 뭉치지 않게(방향은 그대로). 고리 글자도 같은 눈금.
    const rad = (km: number) => R * Math.sqrt(Math.min(1, km / ring));
    const rings = [inner, ring];
    // 번호 점이 비켜 가야 할 자리: 고리 글자 두 개 · 가운데 '이 골프장' 글자 · N
    const obstacles = [
        ...rings.map((r) => ({ x: cx, y: cy + rad(r), r: 18 })),
        { x: cx, y: cy + 23, r: 17 },
        { x: cx, y: cy - R, r: 12 },
    ];
    const pts = raw.map((p) => {
        const d = Math.hypot(p.x, p.y) || 0.0001, r = Math.max(24, rad(d));
        return { ...p, px: cx + (p.x / d) * r, py: cy - (p.y / d) * r };
    });
    // 겹친 점은 서로 조금 민다(번호가 읽혀야 한다) — 방향이 크게 틀어지지 않을 만큼만.
    const GAP = MR * 2 + 3;
    for (let it = 0; it < 60; it++) {
        for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
            const dx = pts[b].px - pts[a].px, dy = pts[b].py - pts[a].py, dd = Math.hypot(dx, dy) || 0.01;
            if (dd >= GAP) continue;
            const push = (GAP - dd) / 2, ux = dx / dd, uy = dy / dd;
            pts[a].px -= ux * push; pts[a].py -= uy * push; pts[b].px += ux * push; pts[b].py += uy * push;
        }
        for (const p of pts) {
            for (const o of obstacles) {
                const dx = p.px - o.x, dy = p.py - o.y, dd = Math.hypot(dx, dy) || 0.01, min = o.r + MR + 1;
                if (dd < min) { p.px = o.x + (dx / dd) * min; p.py = o.y + (dy / dd) * min; }
            }
            const dx = p.px - cx, dy = p.py - cy, dd = Math.hypot(dx, dy) || 0.01;
            if (dd < 24) { p.px = cx + (dx / dd) * 24; p.py = cy + (dy / dd) * 24; }
            p.px = Math.min(W - MR - 2, Math.max(MR + 2, p.px)); p.py = Math.min(H - MR - 2, Math.max(MR + 2, p.py));
        }
    }
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto h-auto block" role="img" aria-label="가까운 골프장 위치" shapeRendering="geometricPrecision">
            <defs>
                <radialGradient id="near-glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor={LIME} stopOpacity="0.10" />
                    <stop offset="100%" stopColor={LIME} stopOpacity="0" />
                </radialGradient>
            </defs>
            <circle cx={cx} cy={cy} r={R} fill="url(#near-glow)" />
            {/* 십자선 — 아주 옅게, 점선 */}
            <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#FFFFFF0F" strokeDasharray="1 3" />
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#FFFFFF0F" strokeDasharray="1 3" />
            {rings.map((r, k) => (
                <circle key={k} cx={cx} cy={cy} r={rad(r)} fill="none" stroke={k ? "#FFFFFF24" : "#FFFFFF14"} strokeDasharray={k ? undefined : "3 4"} />
            ))}
            {/* 북쪽 눈금 + N */}
            <line x1={cx} y1={cy - R - 4} x2={cx} y2={cy - R + 4} stroke="#FFFFFF59" strokeWidth={1.5} strokeLinecap="round" />
            <text x={cx} y={cy - R - 8} textAnchor="middle" fill="#FFFFFF73" fontSize="11" fontWeight={600} letterSpacing="0.5">N</text>
            {/* 고리 글자 — 고리 아래쪽 선 위, 뒤를 파낸다 */}
            {rings.map((r, k) => {
                const label = `${r}km`, w = label.length * 6.4 + 8;
                return (
                    <g key={k}>
                        <rect x={cx - w / 2} y={cy + rad(r) - 7.5} width={w} height={15} rx={7.5} fill={CARD} />
                        <text x={cx} y={cy + rad(r) + 4} textAnchor="middle" fill="#FFFFFF73" fontSize="11" fontWeight={500}>{label}</text>
                    </g>
                );
            })}
            {/* 이 골프장 */}
            <circle cx={cx} cy={cy} r={13} fill="none" stroke={LIME} strokeOpacity={0.35} />
            <circle cx={cx} cy={cy} r={5.5} fill={LIME} stroke={CARD} strokeWidth={2.5} paintOrder="stroke" />
            <rect x={cx - 25} y={cy + 16} width={50} height={14} rx={7} fill={CARD} />
            <text x={cx} y={cy + 26.5} textAnchor="middle" fill="#FFFFFF99" fontSize="10.5" fontWeight={500}>이 골프장</text>
            {pts.map(({ n, i, px, py }) => {
                const live = n.counts.booking + n.counts.join > 0;
                return (
                    <g key={n.slug} role="link" aria-label={n.name} className="cursor-pointer" onClick={() => setLocation(coursePath(n.slug))}>
                        <circle cx={px} cy={py} r={MR + 4} fill="transparent" />
                        <circle cx={px} cy={py} r={MR} fill={live ? LIME : "#1F1F1F"} stroke={CARD} strokeWidth={3} paintOrder="stroke" />
                        {!live && <circle cx={px} cy={py} r={MR - 0.5} fill="none" stroke="#FFFFFF33" />}
                        <text x={px} y={py + 4.2} textAnchor="middle" fontSize="12" fontWeight={700} fill={live ? "#051907" : "#FFFFFFE6"} style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}</text>
                    </g>
                );
            })}
        </svg>
    );
}

export function NearbyCourses({ items, lat, lng }: { items: Near[]; lat: number | null; lng: number | null }) {
    items = items.filter((n) => n.slug && n.name?.trim());
    if (!items.length) return null;
    const mapped = lat != null && lng != null ? items.filter((n) => n.lat != null && n.lng != null && n.km != null) : [];
    const showMap = mapped.length >= 2;
    return (
        <Section id="near" title="가까운 골프장">
            <Card className="overflow-hidden">
                {showMap && <div className="px-2 pt-3 pb-1 border-b border-[#FFFFFF0F]"><Radar lat0={lat!} lng0={lng!} items={mapped} /></div>}
                <ul className="divide-y divide-[#FFFFFF0F]">
                    {items.map((n) => {
                        const idx = mapped.indexOf(n);
                        const live = n.counts.booking + n.counts.join;
                        return (
                            <li key={n.slug}>
                                <Link href={coursePath(n.slug)} className="flex items-center gap-3 px-4 py-3 active:bg-[#FFFFFF0A]">
                                    {showMap && (
                                        <span className={`w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[12px] font-semibold ${live ? "bg-[#64DD17] text-[#051907]" : "bg-[#1F1F1F] text-[#FFFFFFE6] ring-1 ring-inset ring-[#FFFFFF33]"}`}>
                                            {idx >= 0 ? idx + 1 : "·"}
                                        </span>
                                    )}
                                    <CourseLogo logo={n.logo} name={n.name} size="sm" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[15px] font-medium text-white truncate">{n.name}</span>
                                        <span className="block text-[12.5px] text-[#FFFFFF80] truncate tabular-nums">
                                            {[cityShort(n.city), n.km != null ? `${n.km}km` : "", n.holes ? `${n.holes}홀` : ""].filter(Boolean).join(" · ")}
                                        </span>
                                    </span>
                                    <span className="shrink-0 text-right">
                                        {live > 0 && <span className="block text-[13px] font-medium text-[#8BE84A] tabular-nums">티타임 {live}</span>}
                                        {n.price && <span className="block text-[12.5px] text-[#FFFFFF99] tabular-nums">{manwonText(n.price.price)}</span>}
                                    </span>
                                    <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF33]" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </Card>
        </Section>
    );
}
