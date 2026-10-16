/**
 * 어드민 · 등산 › 산행 사진 목록(2026-10-17 어드민 전수 조사 — "산행 사진 전체 보기 — adminGolf/photos 를 그대로 옮긴다").
 * 골프 라운드 사진(storage/adminGolfPhotos)과 **같은 모양**으로 준다 — 화면은 GolfPhotosView kind="hiking" 하나를 같이 쓴다.
 * 다른 것: 골프장 자리에 산(이름 · 공개 페이지), 라운드 · 홀은 없다(null). 거르기 · 정렬 · 이의제기 판단 식은 골프와 같다.
 * 쓰기(가리기 · 보이기 · 이의제기 판정 · 지우기)는 신고 큐와 같은 실행기(services/moderation, targetType 'hiking_photo')로 간다.
 */
import { db } from "../db.js";
import { sql, type SQL } from "drizzle-orm";
import { hikingMountainPath } from "../../shared/hikingMountains.js";
import { ownBlobHost } from "../utils/blob.js";
import { ACTION_LABEL, availableActions, isAppealOpen, isModerationAction, type ModerationAction } from "../lib/reportQueue.js";
import { likePattern, ownPhotoUrl, type PhotoCounts, type PhotoFilter, type PhotoListQuery } from "./adminGolfPhotos.js";

export interface AdminHikingPhoto {
    id: string;
    url: string | null;
    thumbUrl: string | null;
    width: number | null;
    height: number | null;
    holeNo: null;
    /** 산 — 화면이 골프장 칸에 그대로 쓴다 */
    course: { slug: string | null; name: string | null; path: string | null };
    round: null;
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
export interface AdminHikingPhotoPage { items: AdminHikingPhoto[]; counts: PhotoCounts; total: number; hasMore: boolean; offset: number; limit: number }

const PHOTO_ACTIONS: readonly ModerationAction[] = ["appeal_approve", "appeal_reject", "blind", "unblind", "delete"];
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
const isUndefinedTable = (e: any) => (e?.code ?? e?.cause?.code) === "42P01" || /relation "hiking_photos" does not exist/.test(String(e?.message ?? ""));

function photoCte(q: PhotoListQuery): SQL {
    const conds: SQL[] = [];
    if (q.course) {
        const like = likePattern(q.course);
        conds.push(sql`(mt.slug = ${q.course} OR mt.slug ILIKE ${like} OR mt.name ILIKE ${like})`);
    }
    if (q.days) conds.push(sql`ph.created_at >= now()::timestamp - make_interval(days => ${q.days}::int)`);
    const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``;
    return sql`
        WITH p AS (
            SELECT ph.id::text AS id, ph.member_id::text AS member_id, ph.url, ph.thumb_url, ph.width, ph.height, ph.is_public, ph.appeal_text,
                   ph.created_at AS created_ts, ph.hidden_at AS hidden_ts, ph.appeal_at AS appeal_ts,
                   mt.slug AS mountain_slug, mt.name AS mountain_name, m.name AS uploader_name,
                   la.action AS last_action, la.created_at AS last_action_ts,
                   COALESCE(rp.pending, 0) AS open_reports, COALESCE(rp.total, 0) AS report_count
            FROM hiking_photos ph
            LEFT JOIN hiking_mountains mt ON mt.id = ph.mountain_id
            LEFT JOIN hiq_members m ON m.id = ph.member_id
            LEFT JOIN LATERAL (
                SELECT a.action, a.created_at FROM hiq_moderation_actions a
                WHERE a.target_type = 'hiking_photo' AND a.target_id = ph.id
                ORDER BY a.created_at DESC LIMIT 1
            ) la ON true
            LEFT JOIN LATERAL (
                SELECT count(*)::int AS total, count(*) FILTER (WHERE r.status = 'pending')::int AS pending
                FROM hiq_reports r WHERE r.target_type = 'hiking_photo' AND r.target_id = ph.id
            ) rp ON true
            ${where}
        ), q AS (
            SELECT p.*, (p.hidden_ts IS NOT NULL AND p.appeal_ts IS NOT NULL AND (p.last_action_ts IS NULL OR p.appeal_ts > p.last_action_ts)) AS appeal_open
            FROM p
        )`;
}

function toAdmin(r: any, host: string | null): AdminHikingPhoto {
    const url = ownPhotoUrl(r.url, host);
    const hidden = !!r.hidden_at;
    const appealOpen = isAppealOpen({ appealAt: r.appeal_at, isBlinded: hidden, lastActionAt: r.last_action_at });
    const n = (v: unknown) => Math.max(0, Number(v) || 0);
    return {
        id: r.id, url, thumbUrl: ownPhotoUrl(r.thumb_url, host) ?? url, width: r.width ?? null, height: r.height ?? null, holeNo: null,
        course: { slug: r.mountain_slug ?? null, name: r.mountain_name ?? null, path: r.mountain_slug ? hikingMountainPath(r.mountain_slug) : null },
        round: null,
        uploader: { id: r.member_id, name: r.uploader_name?.trim() || "(알 수 없는 회원)" },
        isPublic: !!r.is_public, hiddenAt: r.hidden_at ?? null,
        appeal: r.appeal_at || r.appeal_text ? { text: r.appeal_text ?? null, at: r.appeal_at ?? null, open: appealOpen } : null,
        openReports: n(r.open_reports), reportCount: n(r.report_count),
        lastAction: r.last_action && r.last_action_at ? { action: r.last_action, label: isModerationAction(r.last_action) ? ACTION_LABEL[r.last_action] : r.last_action, at: r.last_action_at } : null,
        actions: availableActions({ targetType: "hiking_photo", exists: true, isBlinded: hidden, appealOpen, pendingCount: 0, author: null }).filter((a) => PHOTO_ACTIONS.includes(a)),
        createdAt: r.created_at,
    };
}

export async function listAdminHikingPhotos(q: PhotoListQuery): Promise<AdminHikingPhotoPage> {
    try {
        const [raw, countRows] = await Promise.all([
            db.execute(sql`${photoCte(q)}
                SELECT id, member_id, url, thumb_url, width, height, is_public, appeal_text, mountain_slug, mountain_name, uploader_name, last_action, open_reports, report_count,
                       ${iso("created_ts")} AS created_at, ${iso("hidden_ts")} AS hidden_at, ${iso("appeal_ts")} AS appeal_at, ${iso("last_action_ts")} AS last_action_at
                FROM q ${FILTER_SQL[q.filter]} ${ORDER_SQL[q.filter]}
                LIMIT ${q.limit + 1} OFFSET ${q.offset}`).then(rowsOf),
            db.execute(sql`${photoCte(q)}
                SELECT count(*) FILTER (WHERE is_public AND hidden_ts IS NULL)::int AS "public", count(*) FILTER (WHERE hidden_ts IS NOT NULL)::int AS "hidden",
                       count(*) FILTER (WHERE appeal_open)::int AS "appealed", count(*)::int AS "all"
                FROM q`).then(rowsOf),
        ]);
        const c = countRows[0] ?? {};
        const counts: PhotoCounts = { public: Number(c.public ?? 0), hidden: Number(c.hidden ?? 0), appealed: Number(c.appealed ?? 0), all: Number(c.all ?? 0) };
        const host = ownBlobHost();
        return { items: raw.slice(0, q.limit).map((r) => toAdmin(r, host)), counts, total: counts[q.filter], hasMore: raw.length > q.limit, offset: q.offset, limit: q.limit };
    } catch (e) {
        if (isUndefinedTable(e)) return { items: [], counts: EMPTY, total: 0, hasMore: false, offset: q.offset, limit: q.limit };
        throw e;
    }
}
