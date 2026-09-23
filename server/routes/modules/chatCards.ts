/**
 * 채팅 첨부 카드(2026-09-23 오너: "당구·골프 채팅에 각각 + 아이콘 — 사진은 용량 때문에 안 되고, 우리가 가진 DB·자산으로").
 *
 * 카드는 **서버만 만든다**. 보내기 라우트(chat.ts)는 metadata 를 버리므로 화면이 카드 모양을 지정할 수 없다 —
 * 여기서 실제 행(대전·경기·회원·매장·글·세션)을 읽어 만들기 때문에 없는 것으로 카드를 만들 수 없다(가짜 카드 방지).
 *
 *   POST /chat/rooms/:key/cards/sim-invite    { gameType? }    당구  🎱 온라인 대전(내 대기 방 재사용, 없으면 만든다 — 푸시가 참가 화면으로 바로 간다)
 *   POST /chat/rooms/:key/cards/match-invite  { gameType, seats, target? }  당구  🎱 매칭 대결(실전 경기 — 카드가 핀을 들고 대기실이 된다)
 *   POST /chat/rooms/:key/cards/game-result   { gameId }       당구  🏁 경기 결과(내가 뛴 경기만)
 *   POST /chat/rooms/:key/cards/my-stats      {}               공통  📊 내 기록
 *   POST /chat/rooms/:key/cards/store         { code | slug }  당구  📍 매장(디렉터리 code · 파트너 slug/id)
 *   POST /chat/rooms/:key/cards/golf-booking  { bookingId }    골프  ⛳ 조인·부킹 글(기존 GOLF_BOOKING 카드와 같은 모양)
 *   POST /chat/rooms/:key/cards/golf-match    { courseName }   골프  ⛳ 랭큐매치 핀(세션을 만든다)
 *   POST /chat/rooms/:key/cards/golf-round    { historyId }    골프  ⛳ 라운드 결과(내 기록만)
 *
 * 응답은 보내기 라우트와 같은 모양(메시지 행 + sender) — 화면이 목록에 바로 끼운다. 요약(message)은 카드를 못 그리는
 * 옛 앱용 한 줄이라 한국어 그대로 저장하고, 카드 본문은 화면이 metadata 로 자기 언어로 그린다.
 * **푸시 본문은 따로 만든다**(push 인자) — 요약을 그대로 쓰면 외국어 회원 폰·알림함에 한국어가 박힌다(2026-09-23 리뷰).
 */
import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../../db.js";
import { storeListings, type HiqMember } from "../../../shared/schema.js";
import { storage } from "../../storage/index.js";
import { sendSuccess, sendError } from "../../utils/response.js";
import { requireAuth, AuthRequest } from "../../middleware/auth.js";
import { requireTermsAccepted } from "../../middleware/terms.js";
import { requireGolfAccess } from "../../middleware/golfAccess.js";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { parseRoomKey, type RoomRef } from "../../storage/chat.repo.js";
import { msg, localeOf, type I18nText } from "../../lib/i18n.js";
import { notifyRoom } from "./chat.js";
import { createSchema as simCreateSchema, createHostMatch } from "./simMatch.js";

const router = Router();
type Sport = "BILLIARDS" | "GOLF";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 디렉터리 매장 코드(listings.ts 의 CODE_RE 와 같다). */
const LISTING_CODE_RE = /^[A-Za-z0-9_-]{1,20}$/;
/** 조인·부킹 방은 티타임 이틀 뒤 닫힌다 — chat.ts 보내기와 같은 값(그쪽은 내보내지 않는다). */
const LISTING_ROOM_GRACE_MS = 2 * 86_400_000;
/** 골프 카드는 골프 문지기(허용 목록)까지 — /golf 라우터와 같은 규칙. */
const golfGate = [...requireGolfAccess, requireTermsAccepted];
const billiardsGate = [requireAuth, requireTermsAccepted];

const gameTypeKo = (t: string) => (t === "3c" ? "3쿠션" : t === "4c" ? "4구" : t);

interface Room {
    ref: RoomRef;
    sport: Sport;
    info: Awaited<ReturnType<typeof storage.chat.roomInfo>>;
    me: HiqMember;
}

/**
 * 열쇠를 풀고 권한·종목·속도를 본다(chat.ts 의 openRoom + 보내기 검사와 같은 순서). 실패하면 응답을 보내고 null.
 * want: 카드가 붙을 수 있는 방의 종목. 방 종목은 roomInfo.sport(listing 방은 늘 GOLF).
 */
async function openRoom(req: AuthRequest, res: any, want: Sport | "ANY"): Promise<Room | null> {
    const ref = parseRoomKey(String(req.params.key ?? ""));
    if (!ref) { sendError(res, 404, "err.chat.roomNotFound"); return null; }
    // 문의 방에는 카드를 안 붙인다 — 화면도 + 를 안 그린다(운영자 문의에 대전 초대·매장 카드는 뜻이 없다).
    if (ref.kind === "support") { sendError(res, 400, "err.chat.card.notHere"); return null; }
    if (!(await storage.chat.canAccess(ref, req.userId!))) {
        if (ref.kind === "listing" && !(await storage.getGolfBooking(ref.id))) { sendError(res, 404, "err.chat.roomGone", "ROOM_GONE"); return null; }
        sendError(res, 403, ref.kind === "listing" ? "err.chat.confirmedOnly" : "err.chat.noAccess", "NOT_ROOM_MEMBER");
        return null;
    }
    // 카드도 방 전원에게 푸시가 간다 — 글과 같은 속도 제한(10초에 8건).
    if ((await storage.chat.recentSendCount(ref.key, req.userId!, 10)) >= 8) { sendError(res, 429, "err.chat.tooFast", "CHAT_TOO_FAST"); return null; }
    const info = await storage.chat.roomInfo(ref, req.userId!, localeOf(res));
    if (ref.kind === "listing" && info.booking && new Date(info.booking.datetime).getTime() < Date.now() - LISTING_ROOM_GRACE_MS) {
        sendError(res, 403, "err.chat.roundOver", "ROOM_CLOSED"); return null;
    }
    const sport: Sport = info.sport ?? "BILLIARDS";
    if (want !== "ANY" && sport !== want) { sendError(res, 400, "err.chat.card.sportMismatch", "SPORT_MISMATCH"); return null; }
    const me = await storage.getMemberById(req.userId!);
    if (!me) { sendError(res, 404, "err.member.notFound"); return null; }
    return { ref, sport, info, me };
}

/**
 * 카드 행을 만들고 방 사람들에게 푸시한 뒤 보내기 라우트와 같은 모양으로 돌려준다.
 * push: 푸시 본문(받는 사람 언어). url: 누르면 갈 곳(없으면 방).
 */
async function postCard(res: any, room: Room, type: string, summary: string, metadata: Record<string, unknown>, opts?: { push?: I18nText; url?: string }) {
    const { ref, me, info } = room;
    const row = await storage.chat.addMessage({ key: ref.key, senderId: me.id, type: "card", message: summary, metadata: { type, ...metadata } });
    // 1:1 은 제목이 곧 보낸 사람이다 — 방 제목은 보는 사람 기준 상대 이름이라 그대로 쓰면 받는 사람 폰에 자기 이름이 뜬다(chat.ts 와 같다).
    // 대괄호는 '방 이름' 표기라 1:1 에서는 안 쓴다(notif.chat.dm.title 관례).
    const heading = msg(`notif.chat.card.${type}`, { room: ref.kind === "dm" ? me.name : `[${info.title}]` });
    await notifyRoom(ref, me.id, opts?.push ?? summary.slice(0, 80), heading, room.sport, opts?.url);
    const profile = me.profileId ? await storage.getProfile(me.profileId) : null;
    return sendSuccess(res, { ...row, sender: { name: me.name, profileImageUrl: profile?.profileImageUrl ?? null } });
}

/* ── 당구 ─────────────────────────────────────────────── */

const simInviteSchema = z.object({
    gameType: z.enum(["3c", "4c"]).optional(),
    tableId: z.enum(["DAEDAE", "JUNGDAE_KR"]).optional(),
    handicap: z.boolean().optional(),
});

// 🎱 온라인 대전 초대 — 내가 호스트인 대기 방이 있으면 그 방의 코드, 없으면 새로 만든다(POST /sim/matches 와 같은 기본값).
router.post("/rooms/:key/cards/sim-invite", ...billiardsGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = simInviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "BILLIARDS"); if (!room) return;
    const { me } = room;
    const wanted = parsed.data.gameType;
    const wantTable = parsed.data.tableId;
    const wantHandi = parsed.data.handicap;
    // 종목을 골랐는데 대기 방이 다른 종목이면 새로 만든다(만들 때 옛 방은 cancelOtherWaiting 으로 접힌다).
    // 목록은 host·guest 를 섞어 최신순으로 준다 — 20건만 보면 게스트로 몇 판 뛴 사이 내 대기 방이 밀려나고,
    // 못 찾아 새로 만들면 createHostMatch 가 원래 방을 취소해 앞서 올린 카드의 코드가 죽는다(2026-09-23 리뷰).
    const mine = await storage.simMatch.listMine(me.id, 100);
    // 비밀번호 방은 재사용하지 않는다 — 카드에는 코드만 실려서 받는 사람이 한 번에 못 들어온다.
    // 고른 값과 다른 방은 다시 쓰지 않는다 — 3쿠션 대대 방을 열어 둔 채 4구 중대를 고르면 새로 만들어야 한다.
    let m = mine.find((x) => x.status === "waiting" && x.hostId === me.id && !x.passwordHash
        && (!wanted || x.gameType === wanted) && (!wantTable || x.tableId === wantTable) && (wantHandi === undefined || x.handicap === wantHandi));
    if (!m) {
        const gameType = wanted ?? "3c";
        // 테이블 기본값은 화면과 같다(3쿠션 대대 · 4구 중대) — 늘 대대로 만들면 4구가 엉뚱한 판이 된다.
        const tableId = wantTable ?? (gameType === "3c" ? "DAEDAE" : "JUNGDAE_KR");
        const handi = gameType === "3c" ? me.handi3c : me.handi4c;
        const target = typeof handi === "number" && handi >= 1 && handi <= 999 ? handi : gameType === "3c" ? 15 : 100;
        const made = await createHostMatch(me.id, simCreateSchema.parse({ gameType, tableId, target, handicap: wantHandi ?? true }));
        if (!made) return sendError(res, 400, "err.sim.badInput");
        m = made.full;
    }
    const code = String(m.code);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    const summary = `🎱 온라인 대전 · ${gameTypeKo(m.gameType)} · 코드 ${spaced}`;
    return postCard(res, room, "SIM_INVITE", summary, {
        // ⚠️ hostTarget 은 **핸디전이면 상대가 들어오는 순간 두 사람의 온라인 기록으로 다시 정해진다**(simMatch 의 handicapTargets).
        // 그래서 핸디전 카드에는 목표 숫자를 싣지 않는다 — 화면이 "핸디전"이라고만 적는다(2026-09-23 오너: "다마수 계산 없이?").
        matchId: m.id, code, gameType: m.gameType, tableId: m.tableId, handicap: m.handicap,
        ...(m.handicap ? {} : { target: m.hostTarget }), hostName: m.hostName,
    }, {
        push: msg(`notif.chat.card.body.SIM_INVITE.${m.gameType}`, { code: spaced }),
        // 알림을 누르면 채팅이 아니라 **판으로 바로** 들어간다 — 초대한 사람은 이미 대기방에 있다(2026-09-23 오너).
        // same=1: 핸디전이 아닌 방은 들어오는 쪽이 자기 다마수를 보내지 않게 해 **둘 다 같은 목표**가 되게 한다.
        url: `/online-game?join=${encodeURIComponent(code)}&auto=1${m.handicap ? "" : "&same=1"}`,
    });
}));

const matchInviteSchema = z.object({
    gameType: z.enum(["3c", "4c"]),
    seats: z.number().int().min(2).max(4),
    target: z.number().int().optional(),
});

/** 실전 경기 슬롯 상한 — hiq_games 에 player1~4 뿐이다(화면의 MAX_PLAYERS 와 같은 숫자). */
const MATCH_MAX_SEATS = 4;

// 🎱 매칭 대결(실전 경기) — **카드 자체가 대기실**이다. 카드가 핀을 들고, 보는 사람은 [참가하기] 한 번으로 앉는다.
// 온라인 대전(SIM_INVITE)과 다른 것이다: 여기서 앉은 사람은 오프라인 테이블에서 치고 앱은 점수만 적는다.
router.post("/rooms/:key/cards/match-invite", ...billiardsGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = matchInviteSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "BILLIARDS"); if (!room) return;
    const { me, ref, info } = room;
    const { gameType } = parsed.data;
    // 1:1 방은 자리가 둘뿐이다 — 다른 값이 와도 2로 내린다(오너: "친구랑 대결은 2인, 크루는 4인까지").
    // 크루 방은 크루원이 수십 명이라 방 인원으로 자리를 정할 수 없다 — 상한 4 는 스키마가 정한 상수다.
    const seats = ref.kind === "dm" && info.members.length === 2
        ? 2
        : Math.min(MATCH_MAX_SEATS, Math.max(2, parsed.data.seats));
    // 목표(핸디)는 경기 시작 때 player1Target 으로 들어간다 — 거기 상한(999)과 같은 스케일로 자른다. 0 이면 끝낼 방법이 없다.
    const target = parsed.data.target === undefined ? undefined : Math.min(999, Math.max(1, Math.round(parsed.data.target)));
    // 살아 있는 내 핀을 먼저 쓴다 — 새로 만들면 앞서 올린 카드가 아무도 못 앉는 죽은 대기실이 된다(SIM_INVITE 와 같은 규칙).
    const code = (await storage.getLivePendingInvite(me.id, "BILLIARDS")) ?? await storage.createInvite(me.id);
    const spaced = `${code.slice(0, 3)} ${code.slice(3)}`;
    const summary = `🎱 매칭 대결 · ${gameTypeKo(gameType)} · ${seats}인 · 코드 ${spaced}`;
    return postCard(res, room, "MATCH_INVITE", summary, {
        code, gameType, seats, hostId: me.id, hostName: me.name, ...(target === undefined ? {} : { target }),
    }, {
        push: msg(`notif.chat.card.body.MATCH_INVITE.${gameType}`, { seats: String(seats) }),
        // url 은 **덮어쓰지 않는다** — 방으로 가야 카드의 [참가하기]를 누른다(온라인 대전과 반대다: 그쪽은 눌러서 바로 판으로 간다).
    });
}));

const gameResultSchema = z.object({ gameId: z.string().regex(UUID) });

// 🏁 경기 결과 — 그 경기의 player1..4 에 내가 있어야 한다.
router.post("/rooms/:key/cards/game-result", ...billiardsGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = gameResultSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "BILLIARDS"); if (!room) return;
    const game = await storage.getHiqGameById(parsed.data.gameId);
    if (!game) return sendError(res, 404, "err.game.notFound", "GAME_NOT_FOUND");
    const slots = [1, 2, 3, 4] as const;
    const idOf = (i: 1 | 2 | 3 | 4) => (game as any)[`player${i}Id`] as string | null;
    if (!slots.some((i) => idOf(i) === room.me.id)) return sendError(res, 403, "err.chat.card.notYourGame", "NOT_PARTICIPANT");
    // 골프로 저장된 경기(gameType golf)는 당구 방 카드가 아니다.
    if (game.gameType !== "3c" && game.gameType !== "4c") return sendError(res, 400, "err.chat.card.sportMismatch", "SPORT_MISMATCH");
    const players: { name: string; score: number; isWinner: boolean }[] = [];
    for (const i of slots) {
        const id = idOf(i);
        let name = (game as any)[`player${i}Name`] as string | null;
        if (!id && !name) continue;
        // 이름 칸이 비어 있는 옛 경기 — GET /game/:id 처럼 회원 이름으로 채운다(여기서는 저장하지 않는다).
        if (!name && id) name = (await storage.getMemberById(id))?.name ?? null;
        players.push({ name: name ?? "", score: Number((game as any)[`player${i}Score`] ?? 0), isWinner: !!game.winnerId && game.winnerId === id });
    }
    const line = players.map((p) => `${p.name} ${p.score}`).join(" : ");
    const summary = `🏁 경기 결과 · ${gameTypeKo(game.gameType)} · ${line}`;
    return postCard(res, room, "GAME_RESULT", summary, {
        gameId: game.id, gameType: game.gameType, players, innings: game.totalInnings, playedAt: game.playedAt,
    }, { push: msg(`notif.chat.card.body.GAME_RESULT.${game.gameType}`, { line }) });
}));

const storeSchema = z.object({
    code: z.string().regex(LISTING_CODE_RE).optional(),
    slug: z.string().trim().min(1).max(80).optional(),
}).refine((b) => !!b.code !== !!b.slug, { message: "code 또는 slug 하나" });

// 📍 매장 — 디렉터리(code, /listings/:code) 또는 파트너(slug, /public-stores/:slug). 화면은 파트너에 slug 가 없으면 id 를 보낸다.
router.post("/rooms/:key/cards/store", ...billiardsGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = storeSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "BILLIARDS"); if (!room) return;
    let card: { code?: string; slug?: string; name: string; address: string | null; region: string | null; phone: string | null } | null = null;
    if (parsed.data.code) {
        const [row] = await db.select({ code: storeListings.code, name: storeListings.name, region: storeListings.region, address: storeListings.address, phone: storeListings.phone })
            .from(storeListings).where(eq(storeListings.code, parsed.data.code)).limit(1);
        if (row) card = { code: row.code, name: row.name, address: row.address, region: row.region, phone: row.phone ?? null };
    } else {
        const slug = parsed.data.slug!;
        let store = await storage.getPublicStoreBySlug(slug);
        if (!store && UUID.test(slug)) {
            const byId = await storage.getStoreById(slug);
            if (byId) store = await storage.getPublicStoreBySlug(byId.slug);
        }
        // 디렉터리에 연결된 파트너면 code 도 싣는다 — /stores/:code 가 요금표·명예의전당이 있는 정본 페이지다.
        if (store) card = { slug: store.slug, ...(store.listingCode ? { code: store.listingCode } : {}), name: store.name, address: store.address ?? null, region: store.region ?? null, phone: store.phone ?? null };
    }
    if (!card) return sendError(res, 404, "err.chat.card.storeNotFound", "STORE_NOT_FOUND");
    const summary = `📍 매장 · ${card.name}${card.address ? ` · ${card.address}` : ""}`;
    return postCard(res, room, "STORE", summary, card, { push: msg("notif.chat.card.body.STORE", { name: card.name, where: card.address ?? card.region ?? "" }) });
}));

/* ── 공통 ─────────────────────────────────────────────── */

// 📊 내 기록 — 내 회원 행의 숫자만(없는 값은 null). 방 종목에 따라 요약 줄이 다르다.
router.post("/rooms/:key/cards/my-stats", ...billiardsGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const room = await openRoom(req, res, "ANY"); if (!room) return;
    const { me, sport } = room;
    const nz = <T,>(v: T | null | undefined): T | null => (v === undefined || v === null ? null : v);
    const summary = sport === "GOLF"
        ? `📊 내 기록 · 핸디 ${nz(me.golfHandicap) ?? "-"} · 평균 ${me.golfAvgScore ? Math.round(me.golfAvgScore) : "-"}타`
        : `📊 내 기록 · 3쿠션 ${nz(me.handi3c) ?? "-"} · 4구 ${nz(me.handi4c) ?? "-"}`;
    const push = sport === "GOLF"
        ? msg("notif.chat.card.body.MY_STATS_GOLF", { a: String(nz(me.golfHandicap) ?? "-"), b: me.golfAvgScore ? String(Math.round(me.golfAvgScore)) : "-" })
        : msg("notif.chat.card.body.MY_STATS", { a: String(nz(me.handi3c) ?? "-"), b: String(nz(me.handi4c) ?? "-") });
    return postCard(res, room, "MY_STATS", summary, {
        memberId: me.id, name: me.name, sport,
        handi3c: nz(me.handi3c), handi4c: nz(me.handi4c), avg3c: nz(me.avg3c), avg4c: nz(me.avg4c),
        rating3c: nz(me.rating3c), rating4c: nz(me.rating4c),
        golfHandicap: nz(me.golfHandicap), golfAvgScore: nz(me.golfAvgScore), golfGrade: nz(me.golfGrade),
    }, { push });
}));

/* ── 골프 ─────────────────────────────────────────────── */

const golfBookingSchema = z.object({ bookingId: z.string().regex(UUID) });

// ⛳ 조인·부킹 글 — golf.ts 의 /bookings/:id/share/crew 와 같은 카드(기존 GOLF_BOOKING 타입 재사용).
router.post("/rooms/:key/cards/golf-booking", ...golfGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = golfBookingSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "GOLF"); if (!room) return;
    const booking: any = await storage.getGolfBooking(parsed.data.bookingId);
    if (!booking || booking.isBlinded) return sendError(res, 404, "err.chat.card.bookingNotFound", "BOOKING_NOT_FOUND");
    const name = booking.isBlind ? (booking.blindName || "비공개 골프장") : booking.courseName;
    const when = new Date(booking.datetime).toLocaleString("ko-KR", {
        month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Seoul",
    });
    const kstDay = new Date(booking.datetime).toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" });
    const view = booking.listingType === "JOIN" ? "JOIN" : "BOOKING";
    const label = view === "JOIN" ? "조인" : "부킹";
    const summary = `⛳️ [${label} 공유] ${name} / ${when} / 그린피 ${Number(booking.greenFee).toLocaleString()}원`;
    return postCard(res, room, "GOLF_BOOKING", summary, {
        bookingId: booking.id, courseName: name, datetime: booking.datetime, greenFee: booking.greenFee, listingType: view,
        // 날짜를 함께 싣는다 — 받는 사람이 눌렀을 때 목록이 그 날짜로 열려야 글이 보인다.
        date: kstDay,
    }, { push: msg(`notif.chat.card.body.GOLF_BOOKING.${view}`, { name, when }) });
}));

const golfMatchSchema = z.object({ courseName: z.string().trim().min(1).max(80) });

// ⛳ 랭큐매치 — POST /golf/match/create 와 같은 저장소 호출(스트로크·다함께, 게스트 없음)로 세션을 만들고 핀을 싣는다.
router.post("/rooms/:key/cards/golf-match", ...golfGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = golfMatchSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "GOLF"); if (!room) return;
    // 내 라운드가 이미 열려 있으면 그 핀을 쓴다 — 새로 만들면 홈의 '진행 중 라운드' 가 빈 방으로 바뀌고
    // 앞서 올린 카드의 핀이 방장 없는 방으로 남는다(2026-09-23 리뷰). SIM_INVITE 의 대기 방 재사용과 같은 규칙.
    const active: any = await storage.getActiveGolfMatch(room.me.id);
    const mineActive = active && active.hostId === room.me.id ? active : null;
    const session: any = mineActive ?? await storage.createGolfMatchSession(room.me.id, { courseName: parsed.data.courseName, gameMode: "stroke", strokeMode: "group" });
    const courseName = String(session.courseName || parsed.data.courseName);
    const summary = `⛳ 랭큐매치 · ${courseName} · 핀 ${session.pinCode}`;
    return postCard(res, room, "GOLF_MATCH", summary, { sessionId: session.id, pinCode: session.pinCode, courseName, hostName: room.me.name },
        { push: msg("notif.chat.card.body.GOLF_MATCH", { name: courseName, pin: String(session.pinCode) }) });
}));

const golfRoundSchema = z.object({ historyId: z.string().regex(UUID) });

// ⛳ 라운드 결과 — hiq_game_history 의 내 골프 행(golfSessionId 있는 것)만.
router.post("/rooms/:key/cards/golf-round", ...golfGate, asyncHandler(async (req: AuthRequest, res: any) => {
    const parsed = golfRoundSchema.safeParse(req.body ?? {});
    if (!parsed.success) return sendError(res, 400, "err.chat.card.badInput");
    const room = await openRoom(req, res, "GOLF"); if (!room) return;
    const h = await storage.getGameHistoryById(parsed.data.historyId);
    // 남의 기록은 404 — /history/:id/detail 과 같이 존재 여부를 흘리지 않는다.
    if (!h || h.memberId !== room.me.id) return sendError(res, 404, "err.game.historyNotFound");
    if (h.sportCategory !== "GOLF" || !h.golfSessionId) return sendError(res, 400, "err.chat.card.sportMismatch", "SPORT_MISMATCH");
    // 코스명이 비면 화면이 첫 줄을 빈칸으로 그린다 — null 로 실어 ChatCard 가 사전 폴백("코스 미입력")을 쓰게 한다.
    const courseName: string | null = h.locationName || null;
    const summary = `⛳ 라운드 결과 · ${courseName ?? "골프장"} · ${h.score}타`;
    return postCard(res, room, "GOLF_ROUND", summary, { sessionId: h.golfSessionId, courseName, score: h.score, playedAt: h.createdAt, name: room.me.name },
        { push: msg("notif.chat.card.body.GOLF_ROUND", { name: courseName ?? "", n: String(h.score ?? "") }) });
}));

export default router;
