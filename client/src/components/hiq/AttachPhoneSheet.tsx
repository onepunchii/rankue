/* eslint-disable react-refresh/only-export-components */
/**
 * 전화번호 계정 잇기 — "전에 전화번호로 쓰셨나요?"
 * 2026-10-07 오너: "휴대폰 로그인 사용자를 카카오나 구글 로그인으로 통합" — 계정은 하나, 들어오는 문이 여럿.
 *
 * 전화번호로 가입해 둔 사람이 연결 없이 '카카오로 시작하기'·'Google로 계속하기'를 누르면 빈 새 계정이 생겨 기록이 갈린다.
 * 그 자리에서 번호와 PIN 을 받아, 방금 들고 온 로그인 수단을 기존 계정으로 옮긴다(서버 POST /api/hiq/social/attach-phone —
 * 빈 계정은 지워지고 쿠키가 기존 계정으로 바뀐다). 다음부터는 그 소셜로 들어와도 기존 계정이다.
 *
 * 쓰는 법
 *   offerAttachPhone()       소셜로 **새 계정이 만들어진 직후** 부른다(SocialLogin · 카카오 복귀 화면). 한국어 화면에서만 뜬다.
 *   openAttachPhoneSheet()   설정 › 연결된 로그인의 '전화번호 계정 잇기'.
 *   useAttachPhonePending()  떠 있거나 곧 뜰 것인가 — 주 종목 묻기(PrimarySportGate)가 이 시트 뒤로 물러선다
 *                            (이으면 계정이 바뀌어, 빈 계정에 주 종목을 물을 이유가 없다).
 *   <AttachPhoneSheetHost /> App 에 한 번.
 *
 * 뜨는 조건은 '나'가 정한다: 소셜로 가입한 계정(전화번호 없음 · PIN 없음)일 때만. 표시(세션 저장소)는 '물어볼 차례'라는 것만 기억한다 —
 * 조건에 맞지 않는 계정에서는 표시를 지우고 아무것도 그리지 않는다.
 * 색: 골프(어두운 화면)면 어두운 시트 — 리터럴 색만. 아니면 밝은 시트 — 디자인 토큰(LoginSheet 와 같은 규칙).
 */
import { useEffect, useState, useSyncExternalStore } from "react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/useAuth";
import { useSport } from "@/contexts/SportContext";
import { useBackToClose } from "@/hooks/useBackToClose";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";
import { LucideLoader2, X } from "@/lib/icons";
import { ApiError, apiRequest, rebindAuthWatchers, refreshAfterLogin } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

/** 세션 저장소의 표시 — 소셜로 새 계정을 만든 직후 '물어볼 차례'. 화면이 통째로 바뀌어도(카카오 복귀) 남는다. */
export const ATTACH_OFFER_KEY = "rankue:attach-offer";

type Source = "signup" | "settings";
interface State { open: boolean; source: Source }
let state: State = { open: false, source: "signup" };
const listeners = new Set<() => void>();
const getState = () => state;
function setState(next: State) {
    state = next;
    listeners.forEach((l) => l());
}
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

function readOffer(): boolean {
    try { return window.sessionStorage.getItem(ATTACH_OFFER_KEY) === "1"; } catch { return false; }
}
function writeOffer(on: boolean) {
    try {
        if (on) window.sessionStorage.setItem(ATTACH_OFFER_KEY, "1");
        else window.sessionStorage.removeItem(ATTACH_OFFER_KEY);
    } catch { /* 저장소를 못 쓰는 환경 — 이번 화면에서만 묻는다 */ }
}

/** 소셜로 새 계정이 만들어진 직후 — 한 번 묻는다. 뜰지는 호스트가 '나'를 보고 정한다. */
export function offerAttachPhone(): void {
    writeOffer(true);
    setState({ open: true, source: "signup" });
}

/** 설정에서 직접 연다. */
export function openAttachPhoneSheet(): void {
    setState({ open: true, source: "settings" });
}

function closeSheet(): void {
    writeOffer(false);
    if (state.open) setState({ open: false, source: state.source });
}

/** 이 시트가 떠 있거나, 새 가입 직후라 곧 뜰 것인가. */
export function useAttachPhonePending(): boolean {
    const s = useSyncExternalStore(subscribe, getState, getState);
    return s.open || readOffer();
}

type Tone = "light" | "dark";
// 클래스는 통째로 적는다 — Tailwind 는 조각을 이어 붙인 이름을 못 찾는다.
const TONE: Record<Tone, { panel: string; grip: string; close: string; title: string; desc: string; input: string; submit: string; skip: string; note: string; error: string }> = {
    light: {
        panel: "bg-surface-1 border-surface-line text-ink-1",
        grip: "bg-surface-line-strong",
        close: "text-ink-3 active:bg-surface-3",
        title: "text-ink-1",
        desc: "text-ink-2",
        input: "bg-surface-0 border border-surface-line text-ink-1 placeholder:text-ink-3",
        submit: "bg-brand text-brand-fg",
        skip: "text-ink-2 active:text-ink-1",
        note: "text-ink-3",
        error: "text-[#D92D20]",
    },
    dark: {
        panel: "bg-[#141414] border-[#FFFFFF1F] text-[#FFFFFF]",
        grip: "bg-[#FFFFFF38]",
        close: "text-[#FFFFFF99] active:bg-[#FFFFFF14]",
        title: "text-[#FFFFFF]",
        desc: "text-[#FFFFFFB3]",
        input: "bg-[#FFFFFF14] border border-[#FFFFFF1F] text-[#FFFFFF] placeholder:text-[#FFFFFF80]",
        submit: "bg-[#64DD17] text-[#0A0A0A]",
        skip: "text-[#FFFFFFCC] active:text-[#FFFFFF]",
        note: "text-[#FFFFFF99]",
        error: "text-[#FF8A80]",
    },
};

const PANEL_ID = "attach-phone-panel";

const dashed = (v: string) => (v.length <= 3 ? v : v.length <= 7 ? `${v.slice(0, 3)}-${v.slice(3)}` : `${v.slice(0, 3)}-${v.slice(3, 7)}-${v.slice(7)}`);

function Panel({ tone, provider, source }: { tone: Tone; provider: string; source: Source }) {
    const { t } = useT();
    const { toast } = useToast();
    const c = TONE[tone];
    const [phone, setPhone] = useState("");
    const [pin, setPin] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const ready = phone.length >= 10 && pin.length >= 4;

    const submit = async () => {
        if (busy || !ready) return;
        setBusy(true);
        setError(null);
        try {
            await apiRequest("/api/hiq/social/attach-phone", { method: "POST", body: { phone, pin } });
            // 쿠키가 기존 계정으로 바뀌었다 — '나'를 새로 받고, 떠 있는 화면들이 새 '나'를 읽게 한다(화면을 옮기지 않는 로그인과 같다)
            await refreshAfterLogin();
            rebindAuthWatchers();
            closeSheet();
            toast({ title: t("attach.done"), description: t("attach.doneDesc").replace("{provider}", provider) });
        } catch (e) {
            // 서버가 만든 문구(번호 없음 · PIN 틀림 · 잠김 …)를 그대로 보여 준다
            setError(e instanceof ApiError && e.message ? e.message : t("attach.failed"));
            setPin("");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div
            id={PANEL_ID}
            tabIndex={-1}
            className={cn("relative max-h-[92dvh] overflow-y-auto rounded-t-[24px] border border-b-0 shadow-[0_-12px_48px_rgba(0,0,0,0.22)] outline-none", c.panel)}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 18px)" }}
        >
            <button
                type="button"
                onClick={closeSheet}
                aria-label={t("loginSheet.close")}
                className={cn("absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full transition-colors", c.close)}
            >
                <X className="h-[18px] w-[18px]" />
            </button>
            <div className="px-6 pt-2.5">
                <div className="flex justify-center pb-4">
                    <span aria-hidden className={cn("h-1 w-10 rounded-full", c.grip)} />
                </div>
                <SheetTitle className={cn("pr-9 text-left text-[18px] font-bold leading-snug break-keep", c.title)}>{t("attach.title")}</SheetTitle>
                <SheetDescription className={cn("mt-1 text-left text-[13.5px] leading-relaxed break-keep", c.desc)}>
                    {t("attach.desc").replace("{provider}", provider)}
                </SheetDescription>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); void submit(); }} className="px-6 pt-4">
                <div className="flex flex-col gap-2.5">
                    <input
                        type="tel"
                        inputMode="numeric"
                        autoComplete="tel-national"
                        aria-label={t("login.phonePlaceholder")}
                        placeholder={t("login.phonePlaceholder")}
                        value={dashed(phone)}
                        onChange={(e) => { setPhone(e.target.value.replace(/[^0-9]/g, "").slice(0, 11)); setError(null); }}
                        className={cn("h-12 w-full rounded-[12px] px-4 text-[16px] font-semibold tabular-nums outline-none", c.input)}
                    />
                    <input
                        type="password"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        autoComplete="current-password"
                        aria-label={t("login.pinPlaceholder")}
                        placeholder={t("login.pinPlaceholder")}
                        value={pin}
                        onChange={(e) => { setPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 8)); setError(null); }}
                        className={cn("h-12 w-full rounded-[12px] px-4 text-[16px] font-semibold tabular-nums outline-none", c.input)}
                    />
                </div>
                {error && <p role="alert" className={cn("mt-2.5 text-[13px] font-medium leading-relaxed break-keep", c.error)}>{error}</p>}
                <button
                    type="submit"
                    disabled={busy || !ready}
                    aria-busy={busy}
                    className={cn("mt-4 flex h-12 w-full items-center justify-center rounded-[12px] text-[15px] font-bold transition-transform active:scale-[0.98] disabled:opacity-40", c.submit)}
                >
                    {busy ? <LucideLoader2 className="h-5 w-5 animate-spin" /> : t("attach.submit")}
                </button>
                <div className="flex justify-center">
                    <button
                        type="button"
                        onClick={closeSheet}
                        className={cn("h-11 px-3 text-[14px] font-semibold underline underline-offset-4 transition-colors", c.skip)}
                    >
                        {t(source === "signup" ? "attach.skip" : "common.cancel")}
                    </button>
                </div>
                <p className={cn("text-center text-[12px] font-medium leading-relaxed break-keep", c.note)}>{t("attach.note")}</p>
            </form>
        </div>
    );
}

/** 전역 호스트 — App 에 한 번. */
export function AttachPhoneSheetHost() {
    const s = useSyncExternalStore(subscribe, getState, getState);
    const { member } = useAuth();
    const { t, locale } = useT();
    const { currentSport } = useSport();
    const conn = (member as { connections?: { phone?: boolean; pin?: boolean; kakao?: boolean; google?: boolean; apple?: boolean } } | undefined)?.connections;
    // 소셜로 가입한 계정인가 — 전화번호가 없고 PIN 도 없다(서버의 조건과 같다. 틀려도 서버가 거절한다)
    const socialOnly = !!member && !!conn && conn.phone === false && conn.pin !== true;

    // 새 문서에서 시작했는데 표시가 남아 있다(카카오에서 돌아온 직후 등) — 이어서 묻는다
    useEffect(() => {
        if (!state.open && readOffer()) setState({ open: true, source: "signup" });
    }, []);
    // 물어볼 계정이 아니면 표시를 치운다 — '나'를 받은 뒤에만 판단한다(받기 전에는 그대로 둔다)
    useEffect(() => {
        if (member && !socialOnly && (state.open || readOffer())) closeSheet();
    }, [member, socialOnly]);
    // 새 가입 직후의 권유는 한국어 화면에서만 — 다른 언어에서는 표시도 남기지 않는다(주 종목 묻기가 기다리지 않게)
    useEffect(() => {
        if (locale !== "ko" && state.source === "signup" && (state.open || readOffer())) closeSheet();
    }, [locale, s]);

    // 새 가입 직후의 권유는 한국어 화면에서만(전화번호 가입은 한국 매장 회원의 길이다). 설정에서 연 것은 언어와 무관하다
    const show = s.open && socialOnly && (s.source === "settings" || locale === "ko");
    useBackToClose(show, closeSheet);

    const provider = conn?.kakao ? t("settings.connKakao") : conn?.google ? "Google" : "Apple";
    const tone: Tone = currentSport === "GOLF" ? "dark" : "light";
    return (
        <Sheet open={show} onOpenChange={(open) => { if (!open) closeSheet(); }}>
            <SheetContent
                side="bottom"
                hideClose
                // 열릴 때 초점은 판 자체에 — 닫기 단추에 초점 테가 서지 않고, 입력 칸에 두지 않아 자판이 바로 올라오지 않는다
                onOpenAutoFocus={(e) => { e.preventDefault(); document.getElementById(PANEL_ID)?.focus(); }}
                className="mx-auto max-w-[448px] border-0 bg-transparent p-0 shadow-none outline-none"
            >
                {show && <Panel tone={tone} provider={provider} source={s.source} />}
            </SheetContent>
        </Sheet>
    );
}
