/**
 * 라운드 사진 전체 화면(2026-09-30) — 앨범(경기 참가자)과 골프장 페이지(누구나)가 같이 쓴다. 옆으로 밀어 넘긴다(scroll-snap).
 *
 *   내 사진(앨범)  → 골프장 페이지 공개 스위치(기본 꺼짐, 켤 때 한 줄 안내) · 지우기
 *   남의 사진      → ⋯ [신고] [차단](UgcActionMenu, targetType golf_photo). 로그아웃이면 로그인으로.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼우고, 골프장 페이지는 로그아웃(당구 테마)에서도 열린다.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { LucideX, LucideTrash2, LucideGlobe, LucideLock, LucideLoader2, LucideMoreVertical } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";
import { GOLF_PHOTO_PUBLIC_NOTICE } from "@shared/golfPhoto";
import { useDeletePhoto, useSetPhotoPublic, useAppealPhoto, invalidatePhotos } from "../../lib/photoApi";
import { useQueryClient } from "@tanstack/react-query";

export interface ViewerPhoto {
    id: string;
    url: string;
    thumbUrl: string;
    memberId: string;
    /** 크레딧 이름 */
    name: string;
    holeNo?: number | null;
    /** 골프장 페이지: '2026년 9월'(달까지만) */
    month?: string;
    mine?: boolean;
    isPublic?: boolean;
    hasCoursePage?: boolean;
    hidden?: boolean;
    /** 지금 가림에 이의제기를 냈나(내 사진만) */
    appealed?: boolean;
}

/** 공개 스위치 — 라임 켜짐. 리터럴 색(골프 테마가 토큰을 바꾼다) */
export function PublicSwitch({ on, busy, onChange, label }: { on: boolean; busy?: boolean; onChange: (v: boolean) => void; label: string }) {
    return (
        <button
            type="button" role="switch" aria-checked={on} aria-label={label} disabled={busy}
            onClick={() => onChange(!on)}
            className={cn("relative shrink-0 w-[46px] h-[28px] rounded-full transition-colors disabled:opacity-60", on ? "bg-[#64DD17]" : "bg-[#FFFFFF2E]")}
        >
            <span className={cn("absolute top-[3px] w-[22px] h-[22px] rounded-full bg-[#ffffff] shadow transition-[left]", on ? "left-[21px]" : "left-[3px]")} />
        </button>
    );
}

/**
 * 신고로 가려진 내 사진 — 알림 + **이의제기 원탭**(자동 가림은 늘 이 둘과 한 세트, 담합·보복 신고 방어).
 * 누르면 운영자 신고 큐에 이 사진이 다시 열린다. 낸 뒤엔 '접수됨'만 보인다.
 */
function HiddenNotice({ photo }: { photo: Pick<ViewerPhoto, "id" | "appealed"> }) {
    const { toast } = useToast();
    const appeal = useAppealPhoto();
    const done = !!photo.appealed || appeal.isSuccess;
    return (
        <div className="mt-2 flex items-center gap-2">
            <p className="flex-1 min-w-0 text-[12.5px] leading-[1.45] text-[#FF8A8C] break-keep">
                {done ? "이의제기가 접수됐어요 · 운영자가 다시 보고 알려 드려요" : "신고가 쌓여 가려진 사진이에요 · 지금은 나만 봐요"}
            </p>
            {!done && (
                <button
                    type="button" disabled={appeal.isPending}
                    onClick={() => appeal.mutate(photo.id, {
                        onSuccess: () => toast({ title: "이의제기가 접수됐어요" }),
                        onError: (e: any) => toast({ variant: "destructive", title: e?.message || "접수하지 못했어요" }),
                    })}
                    className="shrink-0 h-8 px-3 rounded-full bg-[#FFFFFF1A] text-[12.5px] font-semibold text-[#ffffff] active:bg-[#FFFFFF2E] disabled:opacity-60"
                >
                    {appeal.isPending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : "이의제기"}
                </button>
            )}
        </div>
    );
}

/** 내 사진 공개 줄 — 뷰어·방금 올린 사진 카드가 같이 쓴다 */
export function PublicToggleRow({ photo, compact }: { photo: Pick<ViewerPhoto, "id" | "isPublic" | "hasCoursePage" | "hidden" | "appealed">; compact?: boolean }) {
    const { toast } = useToast();
    const setPublic = useSetPhotoPublic();
    const on = !!photo.isPublic;
    if (!photo.hasCoursePage) {
        // 공개할 곳이 없어도 동반자 신고로 가려질 수는 있다 — 이의제기는 여기서도 보여야 한다
        return (
            <div>
                <p className="text-[12.5px] text-[#FFFFFF8C] break-keep">골프장 페이지가 없는 곳이라 이 사진은 앨범에만 보여요</p>
                {photo.hidden && <HiddenNotice photo={photo} />}
            </div>
        );
    }
    return (
        <div>
            <div className="flex items-center gap-3">
                <span className={cn("shrink-0 w-8 h-8 rounded-full flex items-center justify-center", on ? "bg-[#64DD1726] text-[#9BEF5C]" : "bg-[#FFFFFF14] text-[#FFFFFFB3]")}>
                    {on ? <LucideGlobe className="w-[18px] h-[18px]" /> : <LucideLock className="w-[18px] h-[18px]" />}
                </span>
                <span className="flex-1 min-w-0">
                    <span className="block text-[14px] font-semibold text-[#ffffff]">{on ? "골프장 페이지에 공개" : "나와 동반자만 봐요"}</span>
                    {!compact && <span className="block text-[12px] text-[#FFFFFF80]">{on ? "누구나 볼 수 있어요 · 언제든 끌 수 있어요" : "켜면 이 골프장 페이지에 올라가요"}</span>}
                </span>
                <PublicSwitch
                    on={on} busy={setPublic.isPending} label="골프장 페이지에 공개"
                    onChange={(v) => setPublic.mutate({ id: photo.id, isPublic: v }, {
                        onError: (e: any) => toast({ variant: "destructive", title: e?.message || "바꾸지 못했어요" }),
                    })}
                />
            </div>
            {on && <p className="mt-2 text-[12.5px] leading-[1.45] text-[#FFD266] break-keep">{GOLF_PHOTO_PUBLIC_NOTICE}</p>}
            {photo.hidden && <HiddenNotice photo={photo} />}
        </div>
    );
}

/** 로그아웃 방문자의 ⋯ — 신고·차단 자리는 그대로 보여 주고 누르면 로그인으로 */
function LoginUgcMenu() {
    const [, setLocation] = useLocation();
    const [open, setOpen] = useState(false);
    return (
        <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={() => setOpen(!open)} aria-label="더보기" aria-haspopup="menu" aria-expanded={open}
                className="w-10 h-10 rounded-full flex items-center justify-center text-[#FFFFFFCC] active:bg-[#FFFFFF1A]">
                <LucideMoreVertical className="w-5 h-5" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div role="menu" className="absolute right-0 top-11 z-50 w-44 rounded-2xl bg-[#1C1C1E] border border-[#FFFFFF1A] overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.4)]">
                        {["신고", "차단"].map((l) => (
                            <button key={l} role="menuitem" onClick={() => goLogin(setLocation, window.location.pathname + window.location.search)}
                                className={cn("w-full h-11 px-4 text-left text-[13.5px] font-semibold active:bg-[#FFFFFF0F]", l === "차단" ? "text-[#FF8A8C]" : "text-[#ffffff]")}>
                                {l}
                            </button>
                        ))}
                        <p className="px-4 pb-3 pt-1 text-[12px] text-[#FFFFFF80]">로그인하면 할 수 있어요</p>
                    </div>
                </>
            )}
        </div>
    );
}

/** 남의 사진 ⋯ — 로그인했으면 신고·차단, 아니면 로그인 안내. 골프장 페이지 타일·뷰어가 같이 쓴다 */
export function PhotoUgcButton({ photo, onBlocked, dark = true }: { photo: Pick<ViewerPhoto, "id" | "memberId" | "name">; onBlocked?: () => void; dark?: boolean }) {
    const { member, isLoading } = useAuth();
    if (isLoading) return null;
    if (!member) return <LoginUgcMenu />;
    if (member.id === photo.memberId) return null;
    return (
        <UgcActionMenu
            targetType="golf_photo" targetId={photo.id} authorId={photo.memberId} authorName={photo.name} onBlocked={onBlocked}
            className={cn("w-10 h-10 rounded-full", dark ? "text-[#FFFFFFCC] hover:text-[#ffffff] active:bg-[#FFFFFF1A]" : "text-[#FFFFFFB3]")}
            iconClassName="w-5 h-5"
        />
    );
}

export function PhotoViewer({ photos, index, onClose }: {
    photos: ViewerPhoto[];
    index: number | null;
    onClose: () => void;
}) {
    const open = index != null && photos.length > 0;
    const track = useRef<HTMLDivElement>(null);
    const [cur, setCur] = useState(index ?? 0);
    const qc = useQueryClient();
    const del = useDeletePhoto();
    const { toast } = useToast();

    // 열 때 그 사진으로 바로 간다(애니메이션 없이)
    useEffect(() => {
        if (!open || !track.current) return;
        const el = track.current;
        const i = Math.min(index!, photos.length - 1);
        setCur(i);
        requestAnimationFrame(() => { el.scrollLeft = i * el.clientWidth; });
    }, [open, index]); // eslint-disable-line react-hooks/exhaustive-deps

    // 지워서 줄면 범위 안으로. 마지막 한 장까지 지웠으면 닫는다 — 부모의 번호가 남아 있으면 다음 사진이 올라올 때 저절로 열린다
    useEffect(() => {
        if (index != null && photos.length === 0) { onClose(); return; }
        if (open && cur > photos.length - 1) setCur(Math.max(0, photos.length - 1));
    }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // 뒤 화면이 같이 스크롤되지 않게, Esc·방향키
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
            const el = track.current;
            if (!el) return;
            if (e.key === "ArrowRight") el.scrollTo({ left: el.scrollLeft + el.clientWidth, behavior: "smooth" });
            if (e.key === "ArrowLeft") el.scrollTo({ left: el.scrollLeft - el.clientWidth, behavior: "smooth" });
        };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [open, onClose]);

    if (!open) return null;
    const p = photos[Math.min(cur, photos.length - 1)];
    const onScroll = () => {
        const el = track.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        if (i !== cur) setCur(i);
    };
    const remove = () => {
        if (!window.confirm("이 사진을 지울까요? 되돌릴 수 없어요.")) return;
        del.mutate(p.id, {
            onSuccess: () => toast({ title: "사진을 지웠어요" }),
            onError: (e: any) => toast({ variant: "destructive", title: e?.message || "지우지 못했어요" }),
        });
    };

    return createPortal(
        // z-50 + 문서 끝(포털): 밑에 열린 시트(z-50)보다 위, 여기서 여는 신고 창(z-50, 더 나중에 붙는다)보다 아래.
        // pointer-events:auto — 시트(Radix 모달)가 열려 있으면 body 가 pointer-events:none 이라 명시해야 눌린다.
        <div role="dialog" aria-modal="true" aria-label="사진 보기" style={{ pointerEvents: "auto" }} className="fixed inset-0 z-50 bg-[#000000] text-[#ffffff] flex flex-col">
            <div className="shrink-0 flex items-center gap-1 px-2" style={{ paddingTop: "calc(6px + env(safe-area-inset-top))" }}>
                <button type="button" onClick={onClose} aria-label="닫기" className="w-11 h-11 rounded-full flex items-center justify-center active:bg-[#FFFFFF1A]">
                    <LucideX weight="bold" className="w-[22px] h-[22px]" />
                </button>
                <span className="flex-1 text-center text-[14px] font-medium text-[#FFFFFFCC] tabular-nums">{Math.min(cur, photos.length - 1) + 1} / {photos.length}</span>
                <span className="w-11 h-11 flex items-center justify-center">
                    {!p.mine && <PhotoUgcButton photo={p} onBlocked={() => { void invalidatePhotos(qc); onClose(); }} />}
                </span>
            </div>

            <div ref={track} onScroll={onScroll} className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden snap-x snap-mandatory scrollbar-hide overscroll-contain">
                {photos.map((ph, i) => (
                    // 원본(1600px)이 오기 전엔 이미 받아 둔 썸네일을 같은 자리에 깔아 둔다 — 까만 화면으로 기다리지 않게
                    <div key={ph.id} className={cn("w-full h-full shrink-0 snap-center flex items-center justify-center px-1 bg-center bg-contain bg-no-repeat", ph.hidden && "opacity-60")}
                        style={{ backgroundImage: `url("${ph.thumbUrl}")`, backgroundOrigin: "content-box" }}>
                        <img
                            src={Math.abs(i - cur) <= 1 ? ph.url : ph.thumbUrl} alt={ph.holeNo ? `${ph.holeNo}번 홀 사진` : "라운드 사진"}
                            draggable={false} decoding="async"
                            className="max-w-full max-h-full object-contain select-none"
                        />
                    </div>
                ))}
            </div>

            <div className="shrink-0 px-5 pt-3 space-y-3" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                <p className="text-[13px] text-[#FFFFFFB3] truncate">
                    사진 · <span className="text-[#ffffff] font-medium">{p.mine ? "나" : p.name}</span>
                    {p.holeNo ? ` · ${p.holeNo}번 홀` : ""}{p.month ? ` · ${p.month}` : ""}
                </p>
                {p.mine && p.isPublic !== undefined && (
                    <div className="rounded-2xl bg-[#FFFFFF0F] px-4 py-3.5 space-y-3">
                        <PublicToggleRow photo={p} />
                        <button type="button" onClick={remove} disabled={del.isPending}
                            className="h-9 -ml-1 px-2 rounded-lg inline-flex items-center gap-1.5 text-[13px] font-medium text-[#FF8A8C] active:bg-[#FF8A8C1A] disabled:opacity-50">
                            {del.isPending ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <LucideTrash2 className="w-4 h-4" />}사진 지우기
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
