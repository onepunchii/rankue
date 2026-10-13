/**
 * 옛 묶음(전국 주요 봉우리 코스)의 GPX 를 코스로 — 적재(hiking-import.ts)와 다시 잇기(hiking-reroute.ts)가 같이 쓴다.
 *
 * 파일 하나에 조각(trkseg)이 하나면 그대로 한 코스, 여럿이면 등산로 그물이라 shared/hikingRoutes 로 이어 코스들을 만든다.
 * 코스의 id: 조각 하나짜리 파일은 예전 그대로 "<봉우리 번호>-<파일 순번>", 그물에서 만든 코스는 "<봉우리 번호>-<파일 순번>r<길 순번>".
 * (파일 순번은 '점이 둘 이상인 파일'만 센 것 — 예전 적재와 같아야 조각 하나짜리 코스의 id 가 바뀌지 않는다.)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { withKm, type LinePoint } from "../../../shared/hikingGeo";
import { buildRoutes, type RoutePoint } from "../../../shared/hikingRoutes";

/** 파일의 조각들 — 조각마다 [위도, 경도, 높이]. 높이가 없으면 0 */
export function parseGpxSegments(file: string): RoutePoint[][] {
    const t = readFileSync(file, "utf8");
    const out: RoutePoint[][] = [];
    const re = /<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"\s*>(?:\s*<ele>([-\d.]+)<\/ele>)?/g;
    for (const seg of t.matchAll(/<trkseg>([\s\S]*?)<\/trkseg>/g)) {
        const pts: RoutePoint[] = [];
        for (const m of seg[1].matchAll(re)) pts.push([Number(m[1]), Number(m[2]), m[3] == null ? 0 : Number(m[3])]);
        if (pts.length) out.push(pts);
    }
    return out;
}

export interface BundleCourse {
    id: string;
    /** 파일 순번(1부터) */
    file: number;
    /** 그물에서 만든 코스인가(조각 여럿을 이은 것) */
    built: boolean;
    kind: "single" | "summit" | "span";
    line: LinePoint[];
}

/**
 * 한 봉우리 폴더의 파일들 → 코스들. summit 은 이 폴더가 이어진 산의 정상(모르면 null — 그물은 끝에서 끝까지의 길이 된다).
 * 파일의 순서는 이름순(적재와 같다).
 */
export function bundleCourses(dir: string, files: readonly string[], frtrlId: string, summit: { lat: number; lng: number } | null): BundleCourse[] {
    const out: BundleCourse[] = [];
    let n = 0;
    for (const f of files) {
        const segs = parseGpxSegments(join(dir, f));
        // 예전 적재는 파일의 점을 전부 한 줄로 읽어 '점이 둘 이상'인 파일만 세었다 — 같은 기준으로 순번을 매긴다
        if (segs.reduce((s, x) => s + x.length, 0) < 2) continue;
        n++;
        const usable = segs.filter((s) => s.length >= 2);
        if (usable.length <= 1) {
            // 조각 하나(또는 점 하나짜리 조각들이 섞인 파일) — 예전처럼 전부 한 줄로
            out.push({ id: `${frtrlId}-${n}`, file: n, built: false, kind: "single", line: withKm(segs.flat()) });
            continue;
        }
        const built = buildRoutes(usable, summit);
        built.routes.forEach((r, k) => out.push({ id: `${frtrlId}-${n}r${k + 1}`, file: n, built: true, kind: built.kind, line: withKm(r) }));
    }
    return out;
}
