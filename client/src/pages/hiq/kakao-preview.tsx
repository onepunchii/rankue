import { useEffect, useRef, useState } from "react";
import { useLocation, useSearch } from "wouter";
import NotFound from "@/pages/not-found";
import { useT } from "@/lib/i18n";
import { apiRequest } from "@/lib/queryClient";
import { isNativeApp } from "@/lib/nativeBridge";
import { kakaoNativeAvailable, kakaoPreviewOn, setKakaoPreview } from "@/lib/kakaoLogin";
import { KAKAO_PREVIEW_API, KAKAO_PREVIEW_PATH, kakaoPreviewAppUrl, readKakaoPreviewAsk } from "@shared/kakaoLogin";
import { installDevice } from "@shared/installPrompt";

// 카카오 로그인 미리보기 페이지(/kakao-preview) — 2026-10-06.
// 카카오 로그인은 다 만들어 꺼 둔 채 배포돼 있다(새 앱 빌드가 승인되는 날 연다). 그 전에 실기기에서 시험할 수 있게,
// **열쇠를 넣은 기기에서만** 카카오 단추가 보이게 하는 입구다. 계약은 shared/kakaoLogin.ts, 서버는 server/lib/kakaoAuth.
//
//   /kakao-preview?k=<열쇠>   서버가 열쇠를 확인하면 쿠키를 심는다 → 이 기기에 깃발을 세운다
//   /kakao-preview?off=1      쿠키를 지우고 깃발을 내린다
//   앱에서는 rankue://open?path=%2Fkakao-preview%3Fk%3D<열쇠> 로 들어온다(https 링크로는 앱이 이 주소를 열지 않는다)
//
// 여기서 지키는 것
//  - 주소의 열쇠는 읽자마자 지운다(history.replaceState) — 주소창·기록·'보던 주소' 기억에 남지 않게. 열쇠는 요청 본문으로만 보낸다.
//  - 켜지지 않았으면 **없는 화면(404)과 같은 모양**이다: 열쇠가 틀렸을 때 · 서버에 열쇠가 없을 때 · 주소에 아무것도 없을 때 ·
//    연결이 안 됐을 때 모두 같다. 확인하는 동안에도 글자를 그리지 않는다. 이 기능이 있다는 것을 화면이 먼저 말하지 않는다.
//  - 깃발은 서버가 켰다고 답한 **뒤에만** 세운다. 깃발은 단추를 보여 줄지만 정한다(손으로 세워도 쿠키가 없으면 서버가 닫힌 답을 준다).
//  - 새 로그인 길이 아니다 — 로그인 쿠키도 '나'도 바뀌지 않는다. 로그인은 로그인 화면의 카카오 단추가 예전 그대로 한다.

type View =
    | { kind: "checking" }
    | { kind: "none" }
    // key 는 화면 메모리에만 둔다 — 아래 '앱에서도 켜기' 주소를 만드는 데만 쓴다(저장소·주소에 남기지 않는다)
    | { kind: "on"; native: boolean; key: string }
    | { kind: "off" };

/** 휴대폰의 브라우저인가(앱 안이 아니다) — 그때만 '이 기기의 앱에서도 켜기'를 보여 준다. PC 에는 열 앱이 없다. */
function onPhoneBrowser(): boolean {
    if (isNativeApp()) return false;
    try {
        const nav = navigator as Navigator & { standalone?: boolean };
        return installDevice(nav.userAgent, { maxTouchPoints: nav.maxTouchPoints, standalone: nav.standalone }) !== "desktop";
    } catch {
        return false;
    }
}

export default function KakaoPreview() {
    const [, setLocation] = useLocation();
    const search = useSearch();
    const { t } = useT();
    // 주소에 무언가 실려 왔으면 확인이 끝날 때까지 빈 화면, 아니면 처음부터 없는 화면이다
    const [view, setView] = useState<View>(() => (window.location.search ? { kind: "checking" } : { kind: "none" }));
    // 앱이 떠 있는 채로 링크가 또 들어오면 주소만 바뀐다 — 마지막 요청의 답만 화면에 쓴다
    const turn = useRef(0);
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    // 검색 제외 — 이 화면은 사이트맵·프리렌더 목록에 없고(기존 방식), 떠 있는 동안에는 robots 도 noindex 로 둔다
    useEffect(() => {
        const meta = document.head.querySelector<HTMLMetaElement>('meta[name="robots"]');
        const before = meta?.getAttribute("content") ?? null;
        meta?.setAttribute("content", "noindex, nofollow");
        return () => { if (meta && before !== null) meta.setAttribute("content", before); };
    }, []);

    useEffect(() => {
        const raw = window.location.search;
        // 주소에 실린 것이 없다 — 방금 아래에서 지운 뒤의 다시 그림이거나, 이 주소만 연 것이다. 앞선 요청의 결과를 그대로 둔다
        if (!raw) return;
        // 주소에서 곧바로 지운다 — 서버를 부르기 **전**이다(새로고침으로 같은 열쇠를 다시 보내지도 않는다)
        try { window.history.replaceState(window.history.state, "", KAKAO_PREVIEW_PATH); } catch { /* 기록을 못 고치는 환경 */ }

        const ask = readKakaoPreviewAsk(raw);
        const mine = ++turn.current;
        const show = (next: View) => { if (alive.current && turn.current === mine) setView(next); };
        if (ask.kind === "none") { show({ kind: "none" }); return; }
        show({ kind: "checking" });

        if (ask.kind === "off") {
            // 깃발은 서버의 답과 무관하게 내린다. 켜 둔 적이 없는 기기에는 껐다는 말도 하지 않는다(없는 화면)
            const had = kakaoPreviewOn();
            setKakaoPreview(false);
            void apiRequest(KAKAO_PREVIEW_API, { method: "DELETE" })
                .catch(() => undefined)
                .then(() => show(had ? { kind: "off" } : { kind: "none" }));
            return;
        }

        void apiRequest(KAKAO_PREVIEW_API, { method: "POST", body: { key: ask.key } })
            .then((data) => {
                // 서버가 켰다고 답했을 때만(JSON 의 open === true). 그 밖의 답은 전부 '없는 화면'이다
                if (data?.open !== true) { show({ kind: "none" }); return; }
                setKakaoPreview(true);
                show({ kind: "on", native: data.native === true, key: ask.key });
            })
            .catch(() => show({ kind: "none" }));
    }, [search]);

    if (view.kind === "checking") return <div className="min-h-[100dvh] bg-surface-0" aria-busy="true" />;
    if (view.kind === "none") return <NotFound />;

    // 앱 안(카카오 플러그인이 든 바이너리)인데 서버에 앱용 키가 없다 — 단추는 보이지만 눌러도 닫힌 답이 온다. 시험하는 사람이 바로 알게 한 줄 적는다
    const nativeMissing = view.kind === "on" && !view.native && kakaoNativeAvailable();
    // 휴대폰 브라우저에서 켰다 — 같은 기기의 앱(웹뷰는 쿠키·저장소가 따로다)에도 같은 열쇠로 켤 수 있게 앱을 여는 주소를 준다
    const appUrl = view.kind === "on" && onPhoneBrowser() ? kakaoPreviewAppUrl(view.key) : null;

    return (
        <div className="min-h-[100dvh] bg-surface-0 flex flex-col items-center justify-center px-5 font-sans">
            <div className="w-full max-w-[380px] rk-card p-7 flex flex-col items-center text-center">
                <div className="text-brand font-bold text-2xl">RANKUE</div>
                <h1 className="text-[19px] font-bold text-ink-1 mt-5 break-keep">
                    {t(view.kind === "on" ? "kakaoPreview.onTitle" : "kakaoPreview.offTitle")}
                </h1>
                {view.kind === "on" && (
                    <p className="text-[13.5px] text-black/55 mt-2 leading-relaxed break-keep">{t("kakaoPreview.onDesc")}</p>
                )}
                {nativeMissing && (
                    <p role="alert" className="text-[12.5px] font-medium text-red-500 mt-3 leading-relaxed break-keep">{t("kakaoPreview.nativeMissing")}</p>
                )}
                <button
                    type="button"
                    onClick={() => setLocation("/?login=1", { replace: true })}
                    className="w-full mt-6 h-[52px] rounded-tile bg-brand text-brand-fg text-[15px] font-bold active:scale-[0.98] transition-transform"
                >
                    {t("kakao.toLogin")}
                </button>
                {appUrl && (
                    <a
                        href={appUrl}
                        className="mt-4 text-[12.5px] font-medium text-black/45 hover:text-brand transition-colors underline underline-offset-4"
                    >
                        {t("kakaoPreview.openApp")}
                    </a>
                )}
            </div>
        </div>
    );
}
