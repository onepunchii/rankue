/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { useT } from "@/lib/i18n";
import { isTermsAccepted, TERMS_REQUIRED_CODE, TERMS_VERSION } from "@shared/terms";
import { TERMS_CONTENT, termsLang } from "@shared/termsContent";
import { TermsBody } from "./TermsBody";

// 이용약관 동의 시트(감사 S4 — App Store 1.2 · Play UGC: UGC 를 올리기 전에 약관 동의).
//
// 언제 뜨는가
//  - "ugc":    약관에 아직 동의하지 않은 회원이 글·댓글·사진·채팅·크루 만들기를 처음 하려는 순간(gate). 동의하면
//              하려던 동작을 그대로 이어서 한다 — 다시 누르게 하지 않는다.
//  - "signup": 구글·애플 첫 로그인 직후(SocialLogin). 소셜 가입은 동의 화면 없이 계정이 생기므로 들어가기 전에 받는다.
//  - "retry":  화면은 동의했다고 알았는데 서버가 TERMS_REQUIRED 로 거절했을 때(다른 기기·옛 캐시). 어떤 작업이었는지
//              모르니 동의 뒤 "다시 해 주세요"만 안내한다.
// 동의 기록은 서버(POST /api/hiq/me/terms)에 남고, 서버도 UGC 작성 라우트에서 같은 규칙으로 막는다(server/middleware/terms.ts).

type ConsentMode = "ugc" | "signup" | "retry";

interface TermsGate {
    /** 로그인했고 지금 약관에 동의하지 않은 상태 */
    needsConsent: boolean;
    /** 동의돼 있으면 action 을 바로 실행, 아니면 시트를 띄우고 동의한 뒤 실행한다. */
    gate: (action: () => void) => void;
    /** 시트를 띄우고 동의 여부를 돌려준다. 파일 선택처럼 사용자 탭 안에서만 되는 동작은 gate 대신 이걸로 먼저 묻는다. */
    ask: (mode?: ConsentMode) => Promise<boolean>;
}

// 공급자 밖(테스트·단독 렌더)에서는 막지 않는다 — 서버 문지기가 최종 방어선이다.
const TermsGateContext = createContext<TermsGate>({
    needsConsent: false,
    gate: (action) => action(),
    ask: async () => true,
});

export const useTermsGate = () => useContext(TermsGateContext);

const RULE_KEYS = ["terms.rule1", "terms.rule2", "terms.rule3"] as const;

export function TermsConsentProvider({ children }: { children: ReactNode }) {
    const { t, locale } = useT();
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const { member } = useAuth();
    // 비로그인은 묻지 않는다 — 서버가 401 로 막고, 기존 로그인 안내 동선이 맡는다.
    const needsConsent = !!member && !isTermsAccepted(member.termsVersion);

    const [mode, setMode] = useState<ConsentMode | null>(null);
    const [showFull, setShowFull] = useState(false);
    const resolverRef = useRef<((ok: boolean) => void) | null>(null);

    const settle = useCallback((ok: boolean) => {
        const resolve = resolverRef.current;
        resolverRef.current = null;
        setMode(null);
        setShowFull(false);
        resolve?.(ok);
    }, []);

    const ask = useCallback((next: ConsentMode = "ugc") => new Promise<boolean>((resolve) => {
        // 이미 열려 있으면 앞의 요청은 '취소'로 끝낸다 — 두 곳이 한 시트를 동시에 기다리지 않게
        resolverRef.current?.(false);
        resolverRef.current = resolve;
        setShowFull(false);
        setMode(next);
    }), []);

    const gate = useCallback((action: () => void) => {
        if (!needsConsent) {
            action();
            return;
        }
        void ask("ugc").then((ok) => { if (ok) action(); });
    }, [needsConsent, ask]);

    const acceptMutation = useMutation({
        mutationFn: async () => apiRequest("/api/hiq/me/terms", { method: "POST", body: { version: TERMS_VERSION } }),
        onSuccess: () => {
            // 다음 글쓰기부터는 시트 없이 바로 — 내 정보 캐시에 동의를 반영한다
            queryClient.setQueryData(["/api/hiq/me"], (prev: unknown) =>
                prev && typeof prev === "object" ? { ...(prev as object), termsVersion: TERMS_VERSION } : prev);
            if (mode === "retry") toast({ title: t("terms.accepted"), description: t("terms.retryDesc") });
            settle(true);
        },
        onError: (e: any) => toast({ title: t("terms.acceptFailed"), description: e?.message, variant: "destructive" }),
    });

    // 안전망: 서버가 TERMS_REQUIRED 로 거절한 요청을 보면 시트를 띄운다. 모든 UGC 작성은 useMutation 을 거치므로
    // 호출하는 곳마다 오류 처리를 붙이지 않고 여기 한 곳에서 잡는다.
    useEffect(() => {
        return queryClient.getMutationCache().subscribe((event) => {
            if (event.type !== "updated" || event.action.type !== "error") return;
            const err = event.action.error as { data?: { code?: string } } | null;
            if (err?.data?.code !== TERMS_REQUIRED_CODE) return;
            // 화면 캐시가 틀렸다(다른 기기에서 개정 등) — 내 정보를 새로 받아 needsConsent 를 바로잡는다
            void queryClient.invalidateQueries({ queryKey: ["/api/hiq/me"] });
            if (!resolverRef.current) void ask("retry");
        });
    }, [queryClient, ask]);

    const value = useMemo<TermsGate>(() => ({ needsConsent, gate, ask }), [needsConsent, gate, ask]);
    const doc = TERMS_CONTENT[termsLang(locale)];
    const busy = acceptMutation.isPending;

    return (
        <TermsGateContext.Provider value={value}>
            {children}
            <Dialog open={mode !== null} onOpenChange={(open) => { if (!open && !busy) settle(false); }}>
                <DialogContent
                    className="bg-white text-ink-1 max-w-md w-[92%] max-h-[88dvh] overflow-y-auto rounded-[28px] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
                    // 소셜 첫 로그인(signup)에서 닫기는 곧 '동의하지 않음'이라 로그아웃된다 — 바깥 탭·뒤로가기(ESC)
                    // 한 번에 방금 한 로그인을 잃지 않게, 이 모드는 두 버튼으로만 닫는다.
                    onInteractOutside={(e) => { if (mode === "signup") e.preventDefault(); }}
                    onEscapeKeyDown={(e) => { if (mode === "signup") e.preventDefault(); }}
                >
                    <DialogHeader className="text-left mb-1">
                        <DialogTitle className="text-[19px] font-bold text-ink-1">{t("terms.sheetTitle")}</DialogTitle>
                        <DialogDescription className="text-[12.5px] font-medium text-black/55">
                            {t(mode === "signup" ? "terms.signupDesc" : "terms.sheetDesc")}
                        </DialogDescription>
                    </DialogHeader>

                    <ul className="mt-2 space-y-2.5 rounded-2xl bg-black/[0.03] p-4">
                        {RULE_KEYS.map((key) => (
                            <li key={key} className="flex gap-2.5 text-[13px] font-medium leading-relaxed text-black/70">
                                <span aria-hidden className="mt-[8px] h-1 w-1 shrink-0 rounded-full bg-black/40" />
                                <span>{t(key)}</span>
                            </li>
                        ))}
                    </ul>

                    <button
                        type="button"
                        onClick={() => setShowFull((v) => !v)}
                        className="mt-3 self-start text-[13px] font-semibold text-brand"
                        aria-expanded={showFull}
                    >
                        {showFull ? t("terms.hideFull") : t("terms.viewFull")}
                    </button>
                    {showFull && (
                        <div className="mt-2 max-h-[36dvh] overflow-y-auto rounded-2xl border border-black/[0.06] px-4 pb-4">
                            <TermsBody doc={doc} compact />
                        </div>
                    )}

                    <p className="mt-4 text-[12.5px] font-medium leading-relaxed text-black/55">
                        {t("terms.agreeStatement")}{" "}
                        {/* 새 창으로 연다 — 같은 창에서 이동하면 하려던 글쓰기가 사라진다 */}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" className="underline">{t("terms.privacyLink")}</a>
                    </p>

                    <button
                        disabled={busy}
                        onClick={() => acceptMutation.mutate()}
                        className="mt-3 w-full h-12 rounded-full bg-brand text-white text-[15px] font-bold disabled:opacity-40 active:scale-[0.98] transition-transform"
                    >
                        {busy ? t("common.loading") : t("terms.agree")}
                    </button>
                    <button
                        disabled={busy}
                        onClick={() => settle(false)}
                        className="w-full h-11 rounded-full text-[13.5px] font-semibold text-black/50 hover:bg-black/[0.04] transition-colors"
                    >
                        {t(mode === "signup" ? "terms.decline" : "terms.later")}
                    </button>
                </DialogContent>
            </Dialog>
        </TermsGateContext.Provider>
    );
}
