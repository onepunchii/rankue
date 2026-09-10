/**
 * 티스캐너에서 받아 온 골프장 정보를 우리 원장에 얹는다.
 *
 * 왜: 전국 634곳 중 317곳은 코스 구성(전반/후반 이름)이 없어서, 랭큐매치에서 그 골프장을 고르면
 * 전반/후반을 못 골라 라운드를 시작할 수 없었다(2026-09-10 오너 제보). 오너 판단으로 티스캐너에서
 * 가져오기로 했다 — 코스명·홀수·좌표는 사실 정보다.
 *
 * 무엇을 채우나
 *   - rankue_golf_courses : course_name("북/남")을 '/' 로 갈라 코스 이름으로. 홀별 파는 모르니 빈 배열.
 *   - rankue_golf_clubs   : 비어 있는 위도·경도·주소만 채운다(있는 값은 안 건드린다).
 *                            좌표가 없어서 '가까운 골프장' 거리 정렬이 죽어 있었다.
 *
 * 이름 맞추기: 양쪽 표기가 다르다("서울한양" ↔ "한양컨트리클럽"). 이름을 다듬어 견주고,
 * 한쪽이 다른 쪽에 들어가는 경우는 **주소의 시·군이 같을 때만** 같은 곳으로 본다.
 * 애매하면 안 맞춘다 — 엉뚱한 골프장에 남의 코스 이름을 붙이는 쪽이 훨씬 나쁘다.
 *
 *   수집:  node <scratch>/crawl.mjs      (OUT=... MAX=... GAP=...)
 *   반영:  npx tsx scripts/import-teescanner-courses.ts <수집한 json> [--apply]
 *          --apply 없이 돌리면 무엇이 바뀔지만 보여 주고 아무것도 안 쓴다.
 */
import "dotenv/config";
import fs from "node:fs";
import { db } from "../server/db.js";
import { rankueGolfClubs, rankueGolfCourses } from "../shared/schema.js";
import { eq, sql } from "drizzle-orm";

interface TsClub {
    golfclub_seq: number;
    golfclub_name: string;
    area_name?: string;
    address1?: string;
    latitude?: string;
    longitude?: string;
    hole_count?: number;
    course_name?: string;
}

/** &#40; 같은 숫자 실체와 흔한 이름 실체를 되돌린다. */
function unescapeHtml(s: string): string {
    return String(s ?? "")
        .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
        .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ")
        .replace(/&times;/g, "x").replace(/&middot;/g, "·").replace(/&bull;/g, "·");
}

/** 같은 골프장인지 견주려고 흔들리는 부분을 걷어낸다. '스톤비치(P)' = '스톤비치컨트리클럽'. */
function normalizeName(s: string): string {
    return unescapeHtml(s)
        .replace(/\([^)]*\)/g, "")                       // (P), (구 …) 같은 꼬리표
        .replace(/\s+/g, "")
        .replace(/컨트리클럽|골프클럽|골프장|골프&리조트|골프리조트|리조트|퍼블릭|C\.?C|G\.?C|CC|GC/gi, "")
        .replace(/[·\-.,&]/g, "")
        .toLowerCase();
}

/** 주소에서 시·군·구를 하나 뽑는다. 이름이 애매할 때 같은 곳인지 가르는 데 쓴다. */
function cityOf(address: string | null | undefined): string | null {
    const m = unescapeHtml(address ?? "").match(/([가-힣]{2,4})(시|군|구)(?![가-힣])/);
    return m ? m[1] : null;
}

/** 'North/South', '신OUT(18홀)/신IN(18홀)' → 코스 이름 목록. */
function splitCourses(courseName: string | null | undefined): string[] {
    const raw = unescapeHtml(courseName ?? "").trim();
    if (!raw) return [];
    const names = raw.split("/")
        .map((n) => n
            .replace(/\([^)]*\)/g, " ")        // '(18홀)' '(9홀*2)' 는 코스 이름이 아니다
            .replace(/[*x×]\s*\d+\s*$/i, " ")  // '파랑새*2' 의 꼬리
            .replace(/\s+/g, " ").trim())
        .map((n) => n.slice(0, 20))
        .filter(Boolean);
    // 이름이 아닌 것은 뺀다. '9홀X2회' 처럼 홀 수만 적힌 곳은 전반/후반 이름이 따로 없는
    // 9홀 코스라는 뜻이라, 억지로 '9홀' 이라는 코스를 만들지 않고 비워 둔다(회원이 직접 적게 된다).
    const meaningless = new Set(["현장배정", "미정", "-", "없음"]);
    const onlyHoleCount = /^\d+\s*홀(\s*[xX×*]\s*\d+\s*회?)?$/;
    return Array.from(new Set(
        names.filter((n) => !meaningless.has(n) && !onlyHoleCount.test(n) && !/^\d+$/.test(n))
    )).slice(0, 6);
}

async function main() {
    const file = process.argv[2];
    const apply = process.argv.includes("--apply");
    if (!file || !fs.existsSync(file)) {
        console.error("수집한 json 경로를 주세요:  npx tsx scripts/import-teescanner-courses.ts <파일> [--apply]");
        process.exit(1);
    }
    const scraped: TsClub[] = JSON.parse(fs.readFileSync(file, "utf8"));
    console.log(`수집본 ${scraped.length}곳 읽음${apply ? "" : "  (미리보기 — 아무것도 안 씁니다)"}`);

    const clubs = await db.select({
        id: rankueGolfClubs.id, name: rankueGolfClubs.name, address: rankueGolfClubs.address,
        region: rankueGolfClubs.region, latitude: rankueGolfClubs.latitude, longitude: rankueGolfClubs.longitude,
    }).from(rankueGolfClubs);

    const courseCounts = await db.select({
        clubId: rankueGolfCourses.clubId, n: sql<number>`count(*)::int`,
    }).from(rankueGolfCourses).groupBy(rankueGolfCourses.clubId);
    const hasCourses = new Set(courseCounts.filter((c) => Number(c.n) > 0).map((c) => c.clubId));

    // 우리 원장 색인
    const byExact = new Map<string, typeof clubs>();
    for (const c of clubs) {
        const k = normalizeName(c.name);
        if (!byExact.has(k)) byExact.set(k, [] as any);
        byExact.get(k)!.push(c);
    }

    let matched = 0, ambiguous = 0, unmatched = 0;
    let coursesAdded = 0, clubsFilled = 0, coordsFilled = 0, created = 0;
    const unmatchedNames: string[] = [];

    for (const ts of scraped) {
        const tsName = unescapeHtml(ts.golfclub_name);
        const key = normalizeName(tsName);
        if (!key) continue;
        const tsCity = cityOf(ts.address1) ?? cityOf(ts.area_name);

        let hits = byExact.get(key) ?? [];

        // '더시에나서울(구 중부)' 처럼 옛 이름이 괄호에 남아 있으면 그것으로도 찾아본다 —
        // 안 그러면 이미 있는 골프장을 새 이름으로 하나 더 만들어 둘이 된다.
        if (hits.length === 0) {
            const oldName = unescapeHtml(tsName).match(/\(\s*구\s*([^)]+)\)/)?.[1];
            if (oldName) hits = byExact.get(normalizeName(oldName)) ?? [];
        }

        if (hits.length === 0) {
            // 한쪽이 다른 쪽에 들어가는 경우 — **시·군이 같을 때만** 같은 곳으로 본다.
            hits = clubs.filter((c) => {
                const k = normalizeName(c.name);
                if (!k || k.length < 2 || key.length < 2) return false;
                if (!(k.includes(key) || key.includes(k))) return false;
                const cc = cityOf(c.address);
                return !!tsCity && !!cc && tsCity === cc;
            });
        } else if (hits.length > 1 && tsCity) {
            const narrowed = hits.filter((c) => cityOf(c.address) === tsCity);
            if (narrowed.length === 1) hits = narrowed;
        }

        if (hits.length === 0) {
            // 우리 원장에 없는 실제 골프장이다 — 이름·주소·좌표·코스까지 갖춰 새로 넣는다.
            unmatched++;
            unmatchedNames.push(`${tsName}${tsCity ? ` (${tsCity})` : ""}`);
            const names0 = splitCourses(ts.course_name);
            if (apply) {
                const [ins] = await db.insert(rankueGolfClubs).values({
                    name: unescapeHtml(tsName).slice(0, 80),
                    region: unescapeHtml(ts.area_name ?? "").split(">")[0].trim() || null,
                    address: ts.address1 ? unescapeHtml(ts.address1).slice(0, 200) : null,
                    latitude: Number.isFinite(Number(ts.latitude)) ? Number(ts.latitude) : null,
                    longitude: Number.isFinite(Number(ts.longitude)) ? Number(ts.longitude) : null,
                }).returning({ id: rankueGolfClubs.id });
                if (names0.length > 0) {
                    await db.insert(rankueGolfCourses)
                        .values(names0.map((name) => ({ clubId: ins.id, name, pars: [] as number[] })));
                }
            }
            created++;
            coursesAdded += names0.length;
            continue;
        }
        if (hits.length > 1) { ambiguous++; continue; }   // 애매하면 건드리지 않는다
        const club = hits[0];
        matched++;

        // 1) 코스 구성 — 아직 없는 골프장만
        const names = splitCourses(ts.course_name);
        if (names.length > 0 && !hasCourses.has(club.id)) {
            if (apply) {
                await db.insert(rankueGolfCourses)
                    .values(names.map((name) => ({ clubId: club.id, name, pars: [] as number[] })));
            }
            hasCourses.add(club.id);
            coursesAdded += names.length;
            clubsFilled++;
        }

        // 2) 좌표·주소 — 비어 있는 것만
        const lat = Number(ts.latitude), lng = Number(ts.longitude);
        const needCoords = club.latitude == null && club.longitude == null && Number.isFinite(lat) && Number.isFinite(lng);
        const needAddr = !club.address && !!ts.address1;
        if (needCoords || needAddr) {
            if (apply) {
                await db.update(rankueGolfClubs).set({
                    ...(needCoords ? { latitude: lat, longitude: lng } : {}),
                    ...(needAddr ? { address: unescapeHtml(ts.address1!).slice(0, 200) } : {}),
                    updatedAt: new Date(),
                }).where(eq(rankueGolfClubs.id, club.id));
            }
            if (needCoords) coordsFilled++;
        }
    }

    const [{ noCourse }] = await db.select({ noCourse: sql<number>`count(*)::int` })
        .from(rankueGolfClubs)
        .where(sql`not exists (select 1 from rankue_golf_courses c where c.club_id = ${rankueGolfClubs.id})`);

    console.log(`\n맞춘 곳 ${matched} · 애매해서 건너뜀 ${ambiguous} · 새로 넣은 골프장 ${created}`);
    console.log(`코스 구성 채운 골프장 ${clubsFilled}곳 (코스 ${coursesAdded}개) · 좌표 채운 곳 ${coordsFilled}곳`);
    console.log(`${apply ? "지금" : "반영하면"} 코스 구성이 없는 골프장: ${apply ? noCourse : "(미리보기라 그대로)"}`);
    if (unmatchedNames.length > 0) {
        console.log(`\n우리 원장에 없는 티스캐너 골프장 ${unmatchedNames.length}곳 중 20곳:`);
        console.log("  " + unmatchedNames.slice(0, 20).join(" / "));
    }
    process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
