/**
 * 이번 주말 관심 골프장(2026-11-04 오너: "순서대로 추천대로 다 진행" — 골프 3번).
 *
 * 실측(11/4): 가입 7일 넘은 골프 회원의 88%가 첫날만 썼다 — 다시 열 까닭이 없었다. 관심 골프장을 등록한 회원(44명)에게
 * **목요일 저녁 한 번**: 이번 토 · 일의 남은 티 수(공식 사이트를 받는 곳만 — services/golfOpenTees) + 토요일 아침 날씨 한 줄(받아 둔 예보만 —
 * roundBriefAt, 기상청을 부르지 않는다). 지어내지 않는다 — 남은 티를 받지 않는 곳은 수를 적지 않고, 예보가 없으면 날씨를 적지 않는다.
 * 말할 것이 하나도 없는 사람에게는 보내지 않는다.
 *
 * 언제: 한국 시각 목요일 19:00 ~ 20:59. 매시 도는 리마인더 크론에 얹는다(크론 항목을 늘리지 않는다).
 * 한 번만: params.reminderKey 'golf-weekend:<토요일>' 로 같은 주 · 같은 사람에게 두 번 가지 않는다(19시 · 20시 두 번 돈다).
 * 관심 알림의 쿨다운 · 하루 상한에는 들지 않는다(params.watchSlug 를 싣지 않는다). 설정은 골프 알림(pref golf)을 탄다.
 * dry: 보내지 않고 세기만(/api/cron/golf-weekend?dry=1). 회원 id 는 응답에 싣지 않는다.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { notificationService } from "./notificationService.js";
import { coursePath } from "../../shared/golfCourse.js";
import { kstParts } from "../../shared/golfWeather.js";
import { teeSource, teeStillAhead } from "../../shared/golfOpenTee.js";

const rowsOf = (r: any) => (r.rows ?? r) as any[];
const DAY = 86_400_000;
/** 날씨를 읽는 데 쓰는 시간의 뚜껑(크론은 10초 안에 끝나야 한다) */
const WEATHER_BUDGET_MS = 3500;
/** 한 통에 이름을 적는 골프장 수 — 넘으면 '외 N곳'(알림 본문은 두 줄 남짓에서 잘린다) */
export const WEEKEND_SHOWN = 2;
/** 관심 골프장이 둘 이상이면 이리로 — 골프장 목록의 '내 관심'만 보기 */
export const WATCHED_LIST_PATH = "/golf/courses?watched=1";

/** 보낼 때인가 · 이번 주말의 토 · 일(한국 날짜 'YYYY-MM-DD')과 토요일 'YYYYMMDD' */
export function weekendWindow(nowMs: number): { due: boolean; sat: string; sun: string; satYmd: string } {
    const k = kstParts(nowMs);
    const toSat = (6 - k.dow + 7) % 7;
    const sat = kstParts(nowMs + toSat * DAY), sun = kstParts(nowMs + (toSat + 1) * DAY);
    return { due: k.dow === 4 && k.h >= 19 && k.h < 21, sat: sat.key, sun: sun.key, satYmd: sat.ymd };
}
export const weekendKey = (sat: string) => `golf-weekend:${sat}`;

export interface WeekendCourse { slug: string; name: string; /** 토 · 일 남은 티 수 — 받지 않는 골프장은 null */ tees: number | null; /** 토요일 아침 날씨 한 줄 — 예보가 없으면 null */ wx: string | null }

/** 제목 · 본문 · 딥링크. 말할 것이 없으면 null(보내지 않는다) */
export function weekendNotice(courses: readonly WeekendCourse[]): { title: string; body: string; url: string } | null {
    const said = courses.filter((c) => (c.tees ?? 0) > 0 || !!c.wx)
        .sort((a, b) => (b.tees ?? -1) - (a.tees ?? -1) || a.name.localeCompare(b.name, "ko"));
    if (!said.length) return null;
    const line = (c: WeekendCourse) => [c.name, (c.tees ?? 0) > 0 ? `남은 티 ${c.tees!.toLocaleString("en-US")}개` : "", c.wx ? `토 ${c.wx}` : ""].filter(Boolean).join(" · ");
    const shown = said.slice(0, WEEKEND_SHOWN);
    const more = said.length - shown.length;
    return {
        title: "⛳ 이번 주말, 관심 골프장",
        body: `${shown.map(line).join(" / ")}${more > 0 ? ` 외 ${more}곳` : ""}`,
        url: said.length === 1 ? coursePath(said[0].slug) : WATCHED_LIST_PATH,
    };
}

export interface WeekendResult {
    due: boolean; sat: string; members: number; sent: number; already: number; empty: number; failed: number; dry: boolean;
    preview?: { title: string; body: string; url: string }[];
}

export async function runGolfWeekendWatch(nowMs = Date.now(), opts: { dry?: boolean; force?: boolean } = {}): Promise<WeekendResult> {
    const w = weekendWindow(nowMs);
    const out: WeekendResult = { due: w.due, sat: w.sat, members: 0, sent: 0, already: 0, empty: 0, failed: 0, dry: !!opts.dry };
    // 보낼 때가 아니면 아무것도 읽지 않는다(매시 불린다). 점검(dry)은 시간 밖에서도 볼 수 있게 force 를 따로 둔다.
    if (!w.due && !opts.force) return out;

    // 탈퇴 회원은 행이 '탈퇴회원'으로 남는다 — 알림을 만들지 않는다
    const watches = rowsOf(await db.execute(sql`
        select w.member_id::text as member_id, w.slug, p.name
        from golf_course_watches w join golf_course_pages p on p.slug = w.slug join hiq_members m on m.id = w.member_id
        where m.name <> '탈퇴회원' order by w.created_at desc`));
    const byMember = new Map<string, { slug: string; name: string }[]>();
    for (const r of watches) { const a = byMember.get(r.member_id) ?? []; a.push({ slug: r.slug, name: r.name }); byMember.set(r.member_id, a); }
    out.members = byMember.size;
    if (!byMember.size) return out;

    const key = weekendKey(w.sat);
    const done = new Set(rowsOf(await db.execute(sql`
        select member_id::text as member_id from hiq_notifications
        where created_at > now() - interval '3 days' and params->>'reminderKey' = ${key}`)).map((r) => r.member_id));

    // 남은 티 — 받는 골프장의 토 · 일, 12시간 안에 확인한 날만, 지나지 않은 시각만
    const slugs = [...new Set(watches.map((r) => r.slug as string))];
    const teeCount = new Map<string, number>();
    const supplied = slugs.filter((s) => teeSource(s));
    if (supplied.length) {
        const rows = rowsOf(await db.execute(sql`
            select t.slug, t.play_date, t.tee_time from golf_open_tees t
            join golf_open_tee_days d on d.slug = t.slug and d.play_date = t.play_date and d.ok and d.checked_at > now() - interval '12 hours'
            where t.play_date in (${w.sat}, ${w.sun}) and t.slug in (${sql.join(supplied.map((s) => sql`${s}`), sql`, `)})`).catch(() => ({ rows: [] })));
        for (const s of supplied) teeCount.set(s, 0);
        for (const r of rows) if (teeStillAhead(r.play_date, r.tee_time, nowMs)) teeCount.set(r.slug, (teeCount.get(r.slug) ?? 0) + 1);
    }

    // 토요일 아침(8시 티오프) 날씨 — 받아 둔 예보만. 뚜껑을 넘기면 날씨 없이 간다
    const { loadGolfCourseSummary } = await import("../routes/modules/golfCourses.js");
    const { roundBriefAt } = await import("./golfWeather.js");
    const summary = await loadGolfCourseSummary().catch(() => null);
    const wx = new Map<string, string | null>();
    const startedAt = Date.now();
    const wxOf = async (slug: string): Promise<string | null> => {
        if (wx.has(slug)) return wx.get(slug)!;
        const page = summary?.bySlug.get(slug) ?? null;
        const v = page && Date.now() - startedAt < WEATHER_BUDGET_MS ? (await roundBriefAt(page, { ymd: w.satYmd, hour: 8 }, nowMs).catch(() => null))?.brief.verdict ?? null : null;
        wx.set(slug, v);
        return v;
    };

    if (opts.dry) out.preview = [];
    const sends: Promise<unknown>[] = [];
    for (const [memberId, list] of byMember) {
        if (done.has(memberId)) { out.already++; continue; }
        const courses: WeekendCourse[] = [];
        for (const c of list.slice(0, 8)) courses.push({ slug: c.slug, name: c.name, tees: teeCount.has(c.slug) ? teeCount.get(c.slug)! : null, wx: await wxOf(c.slug) });
        const n = weekendNotice(courses);
        if (!n) { out.empty++; continue; }
        if (opts.dry) { if (out.preview!.length < 10) out.preview!.push(n); continue; }
        sends.push(notificationService.sendAndSaveNotification({
            memberId, title: n.title, body: n.body, category: "GOLF", type: "JOIN", pref: "golf",
            params: { url: n.url, reminderKey: key },
        }).then(() => { out.sent++; }, (e: unknown) => { out.failed++; console.error("[GolfWeekendWatch]", e); }));
    }
    await Promise.allSettled(sends);
    return out;
}
