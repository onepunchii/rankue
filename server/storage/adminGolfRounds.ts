/**
 * 골프 관리 · 라운드 저장소(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜 따로 두나: 랭큐매치 라운드(golf_match_sessions)는 지금까지 운영자가 볼 곳이 없었다. 9/9 에 멈춘 방 넷
 * (대기 둘·진행 중 둘)이 그대로 남아 있고, 잘못 적은 라운드가 평균·등급·여권 도장에 들어가도 지울 길이 없었다.
 * 여기서 목록·상세를 읽고, 라우트(routes/modules/adminGolf/rounds.ts)가 세 가지 조치를 한다.
 *  - 접기: 대기·진행 중 방만. 사용자 '방 접기'와 같은 storage.golf.abandonGolfMatchSession(기록을 쓰지 않는다).
 *  - 오래된 대기방 정리: **24시간 넘은 대기방만**. 진행 중 방은 점수를 들고 있어 일괄로는 절대 건드리지 않는다.
 *  - 기록 무효화: 끝난 라운드의 골프 기록(hiq_game_history)만 지우고 평균·등급을 다시 센다. 경기 행은 남긴다.
 *
 * 시각: timestamp 칸은 UTC 벽시계로 저장된다(시간대 없음). raw SQL 에 JS Date 를 넣거나 raw 결과를 new Date 로 읽으면
 * 한국 시간대 기기에서 9시간 어긋난다 — 기준 시각은 DB 의 now() 로 재고, 내보내는 시각은 to_char 로 'Z' ISO 를 만든다.
 * 응답에 전화번호·핀 번호는 싣지 않는다(이름만).
 */
import { db } from "../db.js";
import {
    golfMatchSessions, golfRoundCheckins, hiqCommunityPosts, hiqGameHistory, hiqMembers,
} from "../../shared/schema.js";
import { and, asc, eq, inArray, sql, type SQL } from "drizzle-orm";
import {
    HOLES, isCompleteRound, isGuestId, isValidStroke, minimalTransfers, roundTotals, sanitizeScores,
} from "../../shared/golfMatch.js";
import { sessionOnSite, type OnSiteBucket, type VerdictReason } from "../../shared/golfOnSite.js";
import { isUndefinedCheckinTable, realMemberIds } from "./golfCheckins.js";
import { courseCoordsFor } from "./golf.repo.js";

export type RoundStatus = "waiting" | "playing" | "finished" | "abandoned";
export const ROUND_STATUSES: readonly RoundStatus[] = ["waiting", "playing", "finished", "abandoned"];

/** 대기방 핀이 사는 시간(golf.repo PIN_TTL_MS) — 이걸 넘긴 대기방은 핀으로 못 들어오니 멈춘 방이다 */
export const STALE_WAITING_HOURS = 6;
/** 진행 중 방을 '이어하기'로 보는 시간(golf.repo ACTIVE_TTL_MS) — 이만큼 손대지 않았으면 멈춘 방 */
export const STALE_PLAYING_HOURS = 12;
/** 일괄 정리는 더 보수적으로: 하루 넘게 시작하지 않은 대기방만 */
export const CLEANUP_WAITING_HOURS = 24;

/**
 * 골프 통계 칸의 스키마 기본값(shared/schema.ts hiqMembers). updateGolfStats 는 공식 라운드가 하나도 없으면
 * 아무것도 쓰지 않고 돌아간다 — 무효화로 마지막 공식 라운드가 빠진 회원은 옛 평균이 그대로 남는다. 그때 이 값으로 되돌린다.
 */
export const GOLF_STAT_DEFAULTS = { golfAvgScore: 0, golfBestScore: 0, golfGrade: null, totalGolfGames: 0 } as const;

// ---------------------------------------------------------------------------------------------
// 순수 도우미(테스트: adminGolfRounds.test.ts)
// ---------------------------------------------------------------------------------------------

const ms = (v: Date | string | number | null | undefined): number | null => {
    if (v == null) return null;
    const t = v instanceof Date ? v.getTime() : typeof v === "number" ? v : Date.parse(v);
    return Number.isFinite(t) ? t : null;
};

/** 멈춘 방인가 — 대기방은 만든 지 6시간, 진행 중 방은 마지막으로 손댄 지 12시간. 목록 SQL(STALE_SQL)과 같은 규칙. */
export function staleKindOf(
    r: { status: string; createdAt: Date | string | null | undefined; updatedAt: Date | string | null | undefined },
    now = Date.now(),
): "waiting" | "playing" | null {
    if (r.status === "waiting") {
        const c = ms(r.createdAt);
        return c != null && c < now - STALE_WAITING_HOURS * 3600_000 ? "waiting" : null;
    }
    if (r.status === "playing") {
        const u = ms(r.updatedAt);
        return u != null && u < now - STALE_PLAYING_HOURS * 3600_000 ? "playing" : null;
    }
    return null;
}

const isGuestPlayer = (p: any) => isGuestId(String(p?.memberId ?? "")) || p?.isGuest === true;

/** 참가자 수(회원·게스트)와 적힌 홀 수(누구든 한 명이라도 타수를 적은 홀) */
export function summarizePlayers(players: unknown): { members: number; guests: number; holesEntered: number } {
    const list = Array.isArray(players) ? players : [];
    let members = 0, guests = 0;
    const entered = new Array<boolean>(HOLES).fill(false);
    for (const p of list) {
        if (isGuestPlayer(p)) guests++; else members++;
        const sc = Array.isArray(p?.scores) ? p.scores : [];
        for (let i = 0; i < HOLES; i++) if (isValidStroke(Number(sc[i]))) entered[i] = true;
    }
    return { members, guests, holesEntered: entered.filter(Boolean).length };
}

/**
 * 끝난 라운드의 현장 인증 = 그 경기 기록(hiq_game_history.on_site). 동반자 규칙 때문에 한 경기의 기록은 같은 값을 가진다.
 * onsite(인증) · unverified(미인증 — 점수·평균에는 안 들어간다, 10/1 오너 결정) · legacy(규칙 전 옛 기록, 인정) · none(기록 없음)
 */
export type HistoryVerdict = "onsite" | "unverified" | "legacy" | "none";
export function historyVerdict(c: { onsite: number; unverified: number; legacy: number }): HistoryVerdict {
    if (c.onsite > 0) return "onsite";
    if (c.unverified > 0) return "unverified";
    if (c.legacy > 0) return "legacy";
    return "none";
}

/** 아직 안 끝난(또는 접은) 라운드의 확인 요약 — 그 경기 실제 회원의 확인만 센다(shared sessionOnSite 와 같은 범위) */
export type CheckinVerdict = "verified" | "tried" | "none";
export function checkinVerdict(
    checkins: readonly { memberId: string; verified: boolean; n?: number }[],
    memberIds: readonly string[],
): { verdict: CheckinVerdict; total: number; verified: number } {
    const members = new Set(memberIds);
    let total = 0, verified = 0;
    for (const c of checkins) {
        if (!members.has(c.memberId)) continue;
        const n = c.n ?? 1;
        total += n;
        if (c.verified) verified += n;
    }
    return { verdict: verified > 0 ? "verified" : total > 0 ? "tried" : "none", total, verified };
}

export interface RoundListFilters {
    status: RoundStatus | null;
    stale: boolean;
    /** 끝난·접은 라운드를 이 날수 안에 만든 것만(0 = 전부). 대기·진행 중 방은 날짜와 무관하게 늘 보인다 */
    days: number;
    q: string;
    limit: number;
    offset: number;
}

const intIn = (v: unknown, def: number, min: number, max: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def;
};

/** 쿼리 문자열 → 거르기. 모르는 값은 버린다(거르지 않음). */
export function parseListQuery(q: Record<string, unknown>): RoundListFilters {
    const status = typeof q.status === "string" && (ROUND_STATUSES as readonly string[]).includes(q.status) ? q.status as RoundStatus : null;
    return {
        status,
        stale: q.stale === "1" || q.stale === "true" || q.stale === true,
        days: intIn(q.days, 0, 0, 3650),
        q: typeof q.q === "string" ? q.q.trim().slice(0, 60) : "",
        limit: intIn(q.limit, 30, 1, 100),
        offset: intIn(q.offset, 0, 0, 100_000),
    };
}

/** LIKE 패턴 안의 %·_·\ 를 글자 그대로 */
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

/** 한 사람의 점수판 줄 — 전반(OUT)·후반(IN)·합계·파 대비. 안 적은 홀은 0. */
export function scorecardOf(rawScores: unknown, pars: readonly number[]) {
    const scores = sanitizeScores(rawScores) ?? new Array<number>(HOLES).fill(0);
    const half = (from: number) => scores.slice(from, from + 9).reduce((s, v) => s + (isValidStroke(v) ? v : 0), 0);
    const t = roundTotals(scores, pars);
    return { scores, out: half(0), in: half(9), strokes: t.strokes, holesPlayed: t.holesPlayed, relative: t.relative, complete: isCompleteRound(scores) };
}

export interface MemberRecount { reset: boolean; error: string | null }
/**
 * 무효화 뒤 평균·등급 다시 세기. 한 명씩, 실패해도 다음 사람으로 간다.
 * recompute(= storage.golf.updateGolfStats)가 null 이면 공식 라운드가 하나도 안 남았다는 뜻 — 옛 평균이 그대로 남지 않게 기본값으로 되돌린다.
 */
export async function recountMembers(
    ids: readonly string[],
    recompute: (memberId: string) => Promise<unknown>,
    resetIfNoOfficial: (memberId: string) => Promise<boolean>,
): Promise<Map<string, MemberRecount>> {
    const out = new Map<string, MemberRecount>();
    for (const id of new Set(ids)) {
        try {
            const r = await recompute(id);
            out.set(id, { reset: r == null ? await resetIfNoOfficial(id) : false, error: null });
        } catch (e) {
            out.set(id, { reset: false, error: (e as Error)?.message || String(e) });
        }
    }
    return out;
}

// ---------------------------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------------------------

/** UTC 벽시계 '지금' — timestamp 칸과 같은 기준 */
const UTC_NOW = sql`(now() at time zone 'utc')`;
const iso = (col: SQL) => sql`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`;
/** staleKindOf 와 같은 규칙(SQL). 별칭 s = golf_match_sessions */
const STALE_SQL = sql`((s.status = 'waiting' and s.created_at < ${UTC_NOW} - make_interval(hours => ${STALE_WAITING_HOURS}::int))
    or (s.status = 'playing' and s.updated_at < ${UTC_NOW} - make_interval(hours => ${STALE_PLAYING_HOURS}::int)))`;

const isUndefinedPhotoTable = (e: any) =>
    (e?.code ?? e?.cause?.code) === "42P01" || /relation "golf_round_photos" does not exist/.test(String(e?.message ?? ""));

/** 기간·검색 거르기(상태 칩 숫자도 같은 조건으로 센다). 별칭 s = 경기, m = 방장 */
function baseWhere(f: RoundListFilters): SQL {
    const parts: SQL[] = [sql`true`];
    if (f.days > 0) {
        parts.push(sql`(s.status in ('waiting', 'playing') or s.created_at >= ${UTC_NOW} - make_interval(days => ${f.days}::int))`);
    }
    if (f.q) {
        const like = `%${escapeLike(f.q)}%`;
        parts.push(sql`(s.course_name ilike ${like} or s.front_course_name ilike ${like} or s.back_course_name ilike ${like}
            or m.name ilike ${like} or s.id::text = ${f.q.toLowerCase()}
            or exists (select 1 from jsonb_array_elements(s.players) p where p->>'name' ilike ${like}))`);
    }
    return sql.join(parts, sql` and `);
}

export type OnSiteView =
    | { source: "history"; verdict: HistoryVerdict }
    | { source: "checkins"; verdict: CheckinVerdict; total: number; verified: number };

export interface AdminRoundRow {
    id: string;
    status: RoundStatus;
    stale: "waiting" | "playing" | null;
    courseId: string | null;
    courseName: string | null;
    frontCourseName: string | null;
    backCourseName: string | null;
    gameMode: string;
    solo: boolean;
    host: { id: string; name: string | null };
    members: number;
    guests: number;
    holesEntered: number;
    createdAt: string;
    startedAt: string | null;
    updatedAt: string;
    finishedAt: string | null;
    onSite: OnSiteView;
    historyCount: number;
}

export interface RoundCounts { total: number; waiting: number; playing: number; finished: number; abandoned: number; stale: number }

export async function listRounds(f: RoundListFilters): Promise<{ items: AdminRoundRow[]; total: number; hasMore: boolean }> {
    const where = [baseWhere(f)];
    if (f.status) where.push(sql`s.status = ${f.status}`);
    if (f.stale) where.push(STALE_SQL);

    const rows = (await db.execute(sql`
        select s.id, s.status, s.course_id, s.course_name, s.front_course_name, s.back_course_name,
               s.game_mode, s.stroke_mode, s.host_id, m.name as host_name, s.players,
               ${iso(sql`s.created_at`)} as created_at, ${iso(sql`s.started_at`)} as started_at,
               ${iso(sql`s.updated_at`)} as updated_at, ${iso(sql`s.finished_at`)} as finished_at,
               ${STALE_SQL} as is_stale,
               (count(*) over ())::int as total_count
        from golf_match_sessions s
        left join hiq_members m on m.id = s.host_id
        where ${sql.join(where, sql` and `)}
        order by s.updated_at desc, s.id desc
        limit ${f.limit + 1} offset ${f.offset}`)).rows as Record<string, any>[];

    const page = rows.slice(0, f.limit);
    const ids = page.map((r) => String(r.id));
    const [hist, checks] = await Promise.all([historyCounts(ids), checkinCounts(ids)]);

    const items: AdminRoundRow[] = page.map((r) => {
        const id = String(r.id);
        const status = r.status as RoundStatus;
        const players = Array.isArray(r.players) ? r.players : [];
        const sum = summarizePlayers(players);
        const h = hist.get(id) ?? { n: 0, onsite: 0, unverified: 0, legacy: 0 };
        const onSite: OnSiteView = status === "finished"
            ? { source: "history", verdict: historyVerdict(h) }
            : { source: "checkins", ...checkinVerdict(checks.get(id) ?? [], realMemberIds(players)) };
        return {
            id,
            status,
            stale: r.is_stale ? (status === "waiting" ? "waiting" : status === "playing" ? "playing" : null) : null,
            courseId: r.course_id ?? null,
            courseName: r.course_name ?? null,
            frontCourseName: r.front_course_name ?? null,
            backCourseName: r.back_course_name ?? null,
            gameMode: String(r.game_mode ?? "stroke"),
            solo: r.stroke_mode === "solo",
            host: { id: String(r.host_id), name: r.host_name ?? null },
            members: sum.members,
            guests: sum.guests,
            holesEntered: sum.holesEntered,
            createdAt: String(r.created_at),
            startedAt: r.started_at ?? null,
            updatedAt: String(r.updated_at),
            finishedAt: r.finished_at ?? null,
            onSite,
            historyCount: h.n,
        };
    });
    return { items, total: rows.length > 0 ? Number(rows[0].total_count) : 0, hasMore: rows.length > f.limit };
}

/** 상태 칩 숫자 — 기간·검색만 건 같은 조건 */
export async function roundCounts(f: RoundListFilters): Promise<RoundCounts> {
    const [r] = (await db.execute(sql`
        select count(*)::int as total,
               count(*) filter (where s.status = 'waiting')::int as waiting,
               count(*) filter (where s.status = 'playing')::int as playing,
               count(*) filter (where s.status = 'finished')::int as finished,
               count(*) filter (where s.status = 'abandoned')::int as abandoned,
               count(*) filter (where ${STALE_SQL})::int as stale
        from golf_match_sessions s
        left join hiq_members m on m.id = s.host_id
        where ${baseWhere(f)}`)).rows as Record<string, unknown>[];
    const n = (k: string) => Number(r?.[k] ?? 0);
    return { total: n("total"), waiting: n("waiting"), playing: n("playing"), finished: n("finished"), abandoned: n("abandoned"), stale: n("stale") };
}

/** 경기별 골프 기록 수와 현장 인증 갈래(한 번에 — 경기마다 따로 읽지 않는다) */
async function historyCounts(ids: readonly string[]) {
    const out = new Map<string, { n: number; onsite: number; unverified: number; legacy: number }>();
    if (ids.length === 0) return out;
    const rows = (await db.execute(sql`
        select golf_session_id as id, count(*)::int as n,
               count(*) filter (where on_site is true)::int as onsite,
               count(*) filter (where on_site is false)::int as unverified,
               count(*) filter (where on_site is null)::int as legacy
        from hiq_game_history
        where sport_category = 'GOLF' and golf_session_id in ${ids}
        group by golf_session_id`)).rows as Record<string, unknown>[];
    for (const r of rows) out.set(String(r.id), { n: Number(r.n), onsite: Number(r.onsite), unverified: Number(r.unverified), legacy: Number(r.legacy) });
    return out;
}

/** 경기별 확인 수(회원·인증 여부별). 확인 표가 아직 없으면 빈 값 */
async function checkinCounts(ids: readonly string[]) {
    const out = new Map<string, { memberId: string; verified: boolean; n: number }[]>();
    if (ids.length === 0) return out;
    try {
        const rows = (await db.execute(sql`
            select session_id as id, member_id, verified, count(*)::int as n
            from golf_round_checkins
            where session_id in ${ids}
            group by session_id, member_id, verified`)).rows as Record<string, unknown>[];
        for (const r of rows) {
            const k = String(r.id);
            const arr = out.get(k) ?? [];
            arr.push({ memberId: String(r.member_id), verified: !!r.verified, n: Number(r.n) });
            out.set(k, arr);
        }
    } catch (e) {
        if (!isUndefinedCheckinTable(e)) throw e;
    }
    return out;
}

export interface AdminRoundDetail {
    id: string;
    status: RoundStatus;
    stale: "waiting" | "playing" | null;
    courseId: string | null;
    courseName: string | null;
    frontCourseName: string | null;
    backCourseName: string | null;
    gameMode: string;
    solo: boolean;
    currentHole: number;
    host: { id: string; name: string | null };
    createdAt: string | null;
    startedAt: string | null;
    updatedAt: string | null;
    finishedAt: string | null;
    holesDoneAt: string | null;
    pars: number[];
    parKnown: boolean[];
    players: {
        memberId: string; name: string; isGuest: boolean; isMember: boolean; hasHistory: boolean;
        scores: number[]; out: number; in: number; strokes: number; holesPlayed: number; relative: number; complete: boolean;
    }[];
    rules: { stake: number; useDouble: boolean; doublingMode: string; birdieAmount: number; eagleAmount: number };
    settlement: null | {
        totals: { memberId: string; name: string; amount: number }[];
        transfers: { from: string; to: string; amount: number }[];
        lines: number;
    };
    onSite: {
        courseKnown: boolean;
        /** 지금 확인들로 다시 낸 판정(끝난 경기는 이유 설명용 — 진짜 답은 recorded) */
        verdict: { onSite: boolean; reason: VerdictReason };
        recorded: HistoryVerdict | null;
    };
    checkins: { memberId: string; name: string | null; verified: boolean; bucket: OnSiteBucket | string; source: string; at: string }[];
    photos: { total: number; public: number; hidden: number };
    history: { id: string; memberId: string; name: string | null; score: number; onSite: boolean | null; isWinner: boolean; at: string }[];
    /** 18홀을 다 적은 실제 회원이 있는데 끝난 경기에 기록이 하나도 없다 — 무효화했거나 회원이 탈퇴한 경우 */
    missingHistory: boolean;
    actions: { abandon: boolean; void: boolean };
}

const isoOf = (v: Date | string | null | undefined): string | null => {
    const t = ms(v);
    return t == null ? null : new Date(t).toISOString();
};

/**
 * 상세 — session 은 storage.golf.getGolfMatchSession 의 결과(파 포함, drizzle 이 시각을 Date 로 바꿔 준다).
 * 남의 '이 홀 기록'(퍼팅 등)·사진 주소·핀은 싣지 않는다.
 */
export async function roundDetail(session: any): Promise<AdminRoundDetail> {
    const id = String(session.id);
    const players = (Array.isArray(session.players) ? session.players : []) as any[];
    const pars: number[] = Array.isArray(session.pars) ? session.pars : [];
    const parKnown: boolean[] = Array.isArray(session.parKnown) ? session.parKnown : [];
    const members = realMemberIds(players);

    const [hostRow, history, checkins, photos, course] = await Promise.all([
        db.select({ name: hiqMembers.name }).from(hiqMembers).where(eq(hiqMembers.id, session.hostId)).limit(1),
        db.select({
            id: hiqGameHistory.id, memberId: hiqGameHistory.memberId, name: hiqMembers.name, score: hiqGameHistory.score,
            onSite: hiqGameHistory.onSite, isWinner: hiqGameHistory.isWinner, createdAt: hiqGameHistory.createdAt,
        }).from(hiqGameHistory)
            .leftJoin(hiqMembers, eq(hiqMembers.id, hiqGameHistory.memberId))
            .where(and(eq(hiqGameHistory.golfSessionId, id), eq(hiqGameHistory.sportCategory, "GOLF")))
            .orderBy(asc(hiqGameHistory.score)) as Promise<any[]>,
        checkinsWithNames(id),
        photoCounts(id),
        courseCoordsFor(session.courseId, session.courseName).catch(() => null),
    ]);

    const recordedIds = new Set(history.map((h) => String(h.memberId)));
    const nameOf = new Map(players.map((p) => [String(p?.memberId ?? ""), String(p?.name ?? "")]));
    const cards = players.map((p) => {
        const memberId = String(p?.memberId ?? "");
        const card = scorecardOf(p?.scores, pars);
        return {
            memberId,
            name: String(p?.name ?? "") || "이름 없음",
            isGuest: isGuestPlayer(p),
            isMember: members.includes(memberId),
            hasHistory: recordedIds.has(memberId),
            ...card,
        };
    });

    const stl = session.settlement && typeof session.settlement === "object" ? session.settlement as { totals?: Record<string, number>; transactions?: unknown[] } : null;
    const totals = stl?.totals && typeof stl.totals === "object" ? stl.totals : null;
    const settlement = totals ? {
        totals: Object.entries(totals).map(([memberId, amount]) => ({ memberId, name: nameOf.get(memberId) || "?", amount: Number(amount) || 0 })),
        transfers: minimalTransfers(totals).map((t) => ({ from: nameOf.get(t.fromId) || "?", to: nameOf.get(t.toId) || "?", amount: t.amount })),
        lines: Array.isArray(stl?.transactions) ? stl!.transactions!.length : 0,
    } : null;

    const hv = session.status === "finished"
        ? historyVerdict({
            onsite: history.filter((h) => h.onSite === true).length,
            unverified: history.filter((h) => h.onSite === false).length,
            legacy: history.filter((h) => h.onSite == null).length,
        })
        : null;

    return {
        id,
        status: session.status,
        stale: staleKindOf(session),
        courseId: session.courseId ?? null,
        courseName: session.courseName ?? null,
        frontCourseName: session.frontCourseName ?? null,
        backCourseName: session.backCourseName ?? null,
        gameMode: String(session.gameMode ?? "stroke"),
        solo: session.strokeMode === "solo",
        currentHole: Number(session.currentHole ?? 1),
        host: { id: String(session.hostId), name: hostRow[0]?.name ?? null },
        createdAt: isoOf(session.createdAt),
        startedAt: isoOf(session.startedAt),
        updatedAt: isoOf(session.updatedAt),
        finishedAt: isoOf(session.finishedAt),
        holesDoneAt: isoOf(session.holesDoneAt),
        pars,
        parKnown,
        players: cards,
        rules: {
            stake: Number(session.stake ?? 0), useDouble: !!session.useDouble, doublingMode: String(session.doublingMode ?? "none"),
            birdieAmount: Number(session.birdieAmount ?? 0), eagleAmount: Number(session.eagleAmount ?? 0),
        },
        settlement,
        onSite: {
            courseKnown: !!course,
            verdict: sessionOnSite({
                checkins,
                memberIds: members,
                courseKnown: !!course,
                startedAt: session.startedAt ?? session.createdAt,
                holesDoneAt: session.holesDoneAt ?? session.finishedAt,
            }),
            recorded: hv,
        },
        checkins: checkins.map((c) => ({ memberId: c.memberId, name: c.name, verified: c.verified, bucket: c.bucket, source: c.source, at: isoOf(c.createdAt) ?? "" })),
        photos,
        history: history.map((h) => ({
            id: String(h.id), memberId: String(h.memberId), name: h.name ?? null, score: Number(h.score),
            onSite: h.onSite ?? null, isWinner: !!h.isWinner, at: isoOf(h.createdAt) ?? "",
        })),
        missingHistory: session.status === "finished" && history.length === 0 && cards.some((c) => c.isMember && c.complete),
        actions: {
            abandon: session.status === "waiting" || session.status === "playing",
            void: session.status === "finished" && history.length > 0,
        },
    };
}

async function checkinsWithNames(sessionId: string): Promise<{ memberId: string; name: string | null; verified: boolean; bucket: string; source: string; createdAt: Date }[]> {
    try {
        return await db.select({
            memberId: golfRoundCheckins.memberId, name: hiqMembers.name, verified: golfRoundCheckins.verified,
            bucket: golfRoundCheckins.distanceBucket, source: golfRoundCheckins.source, createdAt: golfRoundCheckins.createdAt,
        }).from(golfRoundCheckins)
            .leftJoin(hiqMembers, eq(hiqMembers.id, golfRoundCheckins.memberId))
            .where(eq(golfRoundCheckins.sessionId, sessionId))
            .orderBy(asc(golfRoundCheckins.createdAt))
            .limit(200);
    } catch (e) {
        if (isUndefinedCheckinTable(e)) return [];
        throw e;
    }
}

async function photoCounts(sessionId: string): Promise<{ total: number; public: number; hidden: number }> {
    try {
        const [r] = (await db.execute(sql`
            select count(*)::int as total,
                   count(*) filter (where is_public)::int as pub,
                   count(*) filter (where hidden_at is not null)::int as hidden
            from golf_round_photos where session_id = ${sessionId}`)).rows as Record<string, unknown>[];
        return { total: Number(r?.total ?? 0), public: Number(r?.pub ?? 0), hidden: Number(r?.hidden ?? 0) };
    } catch (e) {
        if (isUndefinedPhotoTable(e)) return { total: 0, public: 0, hidden: 0 };
        throw e;
    }
}

// --- 오래된 대기방 정리 ---

export interface StaleWaitingRow { id: string; courseName: string | null; hostName: string | null; players: number; createdAt: string | null }

const staleWaitingWhere = (ids?: readonly string[]) => and(
    eq(golfMatchSessions.status, "waiting"),
    sql`${golfMatchSessions.createdAt} < ${UTC_NOW} - make_interval(hours => ${CLEANUP_WAITING_HOURS}::int)`,
    ids ? inArray(golfMatchSessions.id, [...ids]) : undefined,
);

/** 정리 대상(미리 보기). ids 를 주면 그중 아직 대상인 것만 */
export async function staleWaitingRounds(ids?: readonly string[]): Promise<StaleWaitingRow[]> {
    if (ids && ids.length === 0) return [];
    const rows = await db.select({
        id: golfMatchSessions.id, courseName: golfMatchSessions.courseName, hostName: hiqMembers.name,
        players: golfMatchSessions.players, createdAt: golfMatchSessions.createdAt,
    }).from(golfMatchSessions)
        .leftJoin(hiqMembers, eq(hiqMembers.id, golfMatchSessions.hostId))
        .where(staleWaitingWhere(ids))
        .orderBy(asc(golfMatchSessions.createdAt))
        .limit(500);
    return rows.map((r: any) => ({
        id: String(r.id), courseName: r.courseName ?? null, hostName: r.hostName ?? null,
        players: Array.isArray(r.players) ? r.players.length : 0, createdAt: isoOf(r.createdAt),
    }));
}

/**
 * 대기방을 접는다 — 조건(대기 + 24시간)을 **UPDATE 안에서** 다시 건다. 미리 보기와 확인 사이에 누가 방을 시작했으면
 * 그 방은 이미 '진행 중'이라 건드리지 않는다(방 하나씩 abandonGolfMatchSession 을 부르면 진행 중 방도 접힌다).
 */
export async function abandonStaleWaiting(ids?: readonly string[]): Promise<string[]> {
    if (ids && ids.length === 0) return [];
    const rows = await db.update(golfMatchSessions)
        .set({ status: "abandoned", updatedAt: new Date() })
        .where(staleWaitingWhere(ids))
        .returning({ id: golfMatchSessions.id });
    return rows.map((r: { id: string }) => String(r.id));
}

// --- 기록 무효화 ---

export interface GolfStatSnap { name: string; avg: number | null; best: number | null; grade: string | null; rounds: number }

/** 회원의 골프 통계 칸(평균·베스트·등급·공식 라운드 수) */
export async function readGolfStats(ids: readonly string[], runner: any = db): Promise<Map<string, GolfStatSnap>> {
    const out = new Map<string, GolfStatSnap>();
    if (ids.length === 0) return out;
    const rows = await runner.select({
        id: hiqMembers.id, name: hiqMembers.name, avg: hiqMembers.golfAvgScore, best: hiqMembers.golfBestScore,
        grade: hiqMembers.golfGrade, rounds: hiqMembers.totalGolfGames,
    }).from(hiqMembers).where(inArray(hiqMembers.id, [...ids]));
    for (const r of rows) {
        out.set(String(r.id), {
            name: r.name ?? "", avg: r.avg == null ? null : Number(r.avg), best: r.best == null ? null : Number(r.best),
            grade: r.grade ?? null, rounds: Number(r.rounds ?? 0),
        });
    }
    return out;
}

export type DeleteRoundHistoryResult =
    | { ok: false; reason: "not-found" }
    | { ok: false; reason: "not-finished"; status: string }
    | {
        ok: true;
        /** 이번에 기록이 지워진 회원 */
        removed: string[];
        /** 평균을 다시 셀 회원 — 보통 removed. 지울 기록이 없으면(다시 누름) 그 경기의 실제 회원 전부 */
        targets: string[];
        deletedRows: number;
        detachedPosts: number;
        before: Map<string, GolfStatSnap>;
    };

/**
 * 끝난 경기의 골프 기록을 **한 트랜잭션으로** 지운다. 경기 행 → 기록 행 순서로 잠근다
 * (끝내기·늦은 현장 확인과 같은 순서 — 서로 기다릴 뿐 엇갈려 막히지 않는다). 경기 행 자체는 그대로 둔다.
 * 커뮤니티 자랑글이 이 기록을 카드로 물고 있으면(외래키) 지우기가 막힌다 — 연결만 끊는다. 카드 내용은 글에 따로 찍혀 있어 그대로 보인다.
 * 평균 다시 세기(updateGolfStats)는 다른 연결로 읽으므로 **커밋 뒤에** 부른다(recountMembers).
 */
export async function deleteRoundHistory(sessionId: string): Promise<DeleteRoundHistoryResult> {
    return await db.transaction(async (tx: any) => {
        const [s] = await tx.select({ id: golfMatchSessions.id, status: golfMatchSessions.status, players: golfMatchSessions.players })
            .from(golfMatchSessions).where(eq(golfMatchSessions.id, sessionId)).for("update");
        if (!s) return { ok: false, reason: "not-found" } as const;
        if (s.status !== "finished") return { ok: false, reason: "not-finished", status: String(s.status) } as const;

        const rows: { id: string; memberId: string }[] = await tx.select({ id: hiqGameHistory.id, memberId: hiqGameHistory.memberId })
            .from(hiqGameHistory)
            .where(and(eq(hiqGameHistory.golfSessionId, sessionId), eq(hiqGameHistory.sportCategory, "GOLF")))
            .for("update");
        const ids = rows.map((r) => r.id);
        const removed = [...new Set(rows.map((r) => String(r.memberId)))];
        const targets = removed.length > 0 ? removed : realMemberIds(s.players);
        const before = await readGolfStats(targets, tx);

        let detachedPosts = 0;
        if (ids.length > 0) {
            const detached = await tx.update(hiqCommunityPosts).set({ historyId: null })
                .where(inArray(hiqCommunityPosts.historyId, ids))
                .returning({ id: hiqCommunityPosts.id });
            detachedPosts = detached.length;
            await tx.delete(hiqGameHistory).where(inArray(hiqGameHistory.id, ids));
        }
        return { ok: true, removed, targets, deletedRows: ids.length, detachedPosts, before } as const;
    });
}

/**
 * 공식 라운드(점수 > 0 이고 미인증이 아닌 것 — shared countsOnSite)가 하나도 없을 때만 골프 통계를 스키마 기본값으로.
 * 조건을 UPDATE 안에 다시 거는 이유: 그 사이에 이 회원이 라운드를 끝내 새 평균이 들어왔으면 덮어쓰지 않게.
 */
export async function resetGolfStatsIfNoOfficial(memberId: string): Promise<boolean> {
    const rows = await db.update(hiqMembers)
        .set({ ...GOLF_STAT_DEFAULTS, updatedAt: new Date() })
        .where(and(
            eq(hiqMembers.id, memberId),
            sql`not exists (select 1 from hiq_game_history h
                where h.member_id = ${hiqMembers.id} and h.sport_category = 'GOLF' and h.score > 0 and h.on_site is distinct from false)`,
        ))
        .returning({ id: hiqMembers.id });
    return rows.length > 0;
}
