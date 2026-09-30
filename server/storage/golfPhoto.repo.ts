/**
 * 라운드 사진 저장소(2026-09-30). 표 설명은 shared/schema.ts golfRoundPhotos.
 *
 * 원칙
 *  - 권한(그 경기 참가자인가)은 라우트가 본다(routes/modules/golf.ts loadMatch). 여기서는 **내 사진만** 바꾸고 지운다 — 모든 쓰기에 member_id 조건.
 *  - 가려진 사진(hidden_at)은 올린 사람 본인에게만 나간다. 보는 사람이 차단한 회원의 사진은 앨범·골프장 페이지 어디서도 안 나간다
 *    (커뮤니티 notBlockedBy 와 같은 한 방향 규칙).
 *  - 응답에 전화번호 등 식별자를 싣지 않는다 — SELECT 칸을 늘 적는다(이름만).
 *  - 표가 아직 없으면(42P01) 읽기는 빈 목록, 첫 쓰기는 표를 만들고 다시 한다(promo_events 와 같은 방식, migrations/golf_round_photos.sql).
 */
import { db } from "../db.js";
import { golfRoundPhotos, golfMatchSessions, hiqMembers, hiqBlocks } from "../../shared/schema.js";
import { and, eq, desc, sql, isNull, isNotNull, or, inArray } from "drizzle-orm";
import { GOLF_PHOTO_MAX_PER_ROUND, photoCredit, photoMonthLabel } from "../../shared/golfPhoto.js";

const isUndefinedTable = (e: any) =>
    (e?.code ?? e?.cause?.code) === "42P01" || /relation "golf_round_photos" does not exist/.test(String(e?.message ?? ""));

let tableReady: Promise<unknown> | null = null;
function ensureTable() {
    tableReady ??= (async () => {
        await db.execute(sql`
            create table if not exists golf_round_photos (
              id uuid primary key default gen_random_uuid(),
              session_id uuid not null references golf_match_sessions(id) on delete cascade,
              member_id uuid not null references hiq_members(id) on delete cascade,
              hole_no integer,
              url text not null,
              thumb_url text not null,
              width integer,
              height integer,
              is_public boolean not null default false,
              course_slug text,
              hidden_at timestamp,
              created_at timestamp not null default now()
            )
        `);
        // 이의제기 칸은 표를 만든 뒤에 붙었다(9/30) — 이미 있는 표에도 없으면 붙인다
        await db.execute(sql`alter table golf_round_photos add column if not exists appeal_text text`);
        await db.execute(sql`alter table golf_round_photos add column if not exists appeal_at timestamp`);
        await db.execute(sql`create index if not exists golf_round_photos_session_idx on golf_round_photos (session_id)`);
        await db.execute(sql`create index if not exists golf_round_photos_course_idx on golf_round_photos (course_slug, is_public, created_at)`);
    })().catch((e) => { tableReady = null; throw e; });
    return tableReady;
}

/** 읽기: 표가 없으면 빈 값 */
async function orEmpty<T>(run: () => Promise<T>, empty: T): Promise<T> {
    try { return await run(); } catch (e) { if (isUndefinedTable(e)) return empty; throw e; }
}
/** 쓰기: 표가 없으면 만들고 한 번 더 */
async function withTable<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); } catch (e) {
        if (!isUndefinedTable(e)) throw e;
        await ensureTable();
        return await run();
    }
}

/** 보는 사람이 차단한 회원이 올린 사진은 뺀다 */
const notBlockedBy = (viewerId: string | null | undefined) =>
    viewerId
        ? sql`NOT EXISTS (SELECT 1 FROM ${hiqBlocks} WHERE ${hiqBlocks.blockerId} = ${viewerId} AND ${hiqBlocks.blockedId} = ${golfRoundPhotos.memberId})`
        : sql`true`;

const albumCols = {
    id: golfRoundPhotos.id,
    sessionId: golfRoundPhotos.sessionId,
    memberId: golfRoundPhotos.memberId,
    holeNo: golfRoundPhotos.holeNo,
    url: golfRoundPhotos.url,
    thumbUrl: golfRoundPhotos.thumbUrl,
    width: golfRoundPhotos.width,
    height: golfRoundPhotos.height,
    isPublic: golfRoundPhotos.isPublic,
    courseSlug: golfRoundPhotos.courseSlug,
    hiddenAt: golfRoundPhotos.hiddenAt,
    appealAt: golfRoundPhotos.appealAt,
    createdAt: golfRoundPhotos.createdAt,
    uploaderName: hiqMembers.name,
    // 뷰어의 맥락 줄("동강시스타 CC · 7번 홀 · 9월 28일")·'보러 가기' 링크 — 경기 행에서(2026-09-30 오너 피드백)
    courseName: golfMatchSessions.courseName,
    sessionCreatedAt: golfMatchSessions.createdAt,
};
type AlbumRow = { [K in keyof typeof albumCols]: any };

/** 앨범(경기 참가자가 보는 것) 한 장 */
export interface AlbumPhoto {
    id: string;
    sessionId: string;
    memberId: string;
    uploaderName: string;
    holeNo: number | null;
    url: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
    isPublic: boolean;
    /** 골프장 페이지가 있는 골프장인가 — 없으면 공개로 돌려도 보일 곳이 없다 */
    hasCoursePage: boolean;
    /** 공개 사진이 붙는 골프장 페이지 슬러그(없으면 null) — 뷰어의 '보러 가기' */
    courseSlug: string | null;
    /** 그 경기의 골프장 이름·라운드 날(경기를 만든 시각, ISO) — 앨범은 참가자만 보니 날짜까지 싣는다 */
    courseName: string | null;
    playedAt: string;
    /** 신고로 가려졌나(본인 사진에만 true 가 올 수 있다) */
    hidden: boolean;
    /** 지금 가림에 대해 이의제기를 냈나 — 가린 뒤에 낸 것만 센다(풀렸다 다시 가려지면 새로 낼 수 있게) */
    appealed: boolean;
    mine: boolean;
    createdAt: string;
}

const toAlbum = (r: AlbumRow, viewerId: string): AlbumPhoto => ({
    id: r.id,
    sessionId: r.sessionId,
    memberId: r.memberId,
    uploaderName: photoCredit(r.uploaderName),
    holeNo: r.holeNo ?? null,
    url: r.url,
    thumbUrl: r.thumbUrl,
    width: r.width ?? null,
    height: r.height ?? null,
    isPublic: !!r.isPublic,
    hasCoursePage: !!r.courseSlug,
    courseSlug: r.courseSlug ?? null,
    courseName: r.courseName ?? null,
    playedAt: new Date(r.sessionCreatedAt ?? r.createdAt).toISOString(),
    hidden: !!r.hiddenAt,
    appealed: !!r.hiddenAt && !!r.appealAt && new Date(r.appealAt).getTime() >= new Date(r.hiddenAt).getTime(),
    mine: r.memberId === viewerId,
    createdAt: new Date(r.createdAt).toISOString(),
});

/** 골프장 페이지(누구나 보는 것) 한 장 — 날짜는 달까지만, 시각·홀은 싣지 않는다 */
export interface CoursePhoto {
    id: string;
    memberId: string;
    credit: string;
    month: string;
    url: string;
    thumbUrl: string;
    width: number | null;
    height: number | null;
}

export class GolfPhotoRepository {
    /** 그 경기의 앨범 — 오래된 것부터(찍은 순서). 가려진 건 본인 것만, 차단한 회원 것은 빼고. */
    async listForSession(sessionId: string, viewerId: string): Promise<AlbumPhoto[]> {
        return orEmpty(async () => {
            const rows = await db.select(albumCols)
                .from(golfRoundPhotos)
                .innerJoin(golfMatchSessions, eq(golfMatchSessions.id, golfRoundPhotos.sessionId))
                .innerJoin(hiqMembers, eq(hiqMembers.id, golfRoundPhotos.memberId))
                .where(and(
                    eq(golfRoundPhotos.sessionId, sessionId),
                    or(isNull(golfRoundPhotos.hiddenAt), eq(golfRoundPhotos.memberId, viewerId)),
                    notBlockedBy(viewerId),
                ))
                .orderBy(golfRoundPhotos.createdAt, golfRoundPhotos.id);
            return rows.map((r) => toAlbum(r, viewerId));
        }, []);
    }

    /**
     * 내 라운드들의 사진(라운딩 리포트 '사진첩') — 최신부터. 내가 방장이거나 참가자인 경기의 사진 전부(동반자가 올린 것 포함).
     */
    async listMine(memberId: string, limit = 60): Promise<AlbumPhoto[]> {
        return orEmpty(async () => {
            const rows = await db.select(albumCols)
                .from(golfRoundPhotos)
                .innerJoin(golfMatchSessions, eq(golfMatchSessions.id, golfRoundPhotos.sessionId))
                .innerJoin(hiqMembers, eq(hiqMembers.id, golfRoundPhotos.memberId))
                .where(and(
                    or(
                        eq(golfMatchSessions.hostId, memberId),
                        sql`${golfMatchSessions.players} @> ${JSON.stringify([{ memberId }])}::jsonb`,
                    ),
                    or(isNull(golfRoundPhotos.hiddenAt), eq(golfRoundPhotos.memberId, memberId)),
                    notBlockedBy(memberId),
                ))
                .orderBy(desc(golfRoundPhotos.createdAt), desc(golfRoundPhotos.id))
                .limit(Math.min(Math.max(limit, 1), 120));
            return rows.map((r) => toAlbum(r, memberId));
        }, []);
    }

    /** 이 경기에 이 회원이 올린 장수 */
    async countMine(sessionId: string, memberId: string): Promise<number> {
        return orEmpty(async () => {
            const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(golfRoundPhotos)
                .where(and(eq(golfRoundPhotos.sessionId, sessionId), eq(golfRoundPhotos.memberId, memberId)));
            return Number(row?.n ?? 0);
        }, 0);
    }

    /**
     * 한 장 넣기. 한 사람 한 경기 GOLF_PHOTO_MAX_PER_ROUND 장까지 — 세는 것과 넣는 것 사이에 다른 업로드가 끼지 않게
     * (사람·경기) 단위 잠금을 건다(여러 장을 한꺼번에 올리면 요청이 동시에 온다). 넘으면 null.
     */
    async add(v: {
        sessionId: string; memberId: string; holeNo: number | null; url: string; thumbUrl: string;
        width: number | null; height: number | null; isPublic: boolean; courseSlug: string | null;
    }): Promise<{ id: string } | null> {
        return withTable(() => db.transaction(async (tx) => {
            await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`golf_round_photos:${v.sessionId}:${v.memberId}`}))`);
            const [row] = await tx.select({ n: sql<number>`count(*)::int` }).from(golfRoundPhotos)
                .where(and(eq(golfRoundPhotos.sessionId, v.sessionId), eq(golfRoundPhotos.memberId, v.memberId)));
            if (Number(row?.n ?? 0) >= GOLF_PHOTO_MAX_PER_ROUND) return null;
            const [ins] = await tx.insert(golfRoundPhotos).values(v).returning({ id: golfRoundPhotos.id });
            return ins ?? null;
        }));
    }

    async get(id: string) {
        return orEmpty(async () => {
            const [row] = await db.select().from(golfRoundPhotos).where(eq(golfRoundPhotos.id, id)).limit(1);
            return row ?? null;
        }, null);
    }

    /** 내 사진 공개/비공개. 바뀐 행이 없으면(남의 사진·없는 사진) false */
    async setPublic(id: string, memberId: string, isPublic: boolean): Promise<boolean> {
        return orEmpty(async () => {
            const rows = await db.update(golfRoundPhotos).set({ isPublic })
                .where(and(eq(golfRoundPhotos.id, id), eq(golfRoundPhotos.memberId, memberId)))
                .returning({ id: golfRoundPhotos.id });
            return rows.length > 0;
        }, false);
    }

    /** 사진 지우기 — memberId 를 주면 그 회원 사진만(본인 삭제), 안 주면 운영자 삭제. 지운 행의 주소(Blob 정리용) */
    async delete(id: string, memberId?: string): Promise<{ url: string; thumbUrl: string } | null> {
        return orEmpty(async () => {
            const [row] = await db.delete(golfRoundPhotos)
                .where(and(eq(golfRoundPhotos.id, id), memberId ? eq(golfRoundPhotos.memberId, memberId) : sql`true`))
                .returning({ url: golfRoundPhotos.url, thumbUrl: golfRoundPhotos.thumbUrl });
            return row ?? null;
        }, null);
    }

    /** 탈퇴 — 그 회원 사진 전부 지우고 주소를 돌려준다(Blob 정리는 부르는 쪽) */
    async deleteAllByMember(memberId: string): Promise<string[]> {
        return orEmpty(async () => {
            const rows = await db.delete(golfRoundPhotos).where(eq(golfRoundPhotos.memberId, memberId))
                .returning({ url: golfRoundPhotos.url, thumbUrl: golfRoundPhotos.thumbUrl });
            return rows.flatMap((r) => [r.url, r.thumbUrl]);
        }, []);
    }

    /** 신고 누적 자동 가림 — 새로 가렸으면 올린 사람 id(알림용), 이미 가려졌거나 없으면 null */
    async hideByReports(id: string): Promise<string | null> {
        return orEmpty(async () => {
            const [row] = await db.update(golfRoundPhotos).set({ hiddenAt: new Date() })
                .where(and(eq(golfRoundPhotos.id, id), isNull(golfRoundPhotos.hiddenAt)))
                .returning({ memberId: golfRoundPhotos.memberId });
            return row?.memberId ?? null;
        }, null);
    }

    /**
     * 이의제기 — 가려진 **내** 사진에만. 신고 큐가 appeal_at 으로 이 건을 다시 연다(admin.repo reportQueueCte).
     * 커뮤니티 appeal 과 같은 원탭: 문구는 비워 와도 된다.
     */
    async appeal(id: string, memberId: string, text: string): Promise<boolean> {
        return orEmpty(async () => {
            const rows = await db.update(golfRoundPhotos).set({ appealText: text, appealAt: new Date() })
                .where(and(eq(golfRoundPhotos.id, id), eq(golfRoundPhotos.memberId, memberId), isNotNull(golfRoundPhotos.hiddenAt)))
                .returning({ id: golfRoundPhotos.id });
            return rows.length > 0;
        }, false);
    }

    /** 운영자 가림/풀기(신고 큐). 바뀐 행이 있으면 true */
    async setHidden(id: string, hidden: boolean): Promise<boolean> {
        return orEmpty(async () => {
            const rows = await db.update(golfRoundPhotos).set({ hiddenAt: hidden ? new Date() : null })
                .where(eq(golfRoundPhotos.id, id))
                .returning({ id: golfRoundPhotos.id });
            return rows.length > 0;
        }, false);
    }

    /** 신고 큐 미리보기 — 종류별로 한 번에 */
    async getMany(ids: string[]) {
        if (!ids.length) return [];
        return orEmpty(async () => db.select({
            id: golfRoundPhotos.id,
            memberId: golfRoundPhotos.memberId,
            url: golfRoundPhotos.url,
            thumbUrl: golfRoundPhotos.thumbUrl,
            isPublic: golfRoundPhotos.isPublic,
            courseSlug: golfRoundPhotos.courseSlug,
            holeNo: golfRoundPhotos.holeNo,
            hiddenAt: golfRoundPhotos.hiddenAt,
            appealText: golfRoundPhotos.appealText,
            appealAt: golfRoundPhotos.appealAt,
            createdAt: golfRoundPhotos.createdAt,
            courseName: golfMatchSessions.courseName,
        })
            .from(golfRoundPhotos)
            .leftJoin(golfMatchSessions, eq(golfMatchSessions.id, golfRoundPhotos.sessionId))
            .where(inArray(golfRoundPhotos.id, ids)), []);
    }

    /**
     * 골프장 페이지 '라운드 사진' — 공개·안 가려진 것만, 최신부터. 보는 사람이 차단한 회원 것은 뺀다(로그아웃이면 차단 없음).
     * 정지된 계정·탈퇴 회원의 사진은 싣지 않는다(탈퇴는 사진을 지우지만, 지우기 전에 남은 행이 있을 수 있다).
     */
    async listForCourse(slug: string, viewerId: string | null, limit: number): Promise<CoursePhoto[]> {
        return orEmpty(async () => {
            const rows = await db.select({
                id: golfRoundPhotos.id,
                memberId: golfRoundPhotos.memberId,
                url: golfRoundPhotos.url,
                thumbUrl: golfRoundPhotos.thumbUrl,
                width: golfRoundPhotos.width,
                height: golfRoundPhotos.height,
                createdAt: golfRoundPhotos.createdAt,
                name: hiqMembers.name,
            })
                .from(golfRoundPhotos)
                .innerJoin(hiqMembers, eq(hiqMembers.id, golfRoundPhotos.memberId))
                .where(and(
                    eq(golfRoundPhotos.courseSlug, slug),
                    eq(golfRoundPhotos.isPublic, true),
                    isNull(golfRoundPhotos.hiddenAt),
                    isNotNull(hiqMembers.profileId),
                    notBlockedBy(viewerId),
                ))
                .orderBy(desc(golfRoundPhotos.createdAt), desc(golfRoundPhotos.id))
                .limit(Math.min(Math.max(limit, 1), 48));
            return rows.map((r) => ({
                id: r.id,
                memberId: r.memberId,
                credit: photoCredit(r.name),
                month: photoMonthLabel(r.createdAt),
                url: r.url,
                thumbUrl: r.thumbUrl,
                width: r.width ?? null,
                height: r.height ?? null,
            }));
        }, []);
    }

    /** 사이트맵 — 골프장별 공개 사진 원본 주소 최신 n장(한 번의 질의로 전 골프장) */
    async publicImagesBySlug(perSlug: number): Promise<Map<string, string[]>> {
        const out = new Map<string, string[]>();
        await orEmpty(async () => {
            const rows: any[] = await db.execute(sql`
                SELECT course_slug AS slug, url FROM (
                    SELECT p.course_slug, p.url,
                           row_number() OVER (PARTITION BY p.course_slug ORDER BY p.created_at DESC, p.id DESC) AS rn
                    FROM ${golfRoundPhotos} p
                    JOIN ${hiqMembers} m ON m.id = p.member_id
                    WHERE p.course_slug IS NOT NULL AND p.is_public AND p.hidden_at IS NULL AND m.profile_id IS NOT NULL
                ) t WHERE rn <= ${perSlug}
            `).then((r: any) => r.rows ?? r);
            for (const r of rows) out.set(r.slug, [...(out.get(r.slug) ?? []), r.url]);
            return null;
        }, null);
        return out;
    }
}
