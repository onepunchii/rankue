/**
 * '앱에서 열기'의 받는 쪽(2026-10-06 오너: "웹에서 로그인한 사람이 앱을 깔았을 때 다시 로그인하지 않고 그대로 이어 쓰게. 새 앱 빌드 없이").
 *
 * 웹이 받은 한 번짜리 토큰이 앱 주소(rankue://open?path=/dashboard?handoff=…)에 실려 온다. 앱(lib/nativeBridge openDeepLink)은
 * 그 주소에서 토큰을 **떼어** 이 컴포넌트에 건네고, 화면은 토큰 없는 경로로 옮긴다. 이 컴포넌트는 화면이 없다.
 *
 * 2026-10-06 검토 — 토큰이 든 링크를 남에게 보내면 받은 사람이 **보낸 사람의 계정**으로 로그인됐다(링크형 로그인 CSRF). 그래서:
 *   ① 주소에 실려 온 토큰(?handoff=)은 **지우기만 하고 쓰지 않는다** — 웹 브라우저든 앱이든. 정상 흐름은 주소로 토큰을 받지 않는다.
 *      지우는 일은 다른 화면의 효과(useEffect)보다 앞서도록 그리기 직전(useLayoutEffect)에 한다.
 *   ② 쓰는 토큰은 **앱이 커스텀 스킴으로 받은 것**뿐이다(nativeBridge 가 건넨다). 웹 브라우저에서는 서버를 부르지 않는다 —
 *      웹에서 바꿀 일이 없다('앱에서 열기'는 앱 주소만 연다).
 *   ③ 로그인 확인이 끝나기를 기다리고, **서버에 한 번 더 확인한다**. 로그인돼 있으면(또는 확인하지 못하면) 토큰을 쓰지 않고 버린다 —
 *      앱에서 쓰던 계정을 말없이 바꾸지 않는다. 서버도 로그인된 요청은 바꿔 주지 않는다(409).
 *   ④ 바꾸기 전에 **묻는다**(appConfirm) — 방금 웹에서 '앱에서 열기'를 누른 사람만 계속하게.
 *   ⑤ 서버에 **한 번만** 보내 쿠키와 바꾼다(같은 토큰은 다시 보내지 않는다). 성공하면 '나'를 새로 받고, 떠 있는 화면들이 새 '나'를
 *      읽게 한 뒤(rebindAuthWatchers — 화면을 옮기지 않는 로그인이다), 어느 계정으로 들어왔는지 이름과 함께 알린다.
 *   ⑥ 실패하면 조용히 끝낸다 — 만료된 링크를 다시 눌렀을 뿐이다. 보던 화면(비로그인 홈)이 그대로 남는다.
 * 앱의 웹뷰는 https://www.rankue.co.kr 을 그대로 띄우므로 쿠키가 1차 쿠키로 잡힌다.
 * 규칙·주소 모양은 shared/loginHandoff · shared/deepLink(openedAppLink), 서버는 server/routes/modules/handoff.ts.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useSearch } from "wouter";
import { appConfirm } from "@/components/AppDialog";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { isNativeApp, onHandoffDelivered, takeDeliveredHandoff } from "@/lib/nativeBridge";
import { apiRequest, queryClient, rebindAuthWatchers, refreshAfterLogin } from "@/lib/queryClient";
import { takeHandoffFromUrl } from "@shared/loginHandoff";

/** 받아 둔 '나'를 그대로 믿는 시간. 이보다 오래된 답(또는 답 없음·오류)이면 바꾸기 전에 서버에 한 번 다시 묻는다. */
const ME_TRUST_MS = 30 * 1000;

export function HandoffRedeemer() {
    // 주소의 쿼리가 바뀔 때마다 다시 본다 — 앱이 켜진 채 받은 링크(appUrlOpen)는 화면을 새로 띄우지 않고 주소만 옮긴다
    const search = useSearch();
    const { isLoading } = useAuth();
    const { toast } = useToast();
    const { t } = useT();
    const live = useRef({ toast, t });
    live.current = { toast, t };

    /** 앱이 건넸고 아직 처리하지 않은 토큰. 그리는 데 쓰는 값이 아니라 ref 에 둔다(저장소·주소 어디에도 다시 적지 않는다). */
    const pending = useRef<string | null>(null);
    /** 서버에 보낸 토큰 — 같은 것을 두 번 보내지 않는다(효과가 다시 돌아도, 같은 링크가 다시 열려도). */
    const sent = useRef(new Set<string>());
    const [arrived, setArrived] = useState(0);

    // ① 주소에 실려 온 토큰은 지우기만 한다(쓰지 않는다) — 새로고침·공유·뒤로 가기로 주소에 남아 돌지 않게
    useLayoutEffect(() => {
        const taken = takeHandoffFromUrl(window.location.href);
        if (!taken.present) return;
        try {
            // history.state 는 그대로 둔다. wouter 가 이 호출을 듣고 라우터·useSearch 를 새 주소로 맞춘다(nativeBridge 의 '마지막 경로' 기억도 같이 고쳐진다)
            window.history.replaceState(window.history.state, "", taken.cleaned);
        } catch { /* 주소를 못 바꾸는 환경 — 어차피 주소의 토큰은 쓰지 않는다 */ }
    }, [search]);

    // ② 앱이 커스텀 스킴으로 받아 건넨 토큰만 받는다. 웹 브라우저에서는 건네는 쪽(nativeBridge)이 돌지 않는다
    useEffect(() => {
        if (!isNativeApp()) return;
        const take = () => {
            const token = takeDeliveredHandoff();
            if (!token) return;
            pending.current = token;
            setArrived((n) => n + 1);
        };
        // 이 컴포넌트가 붙기 전에 도착한 것(콜드 스타트)부터 꺼낸다
        take();
        return onHandoffDelivered(take);
    }, []);

    // ③~⑥ 로그인 확인이 끝난 뒤에 쓴다
    useEffect(() => {
        const token = pending.current;
        if (!token || isLoading) return;
        pending.current = null;
        if (sent.current.has(token)) return;
        sent.current.add(token);
        void (async () => {
            // 웹 브라우저에서는 바꾸지 않는다(②의 문이 뚫려도 여기서 한 번 더 막는다)
            if (!isNativeApp()) return;
            // 화면이 '비로그인'으로 알고 있어도 서버에 다시 확인한다 — 로그인 확인이 오류로 끝난 것(순간 끊김 · 5xx)도 화면에는 비로그인으로
            // 보인다. 방금(30초 안) 받은 답은 그대로 쓰므로 요청이 늘지 않는다. 로그인돼 있으면 토큰을 쓰지 않고 버린다.
            try {
                const me = await queryClient.fetchQuery({ queryKey: ["/api/hiq/me"], staleTime: ME_TRUST_MS });
                if (me) return;
            } catch {
                return; // 확인하지 못했다(네트워크) — 로그인돼 있을지 모르는 계정을 바꾸지 않는다
            }
            // 묻는다 — 남이 보낸 링크로 그 사람의 계정에 들어가는 일이 없게. 방금 웹에서 '앱에서 열기'를 누른 사람만 계속한다
            const agreed = await appConfirm({
                title: live.current.t("handoff.confirmTitle"),
                message: live.current.t("handoff.confirmDesc"),
                confirmText: live.current.t("handoff.confirmOk"),
            });
            if (!agreed) return;
            let redeemed: { member?: { name?: string | null } } | null = null;
            try {
                redeemed = await apiRequest("/api/hiq/handoff/redeem", { method: "POST", body: { token } });
            } catch {
                return; // 만료·이미 씀·정지·이미 로그인됨 — 조용히 끝낸다(안내 없음)
            }
            // 로그인되는 길이다 — '나'를 새로 받고(shared/loginRefresh.test.ts 가 지킨다), 떠 있는 화면들이 새 '나'를 읽게 한 뒤에 알린다.
            // 화면은 옮기지 않는다
            await refreshAfterLogin();
            rebindAuthWatchers();
            // 어느 계정으로 들어왔는지 보이게 이름을 같이 적는다(화면에 보이는 별명이 먼저, 없으면 이름)
            const me = queryClient.getQueryData<{ nickname?: string | null; name?: string | null } | null>(["/api/hiq/me"]);
            const name = (me?.nickname || me?.name || redeemed?.member?.name || "").trim();
            live.current.toast({
                title: live.current.t("handoff.welcome"),
                description: name ? live.current.t("handoff.welcomeAccount").replace("{name}", name) : undefined,
            });
        })();
    }, [arrived, isLoading]);

    return null;
}
