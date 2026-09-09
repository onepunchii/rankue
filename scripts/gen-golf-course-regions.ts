/**
 * client/src/golf/data/golfCourses.ts 에서 '골프장 id → 지역 코드' 표를 만들어
 * shared/golfCourseRegions.ts 로 쓴다.
 *
 * 왜 표를 따로 두나: 골프장 원장은 328 KB 짜리 정적 파일이고 서버가 통째로 읽기엔 무겁다.
 * 그런데 지역 판정에 필요한 건 id 하나당 코드 한 글자다. 그래서 여기서 미리 접어 둔다.
 * 규칙(shared/golfRegions.ts)이나 원장이 바뀌면 shared/golfCourseRegions.test.ts 가 어긋남을 잡아낸다 —
 * 그때 이 스크립트를 다시 돌리면 된다:  npx tsx scripts/gen-golf-course-regions.ts
 */
import fs from "node:fs";
import path from "node:path";
import { COURSES } from "../client/src/golf/data/golfCourses.js";
import { resolveGolfRegionCode } from "../shared/golfRegions.js";

const entries: string[] = [];
let unresolved = 0;
for (const c of COURSES as any[]) {
    const code = resolveGolfRegionCode(c.region, c.address);
    if (!code) { unresolved++; continue; }
    entries.push(`    ${c.id}: "${code}",`);
}

const out = `// 자동 생성 — 손으로 고치지 말 것.
// 만드는 법: npx tsx scripts/gen-golf-course-regions.ts
// 원본: client/src/golf/data/golfCourses.ts + shared/golfRegions.ts
//
// 왜 필요했나: 등록 화면이 고르는 골프장은 저 정적 파일에서 오고, 그 파일의 region 은 '경기' 같은
// 광역 한 낱말뿐이다(시·군은 address 에만 있다). 서버가 region 글자만 보고 코드를 굳히면
// 경기 골프장이 전부 '시·군 모름' 이 되어 남/북/동/서 칩이 다시 같은 결과를 낸다(2026-09-10 검토).
// 그래서 주소까지 본 판정을 여기 접어 두고, 서버는 course_id 로 그 결과를 꺼내 쓴다.

import type { GolfRegionCode } from "./golfRegions.js";
import { KYUNGGI_ANY } from "./golfRegions.js";

const MAP: Record<number, GolfRegionCode | typeof KYUNGGI_ANY> = {
${entries.join("\n")}
};

/** 정적 골프장 원장의 id 로 지역 코드를 찾는다. 모르는 id 면 null. */
export function golfRegionCodeByCourseId(courseId: unknown): GolfRegionCode | typeof KYUNGGI_ANY | null {
    const n = Number(courseId);
    return Number.isInteger(n) && MAP[n] ? MAP[n] : null;
}

/** 표에 담긴 골프장 수 — 어긋남 검사용. */
export const GOLF_COURSE_REGION_COUNT = ${entries.length};
`;

const dest = path.join(process.cwd(), "shared/golfCourseRegions.ts");
fs.writeFileSync(dest, out);
console.log(`${entries.length}곳 기록, 판정 못 한 곳 ${unresolved}곳 → ${dest}`);
