/**
 * 골프 관리 — 조인·부킹 글 읽기(2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자").
 *
 * 왜 golf.repo 와 따로 두나: 앱 목록(getGolfBookings)은 **회원이 보는 목록**이라 가려진 글을 빼고, 비공개 글은 가명으로만
 * 찾고, 하루치만 준다. 운영자는 거꾸로 가려진 글·신고 붙은 글·지난 글을 다 봐야 하고 가명 글의 실명도 봐야 한다.
 * 같은 함수에 운영자 갈래를 끼우면 한 줄 실수로 회원 목록에 가려진 글이 샌다 — 그래서 운영자 읽기는 여기 따로 둔다.
 *
 *  - manager_phone 은 **읽지도 않는다**(고른 칸만 SELECT, LIST_COLS). 운영자가 이 화면에서 번호로 할 일은 없다.
 *  - 긴급 여부는 저장 칸이 아니라 계산이다(shared/golfJoin isUrgentJoin) — 여기서도 그 함수 하나로만 판정한다.
 *    규칙을 SQL 로 옮겨 적으면 규칙이 바뀔 때 두 곳이 어긋난다. SQL 은 '지금부터 24시간 안의 조인'으로 넉넉히 거르고
 *    마지막 판정은 그 함수가 한다(긴급은 늘 오늘 티라 후보가 몇 건 안 된다).
 *  - 시각: timestamp 칸은 UTC 벽시계다(DB 세션 시간대 GMT, 2026-10-01 실측). Date 는 drizzle 연산자(gte·lt)로만 넘긴다 —
 *    raw sql 에 JS Date 를 끼우면 KST 기기에서 9시간 어긋난다. raw sql 로 읽는 시각은 to_char(… "Z") 로 ISO 를 만들어 준다
 *    (드라이버는 timestamp 를 시간대 없는 문자열로 주고, 브라우저는 그걸 현지 시각으로 읽는다).
 *
 * 글쓴이에게 가는 알림(가림·다시 보임·내림)의 모양도 여기 둔다 — 신고 3건 자동 가림(routes/modules/community.ts)과
 * 운영자 가리기(routes/modules/adminGolf/listings.ts)가 **같은 문구·같은 링크**를 쓰게. 골프 글은 이의제기 칸이 없다
 * (lib/reportQueue APPEALABLE_TARGETS) — 그래서 '이의제기할 수 있다'는 약속 대신 채팅의 '운영자 문의'를 안내한다.
 */
import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, ne, or, sql, type SQL } from "drizzle-orm";
import { db } from "../db.js";
import { golfBookings, golfJoinRequests, hiqMembers, hiqModerationActions, hiqNotifications, hiqReports } from "../../shared/schema.js";
import { isUrgentJoin, listingCapacity } from "../../shared/golfJoin.js";
import { ACTION_LABEL, isModerationAction, reasonLabel } from "../lib/reportQueue.js";
import { msg, type I18nText } from "../lib/i18n.js";

const DAY_MS = 86_400_000;
/** 한 쪽에 싣는 글 수(화면 '이전·다음'). */
export const LISTING_PAGE = 50;
/** 긴급 알림 기록을 거슬러 보는 날 수. */
export const URGENT_LOG_DAYS = 7;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const LISTING_WHENS = ["upcoming", "recent7", "all"] as const;
export const LISTING_TYPES = ["JOIN", "BOOKING"] as const;
export const LISTING_SELLERS = ["STORE", "PERSONAL"] as const;
export const LISTING_FLAGS = ["urgent", "hidden", "reported"] as const;
export type ListingWhen = (typeof LISTING_WHENS)[number];
export type ListingType = (typeof LISTING_TYPES)[number];
export type ListingSeller = (typeof LISTING_SELLERS)[number];
export type ListingFlag = (typeof LISTING_FLAGS)[number];

export interface ListingFilters {
    /** upcoming = 티타임이 아직 안 옴 · recent7 = 최근 7일 안에 올라온 글 · all = 전부 */
    when: ListingWhen;
    type: ListingType | null;
    /** STORE = 매장·매니저(옛 부킹 null 포함) · PERSONAL = 개인 양도 */
    seller: ListingSeller | null;
    flag: ListingFlag | null;
    /** 골프장 실명·가명·장소 이름·글쓴이 이름 */
    q: string;
    offset: number;
    limit: number;
}

export interface ApplicantCounts { applied: number; accepted: number; rejected: number; cancelled: number; noshow: number; /** 확정된 사람 수(부킹 신청 한 건은 1~4명) */ seats: number }
export interface ReportCounts { /** 아직 안 닫힌 신고 */ open: number; total: number }

export interface AdminListingRow {
    id: string;
    listingType: "JOIN" | "BOOKING";
    joinType: string | null;
    /** 올린 쪽(옛 부킹은 null → 매장). 조인은 null, 부킹에서 돌린 조인은 원래 값이 남는다. */
    sellerType: "STORE" | "PERSONAL" | null;
    convertedFromBooking: boolean;
    /** 실명 — 비공개 글도 운영자에게는 실명을 준다 */
    courseName: string;
    isBlind: boolean;
    blindName: string | null;
    /** 회원이 보는 이름(비공개면 가명) */
    publicName: string;
    venueName: string | null;
    region: string;
    datetime: string;
    greenFee: number;
    costMode: string | null;
    isHotDeal: boolean;
    /** 정원 — 조인은 모집 자리 수(사람), 부킹은 1(팀) */
    capacity: number;
    slots: { role: string; gender: string }[] | null;
    owner: { id: string; name: string | null } | null;
    applicants: ApplicantCounts;
    reports: ReportCounts;
    hidden: boolean;
    hiddenReason: string | null;
    urgent: boolean;
    createdAt: string;
}

export interface AdminListingDetail extends AdminListingRow {
    comment: string | null;
    options: string[];
    joinCondition: string | null;
    policyType: string | null;
    policyCustomText: string | null;
    reportReasons: { reason: string; label: string; count: number; open: number }[];
    history: { action: string; label: string; at: string; note: string | null }[];
}

export interface ListingPage {
    items: AdminListingRow[];
    /** 지금 거르기(flag 포함)에 맞는 글 수 */
    total: number;
    hasMore: boolean;
    offset: number;
    limit: number;
    /** 칩 숫자 — 기간·종류·검색은 같고 flag 만 뺀 기준 */
    counts: { all: number; urgent: number; hidden: number; reported: number };
}

export interface UrgentLogRow {
    postId: string;
    sentAt: string;
    lastSentAt: string;
    /** 알림함에 남은 행 수 = 방송 대상 수(푸시를 꺼 둔 사람도 알림함에는 남는다) */
    recipients: number;
    sampleTitle: string | null;
    sampleBody: string | null;
    owner: { id: string; name: string | null } | null;
    status: "live" | "hidden" | "deleted";
    /** 지금 글(지워졌으면 null) */
    listing: AdminListingRow | null;
}

const ZERO_APPLICANTS: ApplicantCounts = { applied: 0, accepted: 0, rejected: 0, cancelled: 0, noshow: 0, seats: 0 };

// ── 순수 도우미(테스트: adminGolfListings.test.ts) ─────────────────────────

const pick = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
    typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : null;

function int(v: unknown, fallback: number): number {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? n : fallback;
}

/** 주소 질의를 거르기로. 모르는 값은 기본으로(400 이 아니라) — 화면이 옛 값으로 불러도 목록은 뜬다. */
export function parseListingFilters(query: Record<string, unknown>): ListingFilters {
    return {
        when: pick(query.when, LISTING_WHENS) ?? "upcoming",
        type: pick(query.type, LISTING_TYPES),
        seller: pick(query.seller, LISTING_SELLERS),
        flag: pick(query.flag, LISTING_FLAGS),
        q: typeof query.q === "string" ? query.q.trim().slice(0, 40) : "",
        offset: Math.min(Math.max(0, int(query.offset, 0)), 100_000),
        limit: Math.min(LISTING_PAGE, Math.max(1, int(query.limit, LISTING_PAGE))),
    };
}

/** ILIKE 패턴 — 검색어의 %·_·\ 는 글자 그대로 찾는다("50%" 를 치면 50 으로 시작하는 모든 글이 걸리지 않게). */
export function likePattern(q: string): string {
    return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** 올린 쪽. 옛 부킹(seller_type null)은 매장 글이다(schema 주석). 조인은 null, 부킹에서 돌린 조인은 원래 값. */
export function effectiveSeller(listingType: string | null | undefined, sellerType: string | null | undefined): "STORE" | "PERSONAL" | null {
    if (sellerType === "STORE" || sellerType === "PERSONAL") return sellerType;
    return listingType === "JOIN" ? null : "STORE";
}

/** 회원에게 보이는 이름 — golf.ts listingName 과 같은 규칙(비공개면 가명, 가명이 비면 '비공개 골프장'). */
export function publicName(b: { isBlind?: boolean | null; blindName?: string | null; courseName: string }): string {
    return b.isBlind ? (b.blindName || "비공개 골프장") : b.courseName;
}

/** 알림 본문용 티타임 "9/25 07:40"(한국 시각) — golf.ts teeText 와 같은 꼴. */
export function kstTee(datetime: Date | string): string {
    const k = new Date(new Date(datetime).getTime() + 9 * 3_600_000);
    if (Number.isNaN(k.getTime())) return "";
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 긴급 방송 알림의 링크(/golf/booking-list/<id>?view=JOIN)에서 글 id. 아니면 null. */
export function listingPostIdFromUrl(url: unknown): string | null {
    if (typeof url !== "string") return null;
    const m = /^\/golf\/booking-list\/([0-9a-f-]{36})(?:[?#/]|$)/i.exec(url);
    return m && UUID_RE.test(m[1]) ? m[1].toLowerCase() : null;
}

export type GolfListingNoticeKind = "autoHidden" | "adminHidden" | "shown" | "deleted";

export interface GolfListingNotice {
    title: string | I18nText;
    body: string | I18nText;
    category: "GOLF";
    type: "MODERATION" | "JOIN";
    params: { url: string };
}

type NoticeListing = { id: string; listingType?: string | null; courseName: string; isBlind?: boolean | null; blindName?: string | null; datetime: Date | string };

/** 글쓴이의 '내 글' 목록 — 가린 글도 거기엔 보인다(?mine=1 은 includeBlinded). 글 상세(/golf/booking-list/<id>)는 가린 글이면 404 다. */
export function myListingsUrl(listingType: string | null | undefined): string {
    return `/golf/my-bookings?tab=${listingType === "JOIN" ? "join" : "booking"}&role=mine`;
}

/**
 * 글쓴이에게 가는 안내. 골프 알림함(category GOLF)으로 간다 — 예전 자동 가림은 당구(BILLIARDS) 알림함에
 * '/community' 링크와 '이의제기할 수 있다'는 문구로 갔다(감사 4.2). 글쓴이 본인에게 가는 것이라 비공개 글도 실명으로 적는다.
 *  autoHidden  신고 3명 자동 가림   adminHidden 운영자 가리기   shown 다시 보이게   deleted 운영자 지우기
 */
export function golfListingNotice(kind: GolfListingNoticeKind, b: NoticeListing): GolfListingNotice {
    const vars = { course: b.courseName, tee: kstTee(b.datetime) };
    const base = { category: "GOLF" as const, type: "MODERATION" as const };
    switch (kind) {
        case "autoHidden":
            return { ...base, title: "notif.golfListing.hidden.title", body: msg("notif.golfListing.hidden.body", vars), params: { url: myListingsUrl(b.listingType) } };
        case "adminHidden":
            return { ...base, title: "notif.golfListing.hidden.title", body: msg("notif.golfListing.hiddenByAdmin.body", vars), params: { url: myListingsUrl(b.listingType) } };
        case "shown":
            // 다시 보이니 글 자체로 보낸다
            return { ...base, title: "notif.moderation.unblind.title", body: "notif.moderation.unblind.body", params: { url: `/golf/booking-list/${b.id}?view=${b.listingType === "JOIN" ? "JOIN" : "BOOKING"}` } };
        case "deleted":
            return { ...base, title: "notif.golfListing.deleted.title", body: msg("notif.golfListing.deleted.body", vars), params: { url: myListingsUrl(b.listingType) } };
    }
}

/**
 * 운영자가 지운 글에 신청해 둔 사람(대기·확정)에게. 확정된 사람은 실명을 이미 알고, 대기 중인 사람에게는 비공개 글이면 가명으로
 * (golf.ts 글 내리기 알림과 같은 규칙). 링크는 같은 종류의 목록 — 다른 티타임을 찾게.
 */
export function golfListingGoneNotice(b: NoticeListing, status: string): GolfListingNotice {
    const course = status === "accepted" ? b.courseName : publicName(b);
    return {
        title: "notif.golfListing.deleted.title",
        body: msg("notif.golfListing.deletedApplicant.body", { course, tee: kstTee(b.datetime) }),
        category: "GOLF",
        type: "JOIN",
        params: { url: `/golf/booking-list?view=${b.listingType === "JOIN" ? "JOIN" : "BOOKING"}` },
    };
}

/** 지우기 전에 처리 기록(hiq_moderation_actions.note)에 남길 원문 — 신고 큐가 '삭제 전 내용'으로 보여 준다. */
export function listingSnapshot(b: {
    listingType?: string | null; courseName: string; isBlind?: boolean | null; blindName?: string | null;
    region?: string | null; datetime: Date | string; greenFee?: number | null; comment?: string | null;
}): { title: string; text: string } {
    const kind = b.listingType === "JOIN" ? "조인" : "부킹";
    const title = b.isBlind && b.blindName ? `${b.courseName}(가명 ${b.blindName})` : b.courseName;
    const fee = Number.isFinite(Number(b.greenFee)) ? `${Number(b.greenFee).toLocaleString("ko-KR")}원` : "";
    const meta = [kind, b.region ?? "", kstTee(b.datetime), fee].filter(Boolean).join(" · ");
    return { title, text: [meta, b.comment?.trim() ?? ""].filter(Boolean).join("\n") };
}

// ── DB ─────────────────────────────────────────────────────────────────

/** 목록·상세가 읽는 칸. ⚠️ manager_phone 은 일부러 없다 — 넣지 마라. */
const LIST_COLS = {
    id: golfBookings.id,
    ownerId: golfBookings.ownerId,
    ownerName: hiqMembers.name,
    courseName: golfBookings.courseName,
    region: golfBookings.region,
    datetime: golfBookings.datetime,
    greenFee: golfBookings.greenFee,
    isHotDeal: golfBookings.isHotDeal,
    isBlind: golfBookings.isBlind,
    blindName: golfBookings.blindName,
    listingType: golfBookings.listingType,
    sellerType: golfBookings.sellerType,
    joinType: golfBookings.joinType,
    joinHeadcount: golfBookings.joinHeadcount,
    joinCondition: golfBookings.joinCondition,
    slots: golfBookings.slots,
    costMode: golfBookings.costMode,
    venueName: golfBookings.venueName,
    isBlinded: golfBookings.isBlinded,
    blindReason: golfBookings.blindReason,
    createdAt: golfBookings.createdAt,
};
const DETAIL_COLS = {
    ...LIST_COLS,
    comment: golfBookings.comment,
    options: golfBookings.options,
    policyType: golfBookings.policyType,
    policyCustomText: golfBookings.policyCustomText,
};

type ListSelect = {
    id: string; ownerId: string | null; ownerName: string | null; courseName: string; region: string; datetime: Date;
    greenFee: number; isHotDeal: boolean; isBlind: boolean; blindName: string | null; listingType: string;
    sellerType: string | null; joinType: string | null; joinHeadcount: number | null; joinCondition: string | null;
    slots: unknown; costMode: string | null; venueName: string | null; isBlinded: boolean; blindReason: string | null; createdAt: Date;
};

/** 안 닫힌 신고가 있는 글 — 바깥 질의의 golf_bookings 행을 가리킨다. */
const openReportExists = sql`exists (select 1 from ${hiqReports} where ${hiqReports.targetType} = 'golf_booking' and ${hiqReports.targetId} = ${golfBookings.id} and ${hiqReports.status} = 'pending')`;

const iso = (d: Date | string | null | undefined): string => {
    const t = d instanceof Date ? d : new Date(d ?? NaN);
    return Number.isNaN(t.getTime()) ? "" : t.toISOString();
};

/** 기간·종류·올린 쪽·검색 — flag 는 뺀 조건(칩 숫자가 이 기준). 글쓴이 이름 검색 때문에 hiq_members 를 늘 left join 한다. */
function baseConditions(f: ListingFilters, nowMs: number): SQL[] {
    const c: SQL[] = [];
    if (f.when === "upcoming") c.push(gte(golfBookings.datetime, new Date(nowMs)));
    else if (f.when === "recent7") c.push(gte(golfBookings.createdAt, new Date(nowMs - 7 * DAY_MS)));
    if (f.type === "JOIN") c.push(eq(golfBookings.listingType, "JOIN"));
    else if (f.type === "BOOKING") c.push(ne(golfBookings.listingType, "JOIN"));
    if (f.seller === "PERSONAL") c.push(eq(golfBookings.sellerType, "PERSONAL"));
    else if (f.seller === "STORE") c.push(or(eq(golfBookings.sellerType, "STORE"), and(isNull(golfBookings.sellerType), ne(golfBookings.listingType, "JOIN")))!);
    if (f.q) {
        const p = likePattern(f.q);
        c.push(or(ilike(golfBookings.courseName, p), ilike(golfBookings.blindName, p), ilike(golfBookings.venueName, p), ilike(hiqMembers.name, p))!);
    }
    return c;
}

function toRow(r: ListSelect, a: ApplicantCounts | undefined, rep: ReportCounts | undefined, nowMs: number): AdminListingRow {
    const listingType = r.listingType === "JOIN" ? "JOIN" : "BOOKING";
    return {
        id: r.id,
        listingType,
        joinType: r.joinType ?? null,
        sellerType: effectiveSeller(r.listingType, r.sellerType),
        convertedFromBooking: listingType === "JOIN" && !!r.sellerType,
        courseName: r.courseName,
        isBlind: !!r.isBlind,
        blindName: r.blindName ?? null,
        publicName: publicName(r),
        venueName: r.venueName ?? null,
        region: r.region,
        datetime: iso(r.datetime),
        greenFee: Number(r.greenFee) || 0,
        costMode: r.costMode ?? null,
        isHotDeal: !!r.isHotDeal,
        capacity: listingCapacity(r),
        slots: Array.isArray(r.slots) ? (r.slots as { role: string; gender: string }[]) : null,
        owner: r.ownerId ? { id: r.ownerId, name: r.ownerName ?? null } : null,
        applicants: a ?? ZERO_APPLICANTS,
        reports: rep ?? { open: 0, total: 0 },
        hidden: !!r.isBlinded,
        hiddenReason: r.blindReason ?? null,
        urgent: isUrgentJoin(r, nowMs),
        createdAt: iso(r.createdAt),
    };
}

export class AdminGolfListingsRepository {
    /** 목록 한 쪽 + 칩 숫자. */
    async list(f: ListingFilters, nowMs = Date.now()): Promise<ListingPage> {
        const base = baseConditions(f, nowMs);
        const [counts, urgentIds] = await Promise.all([this.flagCounts(base), this.urgentIds(base, nowMs)]);

        let rows: ListSelect[];
        let total: number;
        let hasMore: boolean;
        if (f.flag === "urgent") {
            // 긴급은 계산이라 SQL 로 쪽을 못 나눈다 — 판정이 끝난 id 목록(티타임순)을 잘라서 읽는다.
            total = urgentIds.length;
            const pageIds = urgentIds.slice(f.offset, f.offset + f.limit);
            rows = pageIds.length ? await this.selectRows(inArray(golfBookings.id, pageIds)) : [];
            const order = new Map(pageIds.map((id, i) => [id, i]));
            rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
            hasMore = f.offset + f.limit < total;
        } else {
            const flagCond = f.flag === "hidden" ? eq(golfBookings.isBlinded, true) : f.flag === "reported" ? openReportExists : undefined;
            // 다가오는 글은 가까운 티부터(곧 칠 글이 급하다), 나머지는 새로 올라온 글부터.
            const order = f.when === "upcoming"
                ? [asc(golfBookings.datetime), asc(golfBookings.id)]
                : [desc(golfBookings.createdAt), desc(golfBookings.id)];
            const got = await db.select(LIST_COLS)
                .from(golfBookings)
                .leftJoin(hiqMembers, eq(hiqMembers.id, golfBookings.ownerId))
                .where(and(...base, ...(flagCond ? [flagCond] : [])))
                .orderBy(...order)
                .limit(f.limit + 1)
                .offset(f.offset) as ListSelect[];
            hasMore = got.length > f.limit;
            rows = got.slice(0, f.limit);
            total = f.flag === "hidden" ? counts.hidden : f.flag === "reported" ? counts.reported : counts.total;
        }

        return {
            items: await this.hydrate(rows, nowMs),
            total,
            hasMore,
            offset: f.offset,
            limit: f.limit,
            counts: { all: counts.total, urgent: urgentIds.length, hidden: counts.hidden, reported: counts.reported },
        };
    }

    /** 글 하나 — 옆 시트의 자세히(메모·옵션·신고 사유·처리 기록). 없으면 null. */
    async detail(id: string, nowMs = Date.now()): Promise<AdminListingDetail | null> {
        const [r] = await db.select(DETAIL_COLS)
            .from(golfBookings)
            .leftJoin(hiqMembers, eq(hiqMembers.id, golfBookings.ownerId))
            .where(eq(golfBookings.id, id))
            .limit(1);
        if (!r) return null;
        const [[row], history, reasons] = await Promise.all([
            this.hydrate([r as ListSelect], nowMs),
            db.select({ action: hiqModerationActions.action, note: hiqModerationActions.note, createdAt: hiqModerationActions.createdAt })
                .from(hiqModerationActions)
                .where(and(eq(hiqModerationActions.targetType, "golf_booking"), eq(hiqModerationActions.targetId, id)))
                .orderBy(desc(hiqModerationActions.createdAt))
                .limit(10),
            db.select({
                reason: hiqReports.reason,
                count: sql<number>`count(*)::int`,
                open: sql<number>`(count(*) filter (where ${hiqReports.status} = 'pending'))::int`,
            })
                .from(hiqReports)
                .where(and(eq(hiqReports.targetType, "golf_booking"), eq(hiqReports.targetId, id)))
                .groupBy(hiqReports.reason),
        ]);
        return {
            ...row,
            comment: r.comment ?? null,
            options: Array.isArray(r.options) ? r.options : [],
            joinCondition: r.joinCondition ?? null,
            policyType: r.policyType ?? null,
            policyCustomText: r.policyCustomText ?? null,
            reportReasons: reasons
                .map((x) => ({ reason: x.reason, label: reasonLabel(x.reason), count: Number(x.count), open: Number(x.open) }))
                .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
            history: history.map((h) => ({
                action: h.action,
                label: isModerationAction(h.action) ? ACTION_LABEL[h.action] : h.action,
                at: iso(h.createdAt),
                note: h.note,
            })),
        };
    }

    /**
     * 최근 n일 긴급 조인 방송(GOLF_URGENT) — 글별로 묶는다. 방송은 받는 사람마다 알림함 한 행이라(golf.ts broadcastUrgentJoin)
     * 행 수가 곧 받은 사람 수다. 관심 골프장 알림도 type 이 같다 — params.watchSlug 가 있는 행은 뺀다(golfCourseWatch.ts).
     * 방송 행에는 글쓴이(params.ownerId)가 실려 있어, 글이 지워진 뒤에도 누가 쐈는지 남는다.
     */
    async urgentLog(days = URGENT_LOG_DAYS, nowMs = Date.now()): Promise<UrgentLogRow[]> {
        const span = Math.min(Math.max(1, Math.floor(days)), 31);
        const res: any = await db.execute(sql`
            WITH u AS (
                SELECT substring(params->>'url' from '/golf/booking-list/([0-9a-fA-F-]{36})') AS post_id,
                       params->>'ownerId' AS owner_id,
                       created_at, title, body
                FROM ${hiqNotifications}
                WHERE type = 'GOLF_URGENT'
                  AND params->>'watchSlug' IS NULL
                  AND created_at > now() - make_interval(days => ${span}::int)
            )
            SELECT post_id AS "postId",
                   max(owner_id) AS "ownerId",
                   to_char(min(created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "sentAt",
                   to_char(max(created_at), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "lastSentAt",
                   count(*)::int AS "recipients",
                   (array_agg(title ORDER BY created_at))[1] AS "sampleTitle",
                   (array_agg(body ORDER BY created_at))[1] AS "sampleBody"
            FROM u
            WHERE post_id IS NOT NULL
            GROUP BY post_id
            ORDER BY min(created_at) DESC
            LIMIT 200`);
        const groups: Array<{ postId: string; ownerId: string | null; sentAt: string; lastSentAt: string; recipients: number; sampleTitle: string | null; sampleBody: string | null }> =
            (res.rows ?? res).filter((g: any) => typeof g.postId === "string" && UUID_RE.test(g.postId));
        if (!groups.length) return [];

        const postIds = [...new Set(groups.map((g) => g.postId.toLowerCase()))];
        const ownerIds = [...new Set(groups.map((g) => g.ownerId).filter((v): v is string => typeof v === "string" && UUID_RE.test(v)))];
        const [rows, owners] = await Promise.all([
            this.selectRows(inArray(golfBookings.id, postIds)),
            ownerIds.length
                ? db.select({ id: hiqMembers.id, name: hiqMembers.name }).from(hiqMembers).where(inArray(hiqMembers.id, ownerIds))
                : Promise.resolve([] as { id: string; name: string }[]),
        ]);
        const listings = new Map((await this.hydrate(rows, nowMs)).map((l) => [l.id, l]));
        const ownerName = new Map<string, string>((owners as { id: string; name: string }[]).map((o) => [o.id, o.name]));

        return groups.map((g) => {
            const listing = listings.get(g.postId.toLowerCase()) ?? null;
            const oid = listing?.owner?.id ?? (g.ownerId && UUID_RE.test(g.ownerId) ? g.ownerId : null);
            return {
                postId: g.postId.toLowerCase(),
                sentAt: g.sentAt,
                lastSentAt: g.lastSentAt,
                recipients: Number(g.recipients) || 0,
                sampleTitle: g.sampleTitle ?? null,
                sampleBody: g.sampleBody ?? null,
                owner: oid ? { id: oid, name: listing?.owner?.name ?? ownerName.get(oid) ?? null } : null,
                status: !listing ? "deleted" : listing.hidden ? "hidden" : "live",
                listing,
            };
        });
    }

    private async selectRows(where: SQL): Promise<ListSelect[]> {
        return await db.select(LIST_COLS)
            .from(golfBookings)
            .leftJoin(hiqMembers, eq(hiqMembers.id, golfBookings.ownerId))
            .where(where) as ListSelect[];
    }

    private async flagCounts(base: SQL[]): Promise<{ total: number; hidden: number; reported: number }> {
        const [row] = await db.select({
            total: sql<number>`count(*)::int`,
            hidden: sql<number>`(count(*) filter (where ${golfBookings.isBlinded}))::int`,
            reported: sql<number>`(count(*) filter (where ${openReportExists}))::int`,
        })
            .from(golfBookings)
            .leftJoin(hiqMembers, eq(hiqMembers.id, golfBookings.ownerId))
            .where(and(...base));
        return { total: Number(row?.total ?? 0), hidden: Number(row?.hidden ?? 0), reported: Number(row?.reported ?? 0) };
    }

    /** 긴급 조인 id(티타임순). 후보는 '지금부터 24시간 안의 조인'(긴급은 늘 오늘 티 — 넉넉한 상위 집합), 판정은 isUrgentJoin. */
    private async urgentIds(base: SQL[], nowMs: number): Promise<string[]> {
        const rows = await db.select({
            id: golfBookings.id,
            listingType: golfBookings.listingType,
            joinType: golfBookings.joinType,
            costMode: golfBookings.costMode,
            greenFee: golfBookings.greenFee,
            datetime: golfBookings.datetime,
        })
            .from(golfBookings)
            .leftJoin(hiqMembers, eq(hiqMembers.id, golfBookings.ownerId))
            .where(and(
                ...base,
                eq(golfBookings.listingType, "JOIN"),
                gte(golfBookings.datetime, new Date(nowMs)),
                lt(golfBookings.datetime, new Date(nowMs + DAY_MS)),
            ))
            .orderBy(asc(golfBookings.datetime), asc(golfBookings.id))
            .limit(2000);
        return rows.filter((r) => isUrgentJoin(r, nowMs)).map((r) => r.id);
    }

    private async hydrate(rows: ListSelect[], nowMs: number): Promise<AdminListingRow[]> {
        if (!rows.length) return [];
        const ids = rows.map((r) => r.id);
        const [apps, reps] = await Promise.all([this.applicantCounts(ids), this.reportCounts(ids)]);
        return rows.map((r) => toRow(r, apps.get(r.id), reps.get(r.id), nowMs));
    }

    /** 신청 상태별 수. accepted 는 건수(팀), seats 는 확정된 사람 수(부킹 신청 한 건은 1~4명 — golf.repo countJoinRequests 와 같은 구분). */
    private async applicantCounts(ids: string[]): Promise<Map<string, ApplicantCounts>> {
        const rows = await db.select({
            bookingId: golfJoinRequests.bookingId,
            applied: sql<number>`(count(*) filter (where ${golfJoinRequests.status} = 'applied'))::int`,
            accepted: sql<number>`(count(*) filter (where ${golfJoinRequests.status} = 'accepted'))::int`,
            rejected: sql<number>`(count(*) filter (where ${golfJoinRequests.status} = 'rejected'))::int`,
            cancelled: sql<number>`(count(*) filter (where ${golfJoinRequests.status} = 'cancelled'))::int`,
            noshow: sql<number>`(count(*) filter (where ${golfJoinRequests.status} = 'noshow'))::int`,
            seats: sql<number>`(coalesce(sum(${golfJoinRequests.headcount}) filter (where ${golfJoinRequests.status} = 'accepted'), 0))::int`,
        })
            .from(golfJoinRequests)
            .where(inArray(golfJoinRequests.bookingId, ids))
            .groupBy(golfJoinRequests.bookingId);
        return new Map(rows.map((r) => [r.bookingId, {
            applied: Number(r.applied), accepted: Number(r.accepted), rejected: Number(r.rejected),
            cancelled: Number(r.cancelled), noshow: Number(r.noshow), seats: Number(r.seats),
        }]));
    }

    private async reportCounts(ids: string[]): Promise<Map<string, ReportCounts>> {
        const rows = await db.select({
            targetId: hiqReports.targetId,
            open: sql<number>`(count(*) filter (where ${hiqReports.status} = 'pending'))::int`,
            total: sql<number>`count(*)::int`,
        })
            .from(hiqReports)
            .where(and(eq(hiqReports.targetType, "golf_booking"), inArray(hiqReports.targetId, ids)))
            .groupBy(hiqReports.targetId);
        return new Map(rows.map((r) => [r.targetId, { open: Number(r.open), total: Number(r.total) }]));
    }
}

export const adminGolfListings = new AdminGolfListingsRepository();
