/**
 * 어드민 · 회원 상세의 골프 칸과 부킹매니저 켜기·끄기 — 2026-10-01 오너: "골프 부분이 어드민에 많이 빠져 있다 — 넣을 수 있는 거 다 넣자".
 *
 * 서버(GET /admin/members/:id/golf · POST /admin/members/:id/booking-manager)와 화면(MemberDetailSheet)이 이 파일 하나를 같이 본다.
 *
 * ── 부킹매니저는 어디에 있나 ──
 * 따로 된 칸이 없다. 계정 역할 profiles.role **한 칸**(user · store_owner · admin · super_admin · booking_manager)이다.
 * 부킹을 올릴 때 서버(server/routes/modules/golf.ts BOOKING_WRITER_ROLES)가 이 역할로 글을 STORE(매장)·PERSONAL(개인 양도)로 굳힌다.
 * STORE 이면: '개인 양도' 표시가 안 붙고 · 휴대폰 번호가 모두에게 보이고 · 한 시간 400건(개인 40건) · '긴급 핫딜' 리본을 켤 수 있다.
 * 당구 매장 사장님(store_owner)과 관리자도 이미 STORE 다.
 *
 * 칸이 하나라 켜기·끄기는 **user ↔ booking_manager 사이만** 오간다. 사장님·관리자 계정을 여기서 바꾸면 사장님 권한
 * ('내 매장 관리' 메뉴·매장 승인 흐름이 role 을 본다)이나 관리자 권한을 덮어쓰게 되므로 손대지 않는다(이미 STORE 라 바꿀 일도 없다).
 * 서버는 "지금 값이 from 일 때만 to 로" 한 문장으로 바꾼다 — 읽고 쓰는 사이에 사장님 승인이 끼어들어도 덮어쓰지 않는다.
 * 역할을 바꿔도 **이미 올린 글은 그대로**다(sellerType 은 올릴 때 굳는다).
 *
 * ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트를 늘리면 './x.js' 로(없으면 Vercel /api 전체 500).
 */

/** golf.ts BOOKING_WRITER_ROLES 와 같은 목록(adminMemberGolf.test.ts 가 지킨다) — 이 역할이면 부킹이 STORE 로 올라간다 */
export const STORE_SELLER_ROLES: readonly string[] = ["admin", "super_admin", "store_owner", "booking_manager"];

export type BookingManagerKind =
    /** 부킹매니저로 지정됨 — 끌 수 있다 */
    | "manager"
    /** 일반 회원 — 켤 수 있다 */
    | "user"
    /** 당구 매장 사장님 — 이미 STORE, 바꾸지 않는다 */
    | "store_owner"
    /** 관리자 — 이미 STORE, 바꾸지 않는다 */
    | "staff"
    /** 로그인 계정(프로필)이 없는 회원 — 역할 칸 자체가 없다 */
    | "no_account"
    /** 모르는 역할 값 — 건드리지 않는다 */
    | "other";

export interface BookingManagerState {
    kind: BookingManagerKind;
    /** 지금 부킹을 올리면 STORE(매장) 글이 되는가 */
    isStoreSeller: boolean;
    /** 여기서 켜고 끌 수 있는가 */
    canToggle: boolean;
}

/** 계정 역할 → 부킹매니저 스위치 상태. role 이 null 이면 로그인 계정이 없는 회원이다. */
export function bookingManagerState(role: string | null | undefined): BookingManagerState {
    if (role == null) return { kind: "no_account", isStoreSeller: false, canToggle: false };
    if (role === "booking_manager") return { kind: "manager", isStoreSeller: true, canToggle: true };
    if (role === "user") return { kind: "user", isStoreSeller: false, canToggle: true };
    if (role === "store_owner") return { kind: "store_owner", isStoreSeller: true, canToggle: false };
    if (role === "admin" || role === "super_admin") return { kind: "staff", isStoreSeller: true, canToggle: false };
    return { kind: "other", isStoreSeller: STORE_SELLER_ROLES.includes(role), canToggle: false };
}

/** 켜기·끄기가 바꾸는 값 — 지금 역할이 from 일 때만 to 로 바꾼다(다른 역할은 그대로 둔다) */
export function bookingManagerSwitch(on: boolean): { from: "user" | "booking_manager"; to: "user" | "booking_manager" } {
    return on ? { from: "user", to: "booking_manager" } : { from: "booking_manager", to: "user" };
}

/**
 * GET /admin/members/:id/golf 응답. 시각은 전부 'Z' 를 붙인 UTC 문자열(시간대 없는 값을 브라우저가 한국 시각으로 읽어 9시간 어긋나지 않게).
 * 없는 값(입력 안 한 핸디, 기록 없는 평균)은 0 이 아니라 null 이다 — DB 기본값 0 을 '0타'로 보여 주면 거짓말이 된다.
 */
export interface AdminMemberGolf {
    /** profiles.role — 로그인 계정이 없으면 null */
    role: string | null;
    stats: {
        /** hiq_members.golf_grade(공식 라운드 평균으로 매긴 등급, 남에게 보이는 값) */
        grade: string | null;
        /** 저장된 공식 평균·베스트(등급·랭킹·친구 목록이 쓰는 값) */
        avgScore: number | null;
        bestScore: number | null;
        /** 저장된 공식 라운드 수(hiq_members.total_golf_games) */
        storedRounds: number;
        /** 기록에서 지금 센 공식 라운드 수(점수 > 0 · 미인증 제외 — updateGolfStats 와 같은 규칙). 저장값과 다르면 다시 셀 일이 남은 것 */
        officialRounds: number;
        /** 본인이 적은 핸디(안 적었으면 null) */
        handicap: number | null;
        lastRoundAt: string | null;
    };
    /** 골프 기록(hiq_game_history GOLF)의 현장 인증 — true 인증 · false 미인증 · null 규칙 전 옛 기록(인증으로 센다) */
    onSite: { verified: number; unverified: number; legacy: number; total: number };
    /** 최근 골프 기록 10건(새것부터) */
    rounds: { id: string; playedAt: string | null; course: string | null; subType: string | null; score: number; onSite: boolean | null }[];
    /**
     * 조인·부킹 신청 평판(golf_join_requests, 이 회원이 신청자인 행). 관리자만 본다.
     * applications 는 신청한 글 수(같은 글에 다시 신청하면 행 하나), accepted 는 호스트가 받아 준 신청(노쇼로 바뀐 것 포함),
     * cancels·noShows 는 다시 신청해도 줄지 않는 누적 횟수. ⚠️ 글이 지워지면 그 글의 신청 행도 함께 지워진다(cascade).
     */
    reputation: { applications: number; accepted: number; pending: number; rejected: number; cancels: number; noShows: number; lastAppliedAt: string | null };
    /** 이 회원이 올린 조인·부킹 글(golf_bookings.owner_id — 2026-09-09 전 옛 글은 올린 사람 칸이 비어 있어 빠진다) */
    posts: { joins: number; bookings: number; personalBookings: number; blinded: number; upcoming: number; lastPostedAt: string | null };
}
