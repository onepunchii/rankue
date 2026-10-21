/**
 * 국토종주 — 코리아둘레길(2026-10-21). 오너: "전국 축제랑 국토종주를 추가하고 싶은데" → 결정: 걸어서(코리아둘레길) · 등산 안에.
 * 자료: 「한국관광공사_두루누비 정보 서비스_GW」(data.go.kr 15101974 · 이용허락범위 제한 없음) — 길 넷 · 코스 · 코스마다의 GPX.
 * 공개 API 가 주는 코스는 170개다(전체 284개 중) — 화면은 '두루누비 공개 코스'라고 사실대로 적고, 빠진 코스를 지어 채우지 않는다.
 * 길의 이름 · 전체 코스 수 · 거리 · 시작/끝은 두루누비의 길 소개(routeList themedescs)에 적힌 그대로다.
 * 코스 자료는 server/assets/trails/korea-trails.json(server/scripts/fetch-durunubi.ts 가 만든다 — 손으로 고치지 말 것).
 * ⚠️ 서버가 부른다 — 상대 임포트는 ./x.js.
 */

export type TrailRouteId = "haeparang" | "namparang" | "seohaerang" | "dmz";
export interface TrailRoute {
    id: TrailRouteId;
    /** 두루누비의 길 번호(routeIdx) */
    idx: string;
    name: string;
    /** 길의 전체 코스 수 · 거리(km) · 시작 · 끝 — 두루누비 길 소개 그대로 */
    total: number;
    km: number;
    from: string;
    to: string;
    /** 지도 · 칩의 색(뜻 하나씩) */
    color: string;
}
/** 지도 위의 차례 — 동해(해파랑) → 남해(남파랑) → 서해(서해랑) → 접경(DMZ), 한 바퀴 */
export const TRAIL_ROUTES: readonly TrailRoute[] = [
    { id: "haeparang", idx: "T_THEME_MNG0000011235", name: "해파랑길", total: 50, km: 750, from: "부산 오륙도 해맞이공원", to: "고성 통일전망대", color: "#6CB6F0" },
    { id: "namparang", idx: "T_ROUTE_MNG0000000001", name: "남파랑길", total: 90, km: 1470, from: "부산 오륙도 해맞이공원", to: "해남 땅끝마을", color: "#F28C6A" },
    { id: "seohaerang", idx: "T_ROUTE_MNG0000000043", name: "서해랑길", total: 109, km: 1800, from: "해남 땅끝탑", to: "인천 강화", color: "#F6D9A8" },
    { id: "dmz", idx: "T_ROUTE_MNG0000000047", name: "DMZ 평화의 길", total: 35, km: 510, from: "인천 강화", to: "강원 고성", color: "#8FD3A7" },
];
export const trailRouteOf = (id: string | null | undefined) => TRAIL_ROUTES.find((r) => r.id === id) ?? null;
export const trailRouteByIdx = (idx: string) => TRAIL_ROUTES.find((r) => r.idx === idx) ?? null;
export const TRAIL_TOTAL_COURSES = TRAIL_ROUTES.reduce((a, r) => a + r.total, 0);
export const TRAIL_TOTAL_KM = TRAIL_ROUTES.reduce((a, r) => a + r.km, 0);

/** 길의 소개(두루누비 routeList — 한 줄 · 소개 글 그대로) */
export interface TrailRouteMeta { id: TrailRouteId; line: string | null; desc: string | null }

/** 코스 한 줄(목록 · 지도) */
export interface TrailCourseSummary {
    /** 두루누비 코스 번호(crsIdx) */
    id: string;
    route: TrailRouteId;
    /** 주소의 코스 조각 — '1' · '3-1' */
    key: string;
    no: number;
    sub: number | null;
    /** 우회로 · 지선코스 · 예약노선 */
    tags: string[];
    name: string;
    /** 두루누비가 적은 거리(km) · 걸리는 시간(분) · 난이도(1 쉬움 · 2 보통 · 3 어려움) */
    km: number;
    minutes: number | null;
    level: 1 | 2 | 3 | null;
    loop: boolean;
    sigun: string | null;
    start: [number, number];
    end: [number, number];
    /** 지도용 굵은 선([위도, 경도] 스물넷 안팎) */
    coarse: [number, number][];
}
/** 코스 한 곳 — 줄인 선([위도, 경도, 높이, km]) · 소개 글 */
export interface TrailCourseDetail extends TrailCourseSummary {
    line: number[][];
    gainM: number;
    maxM: number;
    startName: string | null;
    endName: string | null;
    summary: string | null;
    contents: string | null;
    tour: string | null;
    traveler: string | null;
    gpx: string | null;
}

/**
 * 코스 이름 → 번호 · 가지 번호 · 붙은 말. '남파랑길 1코스' · 'DMZ 평화의 길 3-1코스(우회로)' · 'DMZ 평화의 길 8코스 (예약노선)'
 * 번호를 못 읽으면 null.
 */
export function parseTrailCourseName(raw: string): { no: number; sub: number | null; tags: string[]; key: string } | null {
    const name = String(raw ?? "").replace(/\s+/g, " ").trim();
    // 길 이름 다음의 첫 번호 — 괄호 안의 '지선3코스'를 번호로 읽지 않게(서해랑길 64-3(지선3코스) 가 3코스와 겹쳤다, 2026-10-21)
    const m = /(\d+)(?:-(\d+))?\s*(?:코스|\()/.exec(name.replace(/\([^)]*\)/g, (x) => x.replace(/\d/g, "#")));
    if (!m) return null;
    const no = Number(m[1]), sub = m[2] ? Number(m[2]) : null;
    const tags = [...name.matchAll(/\(([^)]+)\)/g)].map((x) => x[1].replace(/코스$/, "").replace(/\d+$/, "").trim()).filter(Boolean);
    return { no, sub, tags, key: sub ? `${no}-${sub}` : String(no) };
}

export const TRAIL_LEVEL_NAME: Readonly<Record<1 | 2 | 3, string>> = { 1: "쉬움", 2: "보통", 3: "어려움" };
export const trailTimeText = (min: number | null) => (min == null ? "" : min % 60 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min / 60}시간`);
/** 좁은 칸용 — 30분은 '반'('6시간 반'), 나머지는 그대로 */
export const trailTimeShort = (min: number | null) => (min == null ? "" : min % 60 === 30 ? `${Math.floor(min / 60)}시간 반` : trailTimeText(min));

/** 두루누비의 '시점 : 오륙도해맞이공원 (부산 남구 …)' 줄에서 이름만 */
export function travelerPoint(text: string | null | undefined, which: "시점" | "종점"): string | null {
    const m = new RegExp(`${which}\\s*[:：]\\s*([^\\n(<]+)`).exec(String(text ?? ""));
    const v = m?.[1]?.trim();
    return v ? v.replace(/\s+/g, " ").slice(0, 40) : null;
}

/**
 * 두루누비 코스 요약('- 대변항에서 출발해 봉대산 봉수대와 … 임랑 해변에 이르는 구간')에서 시작 · 끝 이름(2026-10-21).
 * 해파랑길 · DMZ 평화의 길 77코스는 '시점 :' 줄이 없어 화면이 '코스 시작점 · 코스 끝점'으로만 나왔다. 요약에 적힌 말만 쓴다 — 못 읽으면 null.
 * 줄마다 보고 '출발 · 시작'이 있는 줄을 먼저 믿는다('울산 남구에서 중구까지 이어지는 코스' 같은 동네 단위 줄보다).
 */
const END_MARK = /(?:까지|에 이르|에 이름|(?:으로|로) (?:이어지|향하|연결)|에서 끝)/;
const BAD_NAME = /코스|구간|번째|길을|있는|잇는|따라|^\d|[.·~]|^바다$|숲길$/;
/** '보성군 · 고흥군'처럼 동네 이름 한 마디 — 지점이 아니다 */
const AREA_ONLY = /^[가-힣]{1,3}(?:시|군|구|읍|면)$/;
const tidyName = (v: string | undefined): string | null => {
    const t = (v ?? "").replace(/^[-\s]+/, "").replace(/\s+/g, " ").trim();
    return t.length >= 2 && t.length <= 20 && t.split(" ").length <= 4 && !BAD_NAME.test(t) && !AREA_ONLY.test(t) ? t : null;
};
const CUTS = ["지나 ", "거쳐 ", "출발해 ", "출발하여 ", "시작해 ", "시작하여 ", "에서 ", "부터 ", "있는 ", ", "];
export function summaryEnds(summary: string | null | undefined): { start: string | null; end: string | null } {
    const lines = String(summary ?? "").split("\n").map((l) => l.replace(/^\s*-\s*/, "").trim()).filter(Boolean);
    const ranked = [...lines.filter((l) => /출발|시작|부터/.test(l)), ...lines.filter((l) => !/출발|시작|부터/.test(l))];
    let endOnly: string | null = null;
    for (const l of ranked) {
        const em = END_MARK.exec(l);
        if (!em) continue;
        const head = l.slice(0, em.index);
        const sm = /^(.+?)(?:에서|을|를)\s*(?:출발|시작)(?:해|하여|하는|한|하고)?\s/.exec(head) ?? /^(.+?)(?:에서|부터)\s/.exec(head);
        const start = sm ? tidyName(sm[1]) : null;
        // 끝 — 끝 표시 바로 앞, 마지막 '지나 · 거쳐 · 출발해 · 에서 · 부터 · 있는' 뒤
        const tail = sm ? head.slice(sm.index + sm[0].length) : head;
        const cut = Math.max(...CUTS.map((w) => { const i = tail.lastIndexOf(w); return i < 0 ? -1 : i + w.length; }), 0);
        const end = tidyName(tail.slice(cut));
        if (start && end) return { start, end };
        // 시작이 안 적힌 줄('미포 · 청사포를 거쳐 … 대변항에 이르는 코스')은 끝만 — 시작은 앞 코스의 끝으로 채운다(fillTrailEndNames)
        if (!sm && end && !endOnly) endOnly = end;
    }
    return { start: null, end: endOnly };
}

const nearKm = (a: readonly [number, number], b: readonly [number, number]) => {
    const la = ((a[0] + b[0]) / 2) * Math.PI / 180;
    return Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 111 * Math.cos(la));
};
/**
 * 시작 · 끝 이름 채우기 — ① '시점 :' 줄(이미 있는 값) ② 요약의 말(summaryEnds) ③ 이어진 코스(앞 코스의 끝 · 뒤 코스의 시작, **좌표가 400m 안일 때만**)
 * ④ 길의 첫 코스 시작 · 마지막 코스 끝은 길 소개의 출발 · 도착. 어느 것도 없으면 null(화면은 '코스 시작점').
 */
export function fillTrailEndNames<T extends Pick<TrailCourseDetail, "route" | "no" | "sub" | "start" | "end" | "startName" | "endName" | "summary">>(courses: readonly T[]): T[] {
    const out = courses.map((c) => {
        if (c.startName && c.endName) return { ...c };
        const e = summaryEnds(c.summary);
        return { ...c, startName: c.startName ?? e.start, endName: c.endName ?? e.end };
    });
    const main = new Map(out.filter((c) => c.sub == null).map((c) => [`${c.route}/${c.no}`, c]));
    for (const c of out) {
        const r = TRAIL_ROUTES.find((x) => x.id === c.route);
        if (!c.startName) {
            const prev = main.get(`${c.route}/${c.no - 1}`);
            if (c.sub == null && prev?.endName && nearKm(prev.end, c.start) <= 0.4) c.startName = prev.endName;
            else if (c.sub == null && c.no === 1 && r) c.startName = r.from;
        }
        if (!c.endName) {
            const next = main.get(`${c.route}/${c.no + 1}`);
            if (c.sub == null && next?.startName && nearKm(next.start, c.end) <= 0.4) c.endName = next.startName;
            else if (c.sub == null && r && c.no === r.total) c.endName = r.to;
        }
    }
    return out;
}

/** 코스 카드(1200 정사각 · server/services/trailCard)의 글 — 길 · 코스 이름 · 거리/시간/난이도 · 지역 · 코스 선 */
export function trailCardInput(c: Pick<TrailCourseDetail, "route" | "name" | "km" | "minutes" | "level" | "sigun" | "tags" | "line">): { route: string; color: string; name: string; facts: string; place: string; line: [number, number][] } {
    const r = trailRouteOf(c.route);
    const short = r ? c.name.replace(r.name, "").trim() || c.name : c.name;
    const half = c.minutes != null && c.minutes % 60 === 30 ? `${Math.floor(c.minutes / 60)}시간 반` : trailTimeText(c.minutes);
    return {
        route: r?.name ?? "코리아둘레길", color: r?.color ?? "#F6D9A8", name: short,
        facts: [`${c.km}km`, half, c.level ? TRAIL_LEVEL_NAME[c.level] : ""].filter(Boolean).join(" · "),
        place: [c.sigun, ...c.tags].filter(Boolean).join(" · "),
        line: c.line.map((p) => [p[0], p[1]] as [number, number]),
    };
}

export const TRAILS_PATH = "/hiking/trails";
export const trailRoutePath = (id: TrailRouteId) => `${TRAILS_PATH}/${id}`;
export const trailCoursePath = (route: TrailRouteId, key: string) => `${TRAILS_PATH}/${route}/${encodeURIComponent(key)}`;
export const TRAILS_SOURCE = "두루누비(한국관광공사)";
export const TRAILS_H1 = "코리아둘레길";
/** 넷의 거리를 더한 값(4,530km) — 지어 쓰지 않는다 */
export const TRAILS_TAGLINE = `해파랑 · 남파랑 · 서해랑 · DMZ 평화의 길 — 한반도를 한 바퀴 걷는 ${TRAIL_TOTAL_KM.toLocaleString("en-US")}km`;

/** 검색용 제목 · 설명 */
export function trailsHubSeo(n: { courses: number }) {
    return {
        path: TRAILS_PATH,
        title: "코리아둘레길 코스 지도 — 해파랑길 · 남파랑길 · 서해랑길 · DMZ 평화의 길 | 랭큐 등산",
        desc: `한반도를 한 바퀴 걷는 코리아둘레길 ${TRAIL_TOTAL_COURSES}개 코스 중 두루누비 공개 코스 ${n.courses}개의 길 · 거리 · 시간 · 난이도를 지도로. 시작점 · 끝점 · 가는 길까지. 자료 두루누비.`,
    };
}
export function trailRouteSeo(r: TrailRoute, n: { courses: number; km: number }) {
    return {
        path: trailRoutePath(r.id),
        title: `${r.name} 코스 지도 — ${r.total}개 코스 ${r.km.toLocaleString("en-US")}km | 랭큐 등산`,
        desc: `${r.from}에서 ${r.to}까지 ${r.name} ${r.total}개 코스. 두루누비 공개 코스 ${n.courses}개(${Math.round(n.km).toLocaleString("en-US")}km)의 거리 · 시간 · 난이도 · 시작점을 지도로. 자료 두루누비.`,
    };
}
export function trailCourseSeo(c: Pick<TrailCourseDetail, "route" | "key" | "name" | "km" | "minutes" | "level" | "startName" | "endName" | "sigun">) {
    const bits = [`${c.km}km`, trailTimeText(c.minutes), c.level ? TRAIL_LEVEL_NAME[c.level] : ""].filter(Boolean).join(" · ");
    const way = c.startName && c.endName ? `${c.startName}에서 ${c.endName}까지` : "";
    return {
        path: trailCoursePath(c.route, c.key),
        title: `${c.name} — ${bits}${c.sigun ? ` · ${c.sigun}` : ""} | 랭큐 등산`,
        desc: `${way ? `${way} ` : ""}${bits}. 코스 지도 · 높낮이 · 가는 길 · 날씨 · 근처 축제. 자료 두루누비.`,
    };
}
