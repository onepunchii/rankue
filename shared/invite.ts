/**
 * 친구 초대(2026-10-16 오너: "한정판 가장 상위에 친구초대 · 해당 큐대로 친구초대 하기 버튼으로 해당 url 로 누가 들어와서 가입하면").
 * 고른 것: **가입만 센다** · 단계(1명 초크 · 3명 장갑 · 10명 큐) + 초대받은 사람 환영 초크 · 30명마다 한정 큐 한 자루를 고른다(12종 × 10자루).
 *
 * 흐름: 내 코드(여섯 글자) → 링크 rankue.co.kr/i/<코드> → 그 기기에 표시(INVITE_MARK_KEY)를 남긴다 → 가입 · 로그인하면
 * 화면이 표시를 서버에 낸다(POST /invite/claim). 서버는 **새 계정**(가입한 지 INVITE_CLAIM_DAYS 안)만 받는다 — 이미 있던 회원은 세지 않는다.
 * 앱을 깔고 앱에서 가입하면 웹의 표시가 끊긴다(매장 QR 가입과 같은 함정) → 큐 케이스의 '초대 코드 넣기'로 직접 낸다.
 */

export const INVITE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 0 · O · 1 · I 는 헷갈려서 뺀다
export const INVITE_CODE_LEN = 6;
/** 가입한 지 이 날 수 안이어야 초대로 셀 수 있다 */
export const INVITE_CLAIM_DAYS = 7;
/** 링크로 온 기기의 표시 — 이 날 수가 지나면 버린다 */
export const INVITE_MARK_KEY = "rankue.invite";
export const INVITE_MARK_DAYS = 30;
export const INVITE_ORIGIN = "https://www.rankue.co.kr";

export const invitePath = (code: string) => `/i/${code}`;
export const inviteUrl = (code: string) => `${INVITE_ORIGIN}${invitePath(code)}`;

/** 사람이 넣은 코드 — 대문자로, 띄어쓰기 · 줄표를 걷는다. 꼴이 아니면 null */
export function cleanInviteCode(raw: unknown): string | null {
    const s = String(raw ?? "").toUpperCase().replace(/[\s-]/g, "");
    if (s.length !== INVITE_CODE_LEN) return null;
    for (const ch of s) if (!INVITE_ALPHABET.includes(ch)) return null;
    return s;
}

export function randomInviteCode(rand: () => number = Math.random): string {
    let s = "";
    for (let i = 0; i < INVITE_CODE_LEN; i++) s += INVITE_ALPHABET[Math.floor(rand() * INVITE_ALPHABET.length) % INVITE_ALPHABET.length];
    return s;
}

export type ClaimRefusal = "code" | "self" | "old" | "already" | "older";
/**
 * 초대로 셀 수 있는가 — 못 세면 그 까닭.
 *  code 없는 코드 · self 내 코드 · old 가입한 지 오래 · already 이미 누군가의 초대로 셌다 · older 초대한 사람이 나보다 늦게 가입했다
 */
export function claimRefusal(o: { inviterId: string | null; meId: string; myJoinedAt: number; inviterJoinedAt: number | null; already: boolean; now: number }): ClaimRefusal | null {
    if (!o.inviterId) return "code";
    if (o.inviterId === o.meId) return "self";
    if (o.already) return "already";
    if (o.now - o.myJoinedAt > INVITE_CLAIM_DAYS * 86_400_000) return "old";
    if (o.inviterJoinedAt != null && o.inviterJoinedAt > o.myJoinedAt) return "older";
    return null;
}

/** 화면이 저장소에 남기는 표시 */
export interface InviteMark { code: string; at: number }
export function parseInviteMark(raw: string | null, now: number): InviteMark | null {
    if (!raw) return null;
    try {
        const v = JSON.parse(raw) as Partial<InviteMark>;
        const code = cleanInviteCode(v.code);
        if (!code || typeof v.at !== "number" || now - v.at > INVITE_MARK_DAYS * 86_400_000 || v.at > now + 60_000) return null;
        return { code, at: v.at };
    } catch { return null; }
}

/** GET /invite/me */
export interface InviteMe {
    code: string;
    url: string;
    /** 내 초대로 새로 가입한 사람 */
    count: number;
    /** 한정 큐 — 고를 수 있는 수 · 남은 수 */
    picks: { total: number; left: number };
    /** 내가 누구의 초대로 왔는가 */
    invitedBy: string | null;
    /** 아직 초대 코드를 넣을 수 있다(가입한 지 7일 안 · 초대로 세지 않았다) */
    canClaim: boolean;
}
/** GET /invite/code/:code — 링크를 연 사람에게(로그인 없이) */
export interface InviteCard { name: string; hero: string | null }
