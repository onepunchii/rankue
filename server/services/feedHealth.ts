/**
 * 외부 랭킹 크롤러 건강 점검(2026-09-09 오너). "크론이 돌았나"가 아니라 **"새 데이터가 들어왔나"** 를 본다 —
 * 실제로 UMB 는 시간 초과로 한 달, PBA 는 인증서 교체로 조용히 멈춰 있었는데 아무도 몰랐다.
 *
 * 판정
 *  - UMB: 출처 아카이브의 최신 회차가 우리 최신 회차보다 새로우면 "밀림"(부문별). 아카이브를 못 읽으면 "출처 오류".
 *  - PBA: 현재 시즌 랭킹을 못 받아오면 "출처 오류"(인증서·API 변경), 받아왔는데 우리 DB 에 그 시즌이 비면 "밀림".
 * 알림은 하루 한 번까지만(같은 제목이 24시간 안에 있으면 건너뛴다) — 매일 같은 소리로 알림함을 채우지 않는다.
 */
import { db } from "../db.js";
import { sql } from "drizzle-orm";
import { notificationService } from "./notificationService.js";

export interface FeedIssue {
    feed: "umb" | "pba";
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

/** 한 줄 요약(알림 본문·크론 응답용). */
export function summarize(issues: readonly FeedIssue[]): string {
    return issues.map((i) => `${i.feed.toUpperCase()} ${i.scope}: ${i.kind === "stale" ? "밀림" : "출처 오류"}(${i.detail})`).join(" / ");
}

/** 문제가 있으면 운영자에게 알린다. 같은 제목이 24시간 안에 있으면 건너뛴다(하루 한 번). */
export async function alertIfUnhealthy(issues: readonly FeedIssue[]): Promise<{ notified: number; skipped: boolean }> {
    if (issues.length === 0 || ADMIN_MEMBER_IDS.length === 0) return { notified: 0, skipped: false };
    const [recent] = (await db.execute(sql`
        select count(*)::int n from hiq_notifications
        where title = ${ALERT_TITLE} and created_at > now() - interval '24 hours'`)).rows as any[];
    if (recent?.n > 0) return { notified: 0, skipped: true };
    const body = summarize(issues).slice(0, 200);
    let notified = 0;
    for (const memberId of ADMIN_MEMBER_IDS) {
        await notificationService.sendAndSaveNotification({
            memberId, title: ALERT_TITLE, body, category: "admin", type: "broadcast",
            params: { url: "/admin/dashboard" },
        }).then(() => { notified++; }).catch((e) => console.error("[FeedHealth]", e));
    }
    return { notified, skipped: false };
}
