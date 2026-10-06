/**
 * 앱 안내창 — 브라우저 기본 `window.confirm` / `alert` 대신(2026-10-01 오너: "흰 시스템 안내창이 우리 디자인과 안 맞다, 여러 곳에 보인다").
 *
 * 기본 창은 안드로이드 웹뷰에서 흰 판 + "CANCEL / OK" 영어 버튼으로 떠서, 어두운 골프 화면 위에 혼자 튀었다.
 * 여기서는 **디자인 토큰**(surface·ink·brand)만 쓴다 — 당구 쪽은 흰 카드 + 초록, 골프 화면은 `:root[data-sport="GOLF"]` 가
 * 토큰을 바꿔 어두운 카드 + 라임이 된다. 한 컴포넌트로 두 종목 모양을 다 따른다.
 *
 * 쓰는 법(부르는 곳은 기존 confirm 자리 그대로 한 줄):
 *   if (await appConfirm({ message: "이 글을 내릴까요?", tone: "danger", confirmText: "내리기" })) remove();
 *   void appAlert("링크를 복사했어요");
 * 앱 뿌리(App.tsx)에 <AppDialogHost /> 가 한 번 있어야 한다. 없으면(아주 이른 시점) 기본 창으로 떨어진다 — 묻는 일 자체는 빠지지 않게.
 * 다른 모달(예: 골프 '경기에서 나갈까요?') 위에서도 떠야 해서 맨 위 층이다 — z-[10000].
 * 세로로 든 폰의 점수판 상자(LandscapeGuard, zIndex 9999)보다도 위여야 한다: 1000 이던 때는 확인창이 점수판 **밑에** 깔려
 * 보이지 않는데 화면은 잠겨(Radix 가 body 를 pointer-events:none 으로), '종료하기가 안 눌린다'로 보였다(2026-10-06 오너 제보).
 */
import { useEffect, useState } from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface AppDialogOptions {
    title?: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    /** danger = 지우기·나가기·거절처럼 되돌릴 수 없는 일(확인 단추가 빨강) */
    tone?: "default" | "danger";
}

interface Pending extends AppDialogOptions {
    kind: "confirm" | "alert";
    resolve: (ok: boolean) => void;
}

const queue: Pending[] = [];
const listeners = new Set<() => void>();
let hostMounted = 0;
const emit = () => listeners.forEach((l) => l());

function push(p: Pending) {
    queue.push(p);
    emit();
}

const normalize = (o: AppDialogOptions | string): AppDialogOptions => (typeof o === "string" ? { message: o } : o);

/** 확인·취소 — 확인이면 true. 창을 닫거나(바깥·뒤로) 취소하면 false */
export function appConfirm(opts: AppDialogOptions | string): Promise<boolean> {
    const o = normalize(opts);
    if (!hostMounted) return Promise.resolve(typeof window !== "undefined" ? window.confirm(o.message) : false);
    return new Promise<boolean>((resolve) => push({ ...o, kind: "confirm", resolve }));
}

/** 알림 한 장 — 확인을 누르거나 닫으면 끝난다 */
export function appAlert(opts: Omit<AppDialogOptions, "cancelText"> | string): Promise<void> {
    const o = normalize(opts);
    if (!hostMounted) {
        if (typeof window !== "undefined") window.alert(o.message);
        return Promise.resolve();
    }
    return new Promise<void>((resolve) => push({ ...o, kind: "alert", resolve: () => resolve() }));
}

export function AppDialogHost() {
    const { t } = useT();
    const [, force] = useState(0);
    useEffect(() => {
        hostMounted++;
        const l = () => force((n) => n + 1);
        listeners.add(l);
        return () => { hostMounted--; listeners.delete(l); };
    }, []);

    const cur = queue[0];
    // 확인 단추는 onClick(true) 뒤에 Radix 가 닫으며 onOpenChange(false) 를 한 번 더 부른다 —
    // 그때는 이미 다음 창이 맨 앞일 수 있어, **지금 이 창**일 때만 닫는다(다음 창을 엉뚱하게 '취소'로 닫지 않게).
    const settle = (ok: boolean) => {
        if (queue[0] !== cur) return;
        queue.shift();
        emit();
        cur?.resolve(ok);
    };
    if (!cur) return null;
    const danger = cur.tone === "danger";
    return (
        <AlertDialogPrimitive.Root open onOpenChange={(o) => { if (!o) settle(false); }}>
            <AlertDialogPrimitive.Portal>
                <AlertDialogPrimitive.Overlay className="fixed inset-0 z-[10000] bg-black/55 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
                <AlertDialogPrimitive.Content
                    onEscapeKeyDown={() => settle(false)}
                    className={cn(
                        "fixed left-1/2 top-1/2 z-[10000] w-[calc(100%-40px)] max-w-[340px] -translate-x-1/2 -translate-y-1/2",
                        "rounded-[22px] bg-surface-1 border border-surface-line shadow-[0_18px_60px_rgba(0,0,0,0.35)] outline-none",
                        "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
                    )}
                >
                    <div className="px-5 pt-6 pb-4 text-center">
                        {cur.title
                            ? <AlertDialogPrimitive.Title className="text-[17px] font-bold text-ink-1 break-keep">{cur.title}</AlertDialogPrimitive.Title>
                            : <AlertDialogPrimitive.Title className="sr-only">{cur.kind === "confirm" ? t("common.confirmTitle") : t("common.noticeTitle")}</AlertDialogPrimitive.Title>}
                        <AlertDialogPrimitive.Description className={cn(
                            "text-[15px] leading-[1.55] break-keep whitespace-pre-line",
                            cur.title ? "mt-2 text-ink-3" : "text-ink-1 font-medium",
                        )}>
                            {cur.message}
                        </AlertDialogPrimitive.Description>
                    </div>
                    <div className="px-4 pb-4 flex gap-2">
                        {cur.kind === "confirm" && (
                            <AlertDialogPrimitive.Cancel
                                onClick={() => settle(false)}
                                className="flex-1 h-12 rounded-2xl bg-surface-3 text-[15px] font-semibold text-ink-1 active:opacity-80"
                            >
                                {cur.cancelText ?? t("common.cancel")}
                            </AlertDialogPrimitive.Cancel>
                        )}
                        <AlertDialogPrimitive.Action
                            onClick={() => settle(true)}
                            className={cn(
                                "flex-1 h-12 rounded-2xl text-[15px] font-bold active:opacity-85",
                                danger ? "bg-[#E5484D] text-[#ffffff]" : "bg-brand text-brand-fg",
                            )}
                        >
                            {cur.confirmText ?? t("common.ok")}
                        </AlertDialogPrimitive.Action>
                    </div>
                </AlertDialogPrimitive.Content>
            </AlertDialogPrimitive.Portal>
        </AlertDialogPrimitive.Root>
    );
}
