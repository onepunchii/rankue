/**
 * 관심 골프장 알림을 공식 사이트의 남은 티로도(2026-11-04 오너: "순서대로 추천대로 다 진행").
 *
 * 실측(11/4): 관심 등록 95건 · 44명인데 **알림은 한 번도 나가지 않았다**(hiq_notifications 의 watchSlug 0줄) — 관심 알림은 회원의 새 글
 * (POST /bookings)에서만 나가는데, 조인 · 부킹 글은 통틀어 2건이었다. 그사이 남은 티 크롤러(golfOpenTees — 21곳)는 하루 310개쯤의
 * 새 티(그 날을 처음 본 뒤에 생긴 줄 = 취소티 — shared/golfOpenTee isNewTee)를 보고 있었다. 이 둘을 잇는다.
 *
 * 크론(남은 티 받기 · 20분마다)이 받기를 마친 뒤 부른다. 한 사람 · 한 골프장당 **세 시간에 한 통**(OPEN_TEE_GAP_MIN) — 한 곳에 하루 열댓 개가
 * 새로 나오므로 나올 때마다 울리면 소음이다. 그 사이에 나온 티는 다음 한 통에 모여 실린다(지난 알림 뒤에 처음 본 것 · 아직 지나지 않은 것).
 * 관심 조건(주중/주말 · 1·2·3부 · 그린피 상한)을 탄다. 종류를 골랐으면 '부킹'이나 '긴급·취소티'를 고른 사람만(남은 티는 조인이 아니다).
 * 하루 상한 · 알림 형식은 관심 알림(golfCourseWatch)과 같다 — type GOLF_URGENT, params.watchSlug. 조용한 시간(21 ~ 08시)에는 **보내지 않고 모아 둔다** —
 * 아침 첫 통에 밤사이 나온 티가 실린다(열두 시간 안에 나온 것). 관심 글 알림처럼 밤에 알림함에만 남기면 그 뒤 세 시간이 막혀 아침 푸시를 놓친다.
 * 판정과 문구는 순수 함수 — golfOpenTeeAlerts.test.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { WATCH_DAILY_CAP, WATCH_PUSH_FROM_HOUR, WATCH_PUSH_UNTIL_HOUR, dayText, matchesWatch, timeText, type WatchFilters, type WatchListing } from "./golfCourseWatch.js";
import { kstHour } from "../../shared/golfJoin.js";
import { coursePath, teePart, wonShort } from "../../shared/golfCourse.js";
import { teeStillAhead } from "../../shared/golfOpenTee.js";

/** 한 사람 · 한 골프장에 남은 티 알림을 다시 보내기까지(분) */
export const OPEN_TEE_GAP_MIN = 180;
/** 이보다 오래전에 나온 티는 '새로'가 아니다(처음 켠 날 · 오래 쉰 뒤에 묵은 티를 몰아 보내지 않게). 밤 동안 모아 둔 것이 아침에 실릴 만큼 */
export const OPEN_TEE_FRESH_MS = 12 * 3_600_000;

export interface FreshTee { slug: string; day: string; time: string; course: string; price: number | null; firstSeenMs: number }
export interface OpenTeeWatcher { memberId: string; slug: string; name: string; filters: WatchFilters | null }
export interface OpenTeeAlert { memberId: string; slug: string; name: string; tees: FreshTee[]; push: boolean }

const teeAtMs = (t: Pick<FreshTee, "day" | "time">) => Date.parse(`${t.day}T${t.time}:00+09:00`);

/** 관심 조건에 맞나 — 종류는 '부킹' · '긴급·취소티'만 통과(빈 조건은 전부), 나머지는 관심 알림의 판정 그대로 */
export function matchesOpenTee(t: FreshTee, f: WatchFilters | null | undefined, nowMs: number): boolean {
    if (!f) return true;
    if (f.kinds?.length && !f.kinds.some((k) => k === "booking" || k === "urgent")) return false;
    const listing: WatchListing = { id: `open:${t.slug}:${t.day}:${t.time}:${t.course}`, listingType: "BOOKING", greenFee: t.price, datetime: new Date(teeAtMs(t)) };
    return matchesWatch(listing, { ...f, kinds: undefined }, nowMs);
}

/**
 * 누구에게 무엇을(순수 함수). lastAlertMs 는 `${memberId}|${slug}` → 그 골프장으로 마지막 관심 알림을 받은 때, todayPushed 는 지난 24시간 울린 수.
 * 세 시간 안에 받은 사람은 건너뛰고(그 사이 티는 다음 통에 실린다), 하루 상한을 넘으면 알림함에만 — 이른 티가 든 골프장부터 울린다.
 */
export function planOpenTeeAlerts(input: {
    tees: FreshTee[];
    watchers: OpenTeeWatcher[];
    lastAlertMs: ReadonlyMap<string, number>;
    todayPushed: ReadonlyMap<string, number>;
    nowMs: number;
    gapMin?: number;
    dailyCap?: number;
}): OpenTeeAlert[] {
    const gap = (input.gapMin ?? OPEN_TEE_GAP_MIN) * 60_000;
    const cap = input.dailyCap ?? WATCH_DAILY_CAP;
    const bySlug = new Map<string, FreshTee[]>();
    for (const t of input.tees) {
        if (!teeStillAhead(t.day, t.time, input.nowMs) || input.nowMs - t.firstSeenMs > OPEN_TEE_FRESH_MS) continue;
        const a = bySlug.get(t.slug) ?? [];
        a.push(t);
        bySlug.set(t.slug, a);
    }
    const perMember = new Map<string, OpenTeeAlert[]>();
    for (const w of input.watchers) {
        const ts = bySlug.get(w.slug);
        if (!ts) continue;
        const last = input.lastAlertMs.get(`${w.memberId}|${w.slug}`) ?? 0;
        if (input.nowMs - last < gap) continue;
        const hit = ts.filter((t) => t.firstSeenMs > last && matchesOpenTee(t, w.filters, input.nowMs))
            .sort((a, b) => teeAtMs(a) - teeAtMs(b) || a.course.localeCompare(b.course));
        if (!hit.length) continue;
        const list = perMember.get(w.memberId) ?? [];
        if (!list.some((x) => x.slug === w.slug)) list.push({ memberId: w.memberId, slug: w.slug, name: w.name, tees: hit, push: true });
        perMember.set(w.memberId, list);
    }
    const out: OpenTeeAlert[] = [];
    for (const [memberId, alerts] of perMember) {
        let room = Math.max(0, cap - (input.todayPushed.get(memberId) ?? 0));
        alerts.sort((a, b) => teeAtMs(a.tees[0]) - teeAtMs(b.tees[0]));
        for (const a of alerts) { if (room > 0) room--; else a.push = false; out.push(a); }
    }
    return out;
}

/** 제목 · 본문 · 딥링크(그 골프장 페이지 — 남은 티 구역이 있다) */
export function openTeeAlertText(a: Pick<OpenTeeAlert, "slug" | "name" | "tees">, nowMs: number): { title: string; body: string; url: string; teeAt: string } {
    const ts = a.tees;
    const first = ts[0];
    const at = (t: FreshTee) => new Date(teeAtMs(t));
    const teeAt = at(first).toISOString();
    const url = coursePath(a.slug);
    if (ts.length === 1) {
        const body = [`${dayText(at(first), nowMs)} ${teePart(at(first))}부 ${timeText(at(first))}`, first.course || "", first.price ? wonShort(first.price) : "", "공식 사이트 예약"].filter(Boolean).join(" · ");
        return { title: `⛳ ${a.name} 취소티가 나왔어요`, body, url, teeAt };
    }
    let lastDay = "";
    const times = ts.slice(0, 3).map((t) => {
        const d = dayText(at(t), nowMs);
        const s = d === lastDay ? timeText(at(t)) : `${d} ${timeText(at(t))}`;
        lastDay = d;
        return s;
    }).join(", ");
    const more = ts.length > 3 ? ` 외 ${ts.length - 3}개` : "";
    const prices = ts.map((t) => t.price ?? 0).filter((p) => p > 0);
    const low = prices.length ? `최저 ${wonShort(Math.min(...prices))}` : "";
    return { title: `⛳ ${a.name} 취소티 ${ts.length}개가 나왔어요`, body: [`${times}${more}`, low].filter(Boolean).join(" · "), url, teeAt };
}

// ── 보내기 ────────────────────────────────────────────────────────
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const pgArray = (xs: readonly string[]) => `{${xs.map((x) => `"${String(x).replace(/["\\]/g, "")}"`).join(",")}}`;

/** 남은 티를 받은 뒤 부른다. 실패는 삼킨다(받기 결과를 막지 않는다). */
export async function alertOpenTeeWatchers(nowMs = Date.now()): Promise<{ tees: number; pushed: number; inboxOnly: number } | { skipped: string }> {
    const hour = kstHour(nowMs);
    if (hour < WATCH_PUSH_FROM_HOUR || hour >= WATCH_PUSH_UNTIL_HOUR) return { skipped: "조용한 시간(21 ~ 08시) — 아침에 모아 보낸다" };
    try {
        // 관심 등록된 골프장의 새 티(그 날을 처음 본 뒤에 생긴 줄) — 열두 시간 안에 나온 것만
        const teeRows = rowsOf(await db.execute(sql`
            select t.slug, t.play_date, t.tee_time, t.course, t.price, (extract(epoch from t.first_seen) * 1000)::bigint as first_ms
            from golf_open_tees t join golf_open_tee_days d on d.slug = t.slug and d.play_date = t.play_date and d.ok
            where t.first_seen > d.first_checked + interval '1 minute' and t.first_seen > now() - interval '12 hours'
              and exists (select 1 from golf_course_watches w where w.slug = t.slug)`));
        if (!teeRows.length) return { tees: 0, pushed: 0, inboxOnly: 0 };
        const tees: FreshTee[] = teeRows.map((r) => ({ slug: r.slug, day: r.play_date, time: r.tee_time, course: r.course ?? "", price: r.price ?? null, firstSeenMs: Number(r.first_ms) }));
        const slugs = [...new Set(tees.map((t) => t.slug))];
        // 탈퇴 회원은 행이 '탈퇴회원'으로 남는다 — 알림을 만들지 않는다
        const watchRows = rowsOf(await db.execute(sql`
            select w.member_id, w.slug, w.filters, p.name
            from golf_course_watches w join golf_course_pages p on p.slug = w.slug join hiq_members m on m.id = w.member_id
            where w.slug = any(${pgArray(slugs)}::text[]) and m.name <> '탈퇴회원'`));
        if (!watchRows.length) return { tees: tees.length, pushed: 0, inboxOnly: 0 };
        const watchers: OpenTeeWatcher[] = watchRows.map((w) => ({ memberId: String(w.member_id), slug: w.slug, name: w.name, filters: w.filters ?? null }));
        const memberIds = [...new Set(watchers.map((w) => w.memberId))];
        // 지난 24시간의 관심 알림 — 골프장마다 마지막 때(울렸든 알림함에만이든) · 울린 수. 시간은 DB 안에서 epoch 로
        const sent = rowsOf(await db.execute(sql`
            select member_id, params->>'watchSlug' as slug, (extract(epoch from max(created_at)) * 1000)::bigint as last_ms,
                   count(*) filter (where coalesce(params->>'pushed', 'true') = 'true')::int as pushed
            from hiq_notifications
            where member_id = any(${pgArray(memberIds)}::uuid[]) and type = 'GOLF_URGENT' and params ? 'watchSlug' and created_at > now() - interval '24 hours'
            group by member_id, params->>'watchSlug'`));
        const lastAlertMs = new Map<string, number>();
        const todayPushed = new Map<string, number>();
        for (const s of sent) {
            lastAlertMs.set(`${s.member_id}|${s.slug}`, Number(s.last_ms));
            todayPushed.set(String(s.member_id), (todayPushed.get(String(s.member_id)) ?? 0) + Number(s.pushed));
        }
        const plan = planOpenTeeAlerts({ tees, watchers, lastAlertMs, todayPushed, nowMs });
        let pushed = 0, inboxOnly = 0;
        await Promise.allSettled(plan.map((a) => {
            const t = openTeeAlertText(a, nowMs);
            // 하루 상한을 넘은 것만 알림함에(조용한 시간은 위에서 이미 걸렀다)
            const ring = a.push;
            if (ring) pushed++; else inboxOnly++;
            const params = { url: t.url, watchSlug: a.slug, teeAt: t.teeAt, n: a.tees.length, pushed: ring, openTee: true };
            const base = { memberId: a.memberId, title: t.title, body: t.body, category: "GOLF", type: "GOLF_URGENT", params };
            return (ring
                ? notificationService.sendAndSaveNotification({ ...base, pref: "golf" })
                : storage.createNotification({ ...base, isRead: false })
            ).catch((e: unknown) => console.error("[GolfOpenTeeAlert]", e));
        }));
        return { tees: tees.length, pushed, inboxOnly };
    } catch (e) {
        console.error("[GolfOpenTeeAlert]", e);
        return { skipped: String((e as Error)?.message ?? e).slice(0, 80) };
    }
}
