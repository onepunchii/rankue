/**
 * 설정 › 연결된 로그인 › Google 줄 아래의 연결·해제 칸.
 * 2026-10-07 오너: "휴대폰 로그인 사용자를 카카오나 구글 로그인으로 통합" — 전화번호 회원이 내 계정에 구글을 붙여 두면 구글로도 같은 계정에 들어온다.
 *
 * 본인 확인은 카카오 연결과 같다: 로그인 PIN. 서버(POST·DELETE /api/hiq/social/google/link)가 PIN 을 구글 토큰 검증보다 먼저 본다.
 *  - 연결(웹): PIN 을 넣으면 공식 구글 단추(GIS)가 열린다 → 구글이 준 토큰과 PIN 을 같이 보낸다.
 *  - 연결(앱): PIN 을 넣고 '연결' → 네이티브 구글 로그인(lib/nativeSignIn) → 같은 요청.
 *  - 해제: PIN 을 넣고 '해제'.
 * PIN 은 화면 상태에만 있고 보낸 뒤 지운다. 구글 단추(GIS)는 전역 하나라, 이 칸이 떠 있는 동안 다른 구글 단추(가입 팝업)와 같이 뜨지 않는다
 * — 설정은 로그인한 사람의 화면이라 가입 팝업이 열리지 않는다.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { LucideLoader2 } from "@/lib/icons";
import { isNativeApp } from "@/lib/nativeBridge";
import { nativeSocialAvailable, nativeSocialIdToken } from "@/lib/nativeSignIn";
import { ApiError, apiRequest, queryClient } from "@/lib/queryClient";

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

/** 이 기기에서 구글을 연결할 수 있는가 — 앱은 네이티브 플러그인, 웹은 구글 키. */
export function googleLinkAvailable(): boolean {
    return isNativeApp() ? nativeSocialAvailable() : !!GOOGLE_CLIENT_ID;
}

export default function GoogleLinkPanel({ mode, onClose }: { mode: "link" | "unlink"; onClose: () => void }) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const inApp = isNativeApp();
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const gisRef = useRef<HTMLDivElement>(null);
    const [gisReady, setGisReady] = useState(false);
    const live = useRef({ pin, busy });
    live.current = { pin, busy };
    const ready = pin.length >= 4;

    const finish = useCallback((title: string) => {
        void queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
        toast({ title });
        onClose();
    }, [toast, onClose]);

    const fail = useCallback((e: unknown, fallback: string) => {
        setError(e instanceof ApiError && e.message ? e.message : fallback);
        setPin("");
    }, []);

    /** 구글이 준 토큰과 PIN 을 같이 보낸다. */
    const link = useCallback(async (idToken: string) => {
        if (live.current.busy) return;
        setBusy(true);
        setError(null);
        try {
            await apiRequest("/api/hiq/social/google/link", { method: "POST", body: { idToken, pin: live.current.pin } });
            finish(t("link.linked").replace("{provider}", "Google"));
        } catch (e) {
            fail(e, t("link.failed"));
        } finally {
            setBusy(false);
        }
    }, [finish, fail, t]);

    // 구글 단추(GIS)의 콜백은 한 번만 건다 — 늘 최신 link 를 부르게 ref 로 읽는다(부모가 다시 그려져도 단추가 흔들리지 않게)
    const linkRef = useRef(link);
    linkRef.current = link;

    const linkNative = async () => {
        if (busy || !ready) return;
        setError(null);
        try {
            const idToken = await nativeSocialIdToken("google");
            if (!idToken) return; // 사용자가 취소했다
            await link(idToken);
        } catch (e) {
            console.error("[google-link] native sign-in failed:", e);
            setError(t("link.failed"));
        }
    };

    const unlink = async () => {
        if (busy || !ready) return;
        setBusy(true);
        setError(null);
        try {
            await apiRequest("/api/hiq/social/google/link", { method: "DELETE", body: { pin } });
            finish(t("link.unlinked").replace("{provider}", "Google"));
        } catch (e) {
            fail(e, t("link.unlinkFailed"));
        } finally {
            setBusy(false);
        }
    };

    // 웹 연결: 공식 구글 단추(GIS). 누르는 것은 PIN 을 넣은 뒤에만 받는다(아래에서 덮어 둔다)
    useEffect(() => {
        if (mode !== "link" || inApp || !GOOGLE_CLIENT_ID) return;
        const id = "google-gsi";
        const init = () => {
            if (!window.google || !gisRef.current) return;
            window.google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: (r) => { if (r.credential) void linkRef.current(r.credential); },
            });
            const width = Math.max(200, Math.min(400, Math.round(gisRef.current.parentElement?.getBoundingClientRect().width ?? 320)));
            window.google.accounts.id.renderButton(gisRef.current, { theme: "outline", size: "large", shape: "rectangular", width, text: "continue_with", locale });
            setGisReady(true);
        };
        if (document.getElementById(id)) { init(); return; }
        const s = document.createElement("script");
        s.id = id; s.src = "https://accounts.google.com/gsi/client"; s.async = true;
        s.onload = init;
        document.head.appendChild(s);
    }, [mode, inApp, locale]);

    const webLink = mode === "link" && !inApp;
    return (
        <form
            onSubmit={(e) => { e.preventDefault(); if (mode === "unlink") void unlink(); else if (inApp) void linkNative(); }}
            className="mt-2 px-1"
        >
            <p className="text-[12px] text-black/55 mb-2 break-keep">{t(mode === "unlink" ? "link.unlinkPinDesc" : webLink ? "link.pinThenGoogle" : "link.pinDesc")}</p>
            <div className="flex items-center gap-2">
                <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    autoComplete="current-password"
                    autoFocus
                    aria-label={t("login.pinPlaceholder")}
                    placeholder={t("login.pinPlaceholder")}
                    value={pin}
                    onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setError(null); }}
                    className="flex-1 min-w-0 h-12 px-4 bg-black/[0.04] rounded-tile outline-none text-[15px] font-semibold tabular-nums"
                />
                {!webLink && (
                    <button
                        type="submit"
                        disabled={busy || !ready}
                        aria-busy={busy}
                        className={`h-12 px-4 shrink-0 rounded-tile text-[13.5px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform ${mode === "unlink" ? "bg-black/[0.08] text-ink-1" : "bg-brand text-brand-fg"}`}
                    >
                        {busy ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : t(mode === "unlink" ? "settings.disconnect" : "settings.connect")}
                    </button>
                )}
            </div>
            {webLink && (
                // PIN 을 넣기 전·보내는 중에는 구글 단추가 누름을 받지 않는다(흐리게)
                <div className={`mt-2 h-[44px] flex items-center justify-center relative ${ready && !busy ? "" : "opacity-40 pointer-events-none"}`} aria-hidden={!ready}>
                    {/* GIS가 이 컨테이너 내부 DOM을 직접 소유 — React 자식을 절대 넣지 말 것(removeChild 충돌) */}
                    <div ref={gisRef} />
                    {!gisReady && <div className="absolute inset-0 rounded-tile bg-black/[0.04] animate-pulse pointer-events-none" />}
                </div>
            )}
            {error && <p role="alert" className="text-[12.5px] font-medium text-red-500 mt-2 break-keep">{error}</p>}
            <button
                type="button"
                onClick={onClose}
                className="mt-1 h-11 text-[12.5px] font-medium text-black/45 underline underline-offset-4 active:opacity-70"
            >
                {t("common.cancel")}
            </button>
        </form>
    );
}
