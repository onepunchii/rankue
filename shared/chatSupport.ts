/**
 * 문의 방(support:<회원 id>) 규칙 — 서버·화면·시험이 같이 쓴다. DB 를 물지 않는다(화면 번들에도 실린다 — 비밀 값 없음).
 *
 * 2026-10-06 오너: "관리자는 누구와도 다 채팅을 할 수 있게". 문의 방을 **거꾸로도** 쓴다 —
 * 운영자가 회원을 찾아 그 회원의 문의 방에 먼저 쓴다. 운영자 개인 계정으로 1:1 을 여는 방식은 쓰지 않는다:
 * 1:1 은 친구끼리만이라는 규칙이 있고, 개인 대화와 운영 연락이 섞이면 안 되고, 다른 운영자가 이어받을 수 있어야 한다.
 *
 * 여기 모은 것:
 *  1) 회원에게 운영자는 '랭큐 운영팀' **한 사람**이다 — 이름·사진·회원 id·누가 읽었는지를 서버 응답에서 바꾼다
 *     (화면에서만 가리면 응답에 개인 이름이 남는다). 운영자끼리는 누가 답했는지 실제 이름이 보인다.
 *  2) 알림 제목 — 회원이 쓴 적 없는 방에 운영자가 쓰면 '문의 답변'이 아니라 '운영팀 메시지'.
 *  3) 회원 찾기 — 검색어 다듬기 · LIKE 이스케이프 · 탈퇴회원 판정 · 전화 끝 4자리(번호 전체는 응답에 싣지 않는다) ·
 *     어느 매장에서 가입한 행인지와 로그인 계정이 있는지(회원 행은 매장별이라 같은 사람이 두 줄로 나온다).
 */
import { DELETED_PHONE_PREFIX, isPlaceholderPhone } from "./loginPhone.js";
import { isSystemStore } from "./systemStores.js";

/* ── 1) 회원에게 보이는 운영팀 ─────────────────────────── */

/** 회원에게 보이는 '운영팀' 한 사람의 id. 진짜 회원 id(uuid)와 겹치지 않는다 — 화면은 이 값으로 "내가 아닌 한 사람"만 안다. */
export const SUPPORT_TEAM_ID = "support-team";

export interface SupportPerson { id: string; name: string; profileImageUrl: string | null }

/**
 * 메시지의 보낸 사람 — 방 주인(회원)이 쓴 글과 시스템 글(보낸 사람 없음)은 그대로, 나머지(운영자)는 운영팀으로.
 * senderId 까지 바꾼다: 운영자의 회원 id 가 남으면 그 id 로 프로필·전적을 찾아 누구인지 알 수 있다.
 */
export function maskSupportMessages<T extends { senderId: string | null; sender?: { name: string; profileImageUrl?: string | null } | null }>(
    rows: readonly T[], ownerId: string, teamName: string,
): T[] {
    return rows.map((r) => (r.senderId === null || r.senderId === ownerId
        ? r
        : { ...r, senderId: SUPPORT_TEAM_ID, sender: { name: teamName, profileImageUrl: null } }));
}

/** 참여자 명단 — 회원에게는 [회원 본인, 운영팀]. 운영자가 몇 명인지·누구인지 나가지 않는다. */
export function maskSupportMembers(members: readonly SupportPerson[], ownerId: string, teamName: string): SupportPerson[] {
    return [
        ...members.filter((m) => m.id === ownerId),
        { id: SUPPORT_TEAM_ID, name: teamName, profileImageUrl: null },
    ];
}

/**
 * 읽은 시각 — 운영자들의 커서를 운영팀 하나로 접는다(가장 늦게 읽은 시각 = 운영자 중 누구라도 읽었으면 읽은 것).
 * 그대로 주면 운영자의 회원 id 와 각자 언제 읽었는지가 응답에 실린다. 운영자 중 아무도 안 읽었으면 운영팀 줄이 없다(= 아직 안 읽음).
 */
export function collapseSupportReads(reads: readonly { id: string; at: string }[], ownerId: string): { id: string; at: string }[] {
    const out = reads.filter((r) => r.id === ownerId).map((r) => ({ id: r.id, at: r.at }));
    let latest: string | null = null;
    for (const r of reads) {
        if (r.id === ownerId) continue;
        if (latest === null || new Date(r.at).getTime() > new Date(latest).getTime()) latest = r.at;
    }
    if (latest !== null) out.push({ id: SUPPORT_TEAM_ID, at: latest });
    return out;
}

/** 방 목록의 마지막 메시지 앞에 붙는 이름 — 회원에게는 자기 글이면 자기 이름, 운영자 글이면 운영팀. */
export function supportPreviewSender(senderId: string | null, ownerId: string, realName: string | null, teamName: string): string | null {
    if (senderId === null) return null;
    return senderId === ownerId ? realName : teamName;
}

/* ── 2) 알림 ───────────────────────────────────────────── */

export type SupportTitleKey = "notif.chat.supportInquiry.title" | "notif.chat.supportReply.title" | "notif.chat.supportTeam.title";

/**
 * 문의 방 알림의 제목 열쇠.
 *  - 회원이 썼다 → 운영자들에게 "문의"(supportInquiry — 회원 이름이 들어간다).
 *  - 운영자가 썼고 받는 사람이 그 회원이다 → 회원이 이 방에 쓴 적이 있으면 "답변"(supportReply),
 *    한 번도 없으면 "운영팀 메시지"(supportTeam) — 문의한 적도 없는데 '답변'이 오면 이상하다.
 *  - 운영자가 썼고 받는 사람이 다른 운영자다 → 예전 그대로 "답변".
 */
export function supportNotifyTitleKey(a: { senderIsOwner: boolean; recipientIsOwner: boolean; ownerHasWritten: boolean }): SupportTitleKey {
    if (a.senderIsOwner) return "notif.chat.supportInquiry.title";
    if (a.recipientIsOwner && !a.ownerHasWritten) return "notif.chat.supportTeam.title";
    return "notif.chat.supportReply.title";
}

/** 이 알림 본문에서 보낸 사람 이름을 빼야 하나 — 문의 방에서 운영자가 쓴 글이 그 방의 회원에게 갈 때. */
export function supportHidesSender(room: { kind: string; id: string }, senderId: string, recipientId: string): boolean {
    return room.kind === "support" && senderId !== room.id && recipientId === room.id;
}

/* ── 3) 회원 찾기(운영자 전용) ─────────────────────────── */

/**
 * 탈퇴한 회원 행인가 — **번호 자리표시자(del-…)로만** 본다. 탈퇴(user.repo deleteAccount)는 이름('탈퇴회원')과 이 번호를 한 번에 쓴다.
 * 이름으로는 보지 않는다(2026-10-06 검토): 이름은 회원이 설정에서 바꿀 수 있는 값이라, 살아 있는 회원이 이름만 '탈퇴회원'으로 바꾸면
 * 운영자가 그 회원의 문의에 답하지도, 회원 찾기에서 찾지도 못했다(틀린 안내 "탈퇴한 회원이라…"까지 떴다).
 * 번호 자리표시자는 가입·로그인 입구가 받지 않아(shared/loginPhone isLoginPhone) 회원이 흉내 낼 수 없다.
 */
export function isWithdrawnMember(m: { phone?: unknown } | null | undefined): boolean {
    return !!m && typeof m.phone === "string" && m.phone.startsWith(DELETED_PHONE_PREFIX);
}

export const MEMBER_SEARCH_MIN = 2;
export const MEMBER_SEARCH_MAX = 30;
export const MEMBER_SEARCH_LIMIT = 20;

/**
 * 검색어 다듬기 — 글자가 아니면(배열 ?q=a&q=b 포함)·2글자 미만이면 null(서버는 DB 를 안 부르고 빈 목록).
 * 길이는 글자(코드 포인트)로 센다 — 이름 칸이 30자다.
 */
export function memberSearchTerm(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const chars = Array.from(raw.trim().replace(/\s+/g, " "));
    if (chars.length < MEMBER_SEARCH_MIN) return null;
    return chars.slice(0, MEMBER_SEARCH_MAX).join("").trim();
}

/** LIKE 패턴 안의 %·_·\ 를 글자 그대로(Postgres LIKE 의 기본 이스케이프 문자는 \). 값은 늘 파라미터로 넘긴다 — 이건 주입 방어가 아니라 와일드카드 방어다. */
export function escapeLike(s: string): string {
    return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}

/** 전화 끝 4자리 — 같은 이름을 가려내는 데만 쓴다. 소셜·탈퇴 자리표시자와 숫자가 4개 미만인 값은 null. */
export function phoneLast4(phone: unknown): string | null {
    if (typeof phone !== "string" || !phone.trim() || isPlaceholderPhone(phone)) return null;
    const digits = phone.replace(/\D/g, "");
    return digits.length >= 4 ? digits.slice(-4) : null;
}

/** 회원 찾기 한 줄 — 번호 전체·프로필 id·역할 원문은 싣지 않는다. */
export interface AdminMemberHit {
    id: string;
    name: string;
    /** 이름과 다를 때만 */
    nickname: string | null;
    profileImageUrl: string | null;
    /** 가입일(ISO) */
    joinedAt: string | null;
    phoneLast4: string | null;
    /** 주 종목 — 안 골랐으면 null */
    sport: "BILLIARDS" | "GOLF" | null;
    /** 정지된 계정 — 로그인이 막혀 있어 메시지를 못 본다 */
    banned: boolean;
    /** 운영자 계정 */
    staff: boolean;
    /**
     * 가입한 매장 이름 — 본 사이트(hiq)·글로벌(global) 행이면 null.
     * 회원 행은 매장별이다(같은 번호로 제휴 매장과 본 사이트에 따로 가입하면 한 사람이 두 줄). 문의 방 열쇠는 회원 행 id 라,
     * 매장 행을 고르면 그 방은 **그 매장 입구로 로그인했을 때만** 보인다 — 앱은 본 사이트·글로벌 행으로 로그인한다(server/lib/loginMember).
     */
    store: string | null;
    /** 로그인 계정(프로필)이 없는 행(주로 매장에서 번호만으로 등록된 회원) — 푸시 토큰이 프로필에 있어 푸시가 가지 않는다(알림함에만 남는다) */
    noAccount: boolean;
}

export function toAdminMemberHit(r: {
    id: string; name: string; phone?: string | null; createdAt?: Date | string | null; primarySport?: string | null;
    nickname?: string | null; profileImageUrl?: string | null; status?: string | null; role?: string | null;
    profileId?: string | null; storeName?: string | null; storeSlug?: string | null;
}): AdminMemberHit {
    const nick = (r.nickname ?? "").trim();
    const joined = r.createdAt ? new Date(r.createdAt) : null;
    const storeName = (r.storeName ?? "").trim();
    return {
        id: String(r.id),
        name: r.name,
        nickname: nick && nick !== r.name ? nick : null,
        profileImageUrl: r.profileImageUrl ?? null,
        joinedAt: joined && Number.isFinite(joined.getTime()) ? joined.toISOString() : null,
        phoneLast4: phoneLast4(r.phone),
        sport: r.primarySport === "GOLF" ? "GOLF" : r.primarySport === "BILLIARDS" ? "BILLIARDS" : null,
        banned: r.status === "banned",
        // 운영자 = 슈퍼관리자만(2026-10-07). 관리자(admin · 보기 전용)는 문의 방에서 일반 회원이다 — shared/adminRole.ts
        staff: r.role === "super_admin",
        // 매장을 모르는 행(슬러그 없음)은 표시하지 않는다 — 없는 사실을 지어내지 않는다.
        store: r.storeSlug && !isSystemStore(r.storeSlug) ? (storeName || r.storeSlug) : null,
        noAccount: !r.profileId,
    };
}
