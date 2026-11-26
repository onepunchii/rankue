/**
 * www.rankue.kr(골프 도메인)에서 앱이 지킬 것 — 규칙은 shared/siteSplit.ts.
 *
 * .kr 에는 골프 공개 화면만 연다. 앱 셸은 한 벌이라 .kr 에서도 모든 화면을 그릴 수 있는데, 그러면 사이트 전체가 두 도메인에 겹친다.
 * 그래서 ① 안 여는 화면으로 옮겨 가면 원래 사이트(co.kr)의 같은 주소로 보내고 ② 로그인도 co.kr 에서 하게 한다
 * (로그인 쿠키는 도메인을 넘지 못하고, 카카오 · 구글 로그인은 co.kr 주소로만 등록돼 있다).
 * 서버도 같은 일을 한다(주소를 직접 연 사람은 302) — 여기는 앱 안에서 옮겨 다닐 때의 몫이다.
 */
import { useEffect } from "react";
import { useLocation } from "wouter";
import { krAllowed, mainUrlFor, siteOfHost } from "@shared/siteSplit";

export const isKrSite = (): boolean => typeof window !== "undefined" && siteOfHost(window.location.host) === "kr";

/** .kr 이면 co.kr 의 그 주소로 떠난다. 떠났으면 true(부른 쪽은 하던 일을 멈춘다) */
export function leaveKrFor(pathAndQuery: string): boolean {
    if (!isKrSite()) return false;
    window.location.assign(mainUrlFor(pathAndQuery));
    return true;
}

/** 화면 없음 — .kr 에서 안 여는 주소가 되면 co.kr 로 보낸다 */
export function KrSiteGuard() {
    const [location] = useLocation();
    useEffect(() => {
        if (!isKrSite() || krAllowed(location)) return;
        // replace — '뒤로'를 눌렀을 때 이 주소로 돌아와 다시 튕기지 않게
        window.location.replace(mainUrlFor(location + window.location.search));
    }, [location]);
    return null;
}
