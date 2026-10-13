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
import { db } from "../db.js";
import { rankueGolfClubs, rankueGolfCourses } from "../../shared/schema.js";
import { clubParsFit, matchClub, matchCourses, type ScanClub, type ScanClubCourse, type ScanRead } from "../../shared/golfScorecardScan.js";

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
    cache = { clubs: clubs.map((c) => ({ id: String(c.id), name: c.name })), courses, at: now };
    return cache;
}

export interface ResolvedCard {
    club: ScanClub | null;
    front: ScanClubCourse | null;
    back: ScanClubCourse | null;
    /** 전반 · 후반을 다 맞췄을 때의 18홀 파(명부의 것) */
    pars: number[] | null;
}

export function resolveCardWith(read: ScanRead, index: Pick<ClubIndex, "clubs" | "courses">): ResolvedCard {
    const club = matchClub(read, index.clubs, (id) => clubParsFit(read, index.courses.get(id) ?? []));
    if (!club) return { club: null, front: null, back: null, pars: null };
    const [front, back] = matchCourses(read, index.courses.get(club.id) ?? []);
    return { club, front, back, pars: front && back ? [...front.pars.slice(0, 9), ...back.pars.slice(0, 9)] : null };
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
