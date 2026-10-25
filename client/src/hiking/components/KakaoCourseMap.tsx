/**
 * 코스 지도의 '실제 지도'(2026-10-25 오너: "코스 지도에 주변 건물이나 도로가 안 보여서 어딘지 답답해하는 사람들이 있다" → 카카오맵 연동).
 * 카카오 지도(지형도 겹침 · 위성 전환) 위에 우리 코스를 얹는다 — 고른 코스는 짙게, 나머지는 옅게(누르면 그 코스로), 출발 · 도착 · 정상 ·
 * 길 위의 지점 · 볼거리 · 내 위치. 종이 지도(CourseMap)가 기본이고 이 화면은 단추를 눌렀을 때만 뜬다.
 *
 * 💰 유료다(0.1원/건 — 지도를 한 번 만들 때마다. 규칙 shared/kakaoMap). 그래서:
 *   · **지도는 이 부품이 살아 있는 동안 딱 한 번 만든다**(started 깃발). 코스를 바꾸면 얹은 것만 갈아 끼우고, 종이 지도로 갔다 와도
 *     부르는 쪽(CourseMap)이 이 부품을 숨겨 둘 뿐 지우지 않는다 — 다시 만들지 않는다.
 *   · 만들기 전에 기기 하루 상한 → 서버 하루 상한(askKakao("map") — components/kakao/kakaoSdk)을 차례로 묻는다. 하나라도 막히면 만들지 않고 onFail.
 *   · SDK 를 못 받거나(신호 없음) 카카오가 거절하면 onFail — 부르는 쪽이 종이 지도로 돌아간다.
 * 내 위치는 기기에서 받은 점을 이 화면에 그릴 뿐 서버로 보내지 않는다(카카오에는 보고 있는 지역의 지도 조각 요청만 간다).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useEffect, useRef, useState } from "react";
import { kakaoMapUrl } from "@/golf/components/join/joinUi";
import { askKakao, loadKakaoMaps, type KakaoMapFail } from "@/components/kakao/kakaoSdk";
import { COURSE_MAP_DOT_KINDS, COURSE_MAP_LABEL_KINDS, lineBreaks } from "@shared/hikingCourseMap";
import { hikingPoiTitle, type HikingPoiKind } from "@shared/hikingPois";
import type { MountainCourse, MountainPoi } from "../lib/api";
import { POI_COLOR } from "../theme";

const INK = "#0E2A33", TEAL = "#1F5560", PAPER = "#F4EFE3", CORAL = "#F28C6A", HERE = "#2F7BFF", SPOT_INK = "#C2552F";
const BTN = "flex h-10 w-10 items-center justify-center text-[20px] leading-none text-[#0E2A33] active:bg-[#E4DCC8]";
const FLOAT = { background: "#F4EFE3F2", boxShadow: "0 1px 4px rgba(14,42,51,0.28), inset 0 0 0 1px rgba(14,42,51,0.18)" } as const;

export type { KakaoMapFail };

/** 지도 위에 얹는 작은 표(HTML) — 카카오 CustomOverlay 의 내용 */
function tag(html: string): HTMLDivElement {
    const el = document.createElement("div");
    el.innerHTML = html;
    el.style.pointerEvents = "none";
    return el;
}
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const LABEL_CSS = `font-size:12.5px;font-weight:600;color:${INK};white-space:nowrap;text-shadow:0 0 3px #fff,0 0 3px #fff,0 0 3px #fff`;

const NO_EXTRAS: readonly { id: string; lat: number; lng: number; name: string }[] = [];

export default function KakaoCourseMap({ courses, index, onPick, pois, summit, here, extras = NO_EXTRAS, aspect, visible, onFail }: {
    courses: readonly MountainCourse[];
    index: number;
    onPick?: (i: number) => void;
    pois: readonly MountainPoi[];
    summit: { lat: number; lng: number } | null;
    here: { lat: number; lng: number; accuracy?: number | null } | null;
    extras?: readonly { id: string; lat: number; lng: number; name: string }[];
    /** 가로 ÷ 세로 — 종이 지도와 같은 크기로 */
    aspect: number;
    /** 종이 지도로 갔을 때는 숨겨 둔다(지우지 않는다 — 다시 만들면 또 요금이 붙는다) */
    visible: boolean;
    onFail: (why: KakaoMapFail) => void;
}) {
    const box = useRef<HTMLDivElement>(null);
    const map = useRef<any>(null);
    const started = useRef(false);
    const mounted = useRef(true);
    const drawn = useRef<any[]>([]);
    const me = useRef<any[]>([]);
    const failRef = useRef(onFail); failRef.current = onFail;
    const pickRef = useRef(onPick); pickRef.current = onPick;
    const [ready, setReady] = useState(false);
    const [sky, setSky] = useState(false);
    const at = Math.min(Math.max(index, 0), Math.max(0, courses.length - 1));
    const sel = courses[at];
    // 다시 그리는 기준은 값으로 — 부르는 쪽이 그릴 때마다 새 배열 · 새 객체를 넘겨도 지도를 다시 맞추지 않게(손으로 옮긴 자리가 튀지 않게)
    const extrasKey = extras.map((e) => e.id).join(",");
    const summitKey = summit ? `${summit.lat},${summit.lng}` : "";

    useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

    // 만들기 — 이 부품이 사는 동안 딱 한 번(💰). 정리 함수로 끊지 않는다: 끊으면 허락(한 칸)만 쓰고 지도는 못 만든다
    useEffect(() => {
        if (started.current) return;
        started.current = true;
        void (async () => {
            const ok = await askKakao("map");
            if (ok !== "ok") { if (mounted.current) failRef.current(ok); return; }
            let kakao: any;
            try { kakao = await loadKakaoMaps(); } catch { if (mounted.current) failRef.current("sdk"); return; }
            if (!mounted.current || !box.current || map.current) return;
            const p0 = sel?.line[0] ?? (summit ? [summit.lat, summit.lng] : null);
            if (!p0) { failRef.current("sdk"); return; }
            try {
                map.current = new kakao.maps.Map(box.current, { center: new kakao.maps.LatLng(p0[0], p0[1]), level: 6 });
                map.current.addOverlayMapTypeId(kakao.maps.MapTypeId.TERRAIN);
                setReady(true);
            } catch { failRef.current("sdk"); }
        })();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // 코스 · 지점 — 고른 코스가 바뀌면 얹은 것만 갈아 끼운다(지도는 그대로)
    useEffect(() => {
        const m = map.current, kakao = window.kakao;
        if (!ready || !m || !kakao || !sel) return;
        drawn.current.forEach((o) => o.setMap(null));
        drawn.current = [];
        const LL = (lat: number, lng: number) => new kakao.maps.LatLng(lat, lng);
        const put = (o: any) => { o.setMap(m); drawn.current.push(o); return o; };
        // 건너뛴 자리(옛 묶음의 이어 붙인 구간)에서 선을 끊는다 — 없는 길을 긋지 않는다
        const pieces = (c: MountainCourse) => {
            const cut = new Set(lineBreaks(c.line));
            const out: any[][] = [[]];
            c.line.forEach((p, i) => { if (i && cut.has(i)) out.push([]); out[out.length - 1].push(LL(p[0], p[1])); });
            return out.filter((x) => x.length > 1);
        };
        courses.forEach((c, k) => {
            if (k === at) return;
            for (const path of pieces(c)) {
                const line = put(new kakao.maps.Polyline({ path, strokeWeight: 4, strokeColor: TEAL, strokeOpacity: 0.55, strokeStyle: "solid" }));
                if (pickRef.current) kakao.maps.event.addListener(line, "click", () => pickRef.current?.(k));
            }
        });
        for (const path of pieces(sel)) {
            put(new kakao.maps.Polyline({ path, strokeWeight: 9, strokeColor: "#FFFFFF", strokeOpacity: 0.95 }));
            put(new kakao.maps.Polyline({ path, strokeWeight: 5, strokeColor: INK, strokeOpacity: 1 }));
        }
        const dot = (lat: number, lng: number, html: string, z = 3) => put(new kakao.maps.CustomOverlay({ position: LL(lat, lng), content: tag(html), xAnchor: 0, yAnchor: 0.5, zIndex: z }));
        // 길 위의 지점 — 고른 코스의 것만. 갈림길은 작은 점, 나머지는 이름까지
        for (const p of pois) {
            if (p.courseId !== sel.id || !COURSE_MAP_DOT_KINDS.includes(p.kind)) continue;
            const color = POI_COLOR[p.kind] ?? "#8A979B";
            if (!COURSE_MAP_LABEL_KINDS.includes(p.kind)) {
                dot(p.lat, p.lng, `<span style="display:block;margin-left:-4px;width:8px;height:8px;border-radius:50%;background:${color};border:1.5px solid #fff"></span>`, 2);
                continue;
            }
            const name = esc(hikingPoiTitle({ kind: p.kind as HikingPoiKind, name: p.name, note: p.note }).slice(0, 10));
            dot(p.lat, p.lng, `<span style="display:flex;align-items:center;gap:4px;margin-left:-7px"><span style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid #fff;box-shadow:0 0 0 1px rgba(14,42,51,.25)"></span><span style="${LABEL_CSS}">${name}</span></span>`);
        }
        for (const e of extras) {
            dot(e.lat, e.lng, `<span style="display:flex;align-items:center;gap:5px;margin-left:-6px"><span style="width:10px;height:10px;transform:rotate(45deg);background:${SPOT_INK};border:2px solid #fff"></span><span style="${LABEL_CSS};color:${SPOT_INK}">${esc(e.name.slice(0, 10))}</span></span>`, 2);
        }
        // 출발 · 도착 · 정상
        const first = sel.line[0], last = sel.line[sel.line.length - 1];
        if (first) {
            if (!sel.loop && last) dot(last[0], last[1], `<span style="display:flex;align-items:center;gap:5px;margin-left:-8px"><span style="width:16px;height:16px;border-radius:50%;background:${INK};border:3px solid #fff"></span><span style="${LABEL_CSS}">도착</span></span>`, 4);
            dot(first[0], first[1], `<span style="display:flex;align-items:center;gap:5px;margin-left:-8px"><span style="width:16px;height:16px;border-radius:50%;background:#fff;border:3.5px solid ${INK}"></span><span style="${LABEL_CSS}">${sel.loop ? "출발 · 도착" : "출발"}</span></span>`, 5);
        }
        if (summit) {
            put(new kakao.maps.CustomOverlay({
                position: LL(summit.lat, summit.lng), xAnchor: 0.5, yAnchor: 1, zIndex: 6,
                content: tag(`<span style="display:flex;align-items:center;gap:3px;padding:3px 8px;border-radius:999px;background:${CORAL};border:1.5px solid ${INK};font-size:12.5px;font-weight:600;color:${INK};white-space:nowrap">▲ 정상</span>`),
            }));
        }
        // 처음 보이는 곳 — 고른 코스와 정상이 다 들어오게
        const bounds = new kakao.maps.LatLngBounds();
        sel.line.forEach((p) => bounds.extend(LL(p[0], p[1])));
        if (summit) bounds.extend(LL(summit.lat, summit.lng));
        m.setBounds(bounds, 36, 36, 36, 36);
    }, [ready, at, courses, pois, summitKey, extrasKey]); // eslint-disable-line react-hooks/exhaustive-deps

    // 내 위치 — 자주 바뀌어 따로 그린다
    useEffect(() => {
        const m = map.current, kakao = window.kakao;
        if (!ready || !m || !kakao) return;
        me.current.forEach((o) => o.setMap(null));
        me.current = [];
        if (!here) return;
        const pos = new kakao.maps.LatLng(here.lat, here.lng);
        if (here.accuracy != null && here.accuracy > 15 && here.accuracy <= 600) {
            const c = new kakao.maps.Circle({ center: pos, radius: here.accuracy, strokeWeight: 1, strokeColor: HERE, strokeOpacity: 0.35, fillColor: HERE, fillOpacity: 0.13 });
            c.setMap(m); me.current.push(c);
        }
        const o = new kakao.maps.CustomOverlay({ position: pos, xAnchor: 0.5, yAnchor: 0.5, zIndex: 9, content: tag(`<span style="display:block;width:16px;height:16px;border-radius:50%;background:${HERE};border:3px solid #fff;box-shadow:0 0 0 1px rgba(47,123,255,.4)"></span>`) });
        o.setMap(m); me.current.push(o);
    }, [ready, here?.lat, here?.lng, here?.accuracy]); // eslint-disable-line react-hooks/exhaustive-deps

    // 숨겨 둔 사이 크기가 바뀌었을 수 있다 — 다시 보일 때 자리를 다시 잡는다
    useEffect(() => { if (ready && visible) map.current?.relayout(); }, [ready, visible]);

    const zoomBy = (d: number) => { const m = map.current; if (m) m.setLevel(Math.max(1, Math.min(14, m.getLevel() + d)), { animate: true }); };
    const toggleSky = () => {
        const m = map.current, kakao = window.kakao;
        if (!m || !kakao) return;
        const next = !sky;
        m.setMapTypeId(next ? kakao.maps.MapTypeId.HYBRID : kakao.maps.MapTypeId.ROADMAP);
        if (next) m.removeOverlayMapTypeId(kakao.maps.MapTypeId.TERRAIN); else m.addOverlayMapTypeId(kakao.maps.MapTypeId.TERRAIN);
        setSky(next);
    };
    const start = sel?.line[0];

    return (
        <div className="relative overflow-hidden rounded-[18px]" style={{ display: visible ? "block" : "none", background: PAPER, boxShadow: "inset 0 0 0 1px rgba(14,42,51,0.16)" }} data-testid="course-map-kakao" data-ready={ready ? "1" : "0"}>
            <div ref={box} style={{ width: "100%", aspectRatio: `${aspect}` }} role="application" aria-label={`실제 지도 — 코스 ${sel?.seq ?? ""}`} />
            {!ready && (
                <div className="absolute inset-0 flex items-center justify-center text-[13.5px] text-[#0E2A33B3]" data-testid="course-map-kakao-loading">실제 지도를 불러오는 중…</div>
            )}
            {ready && (
                <>
                    <div className="absolute right-2 top-2 z-[2] flex flex-col overflow-hidden rounded-xl" style={FLOAT}>
                        <button type="button" onClick={() => zoomBy(-1)} aria-label="지도 키우기" className={BTN}>+</button>
                        <span className="h-px bg-[#0E2A3326]" aria-hidden />
                        <button type="button" onClick={() => zoomBy(1)} aria-label="지도 줄이기" className={BTN}>−</button>
                    </div>
                    <button type="button" onClick={toggleSky} data-testid="course-map-kakao-sky" data-track-as="hiking-course-map-sky"
                        className="absolute left-2 top-2 z-[2] h-9 rounded-full px-3 text-[13px] font-medium text-[#0E2A33] active:bg-[#E4DCC8]" style={FLOAT}>{sky ? "지도로" : "위성 사진"}</button>
                    <div className="absolute bottom-2 right-2 z-[2] flex items-end gap-2">
                        {here && (
                            <button type="button" onClick={() => map.current?.panTo(new window.kakao.maps.LatLng(here.lat, here.lng))} data-track-as="hiking-course-map-kakao-here"
                                className="flex h-10 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold text-[#0E2A33] active:bg-[#E4DCC8]" style={FLOAT}>
                                <span className="h-2.5 w-2.5 rounded-full" style={{ background: HERE, boxShadow: "0 0 0 2px #FFFFFF" }} aria-hidden />내 위치
                            </button>
                        )}
                        {start && (
                            <a href={kakaoMapUrl("코스 출발점", start[0], start[1])} target="_blank" rel="noopener noreferrer" data-track-as="hiking-course-map-kakao-app"
                                className="flex h-10 items-center rounded-full px-3.5 text-[13.5px] font-semibold text-[#0E2A33] active:bg-[#E4DCC8]" style={FLOAT}>카카오맵에서 열기</a>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
