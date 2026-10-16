/**
 * 어드민 › 낚시 › 조과 검수 목록(2026-10-17 어드민 전수 조사 — 공개 전 필수: "랭킹 썸네일과 자유 입력 어종이 누구에게나 보인다").
 * 라운드 사진(storage/adminGolfPhotos)과 **같은 모양**으로 준다 — 화면은 GolfPhotosView kind="fishing" 하나를 같이 쓴다.
 * 골프장 자리에 어종 · 크기, 기록 줄에 자리 · 날 · 메모. 라운드 · 홀은 없다(null).
 * **남이 볼 수 있었던 조과만** 싣는다 — 공개(랭킹) · 정출판(크루) · 가려진 것. 나만 보는 기록은 운영자도 훑지 않는다(신고가 오면 신고 큐로 본다).
 */
import { db } from "../db.js";
import { sql, type SQL } from "drizzle-orm";
import { ownBlobHost } from "../utils/blob.js";
import { ACTION_LABEL, availableActions, isAppealOpen, isModerationAction, type ModerationAction } from "../lib/reportQueue.js";
import { likePattern, ownPhotoUrl, type PhotoCounts, type PhotoFilter, type PhotoListQuery } from "./adminGolfPhotos.js";

export interface AdminFishingCatch {
    id: string;
    url: string | null;
    thumbUrl: string | null;
    width: null;
    height: null;
    holeNo: null;
    /** 어종 · 크기 — 화면이 골프장 칸에 쓴다 */
    course: { slug: null; name: string; path: null };
    round: null;
    /** 자리 · 날 · 메모 · 어디에 보였나 */
    detail: string;
    uploader: { id: string; name: string };
    isPublic: boolean;
    hiddenAt: string | null;
    appeal: { text: string | null; at: string | null; open: boolean } | null;
    openReports: number;
    reportCount: number;
    lastAction: { action: string; label: string; at: string } | null;
    actions: ModerationAction[];
    createdAt: string;
}
export interface AdminFishingCatchPage { items: AdminFishingCatch[]; counts: PhotoCounts; total: number; hasMore: boolean; offset: number; limit: number }

const ACTIONS: readonly ModerationAction[] = ["appeal_approve", "appeal_reject", "blind", "unblind", "delete"];
const EMPTY: PhotoCounts = { public: 0, hidden: 0, appealed: 0, all: 0 };
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
const iso = (col: string) => sql.raw(`to_char(${col}, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')`);
const rowsOf = (r: any): any[] => r?.rows ?? r ?? [];
const missing = (e: any) => ["42P01", "42703"].includes(e?.code ?? e?.cause?.code);

function cte(q: PhotoListQuery): SQL {
    // 남이 볼 수 있었던 것만 — 공개 · 정출판 · 가려진 것
    const conds: SQL[] = [sql`(c.is_public OR c.trip_id IS NOT NULL OR c.hidden_at IS NOT NULL)`];
    if (q.course) {
        const like = likePattern(q.course);
        conds.push(sql`(c.species ILIKE ${like} OR c.place ILIKE ${like} OR m.name ILIKE ${like})`);
    }
    if (q.days) conds.push(sql`c.created_at >= now() - make_interval(days => ${q.days}::int)`);
    return sql`
        WITH p AS (
            SELECT c.id::text AS id, c.member_id, c.photo_url AS url, c.thumb_url, c.is_public, c.trip_id, c.appeal_text,
                   c.species, c.length_cm, c.fish_count, c.weight_kg, c.place, c.fished_on, c.note,
                   (c.created_at AT TIME ZONE 'UTC') AS created_ts, c.hidden_at AS hidden_ts, c.appeal_at AS appeal_ts,
                   m.name AS uploader_name, la.action AS last_action, la.created_at AS last_action_ts,
                   COALESCE(rp.pending, 0) AS open_reports, COALESCE(rp.total, 0) AS report_count
            FROM fishing_catches c
            LEFT JOIN hiq_members m ON m.id::text = c.member_id
            LEFT JOIN LATERAL (SELECT a.action, a.created_at FROM hiq_moderation_actions a WHERE a.target_type = 'fishing_catch' AND a.target_id = c.id ORDER BY a.created_at DESC LIMIT 1) la ON true
            LEFT JOIN LATERAL (SELECT count(*)::int AS total, count(*) FILTER (WHERE r.status = 'pending')::int AS pending FROM hiq_reports r WHERE r.target_type = 'fishing_catch' AND r.target_id = c.id) rp ON true
            WHERE ${sql.join(conds, sql` AND `)}
        ), q AS (
            SELECT p.*, (p.hidden_ts IS NOT NULL AND p.appeal_ts IS NOT NULL AND (p.last_action_ts IS NULL OR p.appeal_ts > p.last_action_ts)) AS appeal_open FROM p
        )`;
}

const sizeText = (r: any) => [
    r.length_cm != null ? `${Number(r.length_cm)}cm` : null,
    r.weight_kg != null ? `${Number(r.weight_kg)}kg` : null,
    Number(r.fish_count) > 1 ? `${Number(r.fish_count)}마리` : null,
].filter(Boolean).join(" · ");

function toAdmin(r: any, host: string | null): AdminFishingCatch {
    const url = ownPhotoUrl(r.url, host);
    const hidden = !!r.hidden_at;
    const appealOpen = isAppealOpen({ appealAt: r.appeal_at, isBlinded: hidden, lastActionAt: r.last_action_at });
    const n = (v: unknown) => Math.max(0, Number(v) || 0);
    const size = sizeText(r);
    return {
        id: r.id, url, thumbUrl: ownPhotoUrl(r.thumb_url, host) ?? url, width: null, height: null, holeNo: null,
        course: { slug: null, name: size ? `${r.species} ${size}` : String(r.species), path: null },
        round: null,
        detail: [r.place, r.fished_on, r.is_public ? "랭킹에 공개" : r.trip_id ? "크루 정출판" : "비공개", r.note].filter(Boolean).join(" · "),
        uploader: { id: String(r.member_id), name: r.uploader_name?.trim() || "(알 수 없는 회원)" },
        isPublic: !!r.is_public, hiddenAt: r.hidden_at ?? null,
        appeal: r.appeal_at || r.appeal_text ? { text: r.appeal_text ?? null, at: r.appeal_at ?? null, open: appealOpen } : null,
        openReports: n(r.open_reports), reportCount: n(r.report_count),
        lastAction: r.last_action && r.last_action_at ? { action: r.last_action, label: isModerationAction(r.last_action) ? ACTION_LABEL[r.last_action] : r.last_action, at: r.last_action_at } : null,
        actions: availableActions({ targetType: "fishing_catch", exists: true, isBlinded: hidden, appealOpen, pendingCount: 0, author: null }).filter((a) => ACTIONS.includes(a)),
        createdAt: r.created_at,
    };
}

export async function listAdminFishingCatches(q: PhotoListQuery): Promise<AdminFishingCatchPage> {
    try {
        const [raw, countRows] = await Promise.all([
            db.execute(sql`${cte(q)}
                SELECT id, member_id, url, thumb_url, is_public, trip_id, appeal_text, species, length_cm, fish_count, weight_kg, place, fished_on, note,
                       uploader_name, last_action, open_reports, report_count,
                       ${iso("created_ts")} AS created_at, ${iso("hidden_ts")} AS hidden_at, ${iso("appeal_ts")} AS appeal_at, ${iso("last_action_ts")} AS last_action_at
                FROM q ${FILTER_SQL[q.filter]} ${ORDER_SQL[q.filter]}
                LIMIT ${q.limit + 1} OFFSET ${q.offset}`).then(rowsOf),
            db.execute(sql`${cte(q)}
                SELECT count(*) FILTER (WHERE is_public AND hidden_ts IS NULL)::int AS "public", count(*) FILTER (WHERE hidden_ts IS NOT NULL)::int AS "hidden",
                       count(*) FILTER (WHERE appeal_open)::int AS "appealed", count(*)::int AS "all" FROM q`).then(rowsOf),
        ]);
        const c = countRows[0] ?? {};
        const counts: PhotoCounts = { public: Number(c.public ?? 0), hidden: Number(c.hidden ?? 0), appealed: Number(c.appealed ?? 0), all: Number(c.all ?? 0) };
        const host = ownBlobHost();
        return { items: raw.slice(0, q.limit).map((r) => toAdmin(r, host)), counts, total: counts[q.filter], hasMore: raw.length > q.limit, offset: q.offset, limit: q.limit };
    } catch (e) {
        if (missing(e)) return { items: [], counts: EMPTY, total: 0, hasMore: false, offset: q.offset, limit: q.limit };
        throw e;
    }
}
