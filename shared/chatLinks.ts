/**
 * 채팅 말풍선의 링크(2026-10-29 오너: "그 링크주소를 상대방이 클릭했을 때 열리게").
 *
 * 링크로 그리는 것은 **오너(슈퍼 관리자)의 글**(서버가 붙이는 trusted)뿐이다. 회원의 글은 서버가 링크를 가려 저장하고,
 * 가리기 전의 옛 글이나 필터를 비껴간 모양이 남아 있어도 눌리게 만들지 않는다 — 모르는 사람이 보낸 링크를 한 번에 열리게 하면 피싱 통로가 된다.
 *
 * 잡는 모양: http(s):// 로 시작하는 주소 · www. 로 시작하는 주소 · 우리 주소(rankue.co.kr/…)는 앞을 빼고 써도.
 * 주소에 쓰는 ASCII 글자까지만 이어 붙인다 — "https://…/ABC에서"처럼 한글이 바로 붙어도 한글은 주소가 아니다.
 * 끝의 문장부호(. , ! ? 등)와 짝이 없는 닫는 괄호는 문장 쪽으로 돌려준다.
 */

export type ChatTextPart = { kind: "text"; text: string } | { kind: "link"; text: string; href: string };

// 뒤돌아보기((?<!…))는 쓰지 않는다 — 옛 iOS 웹뷰(16.4 이전)는 그 문법을 몰라 묶음 전체가 뜨지 않는다. 앞 글자는 코드에서 본다.
const LINK_RE = /(?:https?:\/\/|www\.|rankue\.co\.kr\/)[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/gi;
const TRAILING = /[.,!?;:'"]+$/;

function trimEnd(raw: string): string {
    let s = raw;
    for (;;) {
        const before = s;
        s = s.replace(TRAILING, "");
        // 짝이 없는 닫는 괄호 — "(https://a.com)" 의 ")" 는 문장의 것이다. 위키 주소처럼 짝이 맞으면 남긴다
        for (const [open, close] of [["(", ")"], ["[", "]"]] as const) {
            if (s.endsWith(close) && s.split(open).length < s.split(close).length) s = s.slice(0, -1);
        }
        if (s === before) return s;
    }
}

function hrefOf(text: string): string | null {
    const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
    try {
        const u = new URL(withScheme);
        if (u.protocol !== "https:" && u.protocol !== "http:") return null;
        // 점 없는 호스트(https://localhost 따위)와 빈 호스트는 링크로 보지 않는다
        if (!u.hostname.includes(".") || u.hostname.startsWith(".") || u.hostname.endsWith(".")) return null;
        return u.href;
    } catch {
        return null;
    }
}

/** 글을 글자 조각과 링크 조각으로 나눈다. 이어 붙이면 원문 그대로다. */
export function splitChatLinks(text: string): ChatTextPart[] {
    const parts: ChatTextPart[] = [];
    let last = 0;
    for (const m of text.matchAll(LINK_RE)) {
        const at = m.index ?? 0;
        // 스킴 없는 모양은 낱말 한가운데서 시작하면 안 된다(abc.www.x · me@rankue.co.kr/…)
        if (!/^https?:/i.test(m[0]) && at > 0 && /[A-Za-z0-9.@/_-]/.test(text[at - 1])) continue;
        const raw = trimEnd(m[0]);
        const href = raw ? hrefOf(raw) : null;
        if (!href) continue;
        if (at > last) parts.push({ kind: "text", text: text.slice(last, at) });
        parts.push({ kind: "link", text: raw, href });
        last = at + raw.length;
    }
    if (last < text.length) parts.push({ kind: "text", text: text.slice(last) });
    return parts;
}
