/**
 * 골프장 데이터 손질(어드민) 저장소 — 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *
 * 골프장 페이지(golf_course_pages) 490곳의 빈칸(파·로고·홈페이지·전화·좌표)을 찾고 손으로 채운다.
 * 어디에 쓰느냐에 따라 다음 적재 때 남는 것과 덮이는 것이 다르다:
 *   - 홀별 파·코스 줄    rankue_golf_courses(라운드 원장) — 적재 스크립트(golf-course-pages.ts)는 읽기만 한다. 남는다.
 *   - 원장 좌표          rankue_golf_clubs.latitude/longitude — 현장 인증(2km)이 이 점부터 본다. 남는다.
 *   - 홈페이지·전화·로고  golf_course_pages — 적재 스크립트를 --write 로 다시 돌리면 원본 자료 값으로 **덮인다**
 *     (그래서 '적재 스크립트 전체 재실행은 피한다'. 화면이 이 사실을 적어 둔다).
 *
 * 파는 다른 작업(공식 사이트에서 파를 채우는 검토된 SQL)도 같은 줄을 쓴다 — '고치기 전 값'이 지금 값과 같을 때만 쓴다(낙관적 확인).
 * 파를 바꾸면 그 골프장 페이지의 courses 칸을 적재 스크립트와 같은 식(shared/golfParEdit.ts pageCoursesFromNines)으로 다시 만든다.
 * 같은 골프장의 코스 두 줄을 동시에 고치면 courses 를 서로 낡은 목록으로 덮을 수 있어 골프장 단위 잠금(advisory lock)을 건다.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import type { AdminKeepKey } from "../../shared/golfParEdit.js";
import {
    isKnownPars, missingFields, nineNameKey, pageCoursesFromNines, NINES_PER_CLUB_MAX,
    type MissingKey, type PageCourse,
} from "../../shared/golfParEdit.js";

type Exec = { execute: (q: SQL) => Promise<unknown> };
const rowsOf = (r: unknown): any[] => ((r as any)?.rows ?? r ?? []) as any[];
const q = async (s: SQL, x: Exec = db) => rowsOf(await x.execute(s));
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

/**
 * timestamp(시간대 없음)에 UTC 가 들어 있다 — raw sql 은 "2026-10-01 05:05:00" 문자열로 돌려준다.
 * Z 를 붙여 읽는다(그냥 new Date() 하면 서버 시간대로 읽혀 9시간이 어긋난다 — golfCourses.ts utcIso 와 같은 함정).
 */
function utcIso(v: unknown): string | null {
    if (v == null) return null;
    if (v instanceof Date) return v.toISOString();
    const s = String(v).trim().replace(" ", "T");
    const d = new Date(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── 목록 ───────────────────────────────────────────────────────────
export interface AdminCourseRow {
    slug: string;
    name: string;
    region: string;
    city: string | null;
    logo: string | null;
    missing: MissingKey[];
    /** 원장 골프장의 코스(9홀) 줄 수 · 그중 경기 화면이 아는 파 */
    nines: number;
    ninesWithPars: number;
    /** 관심(☆) 등록 수 */
    watchers: number;
    /** 앞으로의 부킹·조인 글(운영자가 가린 글 제외, 비공개 글 포함) */
    listings: number;
    /** 최근 90일 라운드 수(랭큐매치 기록 hiq_game_history 의 경기 단위) */
    rounds90: number;
    popularity: number;
    /** 정적 목록 id 가 있어 부킹·조인 글이 붙을 수 있는 곳 */
    bookable: boolean;
}

export interface CourseDataList {
    rows: AdminCourseRow[];
    /** 원장 전체의 코스(9홀) 수와 파가 채워진 수 — 파 채우기 진척 */
    ledger: { nines: number; ninesWithPars: number };
}

/** 골프장 페이지 전부(이름·슬러그가 빈 줄은 페이지가 아니다 — 공개 목록과 같은 기준) + 빈칸·숫자. 거르기·정렬은 라우트가 한다. */
export async function listCourseData(): Promise<CourseDataList> {
    const [pages, nines, watch, listings, rounds] = await Promise.all([
        q(sql`select p.slug, p.name, p.region, p.city, p.logo, p.website, p.phone, p.club_id, p.course_ids, p.popularity,
                     (coalesce(jsonb_typeof(p.fees) = 'object', false) or p.fee_from is not null) as has_fees,
                     c.latitude as club_lat, c.longitude as club_lng
              from golf_course_pages p left join rankue_golf_clubs c on c.id = p.club_id
              where p.slug <> '' and btrim(p.name) <> ''`),
        q(sql`select club_id, pars from rankue_golf_courses`),
        q(sql`select slug, count(*)::int n from golf_course_watches group by slug`),
        // 글의 course_id 는 text(정적 목록 id). 숫자만 센다 — 공개 목록(golfCourses.ts)과 같은 거르기
        q(sql`select course_id, count(*)::int n from golf_bookings
              where datetime > now() and is_blinded = false and course_id ~ '^[0-9]+$' group by course_id`),
        // 한 경기에 회원 기록이 여러 줄 — 경기 단위로 센다(옛 기록은 경기 번호가 없어 줄 단위)
        q(sql`select golf_club_id, count(distinct coalesce(golf_session_id::text, id::text))::int n from hiq_game_history
              where sport_category = 'GOLF' and golf_club_id is not null and created_at > now() - interval '90 days'
              group by golf_club_id`),
    ]);

    const perClub = new Map<string, { nines: number; withPars: number }>();
    let ledgerWith = 0;
    for (const r of nines) {
        const k = String(r.club_id);
        const c = perClub.get(k) ?? { nines: 0, withPars: 0 };
        c.nines++;
        if (isKnownPars(r.pars)) { c.withPars++; ledgerWith++; }
        perClub.set(k, c);
    }
    const watchers = new Map<string, number>(watch.map((w) => [String(w.slug), Number(w.n) || 0]));
    const listingsByCourse = new Map<number, number>(listings.map((l) => [Number(l.course_id), Number(l.n) || 0]));
    const roundsByClub = new Map<string, number>(rounds.map((r) => [String(r.golf_club_id), Number(r.n) || 0]));

    const rows: AdminCourseRow[] = pages.map((p) => {
        const clubId: string | null = p.club_id ? String(p.club_id) : null;
        const ns = (clubId && perClub.get(clubId)) || { nines: 0, withPars: 0 };
        const courseIds: number[] = Array.isArray(p.course_ids) ? p.course_ids.map(Number) : [];
        return {
            slug: p.slug,
            name: p.name,
            region: p.region,
            city: p.city ?? null,
            logo: p.logo ?? null,
            missing: missingFields({
                logo: p.logo ?? null, website: p.website ?? null, phone: p.phone ?? null,
                clubId, clubLat: num(p.club_lat), clubLng: num(p.club_lng),
                hasFees: !!p.has_fees, nines: ns.nines, ninesWithPars: ns.withPars,
            }),
            nines: ns.nines,
            ninesWithPars: ns.withPars,
            watchers: watchers.get(p.slug) ?? 0,
            listings: courseIds.reduce((a, id) => a + (listingsByCourse.get(id) ?? 0), 0),
            rounds90: clubId ? roundsByClub.get(clubId) ?? 0 : 0,
            popularity: Number(p.popularity) || 0,
            bookable: courseIds.length > 0,
        };
    });
    return { rows, ledger: { nines: nines.length, ninesWithPars: ledgerWith } };
}

// ── 공식 로고 자료(server/scripts/data/golf-logos-official.json) ──────────
type OfficialLogo = { logo?: string; website?: string; source?: string };
let officialCache: { at: number; map: Record<string, OfficialLogo> | null } | null = null;

/**
 * 공식 로고 자료 — 적재 스크립트가 다시 돌면 이 표의 로고를 **빈 로고 칸에** 다시 얹는다(applyOfficialLogos).
 * 서버리스 배포에는 이 파일이 실리지 않을 수 있다(vercel.json includeFiles 밖) — 못 읽으면 null(= '확인 못 함'),
 * 이때 화면은 로고 파일 이름(g-…png)으로 출처를 알려 준다.
 */
function readOfficialLogos(): Record<string, OfficialLogo> | null {
    if (officialCache && Date.now() - officialCache.at < 60_000) return officialCache.map;
    const candidates: string[] = [path.join(process.cwd(), "server/scripts/data/golf-logos-official.json")];
    try { candidates.push(fileURLToPath(new URL("../scripts/data/golf-logos-official.json", import.meta.url))); } catch { /* file: 주소가 아닌 환경 */ }
    let map: Record<string, OfficialLogo> | null = null;
    for (const file of candidates) {
        try {
            if (!fs.existsSync(file)) continue;
            const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
            map = parsed && typeof parsed.logos === "object" && parsed.logos ? parsed.logos : {};
            break;
        } catch { /* 다음 후보 */ }
    }
    officialCache = { at: Date.now(), map };
    return map;
}

export interface OfficialLogoInfo {
    /** 자료 파일을 읽었는가. false 면 entry 는 모른다는 뜻 */
    checked: boolean;
    entry: { logo: string | null; website: string | null; source: string | null } | null;
}

export function officialLogoFor(slug: string): OfficialLogoInfo {
    const map = readOfficialLogos();
    if (!map) return { checked: false, entry: null };
    const o = map[slug] ?? map[slug.normalize("NFC")];
    return { checked: true, entry: o ? { logo: o.logo ?? null, website: o.website ?? null, source: o.source ?? null } : null };
}

// ── 한 곳 ──────────────────────────────────────────────────────────
export interface AdminNine {
    id: string;
    name: string;
    /** 원장 값 그대로 — 고칠 때 expectedOld 로 돌려보낸다 */
    pars: unknown;
    known: boolean;
    /** 지금 이 코스로 진행 중인 경기(대기 6시간·진행 12시간 안) */
    liveMatches: number;
    updatedAt: string | null;
}

export async function getCourseData(slug: string) {
    const [p] = await q(sql`select slug, name, region, city, address, lat, lng, logo, website, phone, club_id, course_ids, kind, holes,
                                   courses, fee_from, popularity, aliases, admin_keep, updated_at,
                                   coalesce(jsonb_typeof(fees) = 'object', false) as has_fee_table
                            from golf_course_pages where slug = ${slug}`);
    if (!p) return null;
    const clubId: string | null = p.club_id ? String(p.club_id) : null;
    const courseIds: number[] = Array.isArray(p.course_ids) ? p.course_ids.map(Number).filter(Number.isInteger) : [];
    const none = Promise.resolve([] as any[]);
    const [clubRows, nines, watch, listings, rounds, live, siblings] = await Promise.all([
        clubId ? q(sql`select id, name, region, address, latitude, longitude, updated_at from rankue_golf_clubs where id = ${clubId}::uuid`) : none,
        // 이름순 = 경기 화면 코스 목록(getGolfClubCourses)과 같은 순서
        clubId ? q(sql`select id, name, pars, updated_at from rankue_golf_courses where club_id = ${clubId}::uuid order by name`) : none,
        q(sql`select count(*)::int n from golf_course_watches where slug = ${slug}`),
        courseIds.length
            ? q(sql`select count(*)::int n from golf_bookings
                    where datetime > now() and is_blinded = false and course_id = any(${`{${courseIds.join(",")}}`}::text[])`)
            : none,
        clubId
            ? q(sql`select count(distinct coalesce(golf_session_id::text, id::text))::int n from hiq_game_history
                    where sport_category = 'GOLF' and golf_club_id = ${clubId} and created_at > now() - interval '90 days'`)
            : none,
        // 살아 있는 방 — golf.repo.ts 의 핀 규칙과 같은 시간(대기 6시간·진행 12시간)
        clubId
            ? q(sql`select front_course_name, back_course_name from golf_match_sessions
                    where course_id = ${clubId} and ((status = 'waiting' and created_at > now() - interval '6 hours')
                                                  or (status = 'playing' and updated_at > now() - interval '12 hours'))`)
            : none,
        clubId ? q(sql`select slug, name from golf_course_pages where club_id = ${clubId}::uuid and slug <> ${slug} order by name`) : none,
    ]);
    const club = clubRows[0] ?? null;
    const liveByName = new Map<string, number>();
    for (const m of live) {
        // 9홀 하나짜리는 전반·후반이 같은 이름 — 한 경기로 센다
        for (const n of new Set([m.front_course_name, m.back_course_name].filter(Boolean))) liveByName.set(String(n), (liveByName.get(String(n)) ?? 0) + 1);
    }
    return {
        slug: p.slug as string,
        name: p.name as string,
        region: p.region as string,
        city: (p.city ?? null) as string | null,
        address: (p.address ?? null) as string | null,
        pageLat: num(p.lat),
        pageLng: num(p.lng),
        logo: (p.logo ?? null) as string | null,
        website: (p.website ?? null) as string | null,
        phone: (p.phone ?? null) as string | null,
        kind: (p.kind ?? null) as string | null,
        holes: num(p.holes),
        courses: (Array.isArray(p.courses) ? p.courses : null) as PageCourse[] | null,
        hasFees: !!p.has_fee_table || p.fee_from != null,
        feeFrom: num(p.fee_from),
        popularity: Number(p.popularity) || 0,
        aliases: (Array.isArray(p.aliases) ? p.aliases : []) as string[],
        /** 어드민에서 고친 칸 — 다시 적재해도 남는다(shared/golfParEdit.ts ADMIN_KEEP_KEYS) */
        adminKeep: (Array.isArray(p.admin_keep) ? p.admin_keep : []) as string[],
        bookable: courseIds.length > 0,
        updatedAt: utcIso(p.updated_at),
        club: club
            ? {
                id: String(club.id), name: club.name as string, region: (club.region ?? null) as string | null,
                address: (club.address ?? null) as string | null, lat: num(club.latitude), lng: num(club.longitude),
                updatedAt: utcIso(club.updated_at),
            }
            : null,
        /** 페이지에 원장 번호는 있는데 원장 줄이 없다(지워진 원장) — 코스·파를 넣을 수 없다 */
        clubMissing: !!clubId && !club,
        nines: nines.map((n): AdminNine => ({
            id: String(n.id), name: n.name, pars: n.pars, known: isKnownPars(n.pars),
            liveMatches: liveByName.get(n.name) ?? 0, updatedAt: utcIso(n.updated_at),
        })),
        liveMatches: live.length,
        watchers: Number(watch[0]?.n ?? 0),
        listings: Number(listings[0]?.n ?? 0),
        rounds90: Number(rounds[0]?.n ?? 0),
        /** 같은 원장 골프장을 쓰는 다른 페이지 — 파를 고치면 그 페이지 courses 도 같이 바뀐다 */
        sharedClubPages: siblings.map((s) => ({ slug: String(s.slug), name: String(s.name) })),
        official: officialLogoFor(p.slug),
    };
}
export type AdminCourseDetail = NonNullable<Awaited<ReturnType<typeof getCourseData>>>;

// ── 쓰기 ───────────────────────────────────────────────────────────
/** 같은 골프장의 코스 줄을 고치는 일은 한 번에 하나씩 — courses 다시 만들기가 낡은 목록으로 덮지 않게 */
async function lockClub(tx: Exec, clubId: string) {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`rankue_golf_nines:${clubId}`}))`);
}

/**
 * 그 원장 골프장을 쓰는 페이지들의 courses 를 적재 스크립트와 같은 식으로 다시 만든다.
 * 값이 같으면 건드리지 않는다(updated_at 이 괜히 바뀌지 않게). 바뀐 페이지 슬러그를 돌려준다.
 */
async function refreshPageCourses(tx: Exec, clubId: string): Promise<{ courses: PageCourse[] | null; pagesUpdated: string[] }> {
    const nines = await q(sql`select name, pars from rankue_golf_courses where club_id = ${clubId}::uuid order by name`, tx);
    const courses = pageCoursesFromNines(nines);
    const json = JSON.stringify(courses); // null 이면 'null' — 적재 스크립트가 넣는 JSON null 과 같다
    const updated = await q(sql`update golf_course_pages set courses = ${json}::jsonb, updated_at = now()
                                where club_id = ${clubId}::uuid and courses is distinct from ${json}::jsonb
                                returning slug`, tx);
    return { courses, pagesUpdated: updated.map((r) => String(r.slug)) };
}

type Fail<R extends string> = { ok: false; reason: R };

export type ParsSaveResult =
    | { ok: true; nine: { id: string; clubId: string; name: string; pars: number[] }; before: unknown; unchanged: boolean; courses: PageCourse[] | null; pagesUpdated: string[] }
    | Fail<"gone">
    | { ok: false; reason: "changed"; current: unknown };

/** 한 코스 파 저장. expectedOld 를 주면 지금 값이 그것과 같을 때만(jsonb 비교) 쓴다. */
export async function saveNinePars(rowId: string, pars: number[], expectedOld: unknown[] | undefined): Promise<ParsSaveResult> {
    const [head] = await q(sql`select club_id from rankue_golf_courses where id = ${rowId}::uuid`);
    if (!head) return { ok: false, reason: "gone" };
    const clubId = String(head.club_id);
    const next = JSON.stringify(pars);
    return db.transaction(async (tx: Exec) => {
        await lockClub(tx, clubId);
        const [cur] = await q(expectedOld !== undefined
            ? sql`select id, name, pars, (pars = ${next}::jsonb) as unchanged, (pars = ${JSON.stringify(expectedOld)}::jsonb) as same
                  from rankue_golf_courses where id = ${rowId}::uuid for update`
            : sql`select id, name, pars, (pars = ${next}::jsonb) as unchanged, true as same
                  from rankue_golf_courses where id = ${rowId}::uuid for update`, tx);
        if (!cur) return { ok: false, reason: "gone" } as const;
        if (!cur.same) return { ok: false, reason: "changed", current: cur.pars } as const;
        const nine = { id: String(cur.id), clubId, name: String(cur.name), pars };
        if (cur.unchanged) return { ok: true, nine, before: cur.pars, unchanged: true, courses: null, pagesUpdated: [] } as const;
        await tx.execute(sql`update rankue_golf_courses set pars = ${next}::jsonb, updated_at = now() where id = ${rowId}::uuid`);
        const refreshed = await refreshPageCourses(tx, clubId);
        return { ok: true, nine, before: cur.pars, unchanged: false, ...refreshed } as const;
    });
}

export type NineAddResult =
    | { ok: true; nine: { id: string; clubId: string; name: string; pars: number[] }; clubName: string; courses: PageCourse[] | null; pagesUpdated: string[] }
    | Fail<"gone" | "duplicate" | "limit">;

/** 코스 한 줄 추가 — 같은 골프장 안에서 이름(띄어쓰기·대소문자 무시)이 겹치면 안 받는다. pars 는 9칸 또는 [](모름). */
export async function addNine(clubId: string, name: string, pars: number[]): Promise<NineAddResult> {
    return db.transaction(async (tx: Exec) => {
        await lockClub(tx, clubId);
        const [club] = await q(sql`select id, name from rankue_golf_clubs where id = ${clubId}::uuid`, tx);
        if (!club) return { ok: false, reason: "gone" } as const;
        const existing = await q(sql`select name from rankue_golf_courses where club_id = ${clubId}::uuid`, tx);
        const key = nineNameKey(name);
        if (existing.some((e) => nineNameKey(String(e.name)) === key)) return { ok: false, reason: "duplicate" } as const;
        if (existing.length >= NINES_PER_CLUB_MAX) return { ok: false, reason: "limit" } as const;
        const [ins] = await q(sql`insert into rankue_golf_courses (club_id, name, pars)
                                  values (${clubId}::uuid, ${name}, ${JSON.stringify(pars)}::jsonb) returning id`, tx);
        const refreshed = await refreshPageCourses(tx, clubId);
        return { ok: true, nine: { id: String(ins.id), clubId, name, pars }, clubName: String(club.name), ...refreshed } as const;
    });
}

type PageFields = { website: string | null; phone: string | null; logo: string | null };
export type PageField = keyof PageFields;
export type PagePatchResult =
    | { ok: true; before: PageFields; after: PageFields; changed: PageField[] }
    | Fail<"gone">
    | { ok: false; reason: "changed"; current: PageFields };

/** 페이지 칸 고치기 — 바꿀 칸만. expected 에 적힌 칸은 지금 값이 그것과 같을 때만 쓴다. */
export async function patchCoursePage(slug: string, changes: Partial<PageFields>, expected?: Partial<PageFields>): Promise<PagePatchResult> {
    const COLS: PageField[] = ["website", "phone", "logo"];
    const pick = (r: any): PageFields => ({ website: r.website ?? null, phone: r.phone ?? null, logo: r.logo ?? null });
    const [cur] = await q(sql`select website, phone, logo from golf_course_pages where slug = ${slug}`);
    if (!cur) return { ok: false, reason: "gone" };
    const sets: SQL[] = [];
    const conds: SQL[] = [sql`slug = ${slug}`];
    const changed: PageField[] = [];
    for (const k of COLS) {
        if (!(k in changes)) continue;
        // 칸 이름은 위의 고정 목록에서만 온다(사용자 입력이 아니다)
        sets.push(sql`${sql.raw(k)} = ${changes[k] ?? null}`);
        if (expected && k in expected) conds.push(sql`${sql.raw(k)} is not distinct from ${expected[k] ?? null}::text`);
        changed.push(k);
    }
    if (!sets.length) return { ok: true, before: pick(cur), after: pick(cur), changed: [] };
    // 홈페이지·전화를 고쳤으면(지운 것 포함) 다시 적재해도 그 값이 남게 적어 둔다. 로고는 따로다(올린 로고는 주소 꼴로 남긴다 — shared/golfLogo.ts)
    const keep = changed.filter((k) => k !== "logo");
    if (keep.length) sets.push(keepSql(keep as AdminKeepKey[]));
    sets.push(sql`updated_at = now()`);
    const [row] = await q(sql`update golf_course_pages set ${sql.join(sets, sql`, `)} where ${sql.join(conds, sql` and `)}
                              returning website, phone, logo`);
    if (!row) {
        const [now] = await q(sql`select website, phone, logo from golf_course_pages where slug = ${slug}`);
        return now ? { ok: false, reason: "changed", current: pick(now) } : { ok: false, reason: "gone" };
    }
    return { ok: true, before: pick(cur), after: pick(row), changed };
}

/** admin_keep 에 칸 이름을 더한다(겹치지 않게) — UPDATE 의 set 절 한 조각 */
function keepSql(keys: readonly AdminKeepKey[]): SQL {
    const lit = `{${keys.map((k) => `"${k}"`).join(",")}}`;
    return sql`admin_keep = array(select distinct unnest(admin_keep || ${lit}::text[]) order by 1)`;
}

type LatLng = { lat: number | null; lng: number | null };
export type CoordsResult =
    | { ok: true; name: string; before: LatLng; after: { lat: number; lng: number }; page: { slug: string; before: LatLng } | null }
    | Fail<"gone" | "page-mismatch">;

/**
 * 원장 골프장 좌표 — 현장 인증(골프장 2km 안)이 이 점부터 본다(golf.repo.ts courseCoordsFor).
 * slug 를 주면 **그 골프장 페이지의 좌표도 같은 값으로 맞춘다**(2026-10-07 오너: "원장좌표 수정시 골프장 좌표가 자동 반영되게") —
 * 페이지 좌표는 지도·가까운 골프장·날씨가 쓴다. 그 페이지가 이 원장에 붙어 있을 때만. 같은 원장을 쓰는 다른 페이지는 건드리지 않는다
 * (원장을 잘못 같이 가리키는 페이지가 있다 — 그쪽까지 옮기면 틀린 좌표가 퍼진다).
 */
export async function setClubCoords(clubId: string, lat: number, lng: number, slug?: string): Promise<CoordsResult> {
    return db.transaction(async (tx: Exec) => {
        const [cur] = await q(sql`select name, latitude, longitude from rankue_golf_clubs where id = ${clubId}::uuid for update`, tx);
        if (!cur) return { ok: false, reason: "gone" } as const;
        let pageBefore: LatLng | null = null;
        if (slug !== undefined) {
            const [pg] = await q(sql`select lat, lng, club_id from golf_course_pages where slug = ${slug} for update`, tx);
            if (!pg || String(pg.club_id ?? "") !== clubId) return { ok: false, reason: "page-mismatch" } as const;
            pageBefore = { lat: num(pg.lat), lng: num(pg.lng) };
        }
        const [row] = await q(sql`update rankue_golf_clubs set latitude = ${lat}, longitude = ${lng}, updated_at = now()
                                  where id = ${clubId}::uuid returning latitude, longitude`, tx);
        if (!row) return { ok: false, reason: "gone" } as const;
        if (slug !== undefined) {
            await tx.execute(sql`update golf_course_pages set lat = ${lat}, lng = ${lng}, ${keepSql(["coords"])}, updated_at = now() where slug = ${slug}`);
        }
        return {
            ok: true, name: String(cur.name), before: { lat: num(cur.latitude), lng: num(cur.longitude) }, after: { lat: Number(row.latitude), lng: Number(row.longitude) },
            page: slug !== undefined && pageBefore ? { slug, before: pageBefore } : null,
        } as const;
    });
}

export type PageCoordsResult = { ok: true; name: string; before: LatLng; after: { lat: number; lng: number } } | Fail<"gone" | "has-club">;
/** 원장에 짝이 없는 골프장 페이지의 좌표 — 짝이 있으면 원장 좌표를 고친다(위 setClubCoords 가 페이지까지 맞춘다) */
export async function setPageCoords(slug: string, lat: number, lng: number): Promise<PageCoordsResult> {
    const [cur] = await q(sql`select p.name, p.lat, p.lng, (c.id is not null) as has_club
                              from golf_course_pages p left join rankue_golf_clubs c on c.id = p.club_id where p.slug = ${slug}`);
    if (!cur) return { ok: false, reason: "gone" };
    // 짝이 '있다' = 원장 줄이 실제로 있다. 원장 줄이 지워진 페이지(club_id 만 남음)는 짝이 없는 것으로 본다
    if (cur.has_club) return { ok: false, reason: "has-club" };
    const [row] = await q(sql`update golf_course_pages set lat = ${lat}, lng = ${lng}, ${keepSql(["coords"])}, updated_at = now()
                              where slug = ${slug} and not exists (select 1 from rankue_golf_clubs c where c.id = golf_course_pages.club_id) returning lat, lng`);
    if (!row) return { ok: false, reason: "gone" };
    return { ok: true, name: String(cur.name), before: { lat: num(cur.lat), lng: num(cur.lng) }, after: { lat: Number(row.lat), lng: Number(row.lng) } };
}

export type RenameResult =
    | { ok: true; before: string; after: string; aliases: string[]; club: { id: string; before: string; after: string } | null; unchanged: boolean }
    | Fail<"gone" | "taken" | "club-live" | "club-shared">
    | { ok: false; reason: "changed"; current: string };

/**
 * 골프장 이름 고치기(2026-10-07 오너: "골프장 명 수정 가능하게").
 *  - 페이지 이름만 바꾼다. **주소(슬러그)는 그대로** — 이미 퍼진 링크·검색 결과가 그 주소를 가리킨다.
 *  - 옛 이름은 aliases 에 남긴다: 옛 이름으로도 검색되고, 원장 골프장(이름으로 페이지를 찾는다 — golf.repo.ts)과의 짝도 끊기지 않는다.
 *  - alsoClub: 경기 시작 화면에 뜨는 원장 골프장 이름도 같이 바꾼다. 그 원장에 진행 중 경기가 있거나 다른 페이지가 같이 쓰면 하지 않는다.
 *  - 같은 이름의 다른 골프장 페이지가 있으면 막는다(검색·경기 화면에서 둘을 가를 수 없다).
 */
export async function renameCourse(slug: string, name: string, expectedOld: string | undefined, alsoClub: boolean): Promise<RenameResult> {
    return db.transaction(async (tx: Exec) => {
        const [cur] = await q(sql`select name, aliases, club_id from golf_course_pages where slug = ${slug} for update`, tx);
        if (!cur) return { ok: false, reason: "gone" } as const;
        const before = String(cur.name);
        if (expectedOld !== undefined && expectedOld !== before) return { ok: false, reason: "changed", current: before } as const;
        const key = (s: string) => s.normalize("NFC").replace(/\s+/g, "").toLowerCase();
        const [dup] = await q(sql`select slug from golf_course_pages where slug <> ${slug} and lower(regexp_replace(name, '\\s+', '', 'g')) = ${key(name)} limit 1`, tx);
        if (dup) return { ok: false, reason: "taken" } as const;

        const clubId: string | null = cur.club_id ? String(cur.club_id) : null;
        let club: { id: string; before: string; after: string } | null = null;
        if (alsoClub && clubId) {
            const [c] = await q(sql`select name from rankue_golf_clubs where id = ${clubId}::uuid for update`, tx);
            if (c && String(c.name) !== name) {
                const [sib] = await q(sql`select 1 as x from golf_course_pages where club_id = ${clubId}::uuid and slug <> ${slug} limit 1`, tx);
                if (sib) return { ok: false, reason: "club-shared" } as const;
                const [live] = await q(sql`select 1 as x from golf_match_sessions
                                           where course_id = ${clubId} and ((status = 'waiting' and created_at > now() - interval '6 hours')
                                                                         or (status = 'playing' and updated_at > now() - interval '12 hours')) limit 1`, tx);
                if (live) return { ok: false, reason: "club-live" } as const;
                await tx.execute(sql`update rankue_golf_clubs set name = ${name}, updated_at = now() where id = ${clubId}::uuid`);
                club = { id: clubId, before: String(c.name), after: name };
            }
        }
        const old: string[] = Array.isArray(cur.aliases) ? cur.aliases.map(String) : [];
        if (before === name) return { ok: true, before, after: name, aliases: old, club, unchanged: !club } as const;
        // 옛 이름을 남기고, 새 이름과 같은 별칭은 뺀다(이름이 별칭에 또 있으면 화면에 두 번 나온다)
        const aliases = [...old.filter((a) => key(a) !== key(name)), ...(old.some((a) => key(a) === key(before)) ? [] : [before])];
        const lit = `{${aliases.map((x) => `"${x.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")}}`;
        await tx.execute(sql`update golf_course_pages set name = ${name}, aliases = ${lit}::text[], ${keepSql(["name"])}, updated_at = now() where slug = ${slug}`);
        return { ok: true, before, after: name, aliases, club, unchanged: false } as const;
    });
}
