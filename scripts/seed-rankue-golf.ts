/**
 * 골프장 원장을 DB(rankue_golf_clubs / rankue_golf_courses)에 채운다.
 *
 * 왜 다시 썼나(2026-09-10): 예전 판은 golf_courses_final.json 의 clubName 만 보고
 * `INSERT INTO rankue_golf_clubs (name)` 를 했다. region·address 를 아예 안 채웠고,
 * 그 파일에 없는 골프장(전국 525곳 중 절반 이상)은 DB 에 아예 없었다.
 * 그 결과 랭큐매치의 '라운드 장소 선택'(/api/hiq/golf/clubs 를 본다)이 통째로 비어 있었고,
 * 전반/후반 코스 고르기도 빈 목록이었다 — '88' 을 쳐도 아무것도 안 나왔다(오너 제보).
 *
 * 이제 두 자료를 합친다.
 *   - client/src/golf/data/golfCourses.ts : 전국 525곳. 이름·지역·주소·홀수·전화가 있다(코스 구성은 없다).
 *   - golf/golf_courses_final.json        : 317곳의 **코스 구성**(OUT/IN, LAKE/VALLEY …)과 홀별 파.
 * 이름을 다듬어 맞물리며, 코스 자료에만 있는 곳(해외 골프장 등)도 이름만으로 넣어 코스를 살린다.
 *
 * 다시 돌려도 안전하다(이름으로 찾아 없으면 넣고, 있으면 비어 있는 칸만 채운다).
 *   npx tsx scripts/seed-rankue-golf.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { db } from "../server/db.js";
import { rankueGolfClubs, rankueGolfCourses } from "../shared/schema.js";
import { COURSES } from "../client/src/golf/data/golfCourses.js";
import { eq, and, isNull, sql } from "drizzle-orm";

/** 같은 골프장인지 견주려고 이름에서 흔들리는 부분을 걷어낸다. '한양컨트리클럽' = '한양 CC'. */
function normalizeName(s: string): string {
    return s
        .replace(/\s+/g, "")
        .replace(/컨트리클럽|골프클럽|골프장|골프&리조트|골프리조트|리조트|C\.?C|G\.?C|CC|GC/gi, "")
        .replace(/[()·\-.]/g, "")
        .toLowerCase();
}

interface SubCourse { courseName: string; pars: number[] }

async function main() {
    const jsonPath = path.join(process.cwd(), "golf/golf_courses_final.json");
    const courseData: { clubName: string; courses: SubCourse[] }[] =
        fs.existsSync(jsonPath) ? JSON.parse(fs.readFileSync(jsonPath, "utf8")) : [];

    // 1) 이름 → 코스 구성
    const subByName = new Map<string, SubCourse[]>();
    for (const c of courseData) subByName.set(normalizeName(c.clubName), c.courses);

    // 2) 넣을 골프장 목록: 정적 원장 525곳 + 코스 자료에만 있는 곳
    type Row = { name: string; region: string | null; address: string | null };
    const wanted = new Map<string, Row>();
    for (const c of COURSES as any[]) {
        // 이름이 빈 행이 하나 섞여 있다(정적 원장 id 359, 의성). 이름 없는 골프장을 목록에 세우면
        // 고를 수는 있는데 이름이 안 보인다 — 넣지 않는다.
        const name = String(c.name ?? "").trim();
        if (!name) continue;
        wanted.set(normalizeName(name), { name, region: c.region ?? null, address: c.address ?? null });
    }
    for (const c of courseData) {
        const name = String(c.clubName ?? "").trim();
        if (!name) continue;
        const key = normalizeName(name);
        if (!wanted.has(key)) wanted.set(key, { name, region: null, address: null });
    }

    // 3) 이미 있는 것 읽기
    const existing = await db.select({
        id: rankueGolfClubs.id, name: rankueGolfClubs.name,
        region: rankueGolfClubs.region, address: rankueGolfClubs.address,
    }).from(rankueGolfClubs);
    const idByKey = new Map<string, string>();
    for (const e of existing) idByKey.set(normalizeName(e.name), e.id);

    let created = 0, filled = 0;
    for (const [key, row] of wanted) {
        const id = idByKey.get(key);
        if (!id) {
            const [ins] = await db.insert(rankueGolfClubs)
                .values({ name: row.name, region: row.region, address: row.address })
                .returning({ id: rankueGolfClubs.id });
            idByKey.set(key, ins.id);
            created++;
        } else if (row.region || row.address) {
            // 이름만 있던 옛 행에 지역·주소를 채운다(이미 있는 값은 안 건드린다).
            const res = await db.update(rankueGolfClubs)
                .set({
                    region: sql`coalesce(${rankueGolfClubs.region}, ${row.region})`,
                    address: sql`coalesce(${rankueGolfClubs.address}, ${row.address})`,
                    updatedAt: new Date(),
                })
                .where(and(eq(rankueGolfClubs.id, id),
                    sql`(${rankueGolfClubs.region} is null or ${rankueGolfClubs.address} is null)`))
                .returning({ id: rankueGolfClubs.id });
            if (res.length > 0) filled++;
        }
    }

    // 4) 코스 구성
    let courseAdded = 0, courseUpdated = 0, clubsWithCourses = 0;
    for (const [key, subs] of subByName) {
        const clubId = idByKey.get(key);
        if (!clubId) continue;
        clubsWithCourses++;
        const have = await db.select({ id: rankueGolfCourses.id, name: rankueGolfCourses.name })
            .from(rankueGolfCourses).where(eq(rankueGolfCourses.clubId, clubId));
        const haveByName = new Map(have.map((h) => [h.name, h.id]));
        for (const sub of subs) {
            const existingId = haveByName.get(sub.courseName);
            if (existingId) {
                await db.update(rankueGolfCourses)
                    .set({ pars: sub.pars, updatedAt: new Date() })
                    .where(eq(rankueGolfCourses.id, existingId));
                courseUpdated++;
            } else {
                await db.insert(rankueGolfCourses)
                    .values({ clubId, name: sub.courseName, pars: sub.pars });
                courseAdded++;
            }
        }
    }

    const [{ clubs }] = await db.select({ clubs: sql<number>`count(*)::int` }).from(rankueGolfClubs);
    const [{ courses }] = await db.select({ courses: sql<number>`count(*)::int` }).from(rankueGolfCourses);
    const [{ noCourse }] = await db.select({ noCourse: sql<number>`count(*)::int` })
        .from(rankueGolfClubs)
        .where(sql`not exists (select 1 from rankue_golf_courses c where c.club_id = ${rankueGolfClubs.id})`);

    console.log(`골프장 새로 ${created}곳 · 지역/주소 채움 ${filled}곳`);
    console.log(`코스 새로 ${courseAdded}개 · 갱신 ${courseUpdated}개 (코스가 있는 골프장 ${clubsWithCourses}곳)`);
    console.log(`현재: 골프장 ${clubs}곳 / 코스 ${courses}개 · **코스 구성이 없는 골프장 ${noCourse}곳**`);
    if (noCourse > 0) {
        console.log(`  → 그만큼은 랭큐매치에서 전반/후반을 못 고른다. 코스 구성 자료를 더 모아야 한다.`);
    }
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
