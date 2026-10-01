/**
 * 골프 관리 · 라운드 사진 목록(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜 따로 두나: 앨범·골프장 페이지 쿼리(golfPhoto.repo)는 **보는 사람 기준**(가림·차단·공개를 거른다)이고,
 * 운영자는 그 거르기 없이 전부 — 가린 것·비공개(앨범만) 사진까지 — 봐야 한다.
 * 공개 사진은 사전 승인 없이 바로 골프장 페이지에 뜨므로(2026-09-30 오너 결정) 여기가 사후 점검 자리다.
 *
 * 규칙
 *  - '열린 이의제기'는 신고 큐와 **같은 식**이다: 가려져 있고, 마지막 처리 기록보다 나중에 낸 이의제기
 *    (SQL 은 admin.repo reportQueueCte 의 is_open, 행 표시는 lib/reportQueue isAppealOpen). 두 화면의 숫자가 어긋나지 않게.
 *  - 버튼은 행마다 서버가 정한다(availableActions) — 화면과 서버(services/moderation 의 대조)가 같은 판정을 쓴다.
 *  - 싣지 않는 것: 위치·EXIF(업로드 때 이미 걷었고 칸도 없다), 전화번호. 사진 주소는 **우리** Blob 저장소 것만 —
 *    옛 행이나 손댄 행에 남의 주소가 있으면 운영자 브라우저가 외부로 요청하지 않게 비운다(utils/blob ownBlobHost).
 *  - 시각은 SQL 에서 ISO 문자열로 만든다(칸이 시간대 없는 UTC 벽시계라, 드라이버가 Date 로 풀면 KST 기기에서 9시간 어긋난다).
 */
import { db } from "../db.js";
import { sql, type SQL } from "drizzle-orm";
import { golfRoundPhotos, golfMatchSessions, golfCoursePages, hiqMembers, hiqReports, hiqModerationActions } from "../../shared/schema.js";
import { coursePath } from "../../shared/golfCourse.js";
import { ownBlobHost } from "../utils/blob.js";
import { ACTION_LABEL, availableActions, isAppealOpen, isModerationAction, type ModerationAction } from "../lib/reportQueue.js";

export const PHOTO_FILTERS = ["public", "hidden", "appealed", "all"] as const;
export type PhotoFilter = (typeof PHOTO_FILTERS)[number];
/** 한 쪽 장수 — 폰 3칸·넓은 화면 6칸 둘 다 줄이 딱 떨어진다 */
export const PHOTO_PAGE = 48;
const MAX_LIMIT = 96;
const MAX_DAYS = 365;

export interface PhotoListQuery {
    filter: PhotoFilter;
    /** 골프장 — 슬러그를 그대로 주거나, 이름 일부(슬러그·경기에 적힌 이름·골프장 페이지 이름 어디든) */
    course: string | null;
    /** 최근 n일 안에 올린 것만 */
    days: number | null;
    offset: number;
    limit: number;
}

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const intOf = (v: unknown) => Math.floor(Number(one(v)));

/** 주소창 값(문자열·배열·없음 무엇이든)을 안전한 조건으로 */
export function parsePhotoListQuery(q: Record<string, unknown>): PhotoListQuery {
    const f = String(one(q.filter) ?? "");
    const filter = (PHOTO_FILTERS as readonly string[]).includes(f) ? (f as PhotoFilter) : "all";
    const course = String(one(q.course) ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || null;
    const d = intOf(q.days);
    const o = intOf(q.offset);
    const l = intOf(q.limit);
    return {
        filter,
        course,
        days: Number.isFinite(d) && d >= 1 ? Math.min(d, MAX_DAYS) : null,
        offset: Number.isFinite(o) && o > 0 ? Math.min(o, 100_000) : 0,
        limit: Number.isFinite(l) && l >= 1 ? Math.min(l, MAX_LIMIT) : PHOTO_PAGE,
    };
}

/** ILIKE 패턴 — 운영자가 친 %·_ 는 글자 그대로 찾는다 */
export const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

const BLOB_PUBLIC_RE = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/[^?#\s]+$/i;
/**
 * 우리 Blob 저장소의 사진 주소만 돌려준다(아니면 null). host 가 null 이면(토큰 없는 로컬) 호스트 대조는 건너뛴다
 * — utils/blob isOnOwnBlobHost 와 같은 규칙. 그래도 vercel Blob 공개 주소 모양은 늘 본다.
 */
export function ownPhotoUrl(u: unknown, host: string | null): string | null {
    if (typeof u !== "string" || u.length > 400 || !BLOB_PUBLIC_RE.test(u)) return null;
    if (!host) return u;
    try { return new URL(u).hostname.toLowerCase() === host.toLowerCase() ? u : null; } catch { return null; }
}

/** SQL 이 돌려주는 한 줄(시각은 ISO 문자열) */
export interface AdminGolfPhotoRaw {
    id: string;
    session_id: string;
    member_id: string;
    hole_no: number | null;
    url: string | null;
    thumb_url: string | null;
    width: number | null;
    height: number | null;
    is_public: boolean;
    course_slug: string | null;
    course_name: string | null;
    uploader_name: string | null;
    appeal_text: string | null;
    last_action: string | null;
    open_reports: number | string | null;
    report_count: number | string | null;
    created_at: string;
    round_at: string | null;
    hidden_at: string | null;
    appeal_at: string | null;
    last_action_at: string | null;
}

/** 운영자 화면 한 장 */
export interface AdminGolfPhoto {
    id: string;
    /** 원본(1600px)·썸네일(400px) — 우리 Blob 주소만, 아니면 null */
    url: string | null;
    thumbUrl: string | null;
    width: number | null;
    height: number | null;
    holeNo: number | null;
    course: { slug: string | null; name: string | null; path: string | null };
    round: { id: string; at: string | null };
    uploader: { id: string; name: string };
    isPublic: boolean;
    hiddenAt: string | null;
    /** 이의제기 — open 이면 판단을 기다린다(신고 큐의 '판단 필요'와 같은 식) */
    appeal: { text: string | null; at: string | null; open: boolean } | null;
    /** 안 닫힌 신고 수 · 전체 신고 수 */
    openReports: number;
    reportCount: number;
    lastAction: { action: string; label: string; at: string } | null;
    /** 이 화면이 그릴 수 있는 조치(가리기·보이기·지우기·이의제기 판정) — 서버가 조치 직전에 같은 식으로 다시 대조한다 */
    actions: ModerationAction[];
    createdAt: string;
}

/** 이 화면에서 누를 수 있는 조치. 기각·정지는 신고 큐가 맡는다(신고 사유·신고자를 봐야 하는 판단이다). */
const PHOTO_ACTIONS: readonly ModerationAction[] = ["appeal_approve", "appeal_reject", "blind", "unblind", "delete"];

export function toAdminPhoto(r: AdminGolfPhotoRaw, host: string | null): AdminGolfPhoto {
    const url = ownPhotoUrl(r.url, host);
    const hidden = !!r.hidden_at;
    const appealOpen = isAppealOpen({ appealAt: r.appeal_at, isBlinded: hidden, lastActionAt: r.last_action_at });
    const n = (v: number | string | null) => Math.max(0, Number(v) || 0);
    return {
        id: r.id,
        url,
        thumbUrl: ownPhotoUrl(r.thumb_url, host) ?? url,
        width: r.width ?? null,
        height: r.height ?? null,
        holeNo: r.hole_no ?? null,
        course: { slug: r.course_slug ?? null, name: r.course_name ?? null, path: r.course_slug ? coursePath(r.course_slug) : null },
        round: { id: r.session_id, at: r.round_at ?? null },
        uploader: { id: r.member_id, name: r.uploader_name?.trim() || "(알 수 없는 회원)" },
        isPublic: !!r.is_public,
        hiddenAt: r.hidden_at ?? null,
        appeal: r.appeal_at || r.appeal_text ? { text: r.appeal_text ?? null, at: r.appeal_at ?? null, open: appealOpen } : null,
        openReports: n(r.open_reports),
        reportCount: n(r.report_count),
        lastAction: r.last_action && r.last_action_at
            ? { action: r.last_action, label: isModerationAction(r.last_action) ? ACTION_LABEL[r.last_action] : r.last_action, at: r.last_action_at }
            : null,
        actions: availableActions({ targetType: "golf_photo", exists: true, isBlinded: hidden, appealOpen, pendingCount: 0, author: null })
            .filter((a) => PHOTO_ACTIONS.includes(a)),
        createdAt: r.created_at,
    };
}

export interface PhotoCounts { public: number; hidden: number; appealed: number; all: number }
export interface AdminGolfPhotoPage {
    items: AdminGolfPhoto[];
    counts: PhotoCounts;
    /** 지금 거르기의 전체 장수 */
    total: number;
    hasMore: boolean;
    offset: number;
    limit: number;
}

const EMPTY_COUNTS: PhotoCounts = { public: 0, hidden: 0, appealed: 0, all: 0 };

// 거르기·정렬. 이의제기는 오래 기다린 것부터(24시간 약속), 가림은 최근에 가린 것부터, 나머지는 최근에 올린 것부터.
const FILTER_SQL: Record<PhotoFilter, SQL> = {
    public: sql`WHERE is_public AND hidden_ts IS NULL`,
    hidden: sql`WHERE hidden_ts IS NOT NULL`,
    appealed: sql`WHERE appeal_open`,
    all: sql``,
};
const ORDER_SQL: Record<PhotoFilter, SQL> = {
    public: sql`ORDER BY created_ts DESC, id DESC`,
    hidden: sql`ORDER BY hidden_ts DESC, id DESC`,
    appealed: sql`ORDER BY appeal_ts ASC, id`,
    all: sql`ORDER BY created_ts DESC, id DESC`,
};
/** 시간대 없는 UTC 벽시계 칸 → ISO(…Z). 칸 이름은 이 파일의 상수만 들어온다 */
const iso = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);

function photoCte(q: PhotoListQuery): SQL {
    const conds: SQL[] = [];
    if (q.course) {
        const like = likePattern(q.course);
        conds.push(sql`(ph.course_slug = ${q.course} OR ph.course_slug ILIKE ${like} OR s.course_name ILIKE ${like} OR cp.name ILIKE ${like})`);
    }
    // created_at 은 DB 의 now() 가 세션 시간대(GMT)로 적은 벽시계다 — 같은 식으로 잰다(JS Date 를 넣지 않는다)
    if (q.days) conds.push(sql`ph.created_at >= now()::timestamp - make_interval(days => ${q.days}::int)`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    // appeal_open = admin.repo reportQueueCte 의 is_open 에서 이의제기 쪽과 같은 식(신고 큐의 '판단 필요'와 같은 건을 센다)
    return sql`
        WITH p AS (
            SELECT ph.id, ph.session_id, ph.member_id, ph.hole_no, ph.url, ph.thumb_url, ph.width, ph.height,
                   ph.is_public, ph.course_slug, ph.appeal_text,
                   ph.created_at AS created_ts, ph.hidden_at AS hidden_ts, ph.appeal_at AS appeal_ts,
                   COALESCE(cp.name, s.course_name) AS course_name,
                   s.created_at AS round_ts,
                   m.name AS uploader_name,
                   la.action AS last_action, la.created_at AS last_action_ts,
                   COALESCE(rp.pending, 0) AS open_reports, COALESCE(rp.total, 0) AS report_count
            FROM ${golfRoundPhotos} ph
            LEFT JOIN ${golfMatchSessions} s ON s.id = ph.session_id
            LEFT JOIN ${golfCoursePages} cp ON cp.slug = ph.course_slug
            LEFT JOIN ${hiqMembers} m ON m.id = ph.member_id
            LEFT JOIN LATERAL (
                SELECT a.action, a.created_at FROM ${hiqModerationActions} a
                WHERE a.target_type = 'golf_photo' AND a.target_id = ph.id
                ORDER BY a.created_at DESC LIMIT 1
            ) la ON true
            LEFT JOIN LATERAL (
                SELECT count(*)::int AS total, count(*) FILTER (WHERE r.status = 'pending')::int AS pending
                FROM ${hiqReports} r
                WHERE r.target_type = 'golf_photo' AND r.target_id = ph.id
            ) rp ON true
            ${where}
        ), q AS (
            SELECT p.*,
                   (p.hidden_ts IS NOT NULL AND p.appeal_ts IS NOT NULL
                    AND (p.last_action_ts IS NULL OR p.appeal_ts > p.last_action_ts)) AS appeal_open
            FROM p
        )`;
}

const rowsOf = (r: any): any[] => r?.rows ?? r ?? [];
const isUndefinedTable = (e: any) =>
    (e?.code ?? e?.cause?.code) === "42P01" || /relation "golf_round_photos" does not exist/.test(String(e?.message ?? ""));

/** 운영자 목록 한 쪽 + 거르기별 장수(골프장·기간 조건은 숫자에도 같이 걸린다) */
export async function listAdminGolfPhotos(q: PhotoListQuery): Promise<AdminGolfPhotoPage> {
    try {
        const [raw, countRows] = await Promise.all([
            db.execute(sql`${photoCte(q)}
                SELECT id, session_id, member_id, hole_no, url, thumb_url, width, height, is_public, course_slug, course_name,
                       uploader_name, appeal_text, last_action, open_reports, report_count,
                       ${iso("created_ts")} AS created_at, ${iso("round_ts")} AS round_at, ${iso("hidden_ts")} AS hidden_at,
                       ${iso("appeal_ts")} AS appeal_at, ${iso("last_action_ts")} AS last_action_at
                FROM q ${FILTER_SQL[q.filter]} ${ORDER_SQL[q.filter]}
                LIMIT ${q.limit + 1} OFFSET ${q.offset}`).then(rowsOf),
            db.execute(sql`${photoCte(q)}
                SELECT count(*) FILTER (WHERE is_public AND hidden_ts IS NULL)::int AS "public",
                       count(*) FILTER (WHERE hidden_ts IS NOT NULL)::int AS "hidden",
                       count(*) FILTER (WHERE appeal_open)::int AS "appealed",
                       count(*)::int AS "all"
                FROM q`).then(rowsOf),
        ]);
        const c = countRows[0] ?? {};
        const counts: PhotoCounts = {
            public: Number(c.public ?? 0), hidden: Number(c.hidden ?? 0), appealed: Number(c.appealed ?? 0), all: Number(c.all ?? 0),
        };
        const host = ownBlobHost();
        return {
            items: (raw as AdminGolfPhotoRaw[]).slice(0, q.limit).map((r) => toAdminPhoto(r, host)),
            counts,
            total: counts[q.filter],
            hasMore: raw.length > q.limit,
            offset: q.offset,
            limit: q.limit,
        };
    } catch (e) {
        // 표는 첫 업로드가 만든다(golfPhoto.repo ensureTable) — 아직 없으면 빈 목록
        if (isUndefinedTable(e)) return { items: [], counts: EMPTY_COUNTS, total: 0, hasMore: false, offset: q.offset, limit: q.limit };
        throw e;
    }
}
