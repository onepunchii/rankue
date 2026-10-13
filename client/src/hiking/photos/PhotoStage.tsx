/**
 * 등산 — 사진 크게 보기(2026-10-13). 내 산행 사진(MyPhotos)과 이 산의 사진(MountainPhotos)이 같이 쓴다. 옆으로 밀어 넘긴다.
 *
 * 문서 끝에 붙인다(포털 · z-50): 하단 탭(z-50)보다 위이고, 여기서 여는 신고 창(z-50, 더 나중에 붙는다)과 확인 창(z-10000)보다 아래다.
 * 층을 더 높이면 신고 창이 이 화면 밑에 깔린다 — 띄울 것은 이 화면 **안**(action · children)에 두거나 그 두 창을 쓴다.
 * 무엇을 누르는지에 사람 이름이 섞이지 않게 구역 이름만 남긴다(data-track-as).
 * 골프의 사진 화면(golf/components/photos/PhotoViewer)을 가져다 쓰지 않는다 — 등산은 등산의 것으로.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export interface StagePhoto { id: string; url: string; thumbUrl: string; width: number; height: number }

export function PhotoStage({ photos, index, onIndex, onClose, label, action, children }: {
    photos: readonly StagePhoto[];
    /** 지금 보는 사진의 자리 */
    index: number;
    onIndex: (i: number) => void;
    onClose: () => void;
    /** 화면의 이름(읽어 주는 글) */
    label: string;
    /** 오른쪽 위 — 지우기 · 신고 */
    action?: ReactNode;
    /** 사진 밑 — 올린 사람 · 공개 여부 */
    children?: ReactNode;
}) {
    const track = useRef<HTMLDivElement>(null);
    const n = photos.length;
    const cur = Math.min(Math.max(index, 0), Math.max(n - 1, 0));

    // 열 때 · 밖에서 자리를 바꿨을 때 그 사진으로 바로 간다(움직임 없이)
    useEffect(() => {
        const el = track.current;
        if (!el || !el.clientWidth) return;
        if (Math.round(el.scrollLeft / el.clientWidth) !== cur) el.scrollLeft = cur * el.clientWidth;
    }, [cur, n]);

    // 뒤 화면이 같이 움직이지 않게 · Esc 로 닫기 · 방향키로 넘기기
    useEffect(() => {
        if (n === 0) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { onClose(); return; }
            const el = track.current;
            if (!el) return;
            if (e.key === "ArrowRight") el.scrollTo({ left: el.scrollLeft + el.clientWidth, behavior: "smooth" });
            if (e.key === "ArrowLeft") el.scrollTo({ left: el.scrollLeft - el.clientWidth, behavior: "smooth" });
        };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [onClose, n === 0]);

    if (n === 0) return null;
    const onScroll = () => {
        const el = track.current;
        if (!el || !el.clientWidth) return;
        const i = Math.min(Math.max(Math.round(el.scrollLeft / el.clientWidth), 0), n - 1);
        if (i !== cur) onIndex(i);
    };

    return createPortal(
        <div role="dialog" aria-modal="true" aria-label={label} data-track-as="hiking-photo-view" data-testid="hk-photo-view" style={{ pointerEvents: "auto" }}
            className="fixed inset-0 z-50 flex flex-col bg-[#050F13] font-sans text-[#F4EFE3]">
            <div className="flex h-14 shrink-0 items-center gap-1 px-2" style={{ marginTop: "env(safe-area-inset-top)" }}>
                <button type="button" onClick={onClose} className="h-10 shrink-0 rounded-full px-3.5 text-[15px] text-[#F4EFE3] active:bg-[#FFFFFF14]" data-testid="hk-photo-close">닫기</button>
                <span className="min-w-0 flex-1 text-center text-[13.5px] tabular-nums text-[#F4EFE3B3]">{n > 1 ? `${cur + 1} / ${n}` : ""}</span>
                <span className="flex h-10 min-w-[56px] shrink-0 items-center justify-end">{action}</span>
            </div>
            <div ref={track} onScroll={onScroll} className="scrollbar-hide flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-contain">
                {photos.map((p, i) => (
                    // 큰 사진이 오기 전에는 이미 받아 둔 작은 사진을 같은 자리에 깔아 둔다. 먼 장은 작은 사진만 둔다
                    <div key={`stage:${p.id}`} className="flex h-full w-full shrink-0 snap-center items-center justify-center bg-contain bg-center bg-no-repeat px-1.5"
                        style={{ backgroundImage: `url("${p.thumbUrl}")`, backgroundOrigin: "content-box" }}>
                        <img src={Math.abs(i - cur) <= 1 ? p.url : p.thumbUrl} alt="산행 사진" width={p.width} height={p.height} draggable={false} decoding="async" className="max-h-full max-w-full select-none object-contain" />
                    </div>
                ))}
            </div>
            <div className="shrink-0 px-5 pt-3.5" style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>{children}</div>
        </div>,
        document.body,
    );
}
