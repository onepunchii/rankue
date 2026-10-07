import { Router } from "express";
import { storage } from "../../storage/index.js";
import { coursePageSlugFor, type SeatLimit } from "../../storage/golf.repo.js";
import { deleteBlobs, isOnOwnBlobHost } from "../../utils/blob.js";
import { GOLF_PHOTO_CATEGORY, GOLF_THUMB_CATEGORY, GOLF_PHOTO_MAX_PER_ROUND, isOwnGolfPhotoUrl } from "../../../shared/golfPhoto.js";
import { insertGolfBookingSchema, GolfBooking, insertGolfJoinSchema, GolfJoin, insertGolfMembershipOrderSchema } from "../../../shared/schema.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { checkContent } from "../../utils/contentFilter.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { notifyCrewChat } from "../../services/crewChatNotify.js";
import { attemptKey, checkRateLimit, registerFailure, clearAttempts } from "./auth.js";
import { z } from "zod";
import { notificationService } from "../../services/notificationService.js";
import { notifyListingAlerts } from "../../services/golfCourseWatch.js";
import { JOIN_TYPES, JOIN_OPTIONS, MAX_SLOTS, normalizeSlots, openSlotCount, slotsFromLegacy, isKoreaCoord, isUrgentJoin, kstHour, convertibleSeats, conversionSlots, recruitCondition, listingCapacity, type JoinType, type SlotGender } from "../../../shared/golfJoin.js";
import { msg } from "../../lib/i18n.js";
import { getGolfFootprints } from "../../storage/golfFootprints.js";
import { parseFootprintYear } from "../../../shared/golfFootprints.js";
import { signFootprintShare, footprintCardPath } from "../../lib/footprintShare.js";
import { parseLatLng } from "../../../shared/golfNearby.js";
import { ONSITE_SOURCES, type OnSiteSource } from "../../../shared/golfOnSite.js";
import { sanitizeHolePatches, withoutHoleStats } from "../../../shared/golfHoleStats.js";

const router = Router();

// --- Golf Booking Routes ---
router.get("/bookings", asyncHandler(async (req: AuthRequest, res: any) => {
    // ?applied=1 — 내가 신청한 글(조인·부킹)과 내 상태(2026-09-21 '내 신청' 탭).
    if (req.query.applied === "1") {
        if (!req.userId) return sendError(res, 401, "로그인이 필요합니다");
        const rows = await storage.listMyRequests(req.userId);
        const counted = await withJoinCounts(rows as any[], req.userId);
        // withJoinCounts 가 myJoinStatus 를 다시 채우지만 같은 값이다. 연락처는 확정된 글만.
        return sendSuccess(res, counted);
    }
    // ?mine=1 — 내가 올린 글 전부, 날짜와 무관(2026-09-21 '내역' 시트). 목록은 하루치만 받으므로 따로 둔다.
    if (req.query.mine === "1") {
        if (!req.userId) return sendError(res, 401, "로그인이 필요합니다");
        // 티타임순(asc)이라 하한 없이 limit 만 걸면 **가장 오래된 글부터** 채워 '다가오는'이 잘린다 — 최근 60일부터로 잡고 넉넉히 받는다.
        const mine = await storage.getGolfBookings(undefined, { ownerId: req.userId, includeBlinded: true, sinceDays: 60, limit: 400 });
        return sendSuccess(res, await withJoinCounts(mine as any[], req.userId));
    }
    const date = req.query.date as string | undefined;
    if (!validDate(date) || !validDate(req.query.startDate) || !validDate(req.query.endDate)) return sendError(res, 400, "날짜가 올바르지 않아요");
    // 화면 질의를 그대로 필터로 넘기되, 서버 전용 키(ownerId·includeBlinded·limit·viewerId)는 지운다 — 남의 글 목록이나 가려진 글을 못 꺼내게.
    const { ownerId: _o, includeBlinded: _b, limit: _l, sinceDays: _s, viewerId: _v, ...filters } = req.query as Record<string, unknown>;
    // 보는 사람(viewerId)은 **로그인 id 로만** 넣는다 — 나와 차단 관계인 사람(내가 차단했든, 나를 차단했든)의 글을 목록에서 뺀다(2026-10-06, Apple 1.2 · Play UGC).
    // 질의 문자열의 viewerId 는 위에서 버렸고, 여기서 뒤에 적어 한 번 더 덮는다(남의 차단 목록으로 걸러 보지 못하게).
    const bookings = await storage.getGolfBookings(date, { ...filters, viewerId: req.userId });
    return sendSuccess(res, await withTeeWeather(await withJoinCounts(bookings as any[], req.userId)));
}));

router.get("/bookings/counts", asyncHandler(async (req: any, res: any) => {
    const { startDate, endDate, viewType } = req.query;
    if (!startDate || !endDate) {
        return sendError(res, 400, "시작일과 종료일은 필수입니다.");
    }
    if (!validDate(startDate) || !validDate(endDate)) return sendError(res, 400, "날짜가 올바르지 않아요");
    // 필터를 그대로 넘긴다 — 예전엔 안 넘겨서 날짜 칩이 "12개" 라고 하는데 목록엔 2개만 있었다(2026-09-09 검토).
    // 차단도 목록과 **같이** 건다 — 목록에서는 빠지는데 날짜 칩 숫자에는 남으면 "3건"을 열어 2건을 본다.
    // viewerId 는 질의 뒤에 적는다: 질의 문자열로 덮어쓸 수 없다.
    const counts = await storage.getGolfBookingCounts(startDate as string, endDate as string, viewType as string, { ...req.query, viewerId: req.userId });
    return sendSuccess(res, counts);
}));

/** 질의로 온 날짜가 없거나(undefined) 읽을 수 있는 날짜인가. 못 읽는 값이 저장소까지 가면 Invalid Date 가 500 을 낸다(2026-09-22 리뷰). */
function validDate(v: unknown): boolean {
    if (v === undefined || v === null || v === "") return true;
    return typeof v === "string" && v.length <= 40 && !Number.isNaN(new Date(v).getTime());
}

/** 매물을 올릴 수 있는 역할. 화면(BookingList.tsx)과 같은 목록을 서버에서도 검사한다 — 화면만 가리면 주소로 뚫린다. */
// 관리자(admin)는 관리자 콘솔을 보기만 하는 역할이다(2026-10-07) — 매장 판매자가 아니다. 임명 전처럼 개인(PERSONAL)으로 올린다
const BOOKING_WRITER_ROLES = ["super_admin", "store_owner", "booking_manager"];
const MAX_ITEMS_PER_POST = 40;   // 부킹 시트는 티오프 시간을 여러 개 담아 한 번에 보낸다
/** 한 시간에 올릴 수 있는 글 — 매장·매니저는 재고를 몰아 올리므로 넉넉히, 개인은 도배를 막을 만큼만. */
const postsPerHour = (sellerType: string) => (sellerType === "STORE" ? 400 : 40);

/** 연락 가능한 휴대폰인가. 소셜 가입 회원의 phone 은 "social:google:..." 이라 sms: 링크가 죽는다. */
function cutText(v: unknown, n: number): string | null | undefined {
    if (v === undefined) return undefined;
    if (v === null) return null;
    return typeof v === "string" ? v.slice(0, n) : null;
}

function usablePhone(phone: string | null | undefined): string | null {
    if (!phone || phone.startsWith("social:")) return null;
    const d = phone.replace(/\D/g, "");
    return d.length >= 10 && d.length <= 11 ? phone : null;
}

/**
 * 긴급 조인(당일 떨이) 전체 방송 — 2026-09-23 오너: "오늘인데 사람이 안 구해져서 10만원짜리 그린피를 만원에 올리는 것.
 * 한 명만 채우면 카트비·캐디피는 N빵이니까. 그런 티는 골프 유저에게 전체 푸시가 가게 해서 우리만의 킬링 포인트로 —
 * 다른 곳은 푸시알림이 없거든."
 *
 * 부킹매니저가 편해야 넘어온다(오너) → 매니저가 따로 켤 체크박스는 두지 않는다. 값과 시간만 보고 서버가 알아서 판단한다.
 */
const URGENT_BROADCAST_LIMIT = 300;
/** 방송을 기다려 주는 상한(ms). 서버리스는 응답을 보내면 얼어붙어, 기다리지 않은 푸시는 한 건도 안 나간다(simMatch 방송과 같은 이유). */
const URGENT_BROADCAST_WAIT_MS = 6000;
/** 같은 사람이 이 시간 안에 또 방송하지는 못한다 — 재고를 몰아 올리는 매니저가 하루에 열 통을 쏘면 다들 알림을 끈다. */
const URGENT_QUIET_HOURS = 6;
/** 조용한 시간(한국 시각): 21시~08시엔 푸시를 안 보낸다. 글은 그대로 올라가고 긴급 배지도 붙는다 — 푸시만 건너뛴다. */
const URGENT_PUSH_FROM_HOUR = 8;
const URGENT_PUSH_UNTIL_HOUR = 21;

/** 방송 본문의 티오프 시각 "07:40"(한국 시각). 긴급 조인은 늘 오늘이라 날짜는 붙이지 않는다. */
function teeTimeOnly(datetime: Date | string): string {
    const k = new Date(new Date(datetime).getTime() + 9 * 3_600_000);
    return `${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/** 긴급 방송을 받을 사람 — 밤·도배 제한이면 빈 목록. 관심 알림이 같은 사람을 두 번 울리지 않게 먼저 뽑아 둔다. */
async function urgentTargets(ownerId: string): Promise<string[]> {
    const hour = kstHour(Date.now());
    if (hour < URGENT_PUSH_FROM_HOUR || hour >= URGENT_PUSH_UNTIL_HOUR) return [];
    if (await storage.notifs.hasRecentGolfUrgent(ownerId, URGENT_QUIET_HOURS)) return [];
    // 올린 사람과 차단 관계(어느 쪽이 걸었든)인 회원은 뺀다(2026-10-06). 그 사람 목록에서는 이 글이 빠지므로(notBlockedByViewer)
    // 푸시가 가면 눌러도 글이 없다 — 차단한 사람의 글이 푸시로 다시 찾아오는 것이기도 하다.
    // 여기서 빠진 사람은 관심·지역 알림에서도 빠진다(golfCourseWatch.notBlocked) — 어느 길로도 받지 않는다.
    const [ids, blocked] = await Promise.all([
        storage.notifs.listGolfPushMembers([ownerId], URGENT_BROADCAST_LIMIT),
        storage.golf.blockPeerIds(ownerId),
    ]);
    return blocked.size ? ids.filter((id) => !blocked.has(id)) : ids;
}

async function broadcastUrgentJoin(ownerId: string, b: any, pre?: string[]): Promise<number> {
    const targets = pre ?? await urgentTargets(ownerId);
    if (targets.length === 0) return 0;
    // 받는 사람이 수백 명이고 언어도 제각각이라 문장을 여기서 만들지 않는다 — 키로 보내고 서비스가 받는 사람 언어로 푼다.
    // 비공개(isBlind) 글은 실명 대신 가명이다. 확정 전 사람에게 가는 알림에 실명이 실리면 가려 놓은 뜻이 없다.
    const title = msg("notif.golf.urgent.title", { time: teeTimeOnly(b.datetime), region: b.region ?? "" });
    const body = msg("notif.golf.urgent.body", {
        course: listingName(b),
        fee: Number(b.greenFee).toLocaleString("en-US"),
        open: joinCapacity(b),
    });
    const sends = targets.map((memberId) => notificationService.sendAndSaveNotification({
        memberId, title, body, category: "GOLF", type: "GOLF_URGENT", pref: "golf",
        // ownerId 는 도배 방지(hasRecentGolfUrgent)가 되짚는 값이다 — 딥링크는 url 만 본다.
        // teeAt: 푸시 유효기간을 티오프까지로 자른다(pushOptionsFor) — 꺼진 기기가 나중에 켜져도 지난 티는 안 뜬다.
        params: { url: `/golf/booking-list/${b.id}?view=JOIN`, ownerId, teeAt: new Date(b.datetime).toISOString() },
    }).catch((e) => { console.error("[GolfUrgentBroadcast]", e); }));
    await Promise.race([
        Promise.allSettled(sends),
        new Promise((r) => setTimeout(r, URGENT_BROADCAST_WAIT_MS)),
    ]);
    return targets.length;
}

/**
 * 조인·부킹 글에서 남에게 그대로 보이는 자유 입력 칸(2026-10-06). 길이만 자르고 내용은 보지 않아
 * 욕설·내기 권유가 걸러지지 않고 올라갔다 — 약관 5조("금전 내기·욕설 … 표현은 올리기 전에 자동으로 걸러지고")와 실제가 달랐다.
 * 한 칸씩 따로 본다: 이어 붙여 보면 칸 경계가 붙어("…시" + "발렛…") 멀쩡한 글이 걸린다.
 * region·courseType 도 본다 — 화면은 골프장 원장의 값을 보내지만 API 로는 아무 글자나 실을 수 있고,
 * 카드·채팅방 고정 카드·긴급 조인 푸시 제목에 그대로 나온다(이 두 칸에 실으면 필터를 건너뛸 수 있었다).
 */
const LISTING_TEXT_FIELDS = ["comment", "policyCustomText", "blindName", "venueName", "joinCondition", "courseName", "region", "courseType"] as const;

/**
 * 글에 달 수 있는 옵션 id — 부킹 시트의 여섯(client/src/golf/constants/booking.ts SPECIAL_OPTIONS)과 조인 시트의 JOIN_OPTIONS.
 * 카드는 모르는 id 를 **글자 그대로** 칩으로 그린다. 그래서 목록에 없는 값은 저장하지 않는다 — 아무 문장이나 칩으로 올릴 수 없게.
 * 화면에 옵션을 더하면 여기도 더한다(shared/golfListingSafety.test 가 두 목록이 맞는지 본다).
 */
const LISTING_OPTION_IDS: ReadonlySet<string> = new Set(["couple_2", "player_3", "no_caddie", "marshal", "meal_inc", "cart_free", ...JOIN_OPTIONS.map((o) => o.id)]);
function listingOptions(v: unknown): string[] {
    if (!Array.isArray(v)) return [];
    return Array.from(new Set(v.filter((o): o is string => typeof o === "string" && LISTING_OPTION_IDS.has(o))));
}

/** 걸리면 그 이유(서버 문구), 통과하면 null. 규칙은 contentFilter 의 "listing" 맥락 — 거래·가격 말은 통과, 내기·욕설만 막는다. */
function listingTextBlock(fields: Record<string, unknown>): string | null {
    for (const k of LISTING_TEXT_FIELDS) {
        const v = fields[k];
        if (typeof v !== "string" || !v) continue;
        const f = checkContent(v, { context: "listing" });
        if (f.blocked) return f.reason ?? "부적절한 표현이 포함되어 있습니다.";
    }
    return null;
}

// requireTermsAccepted: 약관에 동의하지 않은 회원과 **정지된 계정**을 함께 막는다(server/middleware/terms.ts).
// 예전엔 requireAuth 뿐이라, 운영자가 정지시킨 사람도 30일짜리 쿠키로 조인·부킹 글을 계속 올렸다(2026-10-06).
// 화면은 따로 안 고쳐도 된다 — TERMS_REQUIRED 로 거절되면 전역 안전망(TermsConsent)이 동의 시트를 띄운다.
router.post("/bookings", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    // 신원은 **서버가 정한다**. 예전엔 managerPhone 을 클라이언트가 보냈고 회원 id 컬럼도 없어서,
    // 남의 번호를 매니저로 박아 매물을 올릴 수 있었다 — 문의 전화는 그 사람에게 가고, 그 사람 목록에
    // 자기가 올린 적 없는 매물이 서고, 지울 수 있는 것도 그 사람뿐이었다(2026-09-09 검토).
    const member = await storage.getMemberById(req.userId!);
    if (!member) return sendError(res, 403, "권한이 없습니다");

    // 조인(같이 칠 사람 모집)은 **누구나**, 부킹(티타임 판매·양도)도 **누구나**(2026-09-21 오너 A안). 예전엔 부킹이
    // 매니저·매장 권한 전용이라 일반 회원은 아무것도 올릴 수 없었다. 대신 부킹은 올린 쪽을 적어 카드에 '매장 / 개인 양도'
    // 배지를 단다 — 돈이 먼저 오가는 글이라 보는 사람이 누구 글인지 알아야 한다. 신고 3건이면 자동으로 가려진다(기존).
    // 조인은 연락처가 필요 없고(신청·승인이 앱 안에서 끝난다), 부킹은 문자 문의 버튼이 있어 휴대폰 번호가 있어야 한다.
    const items = Array.isArray(req.body) ? req.body : [req.body];
    // 한 번에·한 시간에 올릴 수 있는 수(2026-09-22 리뷰) — 배열 본문에 상한이 없어 한 요청으로 수천 건을 만들 수 있었다.
    if (items.length === 0 || items.length > MAX_ITEMS_PER_POST) return sendError(res, 400, `한 번에 ${MAX_ITEMS_PER_POST}건까지 올릴 수 있어요. 나눠서 올려 주세요`);
    const allJoin = items.length > 0 && items.every((it: any) => it?.listingType === "JOIN");
    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    const sellerType = BOOKING_WRITER_ROLES.includes(String(role)) ? "STORE" : "PERSONAL";
    const hourCap = postsPerHour(sellerType);
    if ((await storage.countRecentBookingsByOwner(req.userId!, 60)) + items.length > hourCap) return sendError(res, 429, `한 시간에 ${hourCap}건까지 올릴 수 있어요. 잠시 뒤에 다시 올려 주세요`, "TOO_MANY_POSTS");
    const phone = usablePhone(member.phone);
    if (!allJoin && !phone) return sendError(res, 400, "연락 가능한 휴대폰 번호를 먼저 등록해 주세요", "NO_CONTACT_PHONE");

    // 먼저 전부 검증하고, 다 통과해야 넣는다 — 중간 항목에서 400 이 나면 앞 항목만 저장돼 다시 올릴 때 중복이 됐다.
    const validated: any[] = [];

    for (const item of items) {
        // 클라이언트가 보낸 신원 값은 버린다(덮어쓰기가 아니라 제거 — 스키마가 넓어져도 새지 않게).
        const { managerPhone: _p, ownerId: _o, sellerType: _s, ...rest } = item ?? {};
        // 개인은 매장만 쓰는 값을 못 건드린다 — 핫딜 리본은 매장 매물 표시다.
        if (sellerType === "PERSONAL") rest.isHotDeal = false;
        // 조인의 자리·종류·비용·장소(2026-09-21). 자리가 오면 모집 인원은 자리에서 센다 — 두 값이 어긋나지 않게.
        if (rest.listingType === "JOIN") {
            if (rest.slots !== undefined) {
                const slots = normalizeSlots(rest.slots);
                if (!slots) return sendError(res, 400, "자리 구성이 올바르지 않아요(모집 자리 1 이상, 2~4자리 · 호스트는 첫 자리에만)");
                rest.slots = slots;
                rest.joinHeadcount = openSlotCount(slots);
            } else {
                // 자리 없이 온 옛 형식 — 모집 인원을 1~3 으로 묶는다(4인 1팀). 안 묶으면 정원을 아무 숫자로나 만들 수 있었다.
                rest.joinHeadcount = Math.max(1, Math.min(MAX_SLOTS - 1, Math.floor(Number(rest.joinHeadcount)) || MAX_SLOTS - 1));
            }
            if (rest.joinType !== undefined && !JOIN_TYPES.includes(rest.joinType)) return sendError(res, 400, "조인 종류가 올바르지 않아요");
            if (rest.costMode !== undefined && rest.costMode !== "FIXED" && rest.costMode !== "SPLIT") return sendError(res, 400, "비용 방식이 올바르지 않아요");
            if (rest.costMode === "SPLIT" && (rest.greenFee === undefined || rest.greenFee === null)) rest.greenFee = 0;
            if (!isKoreaCoord(rest.lat, rest.lng)) { rest.lat = null; rest.lng = null; }
            rest.venueName = cutText(rest.venueName, 40);
            // 스크린·파크는 골프장 마스터가 없다 — 장소 이름이 곧 코스 이름이다(목록·검색이 courseName 을 본다).
            if ((rest.joinType === "SCREEN" || rest.joinType === "PARK") && !rest.courseName) { rest.courseName = rest.venueName ?? ""; rest.courseId = rest.courseId ?? "venue"; }
        }
        // 공개되는 자유 입력은 서버에서 자른다 — 화면 maxLength 는 API 로 우회된다.
        // 길이 제한이 없으면 글 본문에 계좌번호·안내문을 통째로 붙일 수 있다(2026-09-09 검토).
        const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : v);
        const data = {
            ...rest,
            comment: cut(rest.comment, 300),
            policyCustomText: cut(rest.policyCustomText, 300),
            blindName: cut(rest.blindName, 30),
            joinCondition: cut(rest.joinCondition, 200),
            courseName: cut(rest.courseName, 60),
            // 지역·코스 종류도 자른다(원장 값은 '경기'처럼 짧다). 옵션은 아는 id 만 남긴다 — 위 LISTING_OPTION_IDS.
            region: cut(rest.region, 40),
            courseType: cut(rest.courseType, 20),
            options: listingOptions(rest.options),
            datetime: new Date(item.datetime),
            ownerId: req.userId,
            managerPhone: phone ?? "",
            sellerType: rest.listingType === "JOIN" ? null : sellerType,
        };

        // 내용 필터(2026-10-06) — 잘라 낸 **저장될 글자 그대로** 본다. 걸리면 한 건도 넣지 않는다(위 '먼저 전부 검증' 규칙 그대로).
        // 전화번호·링크 가리기(maskContacts)는 여기서 하지 않는다: 조인 글도 지금까지 하지 않았고,
        // 매장·매니저 글의 연락처 공개는 정책으로 정해 둔 것이라 이 고침에서 바꾸지 않는다.
        const blockedReason = listingTextBlock(data);
        if (blockedReason) return sendError(res, 400, blockedReason);

        const validation = insertGolfBookingSchema.safeParse(data);
        if (!validation.success) {
            return sendError(res, 400, validation.error.message);
        }

        validated.push(validation.data);
    }

    const results: GolfBooking[] = [];
    for (const data of validated) results.push(await storage.createGolfBooking(data as any));

    // 긴급 조인이면 골프 회원 전체에 알린다. 부킹 시트처럼 한 번에 여러 건을 올려도 **푸시는 1통**(첫 한 건)이다 —
    // 40건이 40통이 되면 그날로 다들 알림을 끈다. 방송이 실패해도 글 등록은 성공이어야 하니 여기서 삼킨다.
    const urgent = results.find((r) => isUrgentJoin(r as any, Date.now()));
    // 관심 골프장 알림(조건·도배 제한·비공개 제외는 서비스가 판정)과 긴급 방송을 **동시에** 보낸다 — 차례로 기다리면 응답이 12초까지 늘었다.
    // 방송을 받는 사람은 관심 알림을 알림함에만 둔다(같은 글로 두 번 울리지 않게). 응답 전에 기다리고, 실패는 삼킨다.
    const sentUrgent = urgent ? await urgentTargets(req.userId!).catch(() => [] as string[]) : [];
    await Promise.allSettled([
        urgent && sentUrgent.length ? broadcastUrgentJoin(req.userId!, urgent, sentUrgent).catch((e) => console.error("[GolfUrgentBroadcast]", e)) : null,
        // 관심 골프장 알림 → 지역 알림(2026-10-05) 순서로 한 함수가 보낸다 — 같은 글로 두 번 울리지 않게
        notifyListingAlerts(req.userId!, results as any[], { silent: new Set(sentUrgent) }).catch((e) => console.error("[GolfListingAlerts]", e)),
    ]);

    return sendSuccess(res, results);
}));

/**
 * POST /bookings/:id/to-join — 내가 올린 부킹을 그 자리에서 조인으로 돌린다.
 *
 * 2026-09-23 오너: "부킹매니저가 부킹을 올릴 때 굳이 4자리 3자리 이렇게 올릴 필요가 없지 않을까?
 *   … 내가 올린 부킹 내역에서 조인 돌리기로 버튼이 있고 그때 해당 옵션을 넣고 바로 조인으로 전환시키게."
 * 왜 올릴 때가 아니라 지금인가: 부킹은 **앱 밖에서** 팔린다(카드의 문자 버튼이 sms: 를 열 뿐이다).
 * 앱은 몇 자리가 팔렸는지 알 길이 없으니, 남은 자리는 **판 사람이 아는 그 순간에** 입력해야 맞는 숫자가 된다.
 *
 * 문지기는 **글쓴이 본인뿐**이다(운영자도 아니다 — 운영자가 할 일은 사기 글을 내리는 것이지 남의 매물 구성을 바꾸는 게 아니다).
 * 삭제 라우트가 쓰는 '번호로 되짚기'(owner_id 가 빈 옛 행)는
 * 일부러 안 가져왔다. 전환은 곧 신청자를 받는다는 뜻이고, 신청자 명단(이름·사진·노쇼 이력)은 canManageBooking 만
 * 열어 주는 것이다. 자기신고 문자열이던 manager_phone 으로 그 문을 열면 남의 글의 신청자가 통째로 넘어간다(2026-09-22 판단).
 * 게다가 owner_id 가 빈 행은 전부 2026-09-09 이전 글이라 티타임이 이미 지났다 — 아래 '지난 티타임' 검사에 어차피 걸린다.
 */
router.post("/bookings/:id/to-join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "부킹을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "부킹을 찾을 수 없어요");
    if (!booking.ownerId || booking.ownerId !== req.userId) return sendError(res, 403, "글쓴이만 조인으로 돌릴 수 있어요");
    if (booking.listingType === "JOIN") return sendError(res, 400, "이미 조인이에요", "ALREADY_JOIN");
    if (new Date(booking.datetime).getTime() <= Date.now()) return sendError(res, 400, "이미 지난 티타임이에요", "TEE_TIME_PASSED");

    // 화면은 **'몇 자리 더 받을지'만** 말한다. 자리 배열은 서버가 만든다(shared/golfJoin.conversionSlots) —
    // 화면이 보낸 배열을 믿으면 "두 자리 팔렸는데 네 자리 남았다"가 통과해 한 팀에 여섯 명을 받게 된다.
    const more = Math.floor(Number(req.body?.more));
    if (!Number.isFinite(more) || more < 1 || more > MAX_SLOTS) return sendError(res, 400, `더 받을 자리는 1~${MAX_SLOTS}자리예요`);
    const genders: SlotGender[] = Array.isArray(req.body?.genders)
        ? req.body.genders.filter((g: unknown) => g === "M" || g === "F" || g === "ANY")
        : [];
    // 비용: 기본은 적어 둔 그린피 그대로(FIXED). 1/N 을 고르면 금액은 뜻이 없어 0 으로 둔다(조인 만들기와 같다).
    const costMode = req.body?.costMode === "SPLIT" ? "SPLIT" : "FIXED";

    // 팔린 자리를 세고 바꾸는 일은 한 트랜잭션 안에서 한다 — 여기서 미리 세어 두면 그 사이 승인이 끼어든다.
    const result = await storage.convertBookingToJoin(booking.id, req.userId!, { more, genders, costMode });
    if (!result.ok) {
        // 네 자리가 **다** 팔렸을 때만 막는다. 두 자리만 팔린 티타임은 남은 두 자리를 돌릴 수 있어야 한다
        // (2026-09-24 오너: "2명이니깐 2명을 더 조인으로 전환해도되고 해야되는데").
        if (result.reason === "full") return sendError(res, 409, "네 자리가 다 팔린 티타임이에요", "BOOKING_CONFIRMED");
        if (result.reason === "bad_slots") return sendError(res, 400, `남은 자리는 ${result.room ?? MAX_SLOTS}자리예요`, "TOO_MANY_SEATS");
        if (result.reason === "already_join") return sendError(res, 400, "이미 조인이에요", "ALREADY_JOIN");
        if (result.reason === "passed") return sendError(res, 400, "이미 지난 티타임이에요", "TEE_TIME_PASSED");
        if (result.reason === "forbidden") return sendError(res, 403, "글쓴이만 조인으로 돌릴 수 있어요");
        return sendError(res, 409, "지금은 조인으로 돌릴 수 없어요", "CONVERT_FAILED");
    }
    const { row: updated, open } = result;

    // 대기 중이던 예약 신청자에게 알린다 — 그 사람들이 신청한 것은 '팀 통째'였는데 이제 자리 하나짜리 조인이다.
    // ⚠️ sendSuccess **전에** await — 서버리스는 응답을 보내면 실행이 얼어붙어 기다리지 않은 푸시는 한 통도 안 나간다.
    const waiting = await storage.pendingRequesterIds(booking.id);
    if (waiting.length > 0) {
        await Promise.allSettled(waiting.map((memberId) => notificationService.sendAndSaveNotification({
            memberId, title: "부킹이 조인으로 바뀌었어요",
            // 신청은 대기열에 그대로 두되 인원은 1 로 맞춰진다(convertBookingToJoin) — 조인은 자리 하나가 사람 하나다.
            // 여러 명으로 신청했던 사람에게 그 말을 안 하면, 일행을 데려갈 생각으로 기다리다 현장에서 어긋난다.
            body: `${listingName(updated)} ${teeText(updated)} — ${open}자리를 받는 조인이 됐어요. 신청은 1자리로 두었어요 — 일행이 있으면 각자 신청해야 해요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=JOIN` },
        }).catch((e) => console.error("[GolfJoinNotify]", e))));
    }
    // 돌린 글이 당일 떨이 조건(오늘·필드·고정가·3만원 이하)이면 긴급 조인 방송도 여기서 나간다 —
    // 매니저가 남은 자리를 떨이로 넘기는 그 순간이 바로 전체 푸시가 값어치를 하는 때다(등록 라우트와 같은 규칙·같은 도배 제한).
    const sentUrgent = isUrgentJoin(updated as any, Date.now()) ? await urgentTargets(req.userId!).catch(() => [] as string[]) : [];
    // 관심 골프장 알림 — 남은 자리는 방금 연 자리 수(open)다(팔린 자리는 이미 찬 칸). 긴급 방송과 동시에, 방송 받은 사람은 조용히.
    await Promise.allSettled([
        sentUrgent.length ? broadcastUrgentJoin(req.userId!, updated, sentUrgent).catch((e) => console.error("[GolfUrgentBroadcast]", e)) : null,
        notifyListingAlerts(req.userId!, [{ ...(updated as any), seatsLeft: open }], { silent: new Set(sentUrgent) }).catch((e) => console.error("[GolfListingAlerts]", e)),
    ]);
    const [withCounts] = await withJoinCounts([updated], req.userId);
    return sendSuccess(res, withCounts);
}));

router.delete("/bookings/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "삭제할 예약이 없거나 권한이 없습니다");
    // 내리기 전에 알릴 사람을 먼저 본다 — 신청 행은 글과 함께 cascade 로 지워진다.
    const requesters = await storage.activeRequesterIds(req.params.id);
    const before: any = await storage.getGolfBooking(req.params.id);
    const member = await storage.getMemberById(req.userId!);
    if (!member?.phone) return sendError(res, 403, "권한이 없습니다");
    // 운영자는 아무 매물이나 내릴 수 있다 — 사기 글을 내릴 방법이 없으면 신고가 무의미하다(2026-09-09).
    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    // 운영자 = 슈퍼관리자만(2026-10-07). 관리자(admin)는 관리자 콘솔을 보기만 하는 역할이라 남의 글을 내리지 못한다 — shared/adminRole.ts
    const isAdmin = role === "super_admin";
    // 그 외에는 등록자 본인만. 옛 행(owner_id 가 빈 행)은 번호로 되짚는다.
    const deleted = isAdmin
        ? await storage.deleteGolfBooking(req.params.id)
        : await storage.deleteGolfBooking(req.params.id, member.phone, req.userId!);
    if (!deleted) return sendError(res, 404, "삭제할 예약이 없거나 권한이 없습니다");
    // 글과 함께 그 방도 닫는다 — 안 지우면 아무도 못 들어가는 방의 메시지만 남는다(명단이 글에서 나오므로 전원 403).
    await storage.chat.deleteRoom(`listing:${req.params.id}`).catch((e) => console.error("[ListingRoomCleanup]", e));
    // 확정·대기 중이던 사람에게 알린다(2026-09-21) — 예전엔 글이 사라진 것을 아무도 몰랐다.
    await notifyListingTakenDown(before, requesters);
    return sendSuccess(res, { success: true });
}));


/**
 * 한 건만 조회. 공유 링크(/golf/booking-list/<id>)를 받은 사람이 그 티타임의 날짜를 모르면
 * 목록이 오늘로 열려 글이 안 보인다 — 화면이 id 로 날짜를 되짚을 때 쓴다(2026-09-10).
 * 가려진 매물은 안 준다.
 */
router.get("/bookings/:id", asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "티타임을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "티타임을 찾을 수 없어요");
    // 올린 사람이 나를 차단했으면 가려진 글과 **같은 답**(2026-10-06). 목록·개수(notBlockedByViewer)와 신청(apply)이 이미 그렇게 답한다 —
    // 상세만 200 이면 "글은 보이는데 신청만 안 된다"로 차단당한 사실이 드러난다. 내 글은 해당 없다.
    if (req.userId && booking.ownerId && booking.ownerId !== req.userId && await storage.crews.hasBlocked(booking.ownerId, req.userId)) return sendError(res, 404, "티타임을 찾을 수 없어요");
    const [withCounts] = await withJoinCounts([booking], req.userId);
    return sendSuccess(res, withCounts);
}));

// --- Golf Join Routes ---
// ── 조인 신청 ──────────────────────────────────────────────────────────────
// 그전엔 '조인 신청하기' 가 문자 앱만 열고 아무 기록도 안 남겼다. 누가 신청했는지·몇 명 찼는지·
// 안 나타났는지가 전부 없었다(2026-09-09 검토). 크루 안에서 조인을 열려면 이게 먼저다.
const DEFAULT_JOIN_CAPACITY = 3;   // 4인 1팀에서 방장을 뺀 자리

router.post("/bookings/:id/apply", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "글을 찾을 수 없어요");
    const isJoin = booking.listingType === "JOIN";
    if (booking.ownerId && booking.ownerId === req.userId) return sendError(res, 400, isJoin ? "내가 올린 조인이에요" : "내가 올린 부킹이에요");
    if (new Date(booking.datetime).getTime() <= Date.now()) return sendError(res, 400, "이미 지난 티타임이에요");
    // 올린 사람이 나를 차단했으면 신청을 받지 않는다(2026-10-06) — 차단한 사람의 이름이 신청자 목록과 푸시("○○님이 신청했어요")로
    // 다시 찾아오면 차단이 반쪽이다. 답은 가려진 글과 **똑같이** 준다: "차단당했다"는 사실이 드러나면 안 된다.
    // 그러려면 이 답 하나만 같아서는 안 된다 — 그 글은 차단당한 사람의 목록·날짜 칩 숫자(notBlockedByViewer, 양방향)와
    // 상세(GET /bookings/:id)에서도 같이 빠진다. 여기는 주소를 직접 부른 경우의 마지막 문이다.
    // 신청 행도 만들지 않고(아래 applyToJoin 전에 끊는다) 알림도 가지 않는다.
    if (booking.ownerId && await storage.crews.hasBlocked(booking.ownerId, req.userId!)) return sendError(res, 404, "글을 찾을 수 없어요");
    // 부킹 예약 신청(2026-09-21 오너: "푸시로 승부") — 문자 대신 앱 안에서 신청→승인→확정. 인원 1~4.
    const headcount = isJoin ? 1 : Math.max(1, Math.min(4, Math.floor(Number(req.body?.headcount)) || 1));

    const limit = seatLimit(booking);
    const r = await storage.applyToJoin(req.params.id, req.userId!, limit, headcount);
    if (r === "already") return sendError(res, 409, "이미 신청했어요", "ALREADY_APPLIED");
    if (r === "rejected") return sendError(res, 403, "올린 분이 받지 않은 신청이라 다시 신청할 수 없어요", "APPLY_REJECTED");
    if (r === "cooldown") return sendError(res, 429, "방금 취소했어요. 1분 뒤에 다시 신청해 주세요", "APPLY_COOLDOWN");
    if (r === "too_many") return sendError(res, 429, "이 글에는 더 신청할 수 없어요(취소 3번)", "APPLY_TOO_MANY");
    if (r === "full") return sendError(res, 409, isJoin ? "자리가 다 찼어요" : "이미 예약이 확정된 티타임이에요", "JOIN_FULL");
    // 올린 사람에게 알린다 — 승인제라 그 사람이 봐야 다음이 있다.
    // ⚠️ 알림은 **기다린다** — 서버리스(Vercel)는 응답을 보내면 실행이 얼어붙어 기다리지 않은 푸시가 통째로 사라진다
    // (2026-09-21 오너: "호스트한테 알림이 잘 안 와요" 의 원인). 이 파일의 모든 알림이 같은 규칙이다.
    if (booking.ownerId) {
        const me = await storage.getMemberById(req.userId!);
        await notificationService.sendAndSaveNotification({
            memberId: booking.ownerId,
            title: isJoin ? "조인 신청이 왔어요" : "예약 신청이 왔어요",
            body: isJoin
                ? `${me?.name ?? "회원"}님이 ${booking.courseName} 조인에 신청했어요. 승인해 주세요.`
                : `${me?.name ?? "회원"}님 · ${headcount}명 · ${booking.courseName} ${teeText(booking)} — 승인해 주세요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoin ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e));
    }
    return sendSuccess(res, { applied: true });
}));

/** 알림·메시지에 쓰는 글 이름 — 비공개(isBlind) 글은 확정 전 사람에게도 가는 알림이라 가명으로. */
function listingName(booking: { isBlind?: boolean | null; blindName?: string | null; courseName: string }): string {
    return booking.isBlind ? (booking.blindName || "비공개 골프장") : booking.courseName;
}

/** 푸시 본문용 티타임 "9/25 07:40"(한국시각). */
function teeText(booking: { datetime: Date | string }): string {
    const d = new Date(booking.datetime);
    const k = new Date(d.getTime() + 9 * 3_600_000);
    return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${String(k.getUTCHours()).padStart(2, "0")}:${String(k.getUTCMinutes()).padStart(2, "0")}`;
}

/**
 * '글이 내려갔어요' — 그 글에 대기·확정 중이던 신청자에게 알린다(2026-09-21). 예전엔 글이 사라진 것을 아무도 몰랐다.
 *
 * 두 곳이 **같은 문구로** 쓴다(2026-10-06):
 *  - 글 내리기(DELETE /bookings/:id) — 글이 지워진다.
 *  - 탈퇴(member.ts DELETE /me) — 그 회원의 글이 가려진다(user.repo deleteAccount). 신청자에게는 같은 일이다:
 *    글이 없어졌고, 확정이었다면 다시 찾아야 한다. **탈퇴했다는 사실은 싣지 않는다**(떠난 사람의 일을 알리지 않는다).
 *
 * 확정자에게는 실명(확정 때 이미 알려 준 이름), 대기자에게는 비공개 글이면 가명(listingName).
 * 글이 없거나 알릴 사람이 없으면 아무 일도 하지 않는다. **던지지 않는다** — 알림 실패가 내리기·탈퇴를 실패로 만들면 안 된다.
 * ⚠️ 부르는 쪽은 응답 **전에** await 한다 — 서버리스는 응답을 보내면 얼어붙어 기다리지 않은 푸시는 한 통도 안 나간다.
 */
export async function notifyListingTakenDown(
    before: { listingType?: string | null; courseName: string; isBlind?: boolean | null; blindName?: string | null; datetime: Date | string } | null | undefined,
    requesters: { memberId: string; status: string }[],
): Promise<void> {
    if (!before || requesters.length === 0) return;
    const isJoin = before.listingType === "JOIN";
    await Promise.allSettled(requesters.map((r) => notificationService.sendAndSaveNotification({
        memberId: r.memberId, title: isJoin ? "조인 글이 내려갔어요" : "부킹 글이 내려갔어요",
        body: `${r.status === "accepted" ? before.courseName : listingName(before)} ${teeText(before)} 글을 올린 분이 내렸어요.${r.status === "accepted" ? " 확정됐던 자리라 다시 찾아보셔야 해요." : ""}`,
        category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list?view=${isJoin ? "JOIN" : "BOOKING"}` },
    }).catch((e) => console.error("[GolfJoinNotify]", e))));
}

/**
 * 정원 = 모집 자리 수. 자리가 없는 옛 글은 모집 인원, 그것도 없으면 기본 3.
 * **부킹은 1** — 티타임 하나는 한 팀에게만 확정된다. 이 1의 단위는 '자리'가 아니라 **'팀'** 이다.
 * 그 팀이 몇 명인지는 신청의 headcount 가 말한다(1~4). 단위를 섞지 않으려면 seatLimit() 을 써라.
 */
function joinCapacity(booking: any): number {
    // 규칙은 shared/golfJoin.listingCapacity 한 곳에 있다 — 공개 골프장 페이지도 같은 값을 쓴다.
    // 옛 글의 모집 인원도 4인 1팀 안으로 묶는다 — 자리 없이 저장된 큰 숫자가 그대로 정원이 되지 않게.
    return listingCapacity(booking);
}

/**
 * 정원과 **그 정원을 세는 단위**를 함께 준다(2026-09-24).
 * 부킹은 팀을 판다 → 승인된 신청 건수로 센다. 조인은 자리를 판다 → 승인된 사람 수로 센다.
 * 조인 신청은 늘 1명이라 조인 쪽 숫자는 예전(행 수)과 언제나 같다.
 */
function seatLimit(booking: any): SeatLimit {
    return { capacity: joinCapacity(booking), unit: booking.listingType === "JOIN" ? "seats" : "parties" };
}

/** 앱이 아는 '팔린 자리'(사람 수). 부킹의 2명짜리 신청 하나는 2다 — 행 수로 세면 1이라 티타임이 잠긴다. */
async function soldSeats(bookingId: string): Promise<number> {
    const counts = await storage.countJoinRequests([bookingId]);
    return counts.get(bookingId)?.seats ?? 0;
}

/**
 * POST /bookings/:id/applicants/:memberId/decision — 호스트의 승인·거절(2026-09-21 오너: "호스트 승인제").
 * 승인은 정원 안에서만 된다. 결과는 신청한 사람에게 푸시로 간다.
 */
router.post("/bookings/:id/applicants/:memberId/decision", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.memberId)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (!(await canManageBooking(req, booking))) return sendError(res, 403, "글쓴이만 할 수 있어요");
    const accept = req.body?.accept === true;
    const isJoin = booking.listingType === "JOIN";
    if (accept && new Date(booking.datetime).getTime() <= Date.now()) return sendError(res, 400, "이미 지난 티타임이에요", "TEE_TIME_PASSED");
    const r = await storage.decideJoinRequest(req.params.id, req.params.memberId, accept, seatLimit(booking));
    if (r === "full") return sendError(res, 409, isJoin ? "자리가 다 찼어요" : "이미 다른 분께 확정한 티타임이에요", "JOIN_FULL");
    if (r === "gone") return sendError(res, 409, "대기 중인 신청이 아니에요");
    // 확정되면 대화방에 들어온다(2026-09-21 채팅) — 시스템 메시지로 알리고, 푸시는 방으로 바로 보낸다.
    if (accept) {
        const who = await storage.getMemberById(req.params.memberId);
        await storage.chat.addMessage({ key: `listing:${booking.id}`, senderId: null, type: "system", message: `${who?.name ?? "회원"}님이 확정됐어요. 이제 여기서 대화해요.` })
            .catch((e) => console.error("[ListingChatSystem]", e));
    }
    // 이번 승인으로 자리가 다 찼으면 남은 대기자에게 알린다(조인·부킹 공통). 거절로 돌리지는 않는다 —
    // 거절은 재신청이 막히는 최종 상태라(2026-09-22), 확정자가 빠져 자리가 다시 나면 이 사람들이 돌아올 수 있어야 한다.
    if (accept) {
        const counts = await storage.countJoinRequests([booking.id]);
        const c = counts.get(booking.id);
        const lim = seatLimit(booking);
        // 정원과 **같은 단위**로 센다 — 조인은 자리(사람 수), 부킹은 팀(건수).
        if ((lim.unit === "seats" ? (c?.seats ?? 0) : (c?.accepted ?? 0)) >= lim.capacity) {
            const waiting = await storage.pendingRequesterIds(booking.id);
            await Promise.allSettled(waiting.map((memberId) => notificationService.sendAndSaveNotification({
                memberId, title: isJoin ? "조인 자리가 다 찼어요" : "예약이 다른 분께 확정됐어요",
                body: `${listingName(booking)} ${teeText(booking)} — 자리가 다시 나면 알려 드릴게요. 기다리기 싫으면 신청을 취소해도 돼요.`,
                // 글 상세가 아니라 **내 신청 목록**으로 보낸다(2026-09-23): 이 알림이 권하는 일("신청을 취소해도 돼요")이
                // 거기에 있다. 글 상세에서는 자리가 다 찼으니 신청 단추도 없어 할 수 있는 게 없었다.
                category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/my-bookings?tab=${isJoin ? "join" : "booking"}&role=applied` },
            }).catch((e) => console.error("[GolfJoinNotify]", e))));
        }
    }
    await notificationService.sendAndSaveNotification({
        memberId: req.params.memberId,
        title: accept ? (isJoin ? "조인이 확정됐어요" : "예약이 확정됐어요") : (isJoin ? "조인 신청이 거절됐어요" : "예약 신청이 거절됐어요"),
        body: accept
            ? (isJoin ? `${booking.courseName} ${teeText(booking)} 자리가 확정됐어요. 채팅방이 열렸어요.` : `${booking.courseName} ${teeText(booking)} 예약이 확정됐어요. 연락처와 채팅방이 열렸어요.`)
            : `${listingName(booking)} ${teeText(booking)}은 이번엔 함께하지 못하게 됐어요.`,
        category: "GOLF", type: "JOIN", pref: "golf",
        // 확정은 채팅방으로(거기서 다음 이야기를 한다). 거절은 **내 신청 목록**으로 — 글 상세로 보내 봐야
        // 거절은 재신청이 막힌 최종 상태라(2026-09-22) 그 화면엔 할 수 있는 일이 하나도 없다.
        // 내 신청 목록에는 '거절' 칩과 "다른 티타임을 찾아보세요" 가 있고, 다른 신청들이 함께 보인다(2026-09-23).
        params: { url: accept ? `/chat/listing/${booking.id}` : `/golf/my-bookings?tab=${isJoin ? "join" : "booking"}&role=applied` },
    }).catch((e) => console.error("[GolfJoinNotify]", e));
    return sendSuccess(res, { status: accept ? "accepted" : "rejected" });
}));

/**
 * GET /places?q= — 스크린·파크 장소 검색(카카오 로컬). KAKAO_REST_KEY 가 없으면 501 을 주고 화면은 이름 직접 입력으로 간다.
 * 좌표가 있어야 "내 주변" 정렬이 된다 — 그래서 키가 생기면 이 경로 하나로 조인이 지도 위에 선다.
 */
router.get("/places", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const key = process.env.KAKAO_REST_KEY;
    const q = String(req.query.q ?? "").trim().slice(0, 40);
    if (!key) return sendError(res, 501, "장소 검색을 아직 쓸 수 없어요", "NO_PLACE_API");
    if (q.length < 2) return sendSuccess(res, []);
    const u = new URL("https://dapi.kakao.com/v2/local/search/keyword.json");
    u.searchParams.set("query", q);
    u.searchParams.set("size", "8");
    const lat = Number(req.query.lat), lng = Number(req.query.lng);
    if (isKoreaCoord(lat, lng)) { u.searchParams.set("x", String(lng)); u.searchParams.set("y", String(lat)); u.searchParams.set("sort", "distance"); }
    const r = await fetch(u, { headers: { Authorization: `KakaoAK ${key}` } });
    if (!r.ok) return sendError(res, 502, "장소 검색이 잠시 안 돼요");
    const j = await r.json() as { documents?: any[] };
    return sendSuccess(res, (j.documents ?? []).map((d) => ({
        name: String(d.place_name ?? ""), address: String(d.road_address_name || d.address_name || ""),
        lat: Number(d.y), lng: Number(d.x), category: String(d.category_name ?? ""),
    })).filter((d) => d.name && isKoreaCoord(d.lat, d.lng)));
}));

router.delete("/bookings/:id/apply", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "신청 내역이 없어요");
    // 티타임이 지난 뒤에는 못 무른다. 안 막으면 안 나타난 사람이 뒤늦게 '취소' 를 눌러
    // 노쇼 표시를 피해 갈 수 있다 — 노쇼는 status 가 'applied' 인 사람만 찍을 수 있기 때문이다.
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (booking && new Date(booking.datetime).getTime() <= Date.now()) {
        return sendError(res, 400, "이미 지난 티타임이라 취소할 수 없어요", "TEE_TIME_PASSED");
    }
    // 확정됐던 사람이 빠지면 방에도 남긴다(취소 전에 명단을 봐야 한다)
    const wasInRoom = booking ? await storage.chat.canAccess({ kind: "listing", id: req.params.id, key: `listing:${req.params.id}` }, req.userId!) : false;
    const ok = await storage.cancelJoinRequest(req.params.id, req.userId!);
    if (!ok) return sendError(res, 404, "신청 내역이 없어요");
    // 확정됐던 사람이 빠졌다 = 자리가 다시 났다. 기다리던 사람들에게 알린다(호스트가 그중에서 다시 승인한다).
    if (wasInRoom && booking && booking.ownerId !== req.userId) {
        const isJoinListing = booking.listingType === "JOIN";
        const waiting = await storage.pendingRequesterIds(req.params.id);
        await Promise.allSettled(waiting.map((memberId) => notificationService.sendAndSaveNotification({
            memberId, title: "자리가 다시 났어요", body: `${listingName(booking)} ${teeText(booking)} — 확정됐던 분이 빠졌어요. 올린 분이 승인하면 알려 드릴게요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoinListing ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e))));
    }
    if (wasInRoom && booking?.ownerId !== req.userId) {
        const me = await storage.getMemberById(req.userId!);
        await storage.chat.addMessage({ key: `listing:${req.params.id}`, senderId: null, type: "system", message: `${me?.name ?? "회원"}님이 빠졌어요.` })
            .catch((e) => console.error("[ListingChatSystem]", e));
    }
    // 올린 사람이 모르고 있으면 안 된다 — 확정해 둔 사람이 빠지면 자리가 다시 비는 일이다(2026-09-21).
    if (booking?.ownerId) {
        const me = await storage.getMemberById(req.userId!);
        const isJoin = booking.listingType === "JOIN";
        await notificationService.sendAndSaveNotification({
            memberId: booking.ownerId, title: isJoin ? "조인 신청이 취소됐어요" : "예약 신청이 취소됐어요",
            body: `${me?.name ?? "회원"}님이 ${booking.courseName} ${teeText(booking)} 신청을 취소했어요.`,
            category: "GOLF", type: "JOIN", pref: "golf", params: { url: `/golf/booking-list/${booking.id}?view=${isJoin ? "JOIN" : "BOOKING"}` },
        }).catch((e) => console.error("[GolfJoinNotify]", e));
    }
    return sendSuccess(res, { applied: false });
}));

/**
 * 이 조인 글의 주인인가. 운영자도 통과시킨다(사기 글 정리).
 *
 * 전화번호로 되짚는 길은 **일부러 안 둔다**. manager_phone 은 2026-09-09 이전에 클라이언트가 보내던
 * 자기신고 문자열이라, 그걸 신원으로 쓰면 남의 번호를 박아 둔 글의 신청자 명단(이름·사진·노쇼 이력)이
 * 그 번호의 주인에게 열린다. owner_id 가 빈 옛 글은 운영자가 맡는다.
 */
async function canManageBooking(req: AuthRequest, booking: any): Promise<boolean> {
    if (booking.ownerId && booking.ownerId === req.userId) return true;
    const member = await storage.getMemberById(req.userId!);
    if (!member) return false;
    const role = (member as any).role ?? (member.profileId ? (await storage.getProfile(member.profileId) as any)?.role : null);
    // 남의 글을 대신 관리하는 것은 슈퍼관리자만(관리자 admin 은 보기 전용 — shared/adminRole.ts)
    return role === "super_admin";
}

/** 주소로 들어온 id 가 uuid 꼴인가. 아니면 Postgres 가 던져 500 이 난다 — 없는 것으로 보고 404 를 준다. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 신청자 목록 — 글쓴이(와 운영자)만.
 * 신청이 쌓여도 볼 화면이 없으면 글쓴이는 여전히 누가 오는지 모른다. 노쇼 표시도 여기서 한다.
 */
router.get("/bookings/:id/applicants", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (!(await canManageBooking(req, booking))) return sendError(res, 403, "글쓴이만 볼 수 있어요");
    const applicants = await storage.listJoinApplicants(req.params.id);
    return sendSuccess(res, {
        teeTime: booking.datetime,
        applicants,
    });
}));

/**
 * 안 나타났다고 표시한다(되돌리기 포함). 글쓴이·운영자만, 그리고 **티타임이 지난 뒤에만**.
 * 치기도 전에 노쇼를 찍을 수 있으면 그건 기록이 아니라 협박 수단이 된다.
 */
router.post("/bookings/:id/applicants/:memberId/noshow", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.id) || !UUID.test(req.params.memberId)) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking) return sendError(res, 404, "조인 글을 찾을 수 없어요");
    if (!(await canManageBooking(req, booking))) return sendError(res, 403, "글쓴이만 표시할 수 있어요");
    if (new Date(booking.datetime).getTime() > Date.now()) {
        return sendError(res, 400, "티타임이 지난 뒤에 표시할 수 있어요", "TEE_TIME_NOT_PASSED");
    }
    const noShow = req.body?.noShow !== false;
    const r = await storage.setJoinNoShow(req.params.id, req.params.memberId, noShow, seatLimit(booking));
    if (r === "full") return sendError(res, 409, "그 사이 자리가 차서 되돌릴 수 없어요", "JOIN_FULL");
    if (r === "gone") return sendError(res, 404, noShow ? "신청 중인 사람이 아니에요" : "노쇼로 표시된 사람이 아니에요");
    return sendSuccess(res, { noShow });
}));

/**
 * 크루 채팅방에 부킹 카드를 올린다.
 *
 * 왜 서버가 만드나: 화면에서 /crews/:id/chats 로 metadata 를 실어 보내고 있었는데, 그 라우트는
 * metadata 를 **버린다**(클라이언트가 카드를 지정할 수 있으면 가짜 정산·예약 카드를 주입할 수 있어서).
 * 그래서 크루방에는 카드가 아니라 눌리지 않는 글자 덩어리만 올라갔다(2026-09-09 검토).
 * 이제 서버가 실제 매물을 읽어 카드를 만든다 — 없는 부킹으로 카드를 만들 수 없다.
 */
router.post("/bookings/:id/share/crew", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const crewId = String(req.body?.crewId ?? "");
    if (!crewId || !UUID.test(crewId)) return sendError(res, 400, "크루를 골라 주세요");
    if (!UUID.test(req.params.id)) return sendError(res, 404, "티타임을 찾을 수 없어요");

    const booking: any = await storage.getGolfBooking(req.params.id);
    if (!booking || booking.isBlinded) return sendError(res, 404, "티타임을 찾을 수 없어요");

    const membership = await storage.getCrewMembership(crewId, req.userId!);
    if (!membership || membership.role === "pending") return sendError(res, 403, "크루 멤버만 공유할 수 있어요");

    const crewData = await storage.getCrew(crewId);
    // 당구 크루에 골프 부킹을 올리지 않는다 — 두 종목은 아예 다른 플랫폼으로 본다.
    if (crewData?.crew?.sportCategory && crewData.crew.sportCategory !== "GOLF") {
        return sendError(res, 400, "골프 크루에만 공유할 수 있어요", "NOT_GOLF_CREW");
    }

    const name = booking.isBlind ? (booking.blindName || "비공개 골프장") : booking.courseName;
    const when = new Date(booking.datetime).toLocaleString("ko-KR", {
        month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit",
        hour12: false, timeZone: "Asia/Seoul",
    });
    const kstDay = new Date(booking.datetime).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const view = booking.listingType === "JOIN" ? "JOIN" : "BOOKING";
    const label = view === "JOIN" ? "조인" : "부킹";

    const chat = await storage.createCrewChat({
        crewId,
        senderId: req.userId,
        // 카드가 못 그려지는 옛 앱에서도 읽히도록 본문에 요점을 남긴다.
        message: `⛳️ [${label} 공유] ${name} / ${when} / 그린피 ${Number(booking.greenFee).toLocaleString()}원`,
        type: "text",
        metadata: {
            type: "GOLF_BOOKING",
            bookingId: booking.id,
            courseName: name,
            datetime: booking.datetime,
            greenFee: booking.greenFee,
            listingType: view,
            // 날짜를 함께 싣는다 — 받는 사람이 눌렀을 때 목록이 그 날짜로 열려야 글이 보인다.
            date: kstDay,
        },
    } as any);

    await notifyCrewChat({
        crewId,
        senderId: req.userId!,
        preview: `${label} 공유 · ${name}`,
        tag: "[GolfShareNotif]",
    });

    return sendSuccess(res, chat);
}));

/** 목록에 '몇 명 찼는지'와 '내가 신청했는지'를 얹는다 — 화면이 그걸 알아야 신청/취소를 가른다. */
/**
 * 글마다 그 티타임의 날씨(2026-10-05) — 날짜별 목록 응답에만 붙인다. 받아 둔 예보만 읽고(기상청을 부르지 않는다),
 * 못 읽으면 글은 그대로 나간다. **비공개 글은 뺀다** — 위치를 가린 글이라 그 자리의 날씨도 싣지 않는다.
 * 골프장 마스터가 없는 글(스크린·파크의 course_id "venue")도 자리 좌표를 몰라 빠진다.
 */
async function withTeeWeather<T extends Record<string, any>>(rows: T[]): Promise<T[]> {
    try {
        const usable = rows.filter((r) => !r.isBlind && /^[0-9]+$/.test(String(r.courseId ?? "")));
        if (!usable.length) return rows;
        const [{ loadGolfCourseSummary }, { teeWeatherFor }] = await Promise.all([import("./golfCourses.js"), import("../../services/golfWeather.js")]);
        const s = await loadGolfCourseSummary();
        const wx = await teeWeatherFor(usable.flatMap((r) => { const page = s.byCourseId.get(Number(r.courseId)); return page ? [{ id: String(r.id), page, datetime: r.datetime }] : []; }));
        return wx.size ? rows.map((r) => (wx.has(r.id) ? { ...r, wx: wx.get(r.id) } : r)) : rows;
    } catch (e) {
        console.error("[GolfTeeWeather]", e);
        return rows;
    }
}

async function withJoinCounts(rows: any[], userId?: string) {
    const ids = rows.map((r) => r.id);
    // 긴급 여부는 컬럼이 아니라 계산이다(shared/golfJoin) — 시간이 지나 자격을 잃으면 배지도 저절로 사라진다.
    // 한 응답 안에서는 같은 '지금'을 쓴다: 행마다 Date.now() 를 부르면 경계에 걸친 글이 같은 목록에서 엇갈릴 수 있다.
    const now = Date.now();
    const [counts, mine] = await Promise.all([
        storage.countJoinRequests(ids),
        userId ? storage.myJoinStatuses(userId, ids) : Promise.resolve(new Map<string, string>()),
    ]);
    return rows.map((r) => {
        const c = counts.get(r.id);
        const myStatus = mine.get(r.id) ?? null;
        // 연락처(2026-09-21): 매장 글은 번호가 영업용이라 그대로, 개인 양도 글은 **올린 사람과 확정된 신청자**에게만.
        // 예약 신청이 앱 안에서 끝나므로 확정 전엔 번호가 필요 없다 — 모두에게 열면 전화번호 수집 창구가 된다.
        // ⚠️ 2026-09-22 리뷰: 이 조건이 `listingType !== "BOOKING"` 으로 시작해 **조인 글은 호스트 개인 번호가 누구에게나** 나갔다.
        // 공개는 매장 부킹 하나뿐이다. 조인과 개인 양도는 올린 사람·확정된 사람에게만.
        const isOwner = !!userId && r.ownerId === userId;
        const isConfirmed = myStatus === "accepted" || myStatus === "noshow";
        const isStoreBooking = r.listingType !== "JOIN" && r.sellerType !== "PERSONAL";
        const showPhone = isStoreBooking || isOwner || myStatus === "accepted";
        const { managerPhone, ...safe } = r;
        // 비공개(isBlind) 글은 실명·장소·좌표를 서버에서 가린다 — 화면만 가명으로 바꿔 그리면 응답 JSON 과 검색 결과에 실명이 그대로 있다.
        // 지역(region)은 남긴다: 지역 필터가 서버에서 걸리므로 가려도 걸러지는 것으로 드러나고, 가명 글도 지역으로는 찾을 수 있어야 한다.
        const mask = !!r.isBlind && !isOwner && !isConfirmed;
        if (mask) Object.assign(safe, { courseName: r.blindName || "비공개 골프장", courseId: null, venueName: null, lat: null, lng: null });
        return {
            ...safe,
            managerPhone: showPhone ? managerPhone : null,
            // joinApplied 는 **자리를 차지한 사람 수**(승인됨) — 화면의 n/정원. 대기는 따로.
            // 행 수가 아니라 headcount 합이다(2026-09-24): 부킹의 2명짜리 신청 하나는 2자리다.
            // 조인 신청은 늘 1명이라 조인 글에서는 예전 값과 똑같다.
            joinApplied: c?.seats ?? 0,
            joinPending: c?.pending ?? 0,
            joinCapacity: joinCapacity(r),
            isUrgent: isUrgentJoin(r, now),
            myJoinStatus: myStatus,
            joinedByMe: myStatus === "applied" || myStatus === "accepted",
        };
    });
}

router.get("/joins", asyncHandler(async (req: AuthRequest, res: any) => {
    const date = req.query.date as string | undefined;
    if (!validDate(date)) return sendError(res, 400, "날짜가 올바르지 않아요");
    // viewerId 는 질의 **뒤에** 적는다 — 내가 차단한 사람의 조인 글을 빼는 값이라 질의 문자열로 덮어쓸 수 없어야 한다(2026-10-06).
    const joins = await storage.getGolfJoins({ date, ...req.query, viewerId: req.userId });
    return sendSuccess(res, await withTeeWeather(await withJoinCounts(joins as any[], req.userId)));
}));

/*
 * POST/DELETE /joins 는 2026-09-09 제거했다.
 * golf_joins 표에 쓰는 라우트였는데 읽는 곳이 한 군데도 없었다 — GET /joins 는 golf_bookings 에서
 * listing_type='JOIN' 을 꺼내 온다. 즉 이 라우트로 만든 조인은 어디에도 안 뜨는 유령이었다.
 * 조인 글은 POST /bookings 로 listingType:'JOIN' 을 실어 만들고, 신청은 /bookings/:id/apply 가 받는다.
 */

router.get("/passport-stats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    // 예전엔 여기서 "비어 있으면 표본을 심는" 코드를 돌렸다. 없는 경기 번호로 넣어서 프로덕션에서
    // 열 때마다 500 이 났고, 성공했다면 남의 골프 평균·랭킹에 가짜 8라운드가 들어갔을 것이다.
    // 2026-09-09 삭제 — 통계는 실제 기록만 센다.
    const stats = await storage.getGolfPassportStats(req.userId!);
    return sendSuccess(res, stats);
}));

/**
 * 골프 발자국(2026-09-30) — 도장을 처음 간 순서로. **본인 것만**(남의 번호를 받는 길이 없다). ?year=2026 이면 그해만.
 * 동선은 민감한 정보라 공유 카드는 따로 서명한 주소로만 연다(아래 /share, server/lib/footprintShare.ts).
 */
router.get("/passport/footprints", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const year = parseFootprintYear(req.query.year);
    return sendSuccess(res, await getGolfFootprints(req.userId!, year));
}));

/**
 * 공유 카드 주소를 만든다 — 본인이 '공유'를 눌렀을 때만. 30일 뒤 닫히는 서명 주소(상대 경로).
 * 아무것도 저장하지 않는다(서명은 계산이다). 발자국이 없으면 만들 게 없다.
 */
router.get("/passport/footprints/share", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const year = parseFootprintYear(req.query.year);
    const fp = await getGolfFootprints(req.userId!, year);
    if (!fp.stops.length) return sendError(res, 404, "아직 공유할 발자국이 없어요");
    const signed = signFootprintShare(req.userId!, year);
    if (!signed) return sendError(res, 503, "지금은 공유 링크를 만들 수 없어요");
    // 주소 자체가 열쇠다 — 어디에도 캐시되지 않게
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, { url: footprintCardPath(req.userId!, year, signed.token), expiresAt: new Date(signed.exp * 1000).toISOString() });
}));

/**
 * 스코어카드 글자 인식 결과를 표로 정리해 돌려준다. **아무것도 저장하지 않는다.**
 *
 * 예전엔 여기서 공용 코스 자료(hiq_course_hole_info)에 홀별 파를 적었다. 두 가지가 겹쳐 있었다:
 *  1. 화면(ScorecardScanner)이 올린 사진을 보지도 않고, 코드에 박아 둔 가짜 결과
 *     (HOLE 1 / PAR 4 / HONG 5)를 3초 기다린 뒤 보내고 있었다. 여기 쌓이던 건 실제 스코어카드가
 *     아니라 지어낸 숫자였고, 사용자에게는 "성공적으로 분석했습니다" 라고 말했다.
 *  2. ocrData 는 클라이언트가 보내는 값이다. 아무나 아무 숫자나 실어 보내면 그게 모든 사람이 보는
 *     골프장 코스 자료가 됐다 — 검증이 한 군데도 없었다.
 * 2026-09-10 저장을 걷어냈다. 진짜 인식을 붙일 때는 **서버가** 이미지에서 직접 뽑은 결과만 적는다.
 */
router.post("/scorecard/ocr", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const { ocrData } = req.body;
    if (!ocrData) return sendError(res, 400, "OCR 데이터가 필요합니다.");

    const parsed = await storage.processScorecardOCR(ocrData);
    if (!parsed) return sendError(res, 400, "분석 가능한 데이터가 없습니다.");

    return sendSuccess(res, parsed);
}));

// --- 랭큐매치 (PIN 으로 모이는 골프 경기) ---
//
// 2026-09-11 다시 짰다. 예전엔 참가자면 누구나 점수·시작·종료·코스를 서버에 직접 바꿀 수 있었고(방장 전용은
// 화면에서만), 점수 저장이 남의 회원번호까지 받아 그 사람 평균·등급을 덮을 수 있었다. 이제 쓰기는 **방장만**,
// 읽기는 **그 경기에 든 사람만**이다. 로그인 없이 방 정보를 통째로 주던 GET /match/pin/:pin 은 없앴다
// (화면이 쓰지도 않았고, 4자리라 전수 조회로 모든 대기방이 새었다).

const matchCreateSchema = z.object({
    courseId: z.string().max(64).nullish(),
    // 골프장 없이 끝낸 라운드가 '알 수 없는 구장' 도장이 됐다 — 이름은 꼭 받는다(화면도 이미 강제한다).
    courseName: z.string().trim().min(1).max(80),
    gameMode: z.enum(["stroke", "skins"]),
    strokeMode: z.enum(["solo", "group"]).nullish(),
    stake: z.coerce.number().optional(),
    useDouble: z.boolean().optional(),
    doublingMode: z.enum(["none", "current", "next"]).optional(),
    birdieAmount: z.coerce.number().optional(),
    eagleAmount: z.coerce.number().optional(),
    frontCourseName: z.string().trim().max(40).nullish(),
    backCourseName: z.string().trim().max(40).nullish(),
    guests: z.array(z.string().trim().min(1).max(12)).max(3).optional(),
});

const matchScoreSchema = z.object({
    holeNo: z.coerce.number().int().min(1).max(18),
    players: z.array(z.object({ memberId: z.string().max(64) }).passthrough()).max(4),
});

router.post("/match/create", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = matchCreateSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "경기 설정이 올바르지 않아요");
    const session = await storage.createGolfMatchSession(req.userId!, parsed.data as any);
    return sendSuccess(res, withoutHoleStats(session));
}));

router.post("/match/join", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const pin = String(req.body?.pin ?? "").replace(/\D/g, "");
    if (pin.length !== 4) return sendError(res, 400, "핀번호 4자리를 입력해 주세요");
    // 4자리는 만 개뿐이다 — 틀린 번호를 연달아 넣으면 잠깐 막는다(로그인 PIN 과 같은 방어).
    const key = attemptKey("golf-pin", req.userId, req.ip);
    const rl = checkRateLimit(key);
    if (rl.limited) {
        return sendError(res, 429, `번호를 여러 번 틀렸어요. ${Math.max(1, Math.ceil(rl.retryAfterSec / 60))}분 뒤에 다시 해 주세요`);
    }
    try {
        const { session, added } = await storage.joinGolfMatchSession(pin, req.userId!);
        // 이미 든 방(내 방 포함)에 다시 들어간 건 '맞힌 것' 으로 치지 않는다 — 치면 틀린 번호 4번 → 내 방 입장을
        // 되풀이해 잠금을 영영 피할 수 있었다(2026-09-11 리뷰).
        if (added) clearAttempts(key);
        return sendSuccess(res, withoutHoleStats(session));
    } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 409) registerFailure(key);
        throw e;
    }
}));

/** 홈의 '진행 중 라운드' 카드. 없으면 null. (/match/:id 보다 먼저 둔다) */
router.get("/match/active", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    return sendSuccess(res, await storage.getActiveGolfMatch(req.userId!));
}));

/** 그 경기에 든 사람(방장 포함)만 통과. hostOnly 면 방장만. */
async function loadMatch(req: AuthRequest, res: any, hostOnly: boolean): Promise<any | null> {
    if (!UUID.test(req.params.id)) { sendError(res, 404, "게임을 찾을 수 없어요"); return null; }
    const session: any = await storage.getGolfMatchSession(req.params.id);
    if (!session) { sendError(res, 404, "게임을 찾을 수 없어요"); return null; }
    const players: any[] = Array.isArray(session.players) ? session.players : [];
    const isHost = session.hostId === req.userId;
    if (!isHost && !players.some((p) => p?.memberId === req.userId)) {
        sendError(res, 403, "이 경기의 참가자가 아니에요");
        return null;
    }
    if (hostOnly && !isHost) { sendError(res, 403, "방장만 할 수 있어요"); return null; }
    return session;
}

router.get("/match/:id", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    return sendSuccess(res, withoutHoleStats(session));
}));

router.post("/match/:id/start", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    return sendSuccess(res, withoutHoleStats(await storage.startGolfMatchSession(req.params.id)));
}));

router.post("/match/:id/score", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    const parsed = matchScoreSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "점수 형식이 올바르지 않아요");
    const session = await storage.updateGolfMatchScore(req.params.id, parsed.data.holeNo, parsed.data.players);
    return sendSuccess(res, withoutHoleStats(session));
}));

router.post("/match/:id/finish", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    return sendSuccess(res, withoutHoleStats(await storage.finishGolfMatchSession(req.params.id)));
}));

router.post("/match/:id/abandon", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    return sendSuccess(res, withoutHoleStats(await storage.abandonGolfMatchSession(req.params.id)));
}));

router.post("/match/:id/course", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!await loadMatch(req, res, true)) return;
    const name = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : undefined);
    const session = await storage.updateGolfMatchCourse(req.params.id, name(req.body?.frontCourseName), name(req.body?.backCourseName));
    return sendSuccess(res, withoutHoleStats(session));
}));

// --- 이 홀 기록(2026-10-01 오너 승인: 퍼팅·페어웨이·벌타 태그 — 규칙은 shared/golfHoleStats.ts) ---
// 점수(방장만)와 달리 **참가자 누구나 자기 칸에만** 쓴다. 타수는 방장 폰 한 대로 적어도 퍼팅·페어웨이는 각자 안다 —
// 방장만 쓰게 하면 넷 중 셋은 이 카드를 못 쓴다. 저장소가 로그인 회원의 칸(putts·fairway·penaltyTags)만 고치고
// 점수·벌타(penalties)·이름·남의 칸엔 손대지 않는다. 이 칸은 기록(평균·등급·도장·현장 인증)이 읽지 않는다.
// 위의 경기 응답은 전부 withoutHoleStats 를 거친다 — 남의 기록은 동반자에게도 안 보이고, 내 것은 여기 GET 으로만 받는다
// (방장 폰은 경기 응답의 선수 목록을 편집 원본으로 붙들고 있어서, 거기 섞이면 낡은 값이 되살아난다).

router.get("/match/:id/hole-stats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await storage.golf.holeStatsView(session, req.userId!));
}));

router.post("/match/:id/hole-stats", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    const patches = sanitizeHolePatches(req.body?.holes);
    if (!patches) return sendError(res, 400, "이 홀 기록 형식이 올바르지 않아요");
    const mine = await storage.golf.updateMyHoleStats(session.id, req.userId!, patches);
    return sendSuccess(res, { mine });
}));

/** 라운딩 리포트 '홀 기록 통계' — 내 공식 라운드 중 이 홀 기록을 적은 것만(통계 식은 화면이 shared 로 센다) */
router.get("/hole-stats/mine", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await storage.golf.myHoleStatsRounds(req.userId!));
}));

// --- 현장 인증 도장(2026-09-30 오너 결정: "집에서 전국 도장을 모으지 못하게") ---
// 라운드 중 참가자 폰이 몇 번(시작·9번 홀·18번 홀·끝내기) 조용히 위치를 보낸다. 서버가 골프장까지 거리를 재고
// **좌표는 버린다** — 남는 건 인증 여부와 거친 구간뿐(<2km·2-10km·>10km·no-fix·no-course). 위치는 본문으로만 받는다
// (주소에 실으면 요청 로그에 좌표가 남는다). 점수와 달리 **참가자 누구나** 보낸다 — 동반자 한 명만 현장이어도 경기 전체가 인증된다.
// 판정은 shared/golfOnSite.ts, 저장은 golf.repo recordGolfCheckin·getGolfOnSiteSummary.

const checkinSchema = z.object({
    lat: z.number().finite().optional(),
    lng: z.number().finite().optional(),
    accuracy: z.number().finite().min(0).max(1_000_000).nullish(),
    /** 위치를 못 잡은 이유(권한 거부·꺼짐·시간 초과) — 좌표 대신 */
    fix: z.enum(["denied", "unavailable"]).optional(),
    source: z.enum(ONSITE_SOURCES as unknown as [OnSiteSource, ...OnSiteSource[]]),
});

router.get("/match/:id/checkin", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, await storage.golf.getGolfOnSiteSummary(session, req.userId!));
}));

router.post("/match/:id/checkin", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    const parsed = checkinSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "위치 정보가 올바르지 않아요");
    const d = parsed.data;
    const at = d.fix ? null : parseLatLng(d.lat, d.lng);
    if (!d.fix && !at) return sendError(res, 400, "위치 정보가 올바르지 않아요");
    const { last, upgraded, session: fresh } = await storage.golf.recordGolfCheckin(session, req.userId!, at ? { ...at, accuracy: d.accuracy ?? null } : null, d.source);
    // 상태는 잠금 뒤에 읽은 새 값으로(방금 끝났을 수 있다)
    res.setHeader("Cache-Control", "no-store");
    return sendSuccess(res, { ...(await storage.golf.getGolfOnSiteSummary(fresh ?? session, req.userId!)), last, upgraded });
}));

// --- 라운드 사진(2026-09-30 오너: "스코어 등록 때 사진 — 추억 앨범, 공개 사진은 그 골프장 페이지에, 신고·차단") ---
// 점수와 달리 **참가자 누구나** 자기 사진을 올린다(방장 폰 한 대로 점수를 적어도 사진은 각자 폰으로 찍는다).
// 파일은 화면이 먼저 POST /api/hiq/upload(golf-photo·golf-thumb, EXIF 제거)로 올리고, 여기선 그 주소를 경기에 붙인다.
// 바꾸기·지우기는 **자기 사진만**(저장소가 member_id 조건으로 막는다).

const photoAddSchema = z.object({
    url: z.string().max(400),
    thumbUrl: z.string().max(400),
    width: z.coerce.number().int().min(1).max(10000).nullish(),
    height: z.coerce.number().int().min(1).max(10000).nullish(),
    holeNo: z.coerce.number().int().min(1).max(18).nullish(),
    isPublic: z.boolean().optional(),
});

router.get("/match/:id/photos", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    const photos = await storage.golfPhotos.listForSession(session.id, req.userId!);
    return sendSuccess(res, {
        photos,
        mineCount: photos.filter((p) => p.mine).length,
        max: GOLF_PHOTO_MAX_PER_ROUND,
    });
}));

// 사진은 UGC 다 — 약관 동의·정지 문지기(커뮤니티 글·크루 사진과 같은 규칙, middleware/terms.ts)
router.post("/match/:id/photos", requireAuth, requireTermsAccepted, asyncHandler(async (req: AuthRequest, res: any) => {
    const session = await loadMatch(req, res, false);
    if (!session) return;
    const parsed = photoAddSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "사진 정보가 올바르지 않아요");
    const d = parsed.data;
    // 주소가 우리 업로드 API 가 **이 회원에게** 만든 것인지 — 남의 사진·외부 주소를 내 라운드 사진으로 붙이지 못하게
    if (!isOwnGolfPhotoUrl(d.url, req.userId!, GOLF_PHOTO_CATEGORY) || !isOwnGolfPhotoUrl(d.thumbUrl, req.userId!, GOLF_THUMB_CATEGORY)) {
        return sendError(res, 400, "사진 주소가 올바르지 않아요");
    }
    // 경로가 맞아도 **우리** 저장소여야 한다 — 남의 Blob 저장소에 같은 경로로 올린 파일은 EXIF 제거를 안 거쳤다
    if (!isOnOwnBlobHost(d.url) || !isOnOwnBlobHost(d.thumbUrl)) return sendError(res, 400, "사진 주소가 올바르지 않아요");
    const drop = () => deleteBlobs([d.url, d.thumbUrl]); // 못 붙인 사진은 Blob 에 남기지 않는다(내 것임을 위에서 확인했다)
    if (session.status === "abandoned") { await drop(); return sendError(res, 409, "접은 라운드에는 사진을 올릴 수 없어요"); }
    const courseSlug = await coursePageSlugFor(session.courseId, session.courseName);
    const row = await storage.golfPhotos.add({
        sessionId: session.id,
        memberId: req.userId!,
        holeNo: d.holeNo ?? null,
        url: d.url,
        thumbUrl: d.thumbUrl,
        width: d.width ?? null,
        height: d.height ?? null,
        // 골프장 페이지가 없는 골프장은 공개로 둘 곳이 없다 — 비공개로만
        isPublic: !!d.isPublic && !!courseSlug,
        courseSlug,
    });
    if (!row) { await drop(); return sendError(res, 409, `한 라운드에 ${GOLF_PHOTO_MAX_PER_ROUND}장까지 올릴 수 있어요`); }
    return sendSuccess(res, { id: row.id, courseSlug });
}));

/** 내 라운드들의 사진(라운딩 리포트 사진첩) — 동반자가 올린 것도 포함, 차단한 회원 것은 빼고 */
router.get("/photos/mine", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    return sendSuccess(res, await storage.golfPhotos.listMine(req.userId!, 60));
}));

// 공개로 돌릴 때만 약관 문지기 — 비공개로 되돌리는 건(노출을 줄이는 쪽) 약관 개정 뒤에도 막지 않는다
const termsIfPublishing = (req: AuthRequest, res: any, next: () => void) =>
    req.body?.isPublic === true ? requireTermsAccepted(req, res, next) : next();

router.patch("/photos/:photoId", requireAuth, termsIfPublishing, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.photoId)) return sendError(res, 404, "사진을 찾을 수 없어요");
    if (typeof req.body?.isPublic !== "boolean") return sendError(res, 400, "공개 여부를 골라 주세요");
    const photo = await storage.golfPhotos.get(req.params.photoId);
    if (!photo || photo.memberId !== req.userId) return sendError(res, 404, "사진을 찾을 수 없어요");
    if (req.body.isPublic && !photo.courseSlug) return sendError(res, 409, "골프장 페이지가 없는 골프장이라 공개할 곳이 없어요");
    await storage.golfPhotos.setPublic(photo.id, req.userId!, req.body.isPublic);
    return sendSuccess(res, { id: photo.id, isPublic: req.body.isPublic });
}));

// 이의제기 — 신고로 가려진 내 사진에 원탭(커뮤니티 /community/appeals 와 같은 규칙). 신고 큐가 이 건을 다시 연다.
router.post("/photos/:photoId/appeal", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.photoId)) return sendError(res, 404, "사진을 찾을 수 없어요");
    const text = String(req.body?.text || "").slice(0, 500) || "이의제기합니다";
    const ok = await storage.golfPhotos.appeal(req.params.photoId, req.userId!, text);
    if (!ok) return sendError(res, 400, "가려진 내 사진에만 이의제기할 수 있어요");
    return sendSuccess(res, { appealed: true });
}));

router.delete("/photos/:photoId", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.photoId)) return sendError(res, 404, "사진을 찾을 수 없어요");
    const gone = await storage.golfPhotos.delete(req.params.photoId, req.userId!);
    if (!gone) return sendError(res, 404, "사진을 찾을 수 없어요");
    // 서버리스는 응답 뒤에 멈출 수 있다 — Blob 정리를 기다린다(crew 사진 삭제와 같은 원칙)
    await deleteBlobs([gone.url, gone.thumbUrl]);
    return sendSuccess(res, { deleted: true });
}));

// --- Golf Club & Course Routes ---
router.get("/clubs", asyncHandler(async (req: any, res: any) => {
    const search = req.query.search as string | undefined;
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : undefined;
    const clubs = await storage.getGolfClubs(search, lat, lng);
    return sendSuccess(res, clubs);
}));

router.get("/clubs/:clubId/courses", asyncHandler(async (req: any, res: any) => {
    const clubId = req.params.clubId;
    const courses = await storage.getGolfClubCourses(clubId);
    return sendSuccess(res, courses);
}));

/**
 * 코스 구성이 아직 없는 골프장에 **회원이 코스 이름을 알려 준다.**
 * 전국 634곳 중 317곳이 자료가 없어, 그런 골프장을 고르면 전반/후반을 못 골라 라운드를 시작할 수 없었다.
 * 이미 자료가 있는 골프장은 이 길로 못 바꾼다(저장소에서 막는다).
 */
router.post("/clubs/:clubId/courses", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    if (!UUID.test(req.params.clubId)) return sendError(res, 404, "골프장을 찾을 수 없어요");
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    if (names.length === 0) return sendError(res, 400, "코스 이름을 적어 주세요");
    const courses = await storage.addCourseNamesIfEmpty(req.params.clubId, names);
    return sendSuccess(res, courses);
}));

// --- Golf Membership Routes ---
router.post("/membership/orders", requireAuth, asyncHandler(async (req: AuthRequest, res: any) => {
    const data = {
        ...req.body,
        status: 'PENDING'
    };

    const validation = insertGolfMembershipOrderSchema.safeParse(data);
    if (!validation.success) {
        return sendError(res, 400, validation.error.message);
    }

    const order = await storage.createGolfMembershipOrder(validation.data as any);
    return sendSuccess(res, order);
}));

export default router;
