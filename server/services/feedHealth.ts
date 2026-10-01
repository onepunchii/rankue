/**
 * 외부 랭킹 크롤러 건강 점검(2026-09-09 오너). "크론이 돌았나"가 아니라 **"새 데이터가 들어왔나"** 를 본다 —
 * 실제로 UMB 는 시간 초과로 한 달, PBA 는 인증서 교체로 조용히 멈춰 있었는데 아무도 몰랐다.
 *
 * 판정
 *  - UMB: 출처 아카이브의 최신 회차가 우리 최신 회차보다 새로우면 "밀림"(부문별). 아카이브를 못 읽으면 "출처 오류".
 *  - PBA: 현재 시즌 랭킹을 못 받아오면 "출처 오류"(인증서·API 변경), 받아왔는데 우리 DB 에 그 시즌이 비면 "밀림".
 * 알림은 하루 한 번까지만(같은 제목이 24시간 안에 있으면 건너뛴다) — 매일 같은 소리로 알림함을 채우지 않는다.
 *
 * 골프 랭킹(2026-10-01)은 출처를 다시 두드리지 않고 DB 만 본다 — 아래 judgeGolfFeed 설명.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { notificationService } from "./notificationService.js";
import { GOLF_TOURS, GOLF_TOUR_META, type GolfTour } from "../../shared/golfTours.js";

export interface FeedIssue {
    feed: "umb" | "pba" | "golf";
    scope: string;
    kind: "stale" | "source-error";
    detail: string;
}

/** 알림을 받을 운영자(회원 id). 비우면 알림을 보내지 않고 결과만 돌려준다. */
const ADMIN_MEMBER_IDS = (process.env.FEED_ALERT_MEMBER_IDS ?? "02fce921-5170-4c0e-9cc2-5be2906f0bb0")
    .split(",").map((s) => s.trim()).filter(Boolean);

const ALERT_TITLE = "랭킹 수집이 멈춰 있어요";

export async function checkUmbHealth(): Promise<FeedIssue[]> {
    const out: FeedIssue[] = [];
    try {
        const { fetchArchive } = await import("./umbService.js");
        const entries = await fetchArchive();
        if (entries.length === 0) {
            return [{ feed: "umb", scope: "archive", kind: "source-error", detail: "아카이브 0건(마크업 변경 의심)" }];
        }
        // 날짜만 문자열로 견준다 — Date 로 바꾸면 저장 시간대에 따라 하루가 밀려 헛알림이 난다(실측).
        // 우리 값은 SQL 에서 바로 YYYY-MM-DD 로, 출처 값은 UTC 자정으로 만들어졌으니 UTC 기준으로 자른다.
        const mine = new Map<string, string>();
        for (const r of (await db.execute(sql`
            select category, to_char(max(edition_date), 'YYYY-MM-DD') as d from umb_rankings group by category`)).rows as any[]) {
            mine.set(String(r.category), String(r.d));
        }
        const newest = new Map<string, string>();
        for (const e of entries) {
            const d = e.editionDate.toISOString().slice(0, 10);
            const cur = newest.get(e.category);
            if (!cur || d > cur) newest.set(e.category, d);
        }
        for (const [cat, src] of newest) {
            const have = mine.get(cat);
            if (!have || src > have) {
                out.push({ feed: "umb", scope: cat, kind: "stale", detail: `출처 ${src} · 우리 ${have ?? "없음"}` });
            }
        }
    } catch (e) {
        out.push({ feed: "umb", scope: "archive", kind: "source-error", detail: (e as Error)?.message?.slice(0, 120) ?? "알 수 없음" });
    }
    return out;
}

export async function checkPbaHealth(): Promise<FeedIssue[]> {
    const out: FeedIssue[] = [];
    try {
        const { fetchSeasonRanking } = await import("./pbaService.js");
        const { currentPbaSeason } = await import("./pbaSync.js");
        const season = currentPbaSeason();
        for (const league of ["PBA", "LPBA"] as const) {
            let rows: unknown[];
            try {
                rows = await fetchSeasonRanking(league, season);
            } catch (e) {
                // 인증서 교체·API 변경이면 여기서 잡힌다(2026-09-09 사고와 같은 모양)
                out.push({ feed: "pba", scope: `${league} ${season}`, kind: "source-error", detail: (e as Error)?.message?.slice(0, 120) ?? "요청 실패" });
                continue;
            }
            if (rows.length < 10) continue;   // 시즌 미발행 등 — 이상 응답 가드와 같은 기준
            const [mine] = (await db.execute(sql`
                select count(*)::int n from pba_season_ranks where season = ${season} and league = ${league}`)).rows as any[];
            if (!mine || mine.n === 0) {
                out.push({ feed: "pba", scope: `${league} ${season}`, kind: "stale", detail: `출처 ${rows.length}명 · 우리 0명` });
            }
        }
    } catch (e) {
        out.push({ feed: "pba", scope: "sync", kind: "source-error", detail: (e as Error)?.message?.slice(0, 120) ?? "알 수 없음" });
    }
    return out;
}

// ── 골프 랭킹(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자") ─────────────
/**
 * 골프는 UMB 처럼 출처를 다시 받지 않는다. 크론(golf-sync, 투어마다 하루 한 번 — vercel.json 21:40·21:50·22:00·22:10 UTC)이
 * 이미 받아 오고, 받을 때마다 **회차가 그대로여도** golf_players.updated_at 을 찍는다(golfSync → upsertPlayers).
 * 그래서 DB 만 보고 두 가지를 가른다.
 *  - 멈춤: 마지막 수집이 30시간을 넘었다 = 하루 한 번 + 6시간 여유. 출처 주소·인증서·마크업이 바뀌어 받기가 실패하면
 *    여기서 잡힌다(UMB 는 시간 초과로 한 달, PBA 는 인증서 교체로 조용히 멈췄던 바로 그 모양).
 *  - 늦음: 수집은 도는데 새 회차가 안 들어온다. 세계 랭킹(owgr·rolex)은 매주 월요일 발표 → 그날 밤(UTC) 크론이 받는다.
 *    7일 + 발표가 하루 밀리는 주 1일 + 크론 한 번 실패 1일 = **9일**. 투어 랭킹(kpga·klpga)은 대회가 끝나야 바뀌어
 *    정해진 주기가 없다 — 시즌(한국 시각 4~11월)엔 주 1회 + 대회 없는 주 하나(7일) + 2일 = **16일**, 비시즌엔 재지 않는다.
 * 날짜는 회차 이름(edition)이 아니라 **들어온 때**(golf_rankings.created_at — 한 회차는 한 트랜잭션이라 같은 값)로 잰다.
 * 롤렉스 폴백(wwgr)은 다음 주 월요일로 라벨을 미리 붙여 회차 날짜가 미래다(2026-10-01 실측: 10-05 회차가 09-28 에 들어옴).
 *
 * 운영자 알림 대상(alert)은 **멈춤 전부 + 세계 랭킹의 늦음**뿐이다. 투어 랭킹의 늦음은 대회 일정 탓에 흔히 생겨
 * 화면(골프 현황)에만 노랗게 띄운다 — 알림으로 보내면 매주 소음이다.
 */
export type GolfFeedState = "ok" | "late" | "stopped";

/** DB 에서 읽은 그대로(시각은 ISO 문자열, UTC). */
export interface GolfFeedRow {
    tour: GolfTour;
    /** 최신 회차 이름 "2026-09-27"(없으면 null) */
    edition: string | null;
    /** 그 회차가 들어온 때 */
    ingestedAt: string | null;
    /** 마지막으로 수집이 성공한 때(golf_players.updated_at 최댓값) */
    lastSyncAt: string | null;
}

export interface GolfFeedHealth extends GolfFeedRow {
    state: GolfFeedState;
    /** 최신 회차가 들어온 지 며칠(소수 한 자리) */
    editionAgeDays: number | null;
    /** 마지막 수집이 몇 시간 전(소수 한 자리) */
    syncAgeHours: number | null;
    /** 늦음 기준(일). 비시즌 투어 랭킹은 null — 재지 않는다 */
    limitDays: number | null;
    /** 운영자 알림 대상인가(멈춤 전부 + 세계 랭킹 늦음) */
    alert: boolean;
    /** 무엇이 문제인가 — 짧게, 화면이 날짜·시간 옆에 붙인다(정상이면 빈 문자열) */
    reason: string;
    /** 한 줄 설명(알림 본문 — 숫자·회차까지) */
    detail: string;
}

export const GOLF_SYNC_LIMIT_HOURS = 30;
export const GOLF_WORLD_LIMIT_DAYS = 9;
export const GOLF_TOUR_LIMIT_DAYS = 16;
/** 골프 알림은 제목을 따로 쓴다 — 같은 제목이면 UMB 가 밀린 날(9/24~ 매일) 골프 알림이 24시간 중복 막기에 늘 먹힌다. */
export const GOLF_ALERT_TITLE = "골프 랭킹 수집이 멈춰 있어요";
/** 골프 알림을 누르면 여는 곳 — 어드민 '골프 현황'(dashboard 의 ?tab= 딥링크) */
export const GOLF_ALERT_URL = "/admin/dashboard?tab=golf-overview";

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** KPGA·KLPGA 정규 시즌(한국 시각 4~11월). 그 밖엔 대회가 없어 회차가 몇 달씩 그대로인 게 정상이다. */
export function isGolfTourSeason(nowMs: number): boolean {
    const month = new Date(nowMs + 9 * HOUR_MS).getUTCMonth() + 1;
    return month >= 4 && month <= 11;
}

/** 이 투어의 늦음 기준(일). null = 지금은 재지 않는다(비시즌 투어 랭킹). */
export function golfEditionLimitDays(tour: GolfTour, nowMs: number): number | null {
    if (GOLF_TOUR_META[tour].world) return GOLF_WORLD_LIMIT_DAYS;
    return isGolfTourSeason(nowMs) ? GOLF_TOUR_LIMIT_DAYS : null;
}

/** "13시간" · "3일" */
function ageText(hours: number): string {
    return hours < 48 ? `${Math.round(hours)}시간` : `${Math.floor(hours / 24)}일`;
}

/** 한 투어의 상태(순수 함수 — 화면과 알림이 같은 판정을 쓴다). */
export function judgeGolfFeed(row: GolfFeedRow, nowMs: number): GolfFeedHealth {
    const syncMs = row.lastSyncAt ? Date.parse(row.lastSyncAt) : NaN;
    const inMs = row.ingestedAt ? Date.parse(row.ingestedAt) : NaN;
    const syncAgeHours = Number.isFinite(syncMs) ? round1(Math.max(0, nowMs - syncMs) / HOUR_MS) : null;
    const editionAgeDays = Number.isFinite(inMs) ? round1(Math.max(0, nowMs - inMs) / DAY_MS) : null;
    const limitDays = golfEditionLimitDays(row.tour, nowMs);

    let state: GolfFeedState = "ok";
    let reason = "";
    let detail: string;
    if (!row.edition || editionAgeDays === null) {
        state = "stopped";
        reason = detail = "회차가 하나도 없음";
    } else if (syncAgeHours === null || syncAgeHours > GOLF_SYNC_LIMIT_HOURS) {
        state = "stopped";
        reason = syncAgeHours === null ? "수집 기록 없음" : `${GOLF_SYNC_LIMIT_HOURS}시간 넘게 수집이 안 됨`;
        detail = syncAgeHours === null ? reason : `마지막 수집 ${ageText(syncAgeHours)} 전(기준 ${GOLF_SYNC_LIMIT_HOURS}시간)`;
    } else if (limitDays !== null && editionAgeDays > limitDays) {
        state = "late";
        reason = `새 회차가 ${limitDays}일 넘게 없음`;
        detail = `새 회차 ${Math.floor(editionAgeDays)}일째 없음(기준 ${limitDays}일) · 최신 ${row.edition}`;
    } else {
        detail = `최신 ${row.edition} · 들어온 지 ${ageText(editionAgeDays * 24)}`;
    }
    const alert = state === "stopped" || (state === "late" && GOLF_TOUR_META[row.tour].world);
    return { ...row, state, editionAgeDays, syncAgeHours, limitDays, alert, reason, detail };
}

/**
 * 투어마다 최신 회차·들어온 때·마지막 수집(읽기만). 최신 회차는 (tour, edition, rank) 인덱스를 거꾸로 한 줄만 읽는다.
 * 시각은 SQL 에서 바로 ISO 문자열로 — timestamp(시간대 없음)를 드라이버가 Date 로 바꾸면 KST 기기에서 9시간 밀린다.
 */
export async function readGolfFeedRows(): Promise<GolfFeedRow[]> {
    const tours = sql.join(GOLF_TOURS.map((t) => sql`(${t})`), sql`, `);
    const res: any = await db.execute(sql`
        select t.tour,
               e.edition,
               to_char(e.created_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as ingested_at,
               (select to_char(max(p.updated_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                  from golf_players p where p.tour = t.tour) as last_sync_at
        from (values ${tours}) as t(tour)
        left join lateral (
            select g.edition, g.created_at from golf_rankings g
            where g.tour = t.tour order by g.edition desc limit 1
        ) e on true`);
    const byTour = new Map<string, any>(((res.rows ?? res) as any[]).map((r) => [String(r.tour), r]));
    return GOLF_TOURS.map((tour) => {
        const r = byTour.get(tour);
        return {
            tour,
            edition: r?.edition ? String(r.edition) : null,
            ingestedAt: r?.ingested_at ? String(r.ingested_at) : null,
            lastSyncAt: r?.last_sync_at ? String(r.last_sync_at) : null,
        };
    });
}

/**
 * 골프 랭킹 건강 점검 — 알림 대상만 FeedIssue 로(멈춤 = 출처 오류, 세계 랭킹 늦음 = 밀림).
 * 크론에서 쓸 때는 제목을 따로: `alertIfUnhealthy(await checkGolfHealth(), { title: GOLF_ALERT_TITLE, url: GOLF_ALERT_URL })`.
 */
export async function checkGolfHealth(nowMs = Date.now()): Promise<FeedIssue[]> {
    try {
        return (await readGolfFeedRows())
            .map((r) => judgeGolfFeed(r, nowMs))
            .filter((h) => h.alert)
            .map((h) => ({ feed: "golf" as const, scope: h.tour, kind: h.state === "stopped" ? "source-error" as const : "stale" as const, detail: h.detail }));
    } catch (e) {
        return [{ feed: "golf", scope: "db", kind: "source-error", detail: (e as Error)?.message?.slice(0, 120) ?? "알 수 없음" }];
    }
}

/** 한 줄 요약(알림 본문·크론 응답용). */
export function summarize(issues: readonly FeedIssue[]): string {
    return issues.map((i) => `${i.feed.toUpperCase()} ${i.scope}: ${i.kind === "stale" ? "밀림" : "출처 오류"}(${i.detail})`).join(" / ");
}

/**
 * 문제가 있으면 운영자에게 알린다. 같은 제목이 24시간 안에 있으면 건너뛴다(하루 한 번).
 * title·url 을 주면 그 제목으로 따로 센다(골프 2026-10-01 — 기본값은 예전 그대로라 UMB·PBA 호출은 바뀌지 않는다).
 */
export async function alertIfUnhealthy(
    issues: readonly FeedIssue[],
    opts: { title?: string; url?: string } = {},
): Promise<{ notified: number; skipped: boolean }> {
    if (issues.length === 0 || ADMIN_MEMBER_IDS.length === 0) return { notified: 0, skipped: false };
    const title = opts.title ?? ALERT_TITLE;
    const [recent] = (await db.execute(sql`
        select count(*)::int n from hiq_notifications
        where title = ${title} and created_at > now() - interval '24 hours'`)).rows as any[];
    if (recent?.n > 0) return { notified: 0, skipped: true };
    const body = summarize(issues).slice(0, 200);
    let notified = 0;
    for (const memberId of ADMIN_MEMBER_IDS) {
        await notificationService.sendAndSaveNotification({
            memberId, title, body, category: "admin", type: "broadcast",
            params: { url: opts.url ?? "/admin/dashboard" },
        }).then(() => { notified++; }).catch((e) => console.error("[FeedHealth]", e));
    }
    return { notified, skipped: false };
}
