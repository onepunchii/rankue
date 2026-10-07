import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { ApiError, apiRequest, queryClient, refreshAfterLogin } from "@/lib/queryClient";
import { offerAttachPhone } from "@/components/hiq/AttachPhoneSheet";
import { loginPagePath } from "@/components/hiq/LoginSheet";
import { joinStoreSlug } from "@/lib/joinStore";
import { takeKakaoPending } from "@/lib/kakaoLogin";
import { KAKAO_REDIRECT_PATH, checkKakaoReturn, kakaoRedirectUri, type KakaoMode } from "@shared/kakaoLogin";
import { safeReturnPath } from "@shared/promoFunnel";
import { isTermsAccepted } from "@shared/terms";

// 카카오 로그인에서 돌아오는 화면(/auth/kakao) — 카카오가 ?code=…&state=… 를 붙여 여기로 보낸다.
// (2026-10-05 오너: "카카오도 오픈 — 한국은 카카오·구글, 다른 나라는 구글·애플")
//
// 여기서 지키는 것
//  - 내가 보낸 요청인지 확인한다: 카카오로 떠나기 전에 남긴 꾸러미(lib/kakaoLogin)의 state 와 주소의 state 가 같고 10분 안일 때만
//    서버를 부른다. 이 검사가 남의 인가 코드를 내 브라우저에 밀어 넣는 공격(로그인 CSRF·'연결' 가로채기)을 막는 유일한 문이다.
//    그래서 로그인인지 연결인지(mode)는 **주소가 아니라 꾸러미에서만** 읽는다 — 주소는 남이 만들 수 있다.
//  - 로그인은 서버를 **한 번만** 부른다: 인가 코드는 한 번밖에 못 쓴다(두 번째는 카카오가 거절해 401 이 나고 실패 횟수도 오른다).
//  - 연결은 서버를 부르기 전에 **로그인 PIN 을 묻는다**(2026-10-05 검토): 쿠키만 쥔 사람이 남의 계정에 자기 카카오를 붙이지 못하게
//    서버가 PIN 으로 본인을 확인한다. 서버는 PIN 을 카카오보다 먼저 보므로 PIN 이 틀리면 인가 코드는 쓰이지 않는다 —
//    그때만 같은 코드로 다시 보낼 수 있다. 그 밖의 답(성공·다른 실패)이 오면 코드는 끝난 것으로 보고 더 부르지 않는다.
//  - 로그인에 성공하면 '나'를 새로 받은 **뒤에** 화면을 옮긴다(queryClient.refreshAfterLogin).

/** 어떤 이유로 못 끝냈나 — 화면 문구를 고른다. server 는 서버가 만든 문구가 있으면 그대로 보여 준다. */
type FailWhy = "no-pending" | "state" | "expired" | "kakao" | "server";

type Failed = { kind: "failed"; mode: KakaoMode | null; back: string | null; why: FailWhy; message: string | null; needsLogin: boolean };

type Outcome =
    | { kind: "stray" }
    | { kind: "cancelled"; mode: KakaoMode | null; back: string | null }
    | { kind: "signed-in"; back: string | null; termsVersion: unknown; redirectTo: unknown; isNew: boolean }
    | { kind: "need-pin"; code: string; back: string | null }
    | Failed;

/** 연결 요청 한 번의 결과. wrong-pin 만 같은 코드로 다시 보낼 수 있다(서버가 카카오를 부르기 전에 거절했다). */
type LinkResult = { kind: "linked" } | { kind: "wrong-pin"; message: string | null } | Failed;

// 이 문서(페이지 로드)에서 돌아온 주소를 처리한 결과. 카카오에서 돌아올 때마다 문서가 새로 뜨므로 문서당 한 번이면 된다.
// 모듈 변수에 두는 이유: 화면이 두 번 그려지거나(React StrictMode) 다시 붙어도 같은 약속을 기다릴 뿐, 서버를 또 부르지 않는다.
let flight: Promise<Outcome> | null = null;

function settleKakaoReturn(): Promise<Outcome> {
    flight ??= readAndExchange();
    return flight;
}

/**
 * 서버가 **만든** 오류 문구만 꺼낸다(2026-10-05 검토). 우리 서버의 오류는 전부 { success:false, message } 꼴이다.
 * 그 밖의 본문은 플랫폼이 낸 것이다 — 함수 시간 초과·죽음의 영어 원문, 서비스 워커가 끊긴 요청 대신 지어내는
 * 가짜 404("Network Unavailable"), "HTTP 500" 같은 대체 글자. 그런 것은 문구로 믿지 않고 null 을 돌려
 * 화면이 우리 문구("연결에 실패했습니다")를 쓰게 한다.
 */
function serverMessageOf(api: ApiError | null): string | null {
    const data = api?.data;
    return data?.success === false && typeof data.message === "string" && data.message ? data.message : null;
}

/** 서버 호출이 실패했을 때의 결과. */
function failedFrom(err: unknown, mode: KakaoMode, back: string | null): Failed {
    console.error("[kakao] exchange failed:", err);
    const api = err instanceof ApiError ? err : null;
    return {
        kind: "failed", mode, back, why: "server",
        message: serverMessageOf(api),
        // 연결하려는데 로그인이 풀려 있었다(401 인데 code 가 없다 — 교환·PIN 실패의 401 은 code 가 있다)
        needsLogin: mode === "link" && api?.status === 401 && !api.data?.code,
    };
}

async function readAndExchange(): Promise<Outcome> {
    const query = new URLSearchParams(window.location.search);
    const code = query.get("code");
    const stateFromUrl = query.get("state");
    const error = query.get("error");

    // 꾸러미는 결과와 무관하게 여기서 꺼내며 지운다(한 번만 쓴다) — 서버를 부르기 **전**이다.
    // 부르는 동안 '뒤로' 갔다가 카카오가 새 코드로 다시 보내도 꾸러미가 없어 서버를 또 부르지 않는다.
    const pending = takeKakaoPending();
    // 주소에서 code·state 를 지운다 — 새로고침으로 같은 코드를 다시 보내지 않게, 주소창·기록에도 남지 않게.
    try { window.history.replaceState(window.history.state, "", KAKAO_REDIRECT_PATH); } catch { /* 기록을 못 고치는 환경 */ }

    // 아래 두 값은 '어디로 돌려보낼지'에만 쓴다(서버를 부를지는 check 가 정한다)
    const mode = pending?.mode ?? null;
    const back = pending?.redirect ?? null;
    const fail = (why: FailWhy): Outcome => ({ kind: "failed", mode, back, why, message: null, needsLogin: false });

    if (error) {
        // 동의 화면에서 '취소'를 누른 것 — 실패가 아니다. 왔던 곳으로 조용히 돌려보낸다.
        return error === "access_denied" ? { kind: "cancelled", mode, back } : fail("kakao");
    }
    // 코드도 오류도 없다 — 카카오에서 온 것이 아니라 이 주소만 연 것이다(위에서 code 를 지운 뒤의 새로고침이 대표적).
    // 처리할 것이 없으니 실패라고 말하지 않고 제자리(로그인돼 있으면 홈, 아니면 로그인 화면)로 보낸다.
    if (!code) return { kind: "stray" };
    const check = checkKakaoReturn(pending, stateFromUrl, Date.now());
    if (!check.ok) return fail(check.reason === "no-pending" ? "no-pending" : check.reason === "expired" ? "expired" : "state");

    // 연결은 여기서 서버를 부르지 않는다 — 화면이 PIN 을 받은 뒤 linkWithPin 이 부른다. 코드는 주소에서 지웠고 메모리에만 있다.
    if (check.mode === "link") return { kind: "need-pin", code, back: check.redirect };

    try {
        // 인가 요청 때와 **같은 글자**의 Redirect URI 를 보낸다(다르면 카카오가 KOE006 으로 거절한다)
        // joinStore — 매장 QR 로 온 기기면 그 매장(shared/joinStore). 표시는 기기 저장소에 있어 카카오에 다녀와도 남아 있다
        const data = await apiRequest("/api/hiq/social/kakao", { method: "POST", body: { code, redirectUri: kakaoRedirectUri(window.location.origin), joinStore: joinStoreSlug() } });
        return { kind: "signed-in", back: check.redirect, termsVersion: data?.member?.termsVersion, redirectTo: data?.redirectTo, isNew: data?.isNew === true };
    } catch (err) {
        return failedFrom(err, "login", check.redirect);
    }
}

/** 내 계정에 카카오를 붙인다 — 인가 코드와 로그인 PIN 을 같이 보낸다. PIN 은 이 요청에만 쓰고 어디에도 남기지 않는다. */
async function linkWithPin(code: string, pin: string, back: string | null): Promise<LinkResult> {
    try {
        await apiRequest("/api/hiq/social/kakao/link", { method: "POST", body: { code, redirectUri: kakaoRedirectUri(window.location.origin), pin } });
        return { kind: "linked" };
    } catch (err) {
        const api = err instanceof ApiError ? err : null;
        // PIN 만 틀렸다 — 서버가 카카오를 부르기 전에 거절해 코드는 그대로다. 같은 화면에서 다시 입력받는다.
        if (api?.status === 401 && api.data?.code === "KAKAO_PIN_WRONG") return { kind: "wrong-pin", message: serverMessageOf(api) };
        return failedFrom(err, "link", back);
    }
}

/**
 * 다시 로그인하러 보낼 주소 — 전체 로그인 화면이 아니라 **예시 홈 위의 가입·로그인 팝업**(2026-10-07 오너: "팝업이 기본이 되게").
 * 끝나면 back 으로 돌아간다(우리 사이트 안의 경로만 — 호스트가 다시 거른다). 없으면 홈.
 */
function loginPath(back: string | null): string {
    return loginPagePath(safeReturnPath(back) ?? "/dashboard");
}

/** 못 끝냈을 때 그리는 것. 문구는 키로 들고 있다가 그릴 때 옮긴다 — 언어 사전이 늦게 실려도 그 언어로 바뀐다. */
type FailView = { titleKey: string; messageKey: string; serverMessage: string | null; to: string; labelKey: string };

/** 못 끝낸 결과 → 이유 한 줄과 돌아갈 단추. */
function failViewOf(out: Failed): FailView {
    const linking = out.mode === "link";
    // 연결하다 실패했으면 설정으로(로그인이 풀려 있었으면 로그인부터 — 끝나면 설정으로 돌아온다), 그 밖에는 로그인 화면으로.
    // 이미 로그인된 사람이 로그인 화면에 가면 landing 이 보던 곳이나 홈으로 넘겨 준다.
    const toSettings = linking && !out.needsLogin;
    return {
        titleKey: linking ? "kakao.linkFailTitle" : "kakao.failTitle",
        messageKey: out.why === "no-pending" ? "kakao.failNoPending"
            : out.why === "expired" ? "kakao.failExpired"
            : out.why === "kakao" ? "kakao.failKakao"
            : out.why === "state" ? "kakao.failState"
            : "login.connectionFailed",
        serverMessage: out.why === "server" ? out.message : null,
        to: toSettings ? "/settings" : loginPath(linking ? "/settings" : out.back),
        labelKey: toSettings ? "kakao.toSettings" : "kakao.toLogin",
    };
}

export default function KakaoCallback() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const { t } = useT();
    const { ask: askTerms } = useTermsGate();
    const [failView, setFailView] = useState<FailView | null>(null);
    // 연결(link)에서 돌아왔다 — PIN 을 받을 차례. 코드는 여기(메모리)에만 있다.
    const [pinAsk, setPinAsk] = useState<{ code: string; back: string | null } | null>(null);
    const [pin, setPin] = useState("");
    const [pinError, setPinError] = useState<string | null>(null);
    const [pinBusy, setPinBusy] = useState(false);
    const pinLock = useRef(false);

    // 아래 효과는 화면이 붙을 때 한 번만 돈다 — 그 안에서 쓰는 함수들은 늘 최신 것을 읽게 ref 로 건넨다
    const live = useRef({ setLocation, toast, t, askTerms });
    live.current = { setLocation, toast, t, askTerms };
    const handled = useRef(false);
    const go = (to: string) => live.current.setLocation(to, { replace: true });

    useEffect(() => {
        let alive = true;
        void settleKakaoReturn().then(async (out) => {
            // StrictMode 는 효과를 두 번 돌린다 — 살아 있는 쪽 하나만 결과를 처리한다
            if (!alive || handled.current) return;
            handled.current = true;
            // 지금 로그인돼 있는가 — 서버에 '나'를 물어본다(비로그인이면 null 이 온다)
            const signedInNow = () => queryClient.fetchQuery({ queryKey: ["/api/hiq/me"], staleTime: 0 }).then(Boolean).catch(() => false);

            if (out.kind === "stray") {
                // 방금 로그인을 마치고 새로고침한 사람일 수 있다 — 로그인돼 있으면 홈, 아니면 로그인 화면
                go(await signedInNow() ? "/dashboard" : loginPath(null));
                return;
            }

            if (out.kind === "cancelled") {
                go(out.mode === "link" ? "/settings" : loginPath(out.back));
                return;
            }

            if (out.kind === "need-pin") {
                // 서버는 아직 부르지 않았다 — PIN 을 받고 나서(submitPin) 부른다
                setPinAsk({ code: out.code, back: out.back });
                return;
            }

            if (out.kind === "signed-in") {
                // 약관 동의(감사 S4) — 소셜 첫 로그인은 동의 화면 없이 계정이 생긴다. SocialLogin 과 같은 규칙:
                // 들어가기 전에 받고, 거절하면 동의 없이 쓰는 상태를 남기지 않는다.
                if (!isTermsAccepted(out.termsVersion)) {
                    const agreed = await live.current.askTerms("signup");
                    if (!agreed) {
                        // 방금 이 로그인으로 **새로 만들어진** 계정이면 지운다(2026-10-05 검토). 남겨 두면 이 카카오 계정을 쥔 빈 계정이 되어,
                        // 전화번호로 가입해 둔 사람이 나중에 설정에서 카카오를 연결하려 할 때 "이미 다른 계정에 연결됨"으로 막힌다.
                        // 삭제는 서버가 쿠키도 같이 치운다. 원래 있던 계정이거나 삭제에 실패하면 예전처럼 로그아웃만 한다(다음 로그인 때 다시 묻는다).
                        const removed = out.isNew
                            ? await apiRequest("/api/hiq/me", { method: "DELETE" }).then(() => true).catch(() => false)
                            : false;
                        if (!removed) await apiRequest("/api/hiq/logout", { method: "POST" }).catch(() => undefined);
                        queryClient.removeQueries({ queryKey: ["/api/hiq/me"] });
                        live.current.toast({ title: live.current.t("terms.declinedTitle"), description: live.current.t("terms.declinedDesc") });
                        go(loginPath(out.back));
                        return;
                    }
                }
                // '나'를 새로 받은 뒤에 옮긴다 — 안 그러면 돌아간 화면이 비로그인으로 그려진다(queryClient.refreshAfterLogin)
                await refreshAfterLogin();
                // 방금 카카오로 새 계정이 만들어졌다 — 전에 전화번호로 쓰던 사람이면 그 계정에 잇게 한 번 묻는다(옮겨 간 화면 위에 뜬다)
                if (out.isNew) offerAttachPhone();
                // 로그인 화면에 실려 왔던 ?redirect= (카카오에 다녀오는 동안 꾸러미가 들고 있었다) → 서버가 준 곳 → 홈
                const dest = safeReturnPath(out.back) ?? safeReturnPath(out.redirectTo) ?? "/dashboard";
                go(dest);
                return;
            }

            // 꾸러미가 없는데 이미 로그인돼 있다 — 로그인을 마친 뒤 '뒤로'를 눌러 카카오가 이 주소로 다시 보낸 경우가 대부분이다
            // (새 코드가 붙어 오지만 꾸러미는 이미 썼다). 그 코드는 쓰지 않고, 실패라고 말하지도 않고 홈으로 보낸다.
            if (out.why === "no-pending" && await signedInNow()) {
                go("/dashboard");
                return;
            }

            // 여기까지 왔으면 못 끝낸 것이다 — 이유 한 줄과 돌아갈 단추를 보여 준다
            setFailView(failViewOf(out));
        }).catch((err) => {
            // 처리하다 뜻밖에 넘어졌을 때 진행 막대만 도는 화면에 가두지 않는다
            console.error("[kakao] return handling failed:", err);
            if (alive) setFailView({ titleKey: "kakao.failTitle", messageKey: "kakao.failState", serverMessage: null, to: loginPath(null), labelKey: "kakao.toLogin" });
        });
        return () => { alive = false; };
    }, []);

    // 연결: PIN 을 받아 서버를 부른다. 두 번 누름은 ref 로 막는다(상태는 다음 그림에야 바뀐다).
    const submitPin = async (e: FormEvent) => {
        e.preventDefault();
        if (!pinAsk || pinLock.current || pin.length < 4) return;
        pinLock.current = true;
        setPinBusy(true);
        setPinError(null);
        const result = await linkWithPin(pinAsk.code, pin, pinAsk.back);
        if (result.kind === "linked") {
            // '나'를 새로 받아 설정의 '연결된 로그인'이 바로 바뀌어 보이게 한다
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] }).catch(() => undefined);
            toast({ title: t("kakao.linked") });
            go(safeReturnPath(pinAsk.back) ?? "/settings");
            return;
        }
        pinLock.current = false;
        setPinBusy(false);
        setPin("");
        if (result.kind === "wrong-pin") {
            // 코드는 아직 쓰이지 않았다 — 같은 화면에서 다시 입력받는다
            setPinError(result.message ?? t("kakao.pinWrong"));
            return;
        }
        // 그 밖의 실패 — 인가 코드는 끝났다고 보고 PIN 화면을 닫는다(다시 보내지 않는다)
        setPinAsk(null);
        setFailView(failViewOf(result));
    };

    if (failView) {
        return (
            <div className="min-h-[100dvh] bg-surface-0 flex flex-col items-center justify-center px-5 font-sans">
                <div className="w-full max-w-[380px] rk-card p-7 flex flex-col items-center text-center">
                    <div className="text-brand font-bold text-2xl">RANKUE</div>
                    <h1 className="text-[19px] font-bold text-ink-1 mt-5">{t(failView.titleKey)}</h1>
                    {/* 서버가 만든 문구(이미 다른 계정에 연결됨 등)가 있으면 그대로, 없으면 이유에 맞는 우리 문구 */}
                    <p role="alert" className="text-[13.5px] text-black/55 mt-2 leading-relaxed break-keep">{failView.serverMessage || t(failView.messageKey)}</p>
                    <button
                        type="button"
                        onClick={() => setLocation(failView.to, { replace: true })}
                        className="w-full mt-6 h-[52px] rounded-tile bg-brand text-brand-fg text-[15px] font-bold active:scale-[0.98] transition-transform"
                    >
                        {t(failView.labelKey)}
                    </button>
                </div>
            </div>
        );
    }

    if (pinAsk) {
        return (
            <div className="min-h-[100dvh] bg-surface-0 flex flex-col items-center justify-center px-5 font-sans">
                <form onSubmit={submitPin} className="w-full max-w-[380px] rk-card p-7 flex flex-col items-center text-center">
                    <div className="text-brand font-bold text-2xl">RANKUE</div>
                    <h1 className="text-[19px] font-bold text-ink-1 mt-5">{t("kakao.pinTitle")}</h1>
                    <p className="text-[13.5px] text-black/55 mt-2 leading-relaxed break-keep">{t("kakao.pinDesc")}</p>
                    <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="current-password"
                        autoFocus
                        aria-label={t("login.pinPlaceholder")}
                        placeholder={t("login.pinPlaceholder")}
                        value={pin}
                        onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setPinError(null); }}
                        className="w-full h-[54px] mt-5 rounded-tile bg-black/[0.03] border border-black/[0.09] focus:border-brand focus:bg-white text-center text-[19px] font-semibold tabular-nums text-ink-1 placeholder:text-black/35 placeholder:font-medium transition-colors outline-none"
                    />
                    {pinError && <p role="alert" className="text-[12.5px] font-medium text-red-500 mt-2.5 break-keep">{pinError}</p>}
                    <button
                        type="submit"
                        disabled={pin.length < 4 || pinBusy}
                        aria-busy={pinBusy}
                        className="w-full mt-4 h-[52px] rounded-tile bg-brand text-brand-fg text-[15px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                    >
                        {t("kakao.pinSubmit")}
                    </button>
                    <button
                        type="button"
                        onClick={() => go("/settings")}
                        className="mt-4 text-[12.5px] font-medium text-black/45 hover:text-brand transition-colors underline underline-offset-4"
                    >
                        {t("common.cancel")}
                    </button>
                </form>
            </div>
        );
    }

    // 확인하는 동안 — 로그인 화면(landing)의 스플래시와 같은 그림. 약관 동의 시트는 이 위에 뜬다.
    return (
        <div className="min-h-screen bg-surface-0 flex flex-col items-center justify-center gap-4 font-sans" aria-busy="true">
            <div className="text-brand font-bold text-4xl animate-pulse">RANKUE</div>
            <div className="w-48 h-1 bg-black/[0.06] rounded-full overflow-hidden">
                <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                    className="w-1/2 h-full bg-brand"
                />
            </div>
            <p role="status" className="text-[12.5px] font-medium text-black/55">{t("kakao.working")}</p>
        </div>
    );
}
