/**
 * 코리아둘레길 코스(2026-10-21) — server/assets/trails/korea-trails.json(scripts/fetch-durunubi.ts 가 만든 파일)을 인스턴스가 한 번 읽어 둔다.
 * 운영 DB 를 쓰지 않는다(두루누비 자료는 거의 안 바뀐다 — 다시 받으면 파일을 새로 만들어 배포한다). 규칙 · 글은 shared/koreaTrails.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TRAIL_ROUTES, fillTrailEndNames, type TrailCourseDetail, type TrailCourseSummary, type TrailRouteId, type TrailRouteMeta } from "../../shared/koreaTrails.js";

interface TrailsFile { source: string; made: string; routes: TrailRouteMeta[]; courses: TrailCourseDetail[] }
let cache: TrailsFile | null = null;

function load(): TrailsFile {
    if (cache) return cache;
    const candidates = [
        path.join(process.cwd(), "server/assets/trails/korea-trails.json"),
        path.join(path.dirname(fileURLToPath(import.meta.url)), "../assets/trails/korea-trails.json"),
    ];
    const file = candidates.find((c) => fs.existsSync(c));
    if (!file) throw new Error(`[koreaTrails] asset not found: ${candidates.join(", ")}`);
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as TrailsFile;
    // 시작 · 끝 이름 — '시점 :' 줄이 없는 코스(해파랑 · DMZ 77)는 두루누비 요약의 말 · 이어진 코스에서(shared fillTrailEndNames). 파일은 받은 그대로 둔다
    cache = { ...raw, courses: fillTrailEndNames(raw.courses) };
    return cache;
}

/** 목록 · 지도에 쓰는 한 줄(선 · 글 없이) */
export const toSummary = (c: TrailCourseDetail): TrailCourseSummary => ({
    id: c.id, route: c.route, key: c.key, no: c.no, sub: c.sub, tags: c.tags, name: c.name, km: c.km, minutes: c.minutes, level: c.level,
    loop: c.loop, sigun: c.sigun, start: c.start, end: c.end, coarse: c.coarse,
});

export function trailCourses(): TrailCourseDetail[] { return load().courses; }
export function trailRouteMeta(): TrailRouteMeta[] { return load().routes; }
export function trailsMade(): string { return load().made; }

/** 길마다 — 두루누비 공개 코스 수 · 거리 합 */
export function trailRouteCounts(): Record<TrailRouteId, { courses: number; km: number }> {
    const out = Object.fromEntries(TRAIL_ROUTES.map((r) => [r.id, { courses: 0, km: 0 }])) as Record<TrailRouteId, { courses: number; km: number }>;
    for (const c of load().courses) { out[c.route].courses++; out[c.route].km += c.km; }
    return out;
}

export function trailCourse(route: string, key: string): { course: TrailCourseDetail; prev: TrailCourseDetail | null; next: TrailCourseDetail | null } | null {
    const list = load().courses.filter((c) => c.route === route);
    const i = list.findIndex((c) => c.key === key);
    if (i < 0) return null;
    // 앞 · 뒤 — 본 코스(가지 번호 없는 것)끼리. 가지 코스는 본 코스 사이에 끼우지 않는다
    const main = list.filter((c) => c.sub == null);
    const before = [...main].reverse().find((c) => c.no < list[i].no) ?? null;
    const after = main.find((c) => c.no > list[i].no) ?? null;
    return { course: list[i], prev: before, next: after };
}
