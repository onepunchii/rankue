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

function Radar({ lat0, lng0, items }: { lat0: number; lng0: number; items: Near[] }) {
    const [, setLocation] = useLocation();
    const W = 343, H = 196, cx = W / 2, cy = H / 2, R = 84;
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111.32, ky = 110.57;
    const raw = items.map((n, i) => ({ n, i, x: (n.lng! - lng0) * kx, y: (n.lat! - lat0) * ky }));
    const far = Math.max(...raw.map((p) => Math.hypot(p.x, p.y)), 0.5);
    const ring = NICE.find((v) => v >= far) ?? Math.ceil(far);
    // 거리는 제곱근 눈금 — 가까운 곳이 가운데에 뭉치지 않게(방향은 그대로). 고리 글자도 같은 눈금.
    const rad = (km: number) => R * Math.sqrt(Math.min(1, km / ring));
    const pts = raw.map((p) => {
        const d = Math.hypot(p.x, p.y) || 0.0001, r = Math.max(22, rad(d));
        return { ...p, px: cx + (p.x / d) * r, py: cy - (p.y / d) * r };
    });
    // 겹친 점은 서로 조금 민다(번호가 읽혀야 한다) — 방향이 크게 틀어지지 않을 만큼만.
    for (let it = 0; it < 40; it++) {
        for (let a = 0; a < pts.length; a++) for (let b = a + 1; b < pts.length; b++) {
            const dx = pts[b].px - pts[a].px, dy = pts[b].py - pts[a].py, dd = Math.hypot(dx, dy) || 0.01;
            if (dd >= 21) continue;
            const push = (21 - dd) / 2, ux = dx / dd, uy = dy / dd;
            pts[a].px -= ux * push; pts[a].py -= uy * push; pts[b].px += ux * push; pts[b].py += uy * push;
        }
        for (const p of pts) {
            const dx = p.px - cx, dy = p.py - cy, dd = Math.hypot(dx, dy) || 0.01;
            if (dd < 20) { p.px = cx + (dx / dd) * 20; p.py = cy + (dy / dd) * 20; }
            p.px = Math.min(W - 12, Math.max(12, p.px)); p.py = Math.min(H - 12, Math.max(12, p.py));
        }
    }
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto h-auto block" role="img" aria-label="가까운 골프장 위치">
            {[NICE.filter((v) => v <= ring / 3).pop() ?? ring / 3, ring].map((r, k) => (
                <g key={k}>
                    <circle cx={cx} cy={cy} r={rad(r)} fill="none" stroke="#FFFFFF1A" strokeDasharray={k === 0 ? "2 4" : undefined} />
                    <text x={cx + rad(r) + 4} y={k === 0 ? cy + 16 : cy - 6} fill="#FFFFFF59" fontSize="13">{r}km</text>
                </g>
            ))}
            <line x1={cx} y1={cy - R} x2={cx} y2={cy + R} stroke="#FFFFFF0F" />
            <line x1={cx - R} y1={cy} x2={cx + R} y2={cy} stroke="#FFFFFF0F" />
            <text x={cx} y={12} textAnchor="middle" fill="#FFFFFF4D" fontSize="13">N</text>
            <circle cx={cx} cy={cy} r={11} fill="#64DD1726" />
            <circle cx={cx} cy={cy} r={5} fill="#64DD17" stroke="#0A0A0A" strokeWidth={2} />
            {pts.map(({ n, i, px, py }) => {
                const live = n.counts.booking + n.counts.join > 0;
                return (
                    <g key={n.slug} role="link" aria-label={n.name} className="cursor-pointer" onClick={() => setLocation(coursePath(n.slug))}>
                        <circle cx={px} cy={py} r={14} fill="transparent" />
                        <circle cx={px} cy={py} r={9.5} fill={live ? "#64DD17" : "#262626"} stroke={live ? "#0A0A0A" : "#FFFFFF40"} strokeWidth={1.5} />
                        <text x={px} y={py + 4} textAnchor="middle" fontSize="13" fontWeight={600} fill={live ? "#051907" : "#FFFFFFCC"}>{i + 1}</text>
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
                                        <span className={`w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[12px] font-semibold ${live ? "bg-[#64DD17] text-[#051907]" : "bg-[#FFFFFF14] text-[#FFFFFFB3]"}`}>
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
                                    <LucideChevronRight className="w-4 h-4 shrink-0 text-[#FFFFFF33]" />
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            </Card>
        </Section>
    );
}
