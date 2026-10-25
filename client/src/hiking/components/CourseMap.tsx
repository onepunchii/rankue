/**
 * 코스 지도(2026-10-13) — 오너: "지도를 연결해서 내 위치가 어디이고 코스가 어디 있는지 … 우리 자료로 그리는 지도, 디테일 신경 써 줘."
 *
 * 바깥 지도 없이, 우리가 가진 코스 선 · 길 위의 지점 · 정상 자리로 종이 지도 한 장을 그린다(셈은 shared/hikingCourseMap — 단위는 km, 위가 북쪽).
 *   · 처음 그림은 **고른 코스**에 맞춘다(산의 코스 전부에 맞추면 코스가 수십 개인 산에서 고른 길이 실처럼 가늘다). 줄이면 산 전체가 보인다.
 *   · 고른 코스는 짙은 선(걷는 방향의 화살촉 · km 표지 · 출발/도착), 나머지는 옅은 선 — 누르면 그 코스로 바뀐다.
 *     옛 묶음의 코스에는 구간을 이어 붙여 직선으로 건너뛰는 것이 있다 — 그 자리에서 선을 끊는다(없는 길을 긋지 않는다).
 *   · 길 위의 지점: 들머리 · 주차장 · 화장실 · 약수터 · 대피소 · 조망점 · 봉우리 · 위험 구간은 이름표까지, 갈림길은 작은 점.
 *     이름표는 겹치지 않게 고른다 — 나 · 정상 · 출발이 먼저, 그다음 봉우리 · 대피소 · 물 · 화장실 …, 키울수록 더 많이 보인다.
 *   · 정상: 깃발과 '정상에서 1km' 고리.
 *   · 내 위치: 파란 점(정확도의 원). **이 기기에서만 찍는다** — 받은 자리는 부르는 화면의 메모리에만 있다(lib/useMyLocation · trail/useTrail).
 *     지도 밖이면 점 대신 "내 위치는 지도 밖 · 북동쪽 12km" 한 줄.
 *   · 손짓: 두 손가락으로 키우기 · 키운 뒤 끌기 · 두 번 눌러 키우기(lib/useBoxZoom), + / − / 처음 크기로 / 산 전체 보기.
 * 산 화면을 한 번 열면 받아 둔 자료만으로 그려진다 — 산에서 신호가 끊겨도 보인다.
 * 위의 '종이 지도 | 실제 지도'(2026-10-25 오너: "주변 건물 · 도로가 안 보여 답답하다") — 실제 지도는 카카오 지도 위에 같은 코스를 얹는다(KakaoCourseMap).
 *   종이 지도가 기본이고, 실제 지도는 눌렀을 때만 받는다(유료 0.1원/건 · shared/kakaoMap). 한 번 연 실제 지도는 숨겨 둘 뿐 지우지 않는다 —
 *   종이 지도와 오가도 지도를 다시 만들지 않는다. 못 띄우면(상한 · 신호 없음) 종이 지도로 돌아가고 까닭을 한 줄로 적는다.
 * ⚠️ 리터럴 색만. 글자는 화면에서 12px 이상(그림 안의 글자는 '화면 1px = 몇 km'로 맞춘다), 굵기는 semibold 까지.
 */
import { Suspense, lazy, useMemo, useState } from "react";
import {
    COURSE_MAP_COPY, COURSE_MAP_DOT_KINDS, COURSE_MAP_LABEL_KINDS, COURSE_MAP_MIN_VIEW_KM, boxAround, courseMapFrame, focusBox, hereOnMap, labelPx, lineBreaks, offViewNote, pickLabels,
    scaleBarKm, scaleBarText, summitRingsKm, toKmXY, type PxRect,
} from "@shared/hikingCourseMap";
import { HIKING_POI_NAME, hikingPoiTitle, type HikingPoiKind } from "@shared/hikingPois";
import type { MountainCourse, MountainPoi } from "../lib/api";
import { useBoxZoom } from "../lib/useBoxZoom";
import { POI_COLOR } from "../theme";
import type { KakaoMapFail } from "./KakaoCourseMap";

/** 실제 지도(카카오) — 눌렀을 때만 받는다. 키가 없는 빌드에서는 단추가 없다 */
const KakaoCourseMap = lazy(() => import("./KakaoCourseMap"));
const KAKAO_READY = !!(import.meta.env.VITE_KAKAO_MAP_KEY || import.meta.env.VITE_KAKAO_JS_KEY);
const REAL_FAIL: Record<KakaoMapFail, string> = {
    device: "오늘은 이 기기에서 실제 지도를 많이 열었어요 — 내일 다시 쓸 수 있어요. 종이 지도는 그대로 돼요.",
    cap: "지금은 실제 지도를 쉬고 있어요 — 종이 지도를 써 주세요.",
    off: "지금은 실제 지도를 쉬고 있어요 — 종이 지도를 써 주세요.",
    net: "실제 지도를 불러오지 못했어요 — 신호가 약한 곳에서는 종이 지도를 써 주세요.",
    sdk: "실제 지도를 불러오지 못했어요 — 신호가 약한 곳에서는 종이 지도를 써 주세요.",
};

/** 이름표를 먼저 다는 차례 — 자리가 겹치면 앞의 것이 남는다 */
const LABEL_RANK: readonly string[] = ["PEAK", "SHELTER", "WATER", "TOILET", "ENTRY", "PARK", "BUS", "DANGER", "VIEW"];
const HERE = "#2F7BFF";
const INK = "#0E2A33", TEAL = "#1F5560", PAPER = "#F4EFE3", CORAL = "#F28C6A";
const BTN = "flex h-10 w-10 items-center justify-center rounded-xl text-[20px] leading-none text-[#0E2A33] active:bg-[#E4DCC8] disabled:opacity-35";
const CHIP = "absolute left-2 top-2 h-9 rounded-full px-3 text-[13px] font-medium text-[#0E2A33] active:bg-[#E4DCC8]";
const FLOAT = { background: "#F4EFE3F2", boxShadow: "0 1px 4px rgba(14,42,51,0.28), inset 0 0 0 1px rgba(14,42,51,0.18)" } as const;
const FS = 12.5;
/** noFlip: 오른쪽에 안 들어가면 왼쪽으로 옮기지 않고 그리지 않는다(볼거리 — 점에서 멀어진 이름표가 길의 것처럼 보였다) */
type Label = { key: string; x: number; y: number; dx: number; dy: number; text: string; fill: string; bold?: boolean; opacity?: number; keep?: boolean; center?: boolean; noFlip?: boolean };

/** 볼거리 점의 색(코리아둘레길의 관광지 — 2026-10-21). 길 위의 지점과 섞이지 않는 산호 잉크 */
const SPOT_INK = "#C2552F";

const NO_EXTRAS: readonly { id: string; lat: number; lng: number; name: string }[] = [];

export function CourseMap({ courses, index, onPick, pois, summit, here, ask, asking, live, className, words, extras = NO_EXTRAS, extrasWord = "볼거리" }: {
    courses: readonly MountainCourse[];
    /** 고른 코스의 차례 */
    index: number;
    /** 다른 코스의 선을 눌렀을 때 — 없으면 선을 누를 수 없다(산행 중) */
    onPick?: (i: number) => void;
    pois: readonly MountainPoi[];
    summit: { lat: number; lng: number } | null;
    here: { lat: number; lng: number; accuracy?: number | null } | null;
    /** 아직 위치 권한을 정하지 않았을 때만 — 눌러서 한 번 묻는다 */
    ask?: (() => void) | null;
    asking?: boolean;
    /** 산행 중 — 내 위치가 계속 새로 온다(점이 숨을 쉰다) */
    live?: boolean;
    className?: string;
    /** 글 바꾸기 — 코리아둘레길(2026-10-21)은 '산 전체 보기' · '이 산의 다른 코스'가 아니다 */
    words?: { wide?: string; others?: string };
    /** 길 밖의 점(코리아둘레길 코스 근처 볼거리 — 2026-10-21). 길 위의 지점보다 이름표가 뒤로 밀린다 */
    extras?: readonly { id: string; lat: number; lng: number; name: string }[];
    extrasWord?: string;
}) {
    const at = Math.min(Math.max(index, 0), Math.max(0, courses.length - 1));
    const sel = courses[at];
    const frame = useMemo(() => courseMapFrame(courses.map((c) => c.line), summit), [courses, summit]);
    const home = frame?.home ?? { x: -1, y: -1, w: 2, h: 2 };
    const start = useMemo(() => (frame && sel ? focusBox(frame, sel.line, summit) : home), [frame, sel, summit]); // eslint-disable-line react-hooks/exhaustive-deps
    const z = useBoxZoom(home, start, COURSE_MAP_MIN_VIEW_KM);
    const [mode, setMode] = useState<"paper" | "real">("paper");
    // 한 번 연 실제 지도는 붙여 둔다 — 지우고 다시 열면 지도를 또 만든다(💰)
    const [realOn, setRealOn] = useState(false);
    const [realNote, setRealNote] = useState<string | null>(null);

    // 선 — 코스가 바뀔 때만 다시 센다. 건너뛴 자리에서는 끊는다
    const paths = useMemo(() => (frame ? courses.map((c) => {
        const cut = new Set(lineBreaks(c.line));
        return c.line.map((p, i) => { const [x, y] = toKmXY(frame, p[0], p[1]); return `${i && !cut.has(i) ? "L" : "M"}${x.toFixed(4)} ${y.toFixed(4)}`; }).join("");
    }) : []), [courses, frame]);
    // 고른 코스 — 점의 자리 · 걷는 방향의 화살촉 · km 표지
    const walk = useMemo(() => {
        if (!frame || !sel || sel.line.length < 2) return null;
        const pts = sel.line.map((p) => ({ xy: toKmXY(frame, p[0], p[1]), km: p[3] }));
        const total = pts[pts.length - 1].km;
        const on = (km: number) => {
            let i = 1;
            while (i < pts.length - 1 && pts[i].km < km) i++;
            const a = pts[i - 1], b = pts[i], t = b.km > a.km ? (km - a.km) / (b.km - a.km) : 0;
            return { x: a.xy[0] + (b.xy[0] - a.xy[0]) * t, y: a.xy[1] + (b.xy[1] - a.xy[1]) * t, deg: (Math.atan2(b.xy[1] - a.xy[1], b.xy[0] - a.xy[0]) * 180) / Math.PI };
        };
        const step = total <= 6 ? 1 : total <= 14 ? 2 : 5;
        const marks: { km: number; x: number; y: number }[] = [];
        for (let k = step; k < total - step * 0.4; k += step) { const p = on(k); marks.push({ km: k, x: p.x, y: p.y }); }
        const arrows = total > 0.6 ? [0.1, 0.24, 0.38, 0.52, 0.66, 0.8, 0.93].map((f) => on(total * f)) : [];
        return { start: pts[0].xy, end: pts[pts.length - 1].xy, marks, arrows, loop: sel.loop };
    }, [frame, sel]);

    if (!frame || !sel) return null;
    const v = z.view, unit = v.w / z.px;                     // 화면 1px = 몇 km
    const W = z.px, H = z.px * (home.h / home.w);
    const inView = (x: number, y: number, m = 0) => x >= v.x - m && x <= v.x + v.w + m && y >= v.y - m && y <= v.y + v.h + m;

    const grid = scaleBarKm(v.w);
    const gx: number[] = [], gy: number[] = [];
    for (let x = Math.ceil(v.x / grid) * grid; x <= v.x + v.w; x += grid) gx.push(x);
    for (let y = Math.ceil(v.y / grid) * grid; y <= v.y + v.h; y += grid) gy.push(y);

    const sxy = summit ? toKmXY(frame, summit.lat, summit.lng) : null;
    const summitShown = !!sxy && sxy[0] >= home.x && sxy[0] <= home.x + home.w && sxy[1] >= home.y && sxy[1] <= home.y + home.h;
    const rings = summitShown ? summitRingsKm(v.w) : [];

    // 길 위의 지점 — 고른 코스의 것만. 갈림길은 작은 점, 나머지는 이름표 후보
    const dots = pois.filter((p) => p.courseId === sel.id && COURSE_MAP_DOT_KINDS.includes(p.kind)).map((p) => { const [x, y] = toKmXY(frame, p.lat, p.lng); return { p, x, y }; }).filter((d) => inView(d.x, d.y, 12 * unit));
    const kindsShown = COURSE_MAP_LABEL_KINDS.filter((k) => pois.some((p) => p.courseId === sel.id && p.kind === k));
    const extraDots = extras.map((e) => { const [x, y] = toKmXY(frame, e.lat, e.lng); return { e, x, y }; }).filter((d) => inView(d.x, d.y, 12 * unit));
    const me = hereOnMap(frame, here);
    const acc = me?.inside && here?.accuracy != null && here.accuracy > 15 && here.accuracy <= 600 ? here.accuracy / 1000 : null;

    // 이름표 — 중요한 것부터 넘겨 겹치지 않는 것만 그린다. 떠 있는 단추들의 자리는 미리 막아 둔다
    const labels: Label[] = [];
    if (me?.inside) labels.push({ key: "me", x: me.x, y: me.y, dx: 11, dy: 0, text: "나", fill: HERE, bold: true, keep: true });
    if (summitShown && sxy) labels.push({ key: "summit", x: sxy[0], y: sxy[1], dx: 11, dy: -8, text: "정상", fill: INK, bold: true, keep: true });
    if (walk) {
        labels.push({ key: "start", x: walk.start[0], y: walk.start[1], dx: 9, dy: 13, text: walk.loop ? "출발 · 도착" : "출발", fill: INK, bold: true, keep: true });
        if (!walk.loop) labels.push({ key: "end", x: walk.end[0], y: walk.end[1], dx: 9, dy: 13, text: "도착", fill: INK, bold: true });
    }
    dots.filter((d) => COURSE_MAP_LABEL_KINDS.includes(d.p.kind))
        .sort((a, b) => LABEL_RANK.indexOf(a.p.kind) - LABEL_RANK.indexOf(b.p.kind) || (a.p.km ?? 0) - (b.p.km ?? 0))
        .forEach((d) => labels.push({ key: `poi:${d.p.id}`, x: d.x, y: d.y, dx: 8, dy: 0, text: hikingPoiTitle({ kind: d.p.kind as HikingPoiKind, name: d.p.name, note: d.p.note }).slice(0, 10), fill: INK }));
    if (sxy) rings.forEach((r) => labels.push({ key: `ring:${r}`, x: sxy[0], y: sxy[1] - r, dx: 0, dy: -9, text: `정상에서 ${scaleBarText(r)}`, fill: TEAL, opacity: 0.8, center: true }));
    extraDots.forEach((d) => labels.push({ key: `extra:${d.e.id}`, x: d.x, y: d.y, dx: 8, dy: 0, text: d.e.name.slice(0, 10), fill: SPOT_INK, noFlip: true }));
    // km 표지 — 넓게 볼 때 서로 붙으면 솎는다(앞의 것에서 22px 안이면 건너뛴다)
    const marks: { km: number; x: number; y: number; px: number; py: number }[] = [];
    for (const m of walk?.marks ?? []) {
        if (!inView(m.x, m.y)) continue;
        const px = (m.x - v.x) / unit, py = (m.y - v.y) / unit;
        if (marks.every((o) => Math.hypot(o.px - px, o.py - py) >= 22)) marks.push({ ...m, px, py });
    }
    const taken: PxRect[] = [{ x0: 0, y0: 0, x1: 176, y1: 46 }, { x0: W - 58, y0: 0, x1: W, y1: 100 }, { x0: 0, y0: H - 46, x1: 118, y1: H }, { x0: W - 172, y0: H - 56, x1: W, y1: H },
        ...marks.map((m) => ({ x0: m.px - 10, y0: m.py - 10, x1: m.px + 10, y1: m.py + 10 }))];
    const spots = labels.filter((l) => inView(l.x, l.y)).filter((l) => !l.noFlip || (l.x - v.x) / unit + l.dx + labelPx(l.text, FS) <= W - 4).map((l) => {
        const w = labelPx(l.text, FS), ax = (l.x - v.x) / unit, py = (l.y - v.y) / unit + l.dy;
        // 오른쪽 끝에서 잘릴 이름표는 점의 왼쪽에 단다
        const px = l.center ? ax - w / 2 : ax + l.dx + w > W - 4 ? ax - l.dx - w : ax + l.dx;
        return { l, x: Math.max(4, px), y: py, w, keep: l.keep };
    });
    const drawn = pickLabels(spots, taken).map((i) => spots[i]);
    const bar = scaleBarKm(v.w);
    const selPath = paths[at];

    return (
        <div className={className} data-testid="course-map-card" data-mode={mode}>
            {KAKAO_READY && (
                <div className="mb-2 flex justify-end">
                    <div className="inline-flex rounded-full p-[3px]" style={{ background: "#FFFFFF14" }} role="tablist" aria-label="지도 종류">
                        {(["paper", "real"] as const).map((k) => (
                            <button key={k} type="button" role="tab" aria-selected={mode === k} data-testid={`course-map-mode-${k}`} data-track-as={k === "real" ? "hiking-course-map-real" : "hiking-course-map-paper"}
                                onClick={() => { if (k === "real") { setRealNote(null); setRealOn(true); } setMode(k); }}
                                className={`h-8 rounded-full px-3.5 text-[13px] font-semibold ${mode === k ? "bg-[#F4EFE3] text-[#0E2A33]" : "text-[#F4EFE3B3]"}`}>
                                {k === "paper" ? "종이 지도" : "실제 지도"}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            <div className="relative overflow-hidden rounded-[18px]" style={{ background: `${PAPER} url(/hiking/art/map-paper.webp) center / cover`, boxShadow: "inset 0 0 0 1px rgba(14,42,51,0.16)", display: mode === "real" ? "none" : undefined }}>
                <svg ref={z.svgRef} viewBox={`${v.x} ${v.y} ${v.w} ${v.h}`} role="img" aria-label={`코스 지도 — 코스 ${sel.seq} · 이 산의 코스 ${courses.length}개 · 위가 북쪽`}
                    style={{ display: "block", width: "100%", aspectRatio: `${home.w} / ${home.h}`, touchAction: z.touchAction, userSelect: "none", WebkitUserSelect: "none" }}
                    data-testid="course-map" data-scale={z.zoom.toFixed(2)} data-view-km={v.w.toFixed(2)} data-here={me ? (me.inside ? "in" : "out") : "none"} {...z.handlers}>
                    {/* 모눈 — 한 칸이 축척 막대의 길이 */}
                    <g stroke={TEAL} strokeOpacity="0.1" strokeWidth={unit} strokeDasharray={`${3 * unit} ${4 * unit}`}>
                        {gx.map((x) => <line key={`x${x}`} x1={x} y1={v.y} x2={x} y2={v.y + v.h} />)}
                        {gy.map((y) => <line key={`y${y}`} x1={v.x} y1={y} x2={v.x + v.w} y2={y} />)}
                    </g>
                    {/* 정상에서의 거리 고리 */}
                    {sxy && rings.map((r) => <circle key={`ring${r}`} cx={sxy[0]} cy={sxy[1]} r={r} fill="none" stroke={TEAL} strokeOpacity="0.24" strokeWidth={1.2 * unit} strokeDasharray={`${4 * unit} ${5 * unit}`} />)}
                    {/* 다른 코스 — 옅은 선. 누르는 자리는 넓게 */}
                    {courses.map((c, k) => (k === at ? null : (
                        <g key={c.id}>
                            <path d={paths[k]} fill="none" stroke={TEAL} strokeOpacity="0.4" strokeWidth={2.2 * unit} strokeLinejoin="round" strokeLinecap="round" />
                            {onPick && <path d={paths[k]} fill="none" stroke="#000" strokeOpacity="0" strokeWidth={22 * unit} style={{ cursor: "pointer" }} data-testid={`course-map-line-${k + 1}`}
                                onClick={() => { if (!z.wasDragged()) onPick(k); }}><title>{`코스 ${c.seq}`}</title></path>}
                        </g>
                    )))}
                    {/* 고른 코스 — 종이색 테두리 위에 짙은 선 */}
                    <path d={selPath} fill="none" stroke={PAPER} strokeWidth={8 * unit} strokeLinejoin="round" strokeLinecap="round" />
                    <path d={selPath} fill="none" stroke={INK} strokeWidth={3.8 * unit} strokeLinejoin="round" strokeLinecap="round" data-testid="course-map-selected" />
                    {/* 걷는 방향 */}
                    {walk?.arrows.map((a, i) => inView(a.x, a.y) && (
                        <path key={`arrow${i}`} d={`M${-2.6 * unit} ${-2.6 * unit} L${2.4 * unit} 0 L${-2.6 * unit} ${2.6 * unit}`} transform={`translate(${a.x} ${a.y}) rotate(${a.deg})`}
                            fill="none" stroke={PAPER} strokeWidth={1.5 * unit} strokeLinecap="round" strokeLinejoin="round" />
                    ))}
                    {/* 길 위의 지점 */}
                    {dots.map((d) => (d.p.kind === "SIGN"
                        ? <circle key={d.p.id} cx={d.x} cy={d.y} r={2.4 * unit} fill={POI_COLOR.SIGN} stroke={PAPER} strokeWidth={0.9 * unit} />
                        : <circle key={d.p.id} cx={d.x} cy={d.y} r={4.6 * unit} fill={POI_COLOR[d.p.kind] ?? "#8A979B"} stroke={PAPER} strokeWidth={1.7 * unit} />))}
                    {/* 길 밖의 볼거리 — 마름모(길 위의 지점은 동그라미) */}
                    {extraDots.map((d) => (
                        <rect key={`extra:${d.e.id}`} x={d.x - 3.6 * unit} y={d.y - 3.6 * unit} width={7.2 * unit} height={7.2 * unit} transform={`rotate(45 ${d.x} ${d.y})`} fill={SPOT_INK} stroke={PAPER} strokeWidth={1.5 * unit} data-testid="course-map-extra" />
                    ))}
                    {/* km 표지 — 길 위의 작은 팻말 */}
                    {marks.map((m) => (
                        <g key={`km${m.km}`} transform={`translate(${m.x} ${m.y}) scale(${unit})`} data-testid="course-map-km">
                            <circle r="9.5" fill={PAPER} stroke={INK} strokeWidth="1.5" />
                            <text y="4.3" textAnchor="middle" fontSize="12" fontWeight={600} fill={INK}>{m.km}</text>
                        </g>
                    ))}
                    {/* 출발 · 도착 */}
                    {walk && (
                        <>
                            {!walk.loop && <circle cx={walk.end[0]} cy={walk.end[1]} r={5.4 * unit} fill={INK} stroke={PAPER} strokeWidth={1.8 * unit} />}
                            <circle cx={walk.start[0]} cy={walk.start[1]} r={5.4 * unit} fill={PAPER} stroke={INK} strokeWidth={2.3 * unit} />
                        </>
                    )}
                    {/* 정상 — 깃발 */}
                    {summitShown && sxy && (
                        <g transform={`translate(${sxy[0]} ${sxy[1]}) scale(${unit})`} data-testid="course-map-summit">
                            <path d="M-8 5 L0 -9 L8 5 Z" fill={CORAL} stroke={INK} strokeWidth="1.4" strokeLinejoin="round" />
                            <path d="M0 -9 V-21 M0 -21 L9 -17.5 L0 -14" fill={CORAL} stroke={INK} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
                        </g>
                    )}
                    {/* 내 위치 */}
                    {me?.inside && (
                        <g data-testid="course-map-here-dot">
                            {acc != null && <circle cx={me.x} cy={me.y} r={acc} fill={HERE} fillOpacity="0.13" stroke={HERE} strokeOpacity="0.35" strokeWidth={unit} />}
                            {live && <circle cx={me.x} cy={me.y} r={7 * unit} fill="none" stroke={HERE} strokeWidth={2 * unit}>
                                <animate attributeName="r" values={`${7 * unit};${19 * unit}`} dur="1.8s" repeatCount="indefinite" />
                                <animate attributeName="stroke-opacity" values="0.7;0" dur="1.8s" repeatCount="indefinite" />
                            </circle>}
                            <circle cx={me.x} cy={me.y} r={6.5 * unit} fill={HERE} stroke="#FFFFFF" strokeWidth={2.6 * unit} />
                        </g>
                    )}
                    {/* 내 위치가 지금 보는 그림 밖 — 그쪽 가장자리에 파란 화살표('내 위치'를 누르면 그리로 간다) */}
                    {me?.inside && !inView(me.x, me.y) && (() => {
                        const cx = v.x + v.w / 2, cy = v.y + v.h / 2, dx = me.x - cx, dy = me.y - cy;
                        const t = Math.min((v.w / 2 - 18 * unit) / Math.max(Math.abs(dx), 1e-9), (v.h / 2 - 18 * unit) / Math.max(Math.abs(dy), 1e-9));
                        return (
                            <g transform={`translate(${cx + dx * t} ${cy + dy * t}) scale(${unit}) rotate(${(Math.atan2(dy, dx) * 180) / Math.PI})`} data-testid="course-map-here-edge">
                                <circle r="12" fill={HERE} stroke="#FFFFFF" strokeWidth="2.4" />
                                <path d="M-4 -5 L5 0 L-4 5" fill="none" stroke="#FFFFFF" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                            </g>
                        );
                    })()}
                    {/* 이름표 — 겹치지 않게 고른 것만 */}
                    {drawn.map(({ l, x, y }) => (
                        <text key={l.key} x={v.x + x * unit} y={v.y + (y + 4.3) * unit} fontSize={FS * unit} fontWeight={l.bold ? 600 : 400} fill={l.fill} fillOpacity={l.opacity ?? 1}
                            paintOrder="stroke" stroke={PAPER} strokeWidth={3.4 * unit} strokeLinejoin="round" data-label={l.key.split(":")[0]}>{l.text}</text>
                    ))}
                </svg>

                {/* 왼쪽 위 — 옮겼으면 '처음 크기로', 코스가 여럿이면 '산 전체 보기', 아니면 손짓 안내 */}
                {z.moved ? (
                    <button type="button" onClick={z.reset} data-testid="course-map-reset" className={CHIP} style={FLOAT}>{COURSE_MAP_COPY.reset}</button>
                ) : z.canOut ? (
                    <button type="button" onClick={z.wide} data-testid="course-map-wide" data-track-as="hiking-course-map-wide" className={CHIP} style={FLOAT}>{words?.wide ?? COURSE_MAP_COPY.wide}</button>
                ) : (
                    <span className="pointer-events-none absolute left-2.5 top-2.5 rounded-full px-2.5 py-1.5 text-[12px] leading-none text-[#0E2A33B3]" style={{ background: "#F4EFE3D9" }} aria-hidden>{COURSE_MAP_COPY.hint}</span>
                )}
                {/* 오른쪽 위 — 키우기 · 줄이기 */}
                <div className="absolute right-2 top-2 flex flex-col overflow-hidden rounded-xl" style={FLOAT}>
                    <button type="button" onClick={() => z.step(1.8)} disabled={!z.canIn} aria-label="지도 키우기" data-testid="course-map-zoom-in" className={BTN}>+</button>
                    <span className="h-px bg-[#0E2A3326]" aria-hidden />
                    <button type="button" onClick={() => z.step(1 / 1.8)} disabled={!z.canOut} aria-label="지도 줄이기" data-testid="course-map-zoom-out" className={BTN}>−</button>
                </div>
                {/* 왼쪽 아래 — 축척 */}
                <div className="pointer-events-none absolute bottom-2.5 left-3 flex flex-col items-start" aria-hidden data-testid="course-map-scale">
                    <span className="text-[12px] leading-none text-[#0E2A33]" style={{ textShadow: "0 0 3px #F4EFE3, 0 0 3px #F4EFE3" }}>{scaleBarText(bar)}</span>
                    <span className="mt-1 block h-[6px] border-x-2 border-b-2 border-[#0E2A33]" style={{ width: Math.max(18, bar / unit) }} />
                </div>
                {/* 오른쪽 아래 — 나침반과 내 위치 */}
                <div className="absolute bottom-2 right-2 flex items-end gap-2">
                    <svg width="38" height="38" viewBox="-19 -19 38 38" aria-hidden className="pointer-events-none">
                        <circle r="17.5" fill="#F4EFE3E6" stroke={INK} strokeOpacity="0.22" />
                        <path d="M0 -13 L4.5 1 L0 -1.5 L-4.5 1 Z" fill={CORAL} stroke={INK} strokeWidth="1" strokeLinejoin="round" />
                        <path d="M0 13 L4.5 -1 L0 1.5 L-4.5 -1 Z" fill="#F4EFE3" stroke={INK} strokeWidth="1" strokeLinejoin="round" />
                    </svg>
                    {me?.inside ? (
                        <button type="button" onClick={() => z.go(boxAround(frame, me.x, me.y))} data-testid="course-map-here" data-track-as="hiking-course-map-here"
                            className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-[#0E2A33] active:bg-[#E4DCC8]" style={FLOAT}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: HERE, boxShadow: "0 0 0 2px #FFFFFF" }} aria-hidden />{COURSE_MAP_COPY.here}
                        </button>
                    ) : ask || asking ? (
                        <button type="button" onClick={() => ask?.()} disabled={!!asking} data-testid="course-map-here-ask" data-track-as="hiking-course-map-here-ask"
                            className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-[#0E2A33] active:bg-[#E4DCC8] disabled:opacity-60" style={FLOAT}>
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: HERE, boxShadow: "0 0 0 2px #FFFFFF" }} aria-hidden />{asking ? COURSE_MAP_COPY.hereAsking : COURSE_MAP_COPY.hereAsk}
                        </button>
                    ) : null}
                </div>
            </div>

            {/* 실제 지도(카카오) — 한 번 열면 붙여 두고 보이기만 바꾼다 */}
            {realOn && (
                <Suspense fallback={mode === "real" ? <div className="flex items-center justify-center rounded-[18px] text-[13.5px] text-[#0E2A33B3]" style={{ aspectRatio: `${home.w} / ${home.h}`, background: PAPER }}>실제 지도를 불러오는 중…</div> : null}>
                    <KakaoCourseMap courses={courses} index={at} onPick={onPick} pois={pois} summit={summit} here={here} extras={extras} aspect={home.w / home.h} visible={mode === "real"}
                        onFail={(why) => { setRealOn(false); setMode("paper"); setRealNote(REAL_FAIL[why]); }} />
                </Suspense>
            )}
            {realNote && <p className="mt-2 text-[13px] text-[#F6D9A8] break-keep" data-testid="course-map-real-note">{realNote}</p>}

            {/* 지도 밑 — 내 위치가 지도 밖일 때의 안내(종이 지도), 점의 뜻, 선의 뜻 */}
            {mode === "paper" && me && !me.inside && me.note && <p className="mt-2 text-[13px] text-[#F6D9A8] break-keep" data-testid="course-map-here-note">{me.note}</p>}
            {mode === "paper" && me?.inside && !inView(me.x, me.y) && <p className="mt-2 text-[13px] text-[#F6D9A8] break-keep" data-testid="course-map-here-away">{offViewNote(me.x - (v.x + v.w / 2), me.y - (v.y + v.h / 2))}</p>}
            {(kindsShown.length > 0 || extraDots.length > 0) && (
                <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-0.5 text-[12.5px] text-[#F4EFE3B3]" aria-label="점의 뜻">
                    {kindsShown.map((k) => (
                        <li key={k} className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2.5 w-2.5 rounded-full" style={{ background: POI_COLOR[k], boxShadow: "0 0 0 1.5px #F4EFE3" }} aria-hidden />{HIKING_POI_NAME[k as HikingPoiKind]}</li>
                    ))}
                    {extraDots.length > 0 && <li className="flex items-center gap-1.5 whitespace-nowrap"><span className="h-2 w-2 rotate-45" style={{ background: SPOT_INK, boxShadow: "0 0 0 1.5px #F4EFE3" }} aria-hidden />{extrasWord}</li>}
                </ul>
            )}
            {onPick && courses.length > 1 && <p className="mt-1.5 px-0.5 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{words?.others ?? COURSE_MAP_COPY.others}</p>}
            {(me?.inside || ask) && <p className="mt-1 px-0.5 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{COURSE_MAP_COPY.hereNote}</p>}
        </div>
    );
}

export default CourseMap;
