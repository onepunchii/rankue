/**
 * 스코어카드 한 장으로 라운드를 남기는 길(2026-10-13 오너: "스코어카드를 첨부하면 자동으로 CC명과 전후반 · 날짜까지 인식해야" ·
 * "지금은 뎁스가 너무 불편한데 — 스코어카드를 넣고 인식이 안 되면 물어보면 되는데").
 *
 *  - resolveCard : 받아쓴 골프장 · 코스 이름과 인쇄된 파를 **우리 명부**(rankue_golf_clubs · rankue_golf_courses)와 맞춘다.
 *                  못 맞춘 것은 null — 화면이 그것만 사람에게 묻는다. 맞춤 규칙은 shared/golfScorecardScan(matchClub · matchCourses).
 *  - signScan / openScan : 읽은 줄들 · 맞춘 골프장과 코스를 서명해서 화면에 주고, 기록할 때 돌려받는다. 서버는 읽은 것을 저장하지 않으므로
 *                  '카드에서 읽은 그대로인가'(공식 여부)를 이 서명으로만 안다. 열쇠는 COOKIE_SECRET 에서 용도별로 파생(lib/footprintShare 와 같은 방식).
 * 명부는 인스턴스 안에 10분 둔다(골프장 600여 곳 · 코스 1,300여 줄).
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { rankueGolfClubs, rankueGolfCourses } from "../../shared/schema.js";
import { eq } from "drizzle-orm";
import { SCAN_PROMOTE_MEMBERS, clubParsFit, courseKey, matchClub, matchCourses, type ScanClub, type ScanClubCourse, type ScanRead } from "../../shared/golfScorecardScan.js";

interface ClubIndex { clubs: ScanClub[]; courses: Map<string, ScanClubCourse[]>; at: number }
let cache: ClubIndex | null = null;
const INDEX_TTL_MS = 10 * 60_000;

export async function clubIndex(now: number = Date.now()): Promise<ClubIndex> {
    if (cache && now - cache.at < INDEX_TTL_MS) return cache;
    const [clubs, rows] = await Promise.all([
        db.select({ id: rankueGolfClubs.id, name: rankueGolfClubs.name }).from(rankueGolfClubs),
        db.select({ clubId: rankueGolfCourses.clubId, name: rankueGolfCourses.name, pars: rankueGolfCourses.pars }).from(rankueGolfCourses),
    ]);
    const courses = new Map<string, ScanClubCourse[]>();
    for (const r of rows) {
        const pars = Array.isArray(r.pars) ? r.pars.map(Number) : [];
        if (pars.length < 9) continue;
        const list = courses.get(r.clubId) ?? [];
        list.push({ name: r.name, pars });
        courses.set(r.clubId, list);
    }
    // 카드에서 확인돼 쌓인 코스(golf_scan_courses) — 명부에 그 이름의 코스가 없는 골프장에만 보탠다. 여러 사람의 카드가 같은 파를 말한 것이 먼저
    try {
        const seen = rowsOf(await db.execute(sql`
            select club_id, course_key, (array_agg(course_name order by last_seen desc))[1] as name, pars_key, count(distinct member_id)::int as members, max(last_seen) as last
            from golf_scan_courses group by club_id, course_key, pars_key order by members desc, last desc`));
        const taken = new Set<string>();
        for (const r of seen) {
            const id = `${r.club_id}|${r.course_key}`;
            if (taken.has(id)) continue;
            taken.add(id);
            const list = courses.get(String(r.club_id)) ?? [];
            if (list.some((c) => courseKey(c.name) === r.course_key)) continue;
            const pars = String(r.pars_key).split("").map(Number);
            if (pars.length !== 9 || pars.some((p) => !(p >= 3 && p <= 6))) continue;
            list.push({ name: String(r.name), pars });
            courses.set(String(r.club_id), list);
        }
    } catch (e) {
        // 표가 아직 없거나 읽지 못해도 명부만으로 간다
        console.warn("[GolfScan] seen courses", String((e as any)?.message ?? e).slice(0, 100));
    }
    cache = { clubs: clubs.map((c) => ({ id: String(c.id), name: c.name })), courses, at: now };
    return cache;
}

const rowsOf = (r: any) => (r.rows ?? r) as any[];

/**
 * 카드에서 확인된 코스와 파를 쌓는다(2026-10-13 오너: "해당 홀과 코스를 누적 DB 로 저장해 놓는 거 알지? 코스에 따른 정보들도 저장돼야 돼").
 * 부르는 쪽이 지킬 것: **그 카드에 찍힌 합과 맞아떨어진 아홉 홀만**(shared halfFits) 넘긴다 — 잘못 읽은 파가 쌓이지 않게.
 * 같은 사람이 같은 것을 또 올리면 횟수와 마지막 날만 늘린다. 공용 명부(rankue_golf_courses)는 두 사람의 카드가 같은 말을 할 때만 고친다(promoteSeenCourse).
 */
export async function saveSeenCourse(v: { clubId: string; name: string; pars: readonly number[]; memberId: string }): Promise<void> {
    const key = courseKey(v.name);
    if (!key || v.pars.length !== 9 || v.pars.some((p) => !(p >= 3 && p <= 6))) return;
    await db.execute(sql`
        insert into golf_scan_courses (club_id, course_key, course_name, pars_key, member_id)
        values (${v.clubId}, ${key}, ${v.name.trim().slice(0, 30)}, ${v.pars.join("")}, ${v.memberId})
        on conflict (club_id, course_key, pars_key, member_id) do update set seen = golf_scan_courses.seen + 1, last_seen = now(), course_name = excluded.course_name`);
    cache = null; // 다음 읽기가 새로 쌓인 코스를 보게
    await promoteSeenCourse(v.clubId, key, v.name.trim().slice(0, 30), v.pars).catch((e) => console.warn("[GolfScan] promote", String((e as any)?.message ?? e).slice(0, 120)));
}

/**
 * 서로 다른 회원 SCAN_PROMOTE_MEMBERS 사람의 카드가 같은 코스 · 같은 파를 말했으면 공용 명부를 고친다 — 없는 코스는 더하고, 파가 다르면 바꾼다
 * (오너 10/14). 같은 사람이 여러 번 올린 것은 한 사람으로 센다. 무엇을 무엇으로 바꿨는지는 서버 기록에 남긴다.
 */
export async function promoteSeenCourse(clubId: string, key: string, name: string, pars: readonly number[]): Promise<"added" | "fixed" | null> {
    const [agree] = rowsOf(await db.execute(sql`select count(distinct member_id)::int as n from golf_scan_courses where club_id = ${clubId} and course_key = ${key} and pars_key = ${pars.join("")}`));
    if ((Number(agree?.n) || 0) < SCAN_PROMOTE_MEMBERS) return null;
    const list = await db.select({ id: rankueGolfCourses.id, name: rankueGolfCourses.name, pars: rankueGolfCourses.pars }).from(rankueGolfCourses).where(eq(rankueGolfCourses.clubId, clubId));
    const cur = list.find((c) => courseKey(c.name) === key);
    if (!cur) {
        await db.insert(rankueGolfCourses).values({ clubId, name, pars: [...pars] });
        console.info("[GolfScan] promote added", JSON.stringify({ clubId, name, pars: pars.join("") }));
        return "added";
    }
    const old = Array.isArray(cur.pars) ? cur.pars.map(Number) : [];
    if (old.length === 9 && old.every((p, i) => p === pars[i])) return null;
    await db.update(rankueGolfCourses).set({ pars: [...pars], updatedAt: new Date() }).where(eq(rankueGolfCourses.id, cur.id));
    console.info("[GolfScan] promote fixed", JSON.stringify({ clubId, name: cur.name, from: old.join(""), to: pars.join("") }));
    return "fixed";
}

export interface ResolvedCard {
    club: ScanClub | null;
    front: ScanClubCourse | null;
    back: ScanClubCourse | null;
}

export function resolveCardWith(read: ScanRead, index: Pick<ClubIndex, "clubs" | "courses">): ResolvedCard {
    const club = matchClub(read, index.clubs, (id) => clubParsFit(read, index.courses.get(id) ?? []));
    if (!club) return { club: null, front: null, back: null };
    const [front, back] = matchCourses(read, index.courses.get(club.id) ?? []);
    return { club, front, back };
}

export async function resolveCard(read: ScanRead): Promise<ResolvedCard> {
    return resolveCardWith(read, await clubIndex());
}

/* ── 읽은 줄의 서명 ─────────────────────────────────────────────────────────── */

const SCAN_TOKEN_TTL_MS = 30 * 60_000;
const key = (): Buffer | null => {
    const secret = process.env.COOKIE_SECRET;
    return secret && secret.length >= 16 ? createHmac("sha256", secret).update("golf-scan-rows:v1").digest() : null;
};
const mac = (k: Buffer, body: string) => createHmac("sha256", k).update(body).digest("base64url");

/** m 회원 · r 읽은 줄들(타수) · d 카드의 날 · c 맞춘 골프장 · f/b 맞춘 전반 · 후반 코스 · e 만료 */
export interface ScanTicket { m: string; r: number[][]; d: string | null; c: string | null; f: string | null; b: string | null; e: number }

/** 읽은 줄(타수)과 카드의 날을 서명한다. 열쇠가 없으면 null — 그때는 공식으로 올릴 길이 없다(미인증으로만) */
export function signScan(memberId: string, rows: number[][], day: string | null, found: { clubId: string | null; front: string | null; back: string | null }, now: number = Date.now()): string | null {
    const k = key();
    if (!k) return null;
    const body = Buffer.from(JSON.stringify({ m: memberId, r: rows, d: day, c: found.clubId, f: found.front, b: found.back, e: now + SCAN_TOKEN_TTL_MS } satisfies ScanTicket)).toString("base64url");
    return `${body}.${mac(k, body)}`;
}

/** 서명이 맞고 · 그 회원의 것이고 · 아직 살아 있으면 내용을, 아니면 null */
export function openScan(token: unknown, memberId: string, now: number = Date.now()): ScanTicket | null {
    const k = key();
    if (!k || typeof token !== "string" || token.length > 4000) return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const want = Buffer.from(mac(k, body)), got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    try {
        const t = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as ScanTicket;
        if (t.m !== memberId || !(t.e > now) || !Array.isArray(t.r)) return null;
        return t;
    } catch {
        return null;
    }
}

/** 시험용 */
export function clearClubIndex(): void { cache = null; }
