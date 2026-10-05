/**
 * 라운드 전날 저녁 브리핑(2026-10-05 오너 "응": 라운드 브리핑 7번) — 내일 치는 사람에게 저녁 7~8시대에 한 번.
 *
 * 누구에게: '내일 내가 친다'가 확실한 사람만 — 골프장 상세의 '내 티타임'과 같은 뜻이다(routes/modules/golfCourses.ts).
 *   · 조인 글을 올린 사람(호스트는 같이 친다) · 신청이 확정(accepted)된 사람.
 *   · 부킹 글을 올린 사람은 **빼낸다** — 그건 파는 티타임이다.
 *   · 가려진 글(is_blinded)·골프장 이름을 가린 글(is_blind)은 보내지 않는다.
 * 무엇을: "내일 07:12 ○○CC 라운드" + 그 라운드의 한 줄 평·근거 숫자·챙길 것. 누르면 그 골프장 날씨가 그 티오프로 열린다.
 *   날씨는 받아 둔 예보에서만 읽는다(roundBriefAt — 기상청을 부르지 않는다). 스크린이거나 골프장을 모르거나 예보가 없으면 준비물만 권한다.
 * 언제: 한국 시각 19:00~20:59(shared/golfRoundShare eveWindow). 매시 도는 리마인더 크론에 얹었다 — 크론 항목을 늘리지 않는다
 *   (Vercel 요금제가 개수를 센다). 21시부터는 조용한 시간이라 보내지 않는다.
 * 한 번만: 알림함에 남긴 params.reminderKey('golf-eve:<글 id>')로 같은 글·같은 사람에게 두 번 가지 않게 한다(19시·20시 두 번 돈다).
 * 설정: type JOIN — 알림 설정의 '조인·부킹' 칸을 탄다(끈 사람은 알림함에만 남는다).
 *
 * dry: 보내지 않고 누구에게 무엇이 갈지 세기만 한다(점검용 — /api/cron/golf-round-eve?dry=1). 회원 id 는 응답에 싣지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { notificationService } from "./notificationService.js";
import { eveKey, eveNotice, eveUrl, eveWindow } from "../../shared/golfRoundShare.js";
import { kstParts } from "../../shared/golfWeather.js";
import type { RoundBrief } from "../../shared/golfRoundBrief.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
/** golf_bookings.datetime 은 시간대 없는 UTC — 글자로 오면 Z 를 붙여 읽는다(그냥 new Date 하면 9시간이 어긋난다) */
export function utcMs(v: unknown): number {
    if (v instanceof Date) return v.getTime();
    const s = String(v).trim().replace(" ", "T");
    return Date.parse(/[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`);
}
const textArray = (xs: readonly string[]) => `{${xs.map((x) => `"${x.replace(/["\\]/g, "")}"`).join(",")}}`;
/** text[] 칸 — 드라이버가 배열로 주면 그대로, 글자("{a,b}")로 주면 풀어서 */
export function pgTextArray(v: unknown): string[] {
    if (Array.isArray(v)) return v.filter((x) => x != null).map(String);
    if (typeof v !== "string") return [];
    return v.replace(/^\{|\}$/g, "").split(",").map((x) => x.trim().replace(/^"|"$/g, "")).filter((x) => x && x !== "NULL");
}

/** 날씨를 읽는 데 쓰는 시간의 뚜껑 */
const WEATHER_BUDGET_MS = 4000;

export interface EveRound { id: string; teeMs: number; courseId: string | null; name: string | null; listingType: string; joinType: string | null; ownerId: string | null; accepted: string[] }
/** 그 글에서 내일 치는 사람들 — 확정된 신청자 + (조인이면) 올린 사람. 겹치면 한 번만 */
export function eveRecipients(r: Pick<EveRound, "listingType" | "ownerId" | "accepted">): string[] {
    const out = new Set(r.accepted.filter(Boolean));
    if (r.listingType === "JOIN" && r.ownerId) out.add(r.ownerId);
    return [...out];
}

export interface EveResult {
    due: boolean; ymd: string; rounds: number; players: number; sent: number; already: number; failed: number; dry: boolean;
    /** dry 일 때만 — 무엇이 갈지(회원 id 없음) */
    preview?: { title: string; body: string; url: string; to: number }[];
}

export async function runGolfRoundEve(nowMs = Date.now(), opts: { dry?: boolean; force?: boolean } = {}): Promise<EveResult> {
    const w = eveWindow(nowMs);
    const out: EveResult = { due: w.due, ymd: w.ymd, rounds: 0, players: 0, sent: 0, already: 0, failed: 0, dry: !!opts.dry };
    // 보낼 시간이 아니면 아무것도 읽지 않는다(매시 불린다). 점검(dry)은 시간 밖에서도 볼 수 있게 force 를 따로 둔다.
    if (!w.due && !opts.force) return out;

    const rows = rowsOf(await db.execute(sql`
        select b.id, b.datetime, b.course_id, b.course_name, b.venue_name, b.listing_type, b.join_type, b.owner_id,
               coalesce(array_agg(r.member_id::text) filter (where r.status = 'accepted'), '{}') as accepted
        from golf_bookings b left join golf_join_requests r on r.booking_id = b.id
        where b.is_blinded = false and coalesce(b.is_blind, false) = false
          and b.datetime >= ${w.fromUtc}::timestamp and b.datetime < ${w.toUtc}::timestamp
        group by b.id order by b.datetime asc limit 500`));
    const rounds: EveRound[] = rows.map((r) => ({
        id: String(r.id), teeMs: utcMs(r.datetime), courseId: r.course_id != null ? String(r.course_id) : null,
        name: (r.venue_name || r.course_name || null) as string | null, listingType: String(r.listing_type ?? "BOOKING"),
        joinType: r.join_type ?? null, ownerId: r.owner_id ? String(r.owner_id) : null,
        accepted: pgTextArray(r.accepted),
    })).filter((r) => Number.isFinite(r.teeMs));
    const plan = rounds.map((r) => ({ r, to: eveRecipients(r) })).filter((x) => x.to.length > 0);
    out.rounds = plan.length;
    out.players = plan.reduce((n, x) => n + x.to.length, 0);
    if (!plan.length) return out;

    // 이미 보낸 것 — 같은 글·같은 사람
    const keys = plan.map((x) => eveKey(x.r.id));
    const sentRows = rowsOf(await db.execute(sql`
        select member_id::text as member_id, params->>'reminderKey' as k from hiq_notifications
        where type = 'JOIN' and created_at > now() - interval '36 hours' and params->>'reminderKey' = any(${textArray(keys)}::text[])`));
    const done = new Set(sentRows.map((x) => `${x.k}|${x.member_id}`));

    // 날씨 — 필드이고 골프장을 아는 글만. 못 읽어도 알림은 간다(준비물만 권한다).
    const { loadGolfCourseSummary } = await import("../routes/modules/golfCourses.js");
    const { roundBriefAt } = await import("./golfWeather.js");
    const summary = await loadGolfCourseSummary().catch(() => null);
    const sends: Promise<unknown>[] = [];
    if (opts.dry) out.preview = [];
    // 같은 골프장·같은 시각은 한 번만 읽고, 날씨 읽기에 쓰는 시간에는 뚜껑을 둔다(크론은 10초 안에 끝나야 한다 —
    // 뚜껑을 넘긴 글은 날씨 없이 준비물만 권한다. 알림 자체는 빠뜨리지 않는다).
    const briefs = new Map<string, RoundBrief | null>();
    const startedAt = Date.now();
    for (const { r, to } of plan) {
        const page = summary && r.courseId && /^\d+$/.test(r.courseId) && r.joinType !== "SCREEN" ? summary.byCourseId.get(Number(r.courseId)) ?? null : null;
        const k = kstParts(r.teeMs);
        let brief: RoundBrief | null = null;
        if (page) {
            const bk = `${page.slug}|${k.h}`;
            if (briefs.has(bk)) brief = briefs.get(bk)!;
            else if (Date.now() - startedAt < WEATHER_BUDGET_MS) {
                brief = (await roundBriefAt(page, { ymd: k.ymd, hour: k.h }, nowMs).catch(() => null))?.brief ?? null;
                briefs.set(bk, brief);
            }
        }
        const t = eveNotice({ name: page?.name ?? r.name, teeMs: r.teeMs, brief });
        const url = eveUrl(page?.slug ?? null, r.teeMs, brief?.teeHour);
        const fresh = to.filter((m) => !done.has(`${eveKey(r.id)}|${m}`));
        out.already += to.length - fresh.length;
        if (opts.dry) { out.preview!.push({ ...t, url, to: fresh.length }); continue; }
        for (const memberId of fresh) {
            sends.push(notificationService.sendAndSaveNotification({
                memberId, title: t.title, body: t.body, category: "GOLF", type: "JOIN", pref: "golf",
                params: { url, reminderKey: eveKey(r.id), teeAt: new Date(r.teeMs).toISOString() },
            }).then(() => { out.sent++; }, (e: unknown) => { out.failed++; console.error("[GolfRoundEve]", e); }));
        }
    }
    await Promise.allSettled(sends);
    return out;
}
