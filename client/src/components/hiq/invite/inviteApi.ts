/**
 * 친구 초대 — 서버의 답 · 링크로 온 기기의 표시(2026-10-16, 규칙 shared/invite).
 * GET /api/hiq/friend-invite/me · GET /api/hiq/friend-invite/code/:code(로그인 없이) · POST /api/hiq/friend-invite/claim
 * (게임 초대 코드의 /invite/:code 와 겹치지 않게 /friend-invite) · POST /api/hiq/cue-case/invite-pick
 */
import { apiRequest } from "@/lib/queryClient";
import { INVITE_MARK_KEY, cleanInviteCode, parseInviteMark, type InviteCard, type InviteMark, type InviteMe } from "@shared/invite";

export const INVITE_ME_KEY = ["/api/hiq/friend-invite/me"] as const;
export const inviteCardKey = (code: string) => ["/api/hiq/friend-invite/code", code] as const;

export const fetchInviteMe = (): Promise<InviteMe> => apiRequest("/api/hiq/friend-invite/me");
export const fetchInviteCard = (code: string): Promise<InviteCard> => apiRequest(`/api/hiq/friend-invite/code/${encodeURIComponent(code)}`);
export const claimInvite = (code: string): Promise<{ ok: true; welcome: string; inviter: string }> => apiRequest("/api/hiq/friend-invite/claim", { method: "POST", body: { code } });
export const pickInviteCue = (itemId: string): Promise<{ itemId: string; serial: number }> => apiRequest("/api/hiq/cue-case/invite-pick", { method: "POST", body: { itemId } });

/* ── 링크로 온 기기의 표시 — 가입 · 로그인한 뒤 InviteClaimer 가 서버에 낸다 ── */
export function readInviteMark(now = Date.now()): InviteMark | null {
    try { return parseInviteMark(localStorage.getItem(INVITE_MARK_KEY), now); } catch { return null; }
}
export function writeInviteMark(code: string, now = Date.now()): void {
    const c = cleanInviteCode(code);
    if (!c) return;
    // 이미 다른 사람의 표시가 있으면 새 링크가 이긴다(가장 최근에 누른 초대)
    try { localStorage.setItem(INVITE_MARK_KEY, JSON.stringify({ code: c, at: now })); } catch { /* 저장소를 못 쓰는 기기 — 코드 넣기로 낸다 */ }
}
export function clearInviteMark(): void {
    try { localStorage.removeItem(INVITE_MARK_KEY); } catch { /* 없어도 된다 */ }
}

/** 서버가 돌려준 오류 키 — 다시 낼 까닭이 없는 것(이미 · 오래 · 내 코드 · 없는 코드)이면 표시를 지운다 */
export function finalRefusal(e: unknown): boolean {
    const status = (e as { status?: number } | null)?.status;
    return status === 400 || status === 404 || status === 409;
}

/**
 * 초대 링크 보내기(2026-10-16 오너: "초대 카드 보내기 하면 이미지만 · 링크까지 같이 · 버튼 하나로") — 파일을 붙이면 카톡 등이 글(링크)을 버린다.
 * 그래서 **링크와 글만** 보낸다 → 받는 쪽에 링크 미리보기(초대 카드 그림 · "OO님이 랭큐로 초대했어요")가 저절로 붙는다(server/prerender /i/:code).
 * 앱 = 시스템 공유창, 웹 = Web Share, 둘 다 없으면 링크를 복사한다.
 */
export type LinkShareOutcome = "shared" | "copied" | "dismissed" | "failed";
export async function shareInviteLink(o: { title: string; text: string; url: string }): Promise<LinkShareOutcome> {
    const { Capacitor } = await import("@capacitor/core");
    const { isDismissal, copyText } = await import("@/sim/share/useShare");
    try {
        if (Capacitor.isNativePlatform()) {
            const { Share } = await import("@capacitor/share");
            await Share.share({ title: o.title, text: o.text, url: o.url, dialogTitle: o.title });
            return "shared";
        }
        const n = typeof navigator !== "undefined" ? navigator : null;
        if (n && typeof n.share === "function") {
            await n.share({ title: o.title, text: o.text, url: o.url });
            return "shared";
        }
    } catch (e) {
        if (isDismissal(e)) return "dismissed";
        // 공유창이 실패하면 복사로 넘어간다
    }
    return (await copyText(`${o.text}\n${o.url}`)) ? "copied" : "failed";
}
