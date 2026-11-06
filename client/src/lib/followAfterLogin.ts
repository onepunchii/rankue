/**
 * 가입하고 팔로우(2026-11-06 — shared/guestConversion). 방문자가 선수 화면에서 '팔로우'를 누르면 그 선수를 이 기기에 적어 두고
 * 가입 팝업을 연다. 가입을 마치고 그 선수 화면에 있으면(카카오처럼 화면이 통째로 다녀와도 누른 화면으로 돌아온다) 바로 팔로우한다 —
 * 누른 일이 헛되지 않게(등산의 '가고 싶은 산'과 같은 방식, hiking/wish/WishParts).
 */
import { useEffect, useRef } from "react";
import { useAuth } from "@/hooks/useAuth";
import { goLoginPage } from "@/components/hiq/LoginGate";
import { openLoginSheet } from "@/components/hiq/LoginSheet";
import { FOLLOW_AFTER_LOGIN_KEY, followIntentMatches, followIntentRead, followIntentRecord, followLoginAsk, type FollowIntent, type FollowKind } from "@shared/guestConversion";

/**
 * 방문자가 '팔로우'를 눌렀다 — 적어 두고 가입 팝업. 한국어 화면은 무엇을 하려다 가입하는지 말하고(followLoginAsk),
 * 다른 언어 화면은 기본 팝업(그 문구는 한국어뿐이다). 가입 뒤 팔로우는 어느 쪽이든 된다.
 */
export function followAfterLogin(intent: FollowIntent, setLocation: (to: string) => void, korean = true): void {
    try { localStorage.setItem(FOLLOW_AFTER_LOGIN_KEY, followIntentRecord(intent, Date.now())); } catch { /* 적지 못해도 가입은 이어진다 */ }
    if (!openLoginSheet(korean ? followLoginAsk(intent.kind, intent.name) : {})) goLoginPage(setLocation);
}

/**
 * 가입하고 돌아온 선수 화면에서 — 적어 둔 것이 이 선수면 run 을 한 번 부른다. 다른 선수 것이면 그대로 둔다(그 화면에서 쓰인다).
 * 오래됐거나 꼴이 틀리면 지우기만 한다. ready 는 화면이 팔로우할 준비가 됐는가(선수 자료를 받았다).
 */
export function useFollowAfterLogin(kind: FollowKind, key: string | null, category: string | null, ready: boolean, run: () => void): void {
    const { member } = useAuth();
    const done = useRef(false);
    useEffect(() => {
        if (!member || !key || !ready || done.current) return;
        let raw: string | null = null;
        try { raw = localStorage.getItem(FOLLOW_AFTER_LOGIN_KEY); } catch { return; }
        if (!raw) return;
        const i = followIntentRead(raw, Date.now());
        if (i && !followIntentMatches(i, kind, key, category)) return;
        done.current = true;
        try { localStorage.removeItem(FOLLOW_AFTER_LOGIN_KEY); } catch { /* 지우지 못해도 오래되면 버려진다 */ }
        if (i) run();
    }, [member, kind, key, category, ready, run]);
}
