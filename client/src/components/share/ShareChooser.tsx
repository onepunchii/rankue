/**
 * 공유 고르기(2026-10-25) — 웹에서 공유 단추를 누르면 '카카오톡으로 보내기'(카드 + 단추) · '다른 앱으로 · 링크 복사' 둘 중에 고른다.
 * 앱 안이거나 카카오 키가 없으면 고르기 없이 그 화면의 예전 공유(fallback — 기기 공유 창 · 복사)를 그대로 한다.
 * 화면은 shareWithKakao({ …, fallback })만 부르면 된다. 창은 앱에 하나(ShareChooserHost — App.tsx).
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useEffect, useState } from "react";
import { LucideX } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast";
import { kakaoShareAvailable, sendKakaoShare, type KakaoShareInput } from "@/lib/kakaoShare";

export type ShareRequest = KakaoShareInput & {
    /** 예전 공유 — 기기 공유 창 · 링크 복사. 카카오톡을 못 쓰거나 '다른 앱'을 고르면 이것을 부른다 */
    fallback: () => void | Promise<void>;
};

let current: ShareRequest | null = null;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());

/** 공유 — 웹이면 고르는 창을 열고, 아니면 예전 공유를 바로 한다 */
export function shareWithKakao(req: ShareRequest): void {
    if (!kakaoShareAvailable()) { void req.fallback(); return; }
    current = req;
    emit();
}

/** 카카오톡 말풍선(카카오 노란 단추 안의 그림) */
function TalkMark() {
    return (
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden><path d="M12 3.5c-5 0-9 3.2-9 7.1 0 2.5 1.6 4.7 4.1 5.9l-.9 3.4c-.1.3.3.6.6.4l4-2.6c.4 0 .8.1 1.2.1 5 0 9-3.2 9-7.2S17 3.5 12 3.5Z" fill="#191919" /></svg>
    );
}

export function ShareChooserHost() {
    const [req, setReq] = useState<ShareRequest | null>(null);
    const { toast } = useToast();
    const close = () => { current = null; setReq(null); };
    useEffect(() => { const f = () => setReq(current); subs.add(f); return () => { subs.delete(f); }; }, []);
    useEffect(() => {
        if (!req) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [req]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!req) return null;
    const kakao = async () => {
        close();
        const r = await sendKakaoShare(req);
        if (r === "sent") return;
        if (r === "device") toast({ title: "오늘은 카카오톡 공유를 많이 했어요 — 다른 앱으로 보내 드릴게요." });
        await req.fallback();
    };
    const other = async () => { close(); await req.fallback(); };
    return (
        <div className="fixed inset-0 z-[96] flex items-end justify-center bg-black/45" onClick={close} data-testid="share-chooser">
            {/* 색은 글자 그대로(style) — 어두운 화면(등산 · 낚시)의 테마가 bg-white 같은 이름을 바꿔 칠해 제목이 안 보였다(화면 확인 10/25) */}
            <div className="w-full max-w-[520px] rounded-t-[26px] px-5 pt-4" style={{ background: "#FFFFFF", color: "#191919", paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
                role="dialog" aria-modal="true" aria-label="공유하기" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-2">
                    <p className="min-w-0 truncate text-[16px] font-bold" style={{ color: "#191919" }}>공유하기 <span className="text-[13.5px] font-medium" style={{ color: "#8A8A8A" }}>{req.title}</span></p>
                    <button type="button" onClick={close} aria-label="닫기" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full active:opacity-60" style={{ color: "#191919" }}><LucideX weight="bold" className="h-5 w-5" aria-hidden /></button>
                </div>
                <div className="mt-3 space-y-2.5">
                    <button type="button" onClick={() => void kakao()} data-track-as="share-kakao" data-testid="share-chooser-kakao"
                        className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15.5px] font-bold active:opacity-90" style={{ background: "#FEE500", color: "#191919" }}>
                        <TalkMark />카카오톡으로 보내기
                    </button>
                    <button type="button" onClick={() => void other()} data-track-as="share-other" data-testid="share-chooser-other"
                        className="flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold active:opacity-80" style={{ background: "#F2F2F2", color: "#191919" }}>
                        다른 앱으로 보내기 · 링크 복사
                    </button>
                </div>
            </div>
        </div>
    );
}
