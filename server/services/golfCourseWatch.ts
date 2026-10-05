/**
 * 관심 골프장 알림(2026-09-24 오너: "관심을 누르면 그 골프장 취소티가 나올 때 알림이 오고 … 우리는 더 심화시키는 거지").
 *
 * 더블이글은 '골프장'만 고른다. 우리는 조건까지 — 종류(부킹·조인·긴급) · 주중/주말 · 1·2·3부 · 그린피 상한 · 남은 자리.
 * 조건은 golf_course_watches.filters(golfCourses.ts cleanFilters 가 아는 칸만 저장한다). 비어 있으면 전부 받는다.
 *
 * 언제: 새 글(POST /bookings — 한 번에 여러 건) · 부킹 → 조인 전환(POST /bookings/:id/to-join).
 * 안 보내는 글: **비공개(isBlind)** — 알림에 골프장 이름이 실리면 가려 둔 뜻이 없다. 가려진(isBlinded)·지난 티·
 *   골프장 마스터가 없는 글(스크린·파크의 course_id "venue").
 *
 * 도배 막기 — 서버리스라 메모리가 없다. **알림함에 남은 행**으로 판정한다(hiq_notifications, 24시간 이내).
 *   · 같은 사람 · 같은 골프장: 20분에 한 통. 한 번에 여러 글이 오면 한 통으로 묶어 "N건".
 *   · 한 사람 하루(24시간) 20통.
 * 조용한 시간 — 긴급 조인 방송(golf.ts broadcastUrgentJoin)과 같은 경계(kstHour, 08~21시만 푸시). 방송은 밤엔
 *   아예 안 나가지만 이건 본인이 **골라서 켠** 알림이라 버리지 않는다 — 밤엔 푸시 없이 알림함에만 남긴다.
 *
 * type 은 GOLF_URGENT — 알림함 '내 차례' 묶음(shared/notificationGroup)이고, 푸시 유효기간이 티오프까지로 잘린다
 * (notificationService.pushOptionsFor). 긴급 방송과는 params.watchSlug 로 가른다. ⚠️ params.ownerId 는 **넣지 않는다** —
 * 방송 도배 방지(hasRecentGolfUrgent)가 그 값을 되짚어, 넣으면 글쓴이의 긴급 방송이 6시간 막힌다.
 *
 * 판정(조건·묶기·문구)은 순수 함수 — golfCourseWatch.test.ts.
 */
import { sql } from "drizzle-orm";
import { db } from "../db.js";
import { storage } from "../storage/index.js";
import { notificationService } from "./notificationService.js";
import { isUrgentJoin, kstHour, listingCapacity } from "../../shared/golfJoin.js";
import { REGION_LABEL, cityShort, coursePath, listPath, listingIntents, teePart, wonShort, type GolfIntent } from "../../shared/golfCourse.js";

export const WATCH_COOLDOWN_MIN = 20;
export const WATCH_DAILY_CAP = 20;
/** 긴급 방송과 같은 조용한 시간(한국 시각 08~21시만 푸시). */
export const WATCH_PUSH_FROM_HOUR = 8;
export const WATCH_PUSH_UNTIL_HOUR = 21;
/** 응답 전에 기다려 주는 상한(ms) — 서버리스는 응답 뒤 얼어붙는다(긴급 방송과 같은 이유). */
const WATCH_WAIT_MS = 6000;

export interface WatchFilters {
    kinds?: GolfIntent[];
    days?: ("weekday" | "weekend")[];
    parts?: ("1" | "2" | "3")[];
    /** 원. greenFee ≤ maxFee. */
    maxFee?: number;
    /** 조인의 남은 자리 ≥ minSeats. 부킹은 통과. */
    minSeats?: number;
}

/** 알림 판정에 필요한 글의 모양(golf_bookings 행 + 남은 자리). */
export interface WatchListing {
    id: string;
    courseId?: string | number | null;
    listingType?: string | null;
    joinType?: string | null;
    costMode?: string | null;
    greenFee?: number | string | null;
    datetime: Date | string;
    slots?: unknown;
    joinHeadcount?: number | null;
    joinCondition?: string | null;
    isBlind?: boolean | null;
    isBlinded?: boolean | null;
    /** 조인의 남은 자리. 없으면 정원(listingCapacity) — 새 글은 신청자가 아직 없다. */
    seatsLeft?: number;
}

const ms = (d: Date | string) => (d instanceof Date ? d.getTime() : new Date(d).getTime());
const isJoin = (l: WatchListing) => l.listingType === "JOIN";

/** 알림을 보내도 되는 글인가 — 비공개·가려진·지난 글, 골프장 마스터가 없는 글은 아니다. */
export function isAlertable(l: WatchListing, nowMs: number): boolean {
    if (l.isBlind || l.isBlinded) return false;
    const t = ms(l.datetime);
    if (!Number.isFinite(t) || t <= nowMs) return false;
    return /^[0-9]+$/.test(String(l.courseId ?? ""));
}

export function seatsLeft(l: WatchListing): number {
    if (!isJoin(l)) return 0;
    if (l.seatsLeft != null && Number.isFinite(l.seatsLeft)) return Math.max(0, Math.floor(l.seatsLeft));
    return listingCapacity(l);
}

/** 한국 날짜로 토·일인가. */
export function isKstWeekend(datetime: Date | string): boolean {
    const d = new Date(ms(datetime) + 9 * 3600_000).getUTCDay();
    return d === 0 || d === 6;
}

/** 조건에 맞나. 빈 조건(또는 빈 칸)은 통과다. */
export function matchesWatch(l: WatchListing, f: WatchFilters | null | undefined, nowMs: number): boolean {
    if (!f) return true;
    if (f.kinds?.length) {
        const intents = listingIntents({ ...l, listingType: isJoin(l) ? "JOIN" : "BOOKING" }, nowMs);
        if (!intents.some((i) => f.kinds!.includes(i))) return false;
    }
    if (f.days?.length && !f.days.includes(isKstWeekend(l.datetime) ? "weekend" : "weekday")) return false;
    if (f.parts?.length && !f.parts.includes(String(teePart(l.datetime)) as "1" | "2" | "3")) return false;
    if (f.maxFee) {
        // 금액이 없거나 1/N 이면 알 수 없다 — 막지 않는다(놓치는 쪽이 더 아프다).
        const fee = Number(l.greenFee);
        if (l.costMode !== "SPLIT" && Number.isFinite(fee) && fee > 0 && fee > f.maxFee) return false;
    }
    if (f.minSeats && isJoin(l) && seatsLeft(l) < f.minSeats) return false;
    return true;
}

// ── 묶기 ──────────────────────────────────────────────────────────
export interface Watcher { memberId: string; slug: string; name: string; filters: WatchFilters | null }
/** 최근 24시간 동안 이 사람에게 간 관심 알림. */
export interface SentHistory { today: number; recentSlugs: ReadonlySet<string> }
/**
 * push=false 면 알림함에만 남긴다(푸시 없음) — 20분 안에 같은 골프장으로 이미 울렸거나, 하루 상한을 넘었거나, 방금 긴급 방송을 받은 사람.
 * 예전엔 그런 글을 **버렸다**(2026-09-24 검토: 두 번째 취소티는 영영 못 봤다). 이제 알림함엔 다 남고 소리만 아낀다.
 */
export interface WatchAlert { memberId: string; slug: string; name: string; listings: WatchListing[]; push: boolean }

/**
 * 누구에게 무엇을 보낼지(순수 함수). listings 는 이미 slug 가 붙은 것. 글쓴이 제외는 호출하는 쪽(쿼리)이 한다.
 * 한 사람·한 골프장당 한 통, 20분 안에 같은 골프장으로 간 적이 있으면 건너뛰고, 하루 상한을 넘기지 않는다.
 * 상한에 걸리면 **이른 티**가 든 골프장부터 보낸다(곧 사라질 자리가 먼저다).
 */
export function planWatchAlerts(input: {
    listings: { slug: string; listing: WatchListing }[];
    watchers: Watcher[];
    history: ReadonlyMap<string, SentHistory>;
    nowMs: number;
    dailyCap?: number;
    /** 이미 같은 글로 긴급 방송 푸시를 받은 사람 — 두 번 울리지 않는다 */
    silent?: ReadonlySet<string>;
}): WatchAlert[] {
    const cap = input.dailyCap ?? WATCH_DAILY_CAP;
    const bySlug = new Map<string, WatchListing[]>();
    for (const { slug, listing } of input.listings) {
        if (!isAlertable(listing, input.nowMs)) continue;
        if (!bySlug.has(slug)) bySlug.set(slug, []);
        bySlug.get(slug)!.push(listing);
    }
    const perMember = new Map<string, WatchAlert[]>();
    for (const w of input.watchers) {
        const ls = bySlug.get(w.slug); if (!ls) continue;
        const h = input.history.get(w.memberId);
        const recent = !!h?.recentSlugs.has(w.slug);
        const hit = ls.filter((l) => matchesWatch(l, w.filters, input.nowMs)).sort((a, b) => ms(a.datetime) - ms(b.datetime));
        if (!hit.length) continue;
        const list = perMember.get(w.memberId) ?? [];
        // 같은 사람이 같은 골프장을 두 번 담지 않는다(관심 표는 (member, slug) 가 키라 원래 없지만, 입력을 믿지 않는다).
        if (!list.some((a) => a.slug === w.slug)) list.push({ memberId: w.memberId, slug: w.slug, name: w.name, listings: hit, push: !recent && !input.silent?.has(w.memberId) });
        perMember.set(w.memberId, list);
    }
    const out: WatchAlert[] = [];
    for (const [memberId, alerts] of perMember) {
        // 하루 상한은 **울린 것**만 센다 — 넘으면 알림함에만(이른 티가 든 골프장부터 울린다)
        let room = Math.max(0, cap - (input.history.get(memberId)?.today ?? 0));
        alerts.sort((a, b) => ms(a.listings[0].datetime) - ms(b.listings[0].datetime));
        for (const a of alerts) { if (a.push) { if (room > 0) room--; else a.push = false; } out.push(a); }
    }
    return out;
}

// ── 문구 ──────────────────────────────────────────────────────────
const WEEK = ["일", "월", "화", "수", "목", "금", "토"];
const kstDay = (t: number) => { const k = new Date(t + 9 * 3600_000); return Date.UTC(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()); };
/** "오늘" · "내일" · "9/27(토)" (한국 날짜) */
export function dayText(datetime: Date | string, nowMs: number): string {
    const t = ms(datetime);
    const diff = Math.round((kstDay(t) - kstDay(nowMs)) / 86_400_000);
    if (diff === 0) return "오늘";
    if (diff === 1) return "내일";
    const k = new Date(t + 9 * 3600_000);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()}(${WEEK[k.getUTCDay()]})`;
}
/** "06:34" (한국 시각) */
export function timeText(datetime: Date | string): string {
    const k = new Date(ms(datetime) + 9 * 3600_000);
    return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}
const feeText = (l: WatchListing) => (l.costMode === "SPLIT" ? "1/N" : wonShort(Number(l.greenFee) || 0));

/** 제목·본문·딥링크. 한 건이면 그 글로, 여러 건이면 골프장 페이지로. */
/** 한국 날짜 "2026-09-27" — 조인·부킹 목록은 그날 하루치만 불러와서, 딥링크에 날짜가 없으면 오늘이 아닌 글은 안 보인다. */
const kstDateOf = (t: number) => new Date(t + 9 * 3600_000).toISOString().slice(0, 10);

export function alertText(a: Pick<WatchAlert, "slug" | "name" | "listings">, nowMs: number): { title: string; body: string; url: string; teeAt: string } {
    const ls = a.listings;
    const first = ls[0];
    const teeAt = new Date(ms(first.datetime)).toISOString();
    if (ls.length === 1) {
        const urgent = isUrgentJoin(first, nowMs);
        const title = urgent ? `⛳ ${a.name} 긴급 조인이 떴어요`
            : isJoin(first) ? `⛳ ${a.name} 조인 자리가 났어요`
            : `⛳ ${a.name} 부킹 티타임이 나왔어요`;
        const kind = isJoin(first) ? `조인 ${seatsLeft(first)}자리` : "부킹";
        const body = [`${dayText(first.datetime, nowMs)} ${teePart(first.datetime)}부 ${timeText(first.datetime)}`, kind, feeText(first)].filter(Boolean).join(" · ");
        return { title, body, url: `/golf/booking-list/${first.id}?date=${kstDateOf(ms(first.datetime))}&view=${isJoin(first) ? "JOIN" : "BOOKING"}`, teeAt };
    }
    // 여러 건: 이른 티 셋 + 외 N건 + 최저가
    let lastDay = "";
    const times = ls.slice(0, 3).map((l) => {
        const d = dayText(l.datetime, nowMs);
        const s = d === lastDay ? timeText(l.datetime) : `${d} ${timeText(l.datetime)}`;
        lastDay = d; return s;
    }).join(", ");
    const more = ls.length > 3 ? ` 외 ${ls.length - 3}건` : "";
    const fees = ls.filter((l) => l.costMode !== "SPLIT").map((l) => Number(l.greenFee)).filter((n) => Number.isFinite(n) && n > 0);
    const low = fees.length ? `최저 ${wonShort(Math.min(...fees))}` : "";
    return {
        title: `⛳ ${a.name} 티타임 ${ls.length}건이 올라왔어요`,
        body: [`${times}${more}`, low].filter(Boolean).join(" · "),
        url: coursePath(a.slug),
        teeAt,
    };
}

// ── 보내기 ────────────────────────────────────────────────────────
const rowsOf = (r: any) => (r.rows ?? r) as any[];
const pgArray = (xs: readonly (string | number)[]) => `{${xs.map((x) => `"${String(x).replace(/["\\]/g, "")}"`).join(",")}}`;

/** 보내기는 시작만 하고(result 는 계획에서 이미 정해진다) 기다림(done)은 호출하는 쪽이 모아서 한다 — 두 알림을 차례로 기다리면 응답이 12초까지 는다. */
interface Started<T> { result: T; done: Promise<unknown> }
const waitFor = (sends: Promise<unknown>[]): Promise<unknown> =>
    Promise.race([Promise.allSettled(sends), new Promise((r) => setTimeout(r, WATCH_WAIT_MS))]);
/** 글쓴이와 차단 관계(어느 쪽이 걸었든)인 사람에게는 그 글 알림을 보내지 않는다. `col` 은 받는 사람 id 열. */
const notBlocked = (col: ReturnType<typeof sql.raw>, ownerId: string) => sql`not exists (
            select 1 from hiq_blocks b
            where (b.blocker_id = ${col} and b.blocked_id = ${ownerId}::uuid) or (b.blocker_id = ${ownerId}::uuid and b.blocked_id = ${col}))`;

/**
 * 새 글·전환된 글을 관심 등록한 사람에게 알린다. 라우트는 응답 **전에** await 하고, 실패는 삼킨다(글 올리기가 실패하면 안 된다).
 * 반환: 보낸 수(푸시 포함) · 밤이라 알림함에만 남긴 수.
 */
export interface CourseWatchResult {
    pushed: number; inboxOnly: number;
    /** 이번에 관심 골프장 알림을 받은 `${memberId}|${slug}` — 지역 알림이 같은 글로 또 보내지 않게 */
    covered: Set<string>;
    /** 이번에 울린(푸시) 수, 회원별 — 지역 알림의 하루 상한에 더한다 */
    rung: Map<string, number>;
}
const noWatch = (): CourseWatchResult => ({ pushed: 0, inboxOnly: 0, covered: new Set(), rung: new Map() });

export async function notifyCourseWatchers(ownerId: string, rows: WatchListing[], opts: { silent?: ReadonlySet<string> } = {}): Promise<CourseWatchResult> {
    const s = await startCourseWatch(ownerId, rows, opts);
    await s.done;
    return s.result;
}

async function startCourseWatch(ownerId: string, rows: WatchListing[], opts: { silent?: ReadonlySet<string> } = {}): Promise<Started<CourseWatchResult>> {
    const none = (): Started<CourseWatchResult> => ({ result: noWatch(), done: Promise.resolve() });
    const nowMs = Date.now();
    const usable = rows.filter((r) => isAlertable(r, nowMs));
    if (!usable.length) return none();
    const ids = [...new Set(usable.map((r) => Number(r.courseId)))];

    const watchRows = rowsOf(await db.execute(sql`
        select w.member_id, w.slug, w.filters, p.name, p.course_ids
        from golf_course_watches w join golf_course_pages p on p.slug = w.slug
        where p.course_ids && ${pgArray(ids)}::int[] and w.member_id <> ${ownerId}::uuid
          and ${notBlocked(sql.raw("w.member_id"), ownerId)}`));
    if (!watchRows.length) return none();

    // 글 → 골프장(slug). 한 course_id 는 한 골프장에만 있다(적재 규칙).
    const slugOfCourse = new Map<number, string>();
    for (const w of watchRows) for (const c of w.course_ids ?? []) slugOfCourse.set(Number(c), w.slug);
    const listings = usable.flatMap((l) => { const slug = slugOfCourse.get(Number(l.courseId)); return slug ? [{ slug, listing: l }] : []; });
    const watchers: Watcher[] = watchRows.map((w) => ({ memberId: String(w.member_id), slug: w.slug, name: w.name, filters: w.filters ?? null }));

    // 최근 24시간 관심 알림 — 시간 비교는 DB 안에서(now()). JS Date 를 끼우면 9시간 어긋난다.
    const memberIds = [...new Set(watchers.map((w) => w.memberId))];
    const sent = rowsOf(await db.execute(sql`
        select member_id, params->>'watchSlug' as slug,
               (created_at > now() - make_interval(mins => ${WATCH_COOLDOWN_MIN})) as recent
        from hiq_notifications
        where member_id = any(${pgArray(memberIds)}::uuid[]) and type = 'GOLF_URGENT' and params ? 'watchSlug'
          and coalesce(params->>'pushed', 'true') = 'true'
          and created_at > now() - interval '24 hours'`));
    const history = new Map<string, { today: number; recentSlugs: Set<string> }>();
    for (const s of sent) {
        const k = String(s.member_id);
        const h = history.get(k) ?? { today: 0, recentSlugs: new Set<string>() };
        h.today++; if (s.recent) h.recentSlugs.add(s.slug);
        history.set(k, h);
    }

    const plan = planWatchAlerts({ listings, watchers, history, nowMs, silent: opts.silent });
    if (!plan.length) return none();

    const hour = kstHour(nowMs);
    const quiet = hour < WATCH_PUSH_FROM_HOUR || hour >= WATCH_PUSH_UNTIL_HOUR;
    let pushed = 0, inboxOnly = 0;
    const covered = new Set<string>();
    const rung = new Map<string, number>();
    const sends = plan.map((a) => {
        const t = alertText(a, nowMs);
        // 밤이거나 소리를 아낄 알림이면 푸시 없이 알림함에만. 아침에 열면 거기 있다.
        const ring = a.push && !quiet;
        if (ring) { pushed++; rung.set(a.memberId, (rung.get(a.memberId) ?? 0) + 1); } else inboxOnly++;
        covered.add(`${a.memberId}|${a.slug}`);
        const params = { url: t.url, watchSlug: a.slug, teeAt: t.teeAt, n: a.listings.length, pushed: ring };
        const base = { memberId: a.memberId, title: t.title, body: t.body, category: "GOLF", type: "GOLF_URGENT", params };
        return (ring
            ? notificationService.sendAndSaveNotification({ ...base, pref: "golf" })
            : storage.createNotification({ ...base, isRead: false })
        ).catch((e: unknown) => console.error("[GolfCourseWatch]", e));
    });
    return { result: { pushed, inboxOnly, covered, rung }, done: waitFor(sends) };
}

// ── 지역 알림(2026-10-05) ─────────────────────────────────────────
/**
 * 오너: "2단계까지 진행" — 검색으로 들어온 사람이 빈 조인 목록에서 "이 지역에 올라오면 알려 주세요"를 켠다(golf_area_alerts).
 * 관심 골프장과 **같은 형식·같은 제한**을 쓴다: type GOLF_URGENT, params.watchSlug = "@지역"(관심 알림으로 세어지고 golf_watch 설정을 탄다),
 * 같은 지역 20분에 한 통, 관심 알림과 **합쳐서** 하루 20통, 밤엔 알림함에만, 긴급 방송을 받은 사람은 조용히.
 * 같은 글로 관심 골프장 알림을 이미 받는 사람에게는 지역 알림을 또 보내지 않는다(covered).
 */
export const areaKey = (region: string) => `@${region}`;
export interface AreaSub { memberId: string; region: string; cities: string[]; filters: WatchFilters | null }
export interface AreaListing { slug: string; courseName: string; region: string; city: string | null; listing: WatchListing }
export interface AreaAlert { memberId: string; region: string; listings: AreaListing[]; push: boolean }

const inCities = (city: string | null, cities: readonly string[]) =>
    !cities.length || (!!city && (cities.includes(city) || cities.includes(cityShort(city))));

/** 누구에게 어느 지역 알림을 보낼지(순수 함수). 한 사람·한 지역당 한 통(여러 글은 묶는다). */
export function planAreaAlerts(input: {
    listings: AreaListing[];
    subs: AreaSub[];
    history: ReadonlyMap<string, SentHistory>;
    nowMs: number;
    dailyCap?: number;
    silent?: ReadonlySet<string>;
    /** 이번 묶음에서 관심 골프장 알림을 받는 `${memberId}|${slug}` */
    covered?: ReadonlySet<string>;
    /** 이번 묶음에서 방금 울린 관심 알림 수(회원별) — 하루 상한에 더한다 */
    rung?: ReadonlyMap<string, number>;
}): AreaAlert[] {
    const cap = input.dailyCap ?? WATCH_DAILY_CAP;
    const usable = input.listings.filter((l) => isAlertable(l.listing, input.nowMs));
    if (!usable.length) return [];
    const perMember = new Map<string, AreaAlert[]>();
    for (const s of input.subs) {
        const hit = usable
            .filter((l) => l.region === s.region && inCities(l.city, s.cities)
                && !input.covered?.has(`${s.memberId}|${l.slug}`)
                && matchesWatch(l.listing, s.filters, input.nowMs))
            .sort((a, b) => ms(a.listing.datetime) - ms(b.listing.datetime));
        if (!hit.length) continue;
        const list = perMember.get(s.memberId) ?? [];
        if (list.some((a) => a.region === s.region)) continue; // (member, region) 은 표의 키 — 입력을 믿지 않는다
        const recent = !!input.history.get(s.memberId)?.recentSlugs.has(areaKey(s.region));
        list.push({ memberId: s.memberId, region: s.region, listings: hit, push: !recent && !input.silent?.has(s.memberId) });
        perMember.set(s.memberId, list);
    }
    const out: AreaAlert[] = [];
    for (const [memberId, alerts] of perMember) {
        let room = Math.max(0, cap - (input.history.get(memberId)?.today ?? 0) - (input.rung?.get(memberId) ?? 0));
        alerts.sort((a, b) => ms(a.listings[0].listing.datetime) - ms(b.listings[0].listing.datetime));
        for (const a of alerts) { if (a.push) { if (room > 0) room--; else a.push = false; } out.push(a); }
    }
    return out;
}

/** 지역 알림의 제목·본문·딥링크. 한 건이면 그 글로, 여러 건이면 그 지역 조인(또는 부킹) 목록으로. */
export function areaAlertText(a: Pick<AreaAlert, "region" | "listings">, nowMs: number): { title: string; body: string; url: string; teeAt: string } {
    const label = (REGION_LABEL[a.region] ?? a.region).replace(/·수도권$/, "");
    const ls = a.listings;
    const first = ls[0];
    const teeAt = new Date(ms(first.listing.datetime)).toISOString();
    if (ls.length === 1) {
        const l = first.listing;
        const title = isUrgentJoin(l, nowMs) ? `⛳ ${label} 긴급 조인이 떴어요`
            : isJoin(l) ? `⛳ ${label} 조인이 올라왔어요`
            : `⛳ ${label} 부킹 티타임이 나왔어요`;
        const kind = isJoin(l) ? `조인 ${seatsLeft(l)}자리` : "부킹";
        const body = [first.courseName, `${dayText(l.datetime, nowMs)} ${teePart(l.datetime)}부 ${timeText(l.datetime)}`, kind, feeText(l)].filter(Boolean).join(" · ");
        return { title, body, url: `/golf/booking-list/${l.id}?date=${kstDateOf(ms(l.datetime))}&view=${isJoin(l) ? "JOIN" : "BOOKING"}`, teeAt };
    }
    const head = ls.slice(0, 2).map((x) => `${x.courseName} ${dayText(x.listing.datetime, nowMs)} ${timeText(x.listing.datetime)}`).join(", ");
    const more = ls.length > 2 ? ` 외 ${ls.length - 2}건` : "";
    const anyJoin = ls.some((x) => isJoin(x.listing));
    return {
        title: `⛳ ${label} 티타임 ${ls.length}건이 올라왔어요`,
        body: `${head}${more}`,
        url: listPath({ intent: anyJoin ? "join" : "booking", region: a.region }),
        teeAt,
    };
}

/**
 * 새 글·전환된 글을 그 지역 알림을 켠 사람에게 알린다. 관심 골프장 알림 **다음에** 부른다(covered·rung 을 넘겨 겹치지 않게).
 * 실패는 호출하는 쪽이 삼킨다(글 올리기가 실패하면 안 된다).
 */
type AreaOpts = { silent?: ReadonlySet<string>; covered?: ReadonlySet<string>; rung?: ReadonlyMap<string, number> };
type AreaResult = { pushed: number; inboxOnly: number };

export async function notifyAreaSubscribers(ownerId: string, rows: WatchListing[], opts: AreaOpts = {}): Promise<AreaResult> {
    const s = await startAreaAlerts(ownerId, rows, opts);
    await s.done;
    return s.result;
}

async function startAreaAlerts(ownerId: string, rows: WatchListing[], opts: AreaOpts = {}): Promise<Started<AreaResult>> {
    const none = (): Started<AreaResult> => ({ result: { pushed: 0, inboxOnly: 0 }, done: Promise.resolve() });
    const nowMs = Date.now();
    const usable = rows.filter((r) => isAlertable(r, nowMs));
    if (!usable.length) return none();
    const ids = [...new Set(usable.map((r) => Number(r.courseId)))];
    const pages = rowsOf(await db.execute(sql`
        select slug, name, region, city, course_ids from golf_course_pages where course_ids && ${pgArray(ids)}::int[]`));
    if (!pages.length) return none();
    const pageOfCourse = new Map<number, { slug: string; name: string; region: string; city: string | null }>();
    for (const p of pages) for (const c of p.course_ids ?? []) pageOfCourse.set(Number(c), { slug: p.slug, name: p.name, region: p.region, city: p.city ?? null });
    const listings: AreaListing[] = usable.flatMap((l) => {
        const p = pageOfCourse.get(Number(l.courseId));
        return p ? [{ slug: p.slug, courseName: p.name, region: p.region, city: p.city, listing: l }] : [];
    });
    const regions = [...new Set(listings.map((l) => l.region))];
    if (!regions.length) return none();

    // 탈퇴 회원은 행이 '탈퇴회원'으로 남는다 — 알림을 만들지 않는다(deleteAccount 가 지우지만 한 번 더 막는다).
    const subRows = rowsOf(await db.execute(sql`
        select a.member_id, a.region, a.cities, a.filters
        from golf_area_alerts a join hiq_members m on m.id = a.member_id
        where a.region = any(${pgArray(regions)}::text[]) and a.member_id <> ${ownerId}::uuid and m.name <> '탈퇴회원'
          and ${notBlocked(sql.raw("a.member_id"), ownerId)}`));
    if (!subRows.length) return none();
    const subs: AreaSub[] = subRows.map((r) => ({ memberId: String(r.member_id), region: r.region, cities: Array.isArray(r.cities) ? r.cities : [], filters: r.filters ?? null }));

    const memberIds = [...new Set(subs.map((s) => s.memberId))];
    const sent = rowsOf(await db.execute(sql`
        select member_id, params->>'watchSlug' as slug,
               (created_at > now() - make_interval(mins => ${WATCH_COOLDOWN_MIN})) as recent
        from hiq_notifications
        where member_id = any(${pgArray(memberIds)}::uuid[]) and type = 'GOLF_URGENT' and params ? 'watchSlug'
          and coalesce(params->>'pushed', 'true') = 'true'
          and created_at > now() - interval '24 hours'`));
    const history = new Map<string, { today: number; recentSlugs: Set<string> }>();
    for (const s of sent) {
        const k = String(s.member_id);
        const h = history.get(k) ?? { today: 0, recentSlugs: new Set<string>() };
        h.today++; if (s.recent) h.recentSlugs.add(s.slug);
        history.set(k, h);
    }

    // rung(방금 울린 관심 알림)은 위 history 에 벌써 들어왔을 수도 있다(보내기가 진행 중이라) — 겹쳐 세면 상한 쪽으로 한두 통 보수적일 뿐이다.
    const plan = planAreaAlerts({ listings, subs, history, nowMs, silent: opts.silent, covered: opts.covered, rung: opts.rung });
    if (!plan.length) return none();

    const hour = kstHour(nowMs);
    const quiet = hour < WATCH_PUSH_FROM_HOUR || hour >= WATCH_PUSH_UNTIL_HOUR;
    let pushed = 0, inboxOnly = 0;
    const sends = plan.map((a) => {
        const t = areaAlertText(a, nowMs);
        const ring = a.push && !quiet;
        if (ring) pushed++; else inboxOnly++;
        const params = { url: t.url, watchSlug: areaKey(a.region), watchArea: a.region, teeAt: t.teeAt, n: a.listings.length, pushed: ring };
        const base = { memberId: a.memberId, title: t.title, body: t.body, category: "GOLF", type: "GOLF_URGENT", params };
        return (ring
            ? notificationService.sendAndSaveNotification({ ...base, pref: "golf" })
            : storage.createNotification({ ...base, isRead: false })
        ).catch((e: unknown) => console.error("[GolfAreaAlert]", e));
    });
    return { result: { pushed, inboxOnly }, done: waitFor(sends) };
}

/**
 * 글이 올라오면 부르는 한 곳 — 관심 골프장 알림을 먼저 **계획**하고, 그 결과(누가 어느 골프장으로 받나·몇 통 울리나)를 넘겨
 * 지역 알림이 같은 글로 또 울리지 않게 한다. 두 알림의 실패는 서로를 막지 않는다.
 * 보내기는 둘 다 시작해 놓고 **한 번에** 기다린다(각자 최대 WATCH_WAIT_MS — 차례로 기다리면 글 올리기 응답이 12초까지 는다).
 */
export async function notifyListingAlerts(ownerId: string, rows: WatchListing[], opts: { silent?: ReadonlySet<string> } = {}): Promise<{ pushed: number; inboxOnly: number }> {
    const course = await startCourseWatch(ownerId, rows, opts).catch((e) => { console.error("[GolfCourseWatch]", e); return null; });
    const area = await startAreaAlerts(ownerId, rows, { silent: opts.silent, covered: course?.result.covered, rung: course?.result.rung })
        .catch((e) => { console.error("[GolfAreaAlert]", e); return null; });
    await Promise.allSettled([course?.done, area?.done]);
    return {
        pushed: (course?.result.pushed ?? 0) + (area?.result.pushed ?? 0),
        inboxOnly: (course?.result.inboxOnly ?? 0) + (area?.result.inboxOnly ?? 0),
    };
}
