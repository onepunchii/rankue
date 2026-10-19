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

/** 1km 안은 같은 리조트의 다른 코스 페이지('설해원 더 레전드 코스' 0km, 2026-10-19) — '0km'는 틀린 값처럼 읽힌다 */
const SAME_SPOT = "같은 자리";
import { Card, Section } from "./ui";

type Near = CourseDetail["nearby"][number];

const NICE = [1, 2, 3, 5, 10, 15, 20, 30, 50, 100, 200];
const LIME = "#64DD17";
/** 그린의 바탕 — 고리 글자 · 가운데 글자 뒤를 이 색으로 파낸다 */
const GREEN = "#0F2A17";
/** 테의 두께 */
const BEZEL = 15;
const DIRS: readonly [string, number][] = [["N", 0], ["E", 90], ["S", 180], ["W", 270]];

/**
 * 둘째 판(2026-09-24 오너: "디자인을 조금 더 디테일하게"):
 *  - 고리 글자(5km·20km)를 고리 **아래쪽 선 위** 바탕색 알약에 얹었다(선이 글자를 가르지 않게) — 번호 점이 글자를 덮던 것(5 가 '5km' 위에)을
 *    글자 자리를 장애물로 넣어 밀어낸다.
 *  - 가운데는 '이 골프장' — 라임 점 + 얇은 고리 + 글자. 북쪽은 고리 위 작은 눈금과 N.
 *  - 번호 점: 글 없는 곳은 짙은 면 + 얇은 테두리, 글 있는 곳은 라임. 둘레에 바탕색 테두리를 둘러 겹쳐도 또렷하게.
 *
 * 셋째 판(2026-10-13 오너: "가까운 골프장도 원 테두리를 등산 나침반처럼, 골프랑 잘 맞는 테두리로") — 그린 위의 깃대:
 *  - 테: 등산의 판(hiking NearMe NearDial)처럼 눈금(5도마다 · 30도마다 길게)과 동서남북을 두른 짙은 고리. N 만 라임.
 *  - 판: 그린 — 짙은 초록에 잔디 깎은 결(비스듬한 띠). 고리와 십자선은 그 위에 옅게.
 *  - 가운데: 홀컵과 깃대(라임 깃발) — '이 골프장'. 번호 점은 골프공: 글 없는 곳은 흰 공, 지금 글이 있는 곳은 라임 공.
 *  - 번호 점은 판 안에만 놓는다(테 위로 올라가지 않게).
 */
function Radar({ lat0, lng0, items }: { lat0: number; lng0: number; items: Near[] }) {
    const [, setLocation] = useLocation();
    const W = 343, H = 262, cx = W / 2, cy = H / 2, R = 104, MR = 11;
    const polar = (deg: number, r: number): [number, number] => [cx + Math.sin((deg * Math.PI) / 180) * r, cy - Math.cos((deg * Math.PI) / 180) * r];
    const kx = Math.cos((lat0 * Math.PI) / 180) * 111.32, ky = 110.57;
    const raw = items.map((n, i) => ({ n, i, x: (n.lng! - lng0) * kx, y: (n.lat! - lat0) * ky }));
    const far = Math.max(...raw.map((p) => Math.hypot(p.x, p.y)), 0.5);
    const ring = NICE.find((v) => v >= far) ?? Math.ceil(far);
    const inner = NICE.filter((v) => v <= ring / 3).pop() ?? ring / 3;
    // 거리는 제곱근 눈금 — 가까운 곳이 가운데에 뭉치지 않게(방향은 그대로). 고리 글자도 같은 눈금.
    const rad = (km: number) => R * Math.sqrt(Math.min(1, km / ring));
    const rings = [inner, ring];
    // 번호 점이 비켜 가야 할 자리: 안쪽 고리의 글자 · 가운데 '이 골프장' 글자 · 깃발 · 바깥 고리의 글자
    const obstacles = [
        { x: cx, y: cy + rad(inner), r: 18 },
        // '이 골프장' 글자는 옆으로 길다 — 둘로 나눠 막는다(하나로 막으면 글자의 양 끝에 공이 걸린다)
        { x: cx - 14, y: cy + 25, r: 15 }, { x: cx + 14, y: cy + 25, r: 15 },
        { x: cx + 5, y: cy - 16, r: 10 },
        // 바깥 고리의 거리(판의 맨 아래 안쪽)
        { x: cx, y: cy + R - 11, r: 17 },
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
            // 판 안에만 — 테 위로 올라가지 않게
            const ex = p.px - cx, ey = p.py - cy, ed = Math.hypot(ex, ey) || 0.01, lim = R - MR - 2;
            if (ed > lim) { p.px = cx + (ex / ed) * lim; p.py = cy + (ey / ed) * lim; }
        }
    }
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[400px] mx-auto h-auto block" role="img" aria-label="가까운 골프장 위치" shapeRendering="geometricPrecision">
            <defs>
                <radialGradient id="near-green" cx="50%" cy="45%" r="62%">
                    <stop offset="0%" stopColor="#1B4A27" />
                    <stop offset="70%" stopColor="#123520" />
                    <stop offset="100%" stopColor="#0C2415" />
                </radialGradient>
                {/* 잔디 깎은 결 — 비스듬한 띠 */}
                <pattern id="near-mow" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(32)"><rect width="13" height="26" fill="#FFFFFF" fillOpacity="0.035" /></pattern>
                <clipPath id="near-clip"><circle cx={cx} cy={cy} r={R} /></clipPath>
            </defs>
            {/* 테 — 눈금과 동서남북 */}
            <circle cx={cx} cy={cy} r={R + BEZEL} fill="#161616" />
            <circle cx={cx} cy={cy} r={R + BEZEL - 2.5} fill="none" stroke={LIME} strokeOpacity={0.42} strokeWidth={1} />
            {Array.from({ length: 72 }, (_, k) => {
                const d = k * 5, long = d % 30 === 0;
                if (d % 90 === 0) return null;
                const [x0, y0] = polar(d, R + 2.5), [x1, y1] = polar(d, R + (long ? 8.5 : 5));
                return <path key={d} d={`M${x0.toFixed(1)} ${y0.toFixed(1)} L${x1.toFixed(1)} ${y1.toFixed(1)}`} stroke="#FFFFFF" strokeOpacity={long ? 0.5 : 0.24} strokeWidth={long ? 1.2 : 0.9} strokeLinecap="round" />;
            })}
            {DIRS.map(([t, d]) => { const [x, y] = polar(d, R + BEZEL / 2); return <text key={t} x={x} y={y + 4.2} textAnchor="middle" fontSize="12" fontWeight={600} fill={d === 0 ? LIME : "#FFFFFFB3"}>{t}</text>; })}
            {/* 판 — 그린 */}
            <circle cx={cx} cy={cy} r={R} fill="url(#near-green)" />
            <g clipPath="url(#near-clip)">
                <circle cx={cx} cy={cy} r={R} fill="url(#near-mow)" />
                <path d={`M${cx} ${cy - R} V${cy + R} M${cx - R} ${cy} H${cx + R}`} stroke="#FFFFFF" strokeOpacity={0.07} strokeDasharray="1 3" />
            </g>
            <circle cx={cx} cy={cy} r={rad(inner)} fill="none" stroke="#FFFFFF" strokeOpacity={0.2} strokeDasharray="3 4" />
            <circle cx={cx} cy={cy} r={R} fill="none" stroke="#000000" strokeOpacity={0.5} strokeWidth={1.2} />
            {/* 고리의 거리 — 안쪽은 고리 아래쪽 선 위에(뒤를 파낸다), 바깥쪽은 판의 맨 아래 안쪽에 */}
            {(() => { const label = `${inner}km`, w = label.length * 6.8 + 8; return (<g><rect x={cx - w / 2} y={cy + rad(inner) - 8} width={w} height={16} rx={8} fill={GREEN} /><text x={cx} y={cy + rad(inner) + 4.2} textAnchor="middle" fill="#FFFFFF99" fontSize="12" fontWeight={500}>{label}</text></g>); })()}
            <text x={cx} y={cy + R - 7} textAnchor="middle" fill="#FFFFFF8C" fontSize="12" fontWeight={500}>{`${ring}km`}</text>
            {/* 이 골프장 — 홀컵과 깃대 */}
            <circle cx={cx} cy={cy} r={13} fill="none" stroke={LIME} strokeOpacity={0.35} />
            <ellipse cx={cx} cy={cy + 1} rx={6.5} ry={2.8} fill="#050A06" stroke="#000000" strokeOpacity={0.6} />
            <path d={`M${cx} ${cy + 1} V${cy - 24}`} stroke="#F4F4F0" strokeWidth={1.5} strokeLinecap="round" />
            <path d={`M${cx + 0.7} ${cy - 24} L${cx + 12} ${cy - 20} L${cx + 0.7} ${cy - 15.5} Z`} fill={LIME} stroke="#0A0A0A" strokeOpacity={0.5} strokeWidth={0.6} strokeLinejoin="round" />
            <rect x={cx - 27} y={cy + 17} width={54} height={16} rx={8} fill={GREEN} />
            <text x={cx} y={cy + 29} textAnchor="middle" fill="#FFFFFFB3" fontSize="12" fontWeight={500}>이 골프장</text>
            {pts.map(({ n, i, px, py }) => {
                const live = n.counts.booking + n.counts.join > 0;
                return (
                    <g key={n.slug} role="link" aria-label={n.name} className="cursor-pointer" onClick={() => setLocation(coursePath(n.slug))}>
                        <circle cx={px} cy={py} r={MR + 4} fill="transparent" />
                        {/* 골프공 — 글 없는 곳은 흰 공, 지금 글이 있는 곳은 라임 공. 둘레에 그린색 테를 둘러 겹쳐도 또렷하게 */}
                        <circle cx={px} cy={py} r={MR} fill={live ? LIME : "#F4F4F0"} stroke={GREEN} strokeWidth={3} paintOrder="stroke" />
                        <circle cx={px - 3} cy={py - 3.5} r={MR - 4} fill="#FFFFFF" fillOpacity={live ? 0.22 : 0.55} />
                        <text x={px} y={py + 4.2} textAnchor="middle" fontSize="12" fontWeight={700} fill={live ? "#051907" : "#141414"} style={{ fontVariantNumeric: "tabular-nums" }}>{i + 1}</text>
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
                                        <span className={`w-6 h-6 shrink-0 rounded-full inline-flex items-center justify-center text-[12px] font-semibold ${live ? "bg-[#64DD17] text-[#051907]" : "bg-[#F4F4F0] text-[#141414]"}`}>
                                            {idx >= 0 ? idx + 1 : "·"}
                                        </span>
                                    )}
                                    <CourseLogo logo={n.logo} name={n.name} size="sm" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-[15px] font-medium text-white truncate">{n.name}</span>
                                        {/* 자리 · 거리 · 홀은 덩어리 사이에서만 줄바꿈, 회원권 시세는 이름표를 붙여 아래 줄에(2026-10-17 리뷰:
                                            오른쪽의 '2억 6,500만원'이 무엇인지 안 적혀 있었고, 그 칸에 밀려 "진천 · 11.9k…" 로 잘렸다) */}
                                        <span className="mt-0.5 flex flex-wrap gap-x-1 text-[12.5px] text-[#FFFFFF80] tabular-nums">
                                            {(() => { const f = [cityShort(n.city), n.km != null ? (n.km < 1 ? SAME_SPOT : `${n.km}km`) : "", n.holes ? `${n.holes}홀` : ""].filter(Boolean); return f.map((x, i) => <span key={i} className="whitespace-nowrap">{x}{i < f.length - 1 ? " ·" : ""}</span>); })()}
                                        </span>
                                        {n.price && <span className="mt-0.5 block text-[12.5px] text-[#FFFFFF99] tabular-nums" data-testid="near-membership">회원권 {manwonText(n.price.price)}</span>}
                                    </span>
                                    {live > 0 && <span className="shrink-0 text-right text-[13px] font-medium text-[#8BE84A] tabular-nums">티타임 {live}</span>}
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
