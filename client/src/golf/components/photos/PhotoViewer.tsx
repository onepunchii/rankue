/**
 * 라운드 사진 전체 화면(2026-09-30) — 앨범(경기 참가자)과 골프장 페이지(누구나)가 같이 쓴다. 옆으로 밀어 넘긴다(scroll-snap).
 *
 * v2(같은 날 오너: "공개 내용이 디자인이랑 내용이 아쉬워 — 같은 말 두 번, 노란 문단은 경보 같고, 어느 골프장·몇 번 홀인지 없고,
 * 지우기가 시끄럽다"):
 *   사진 밑       맥락 한 줄("동강시스타 CC · 7번 홀 · 9월 28일") + 크레딧("내 사진" / "사진 · 닉네임")
 *   내 사진       공개 범위 두 칸 고르기(🔒 나와 동반자만 | 🌐 골프장에 공개) → 상태 한 줄(공개면 '보러 가기 ›'),
 *                공개인 동안엔 조용한 ⓘ 초상권 한 줄. 가려진 사진은 이의제기 원탭(HiddenNotice).
 *   지우기        위 막대의 휴지통 → 확인 카드(되돌릴 수 없다는 말과 함께). 빨간 글자 링크는 없앴다.
 *   남의 사진      위 막대 ⋯ [신고] [차단](UgcActionMenu, targetType golf_photo). 로그아웃이면 로그인으로.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼우고, 골프장 페이지는 로그아웃(당구 테마)에서도 열린다.
 */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import {
    LucideX, LucideTrash2, LucideGlobe, LucideLock, LucideLoader2, LucideMoreVertical, LucideInfo, LucideChevronRight,
} from "@/lib/icons";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";
import { coursePath } from "@shared/golfCourse";
import { GOLF_PHOTO_FACE_NOTICE } from "@shared/golfPhoto";
import { useDeletePhoto, useSetPhotoPublic, useAppealPhoto, invalidatePhotos } from "../../lib/photoApi";
import { useQueryClient } from "@tanstack/react-query";

/** 골프장 페이지의 '라운드 사진' 칸 — 뷰어의 '보러 가기'가 여기로 건너간다(CoursePhotoGallery 가 이 id 를 단다) */
export const ROUND_PHOTOS_ANCHOR = "round-photos";

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
    /** 앨범: 그 경기 골프장 이름·골프장 페이지 슬러그·라운드 날("9월 28일" — 참가자만 보니 날까지) */
    courseName?: string | null;
    courseSlug?: string | null;
    dateLabel?: string | null;
    mine?: boolean;
    isPublic?: boolean;
    hasCoursePage?: boolean;
    hidden?: boolean;
    /** 지금 가림에 이의제기를 냈나(내 사진만) */
    appealed?: boolean;
}

/** 공개 스위치 — 라임 켜짐. 리터럴 색(골프 테마가 토큰을 바꾼다). 방금 올린 사진 카드(RoundPhotoCamera)가 쓴다 */
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

/** 초상권 한 줄 — 작고 조용하게. 공개로 돌린 순간부터 공개인 동안 늘 보인다 */
export function FaceNotice({ className }: { className?: string }) {
    return (
        <p className={cn("flex items-start gap-1.5 text-[12px] leading-[1.5] text-[#FFFFFF73] break-keep", className)}>
            <LucideInfo className="mt-[2px] w-3.5 h-3.5 shrink-0" />{GOLF_PHOTO_FACE_NOTICE}
        </p>
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
        <div className="mt-3 flex items-center gap-2.5 rounded-2xl bg-[#FF453A14] ring-1 ring-inset ring-[#FF453A33] px-3.5 py-2.5">
            <p className="flex-1 min-w-0 text-[12.5px] leading-[1.45] text-[#FFB3AE] break-keep">
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

/**
 * 내 사진의 공개 범위 — 두 칸 고르기. 스위치 한 개보다 '지금 어느 쪽인지'가 분명하다(오너 v2).
 * 아래 한 줄이 결과를 말한다: 공개면 어느 페이지에 올라가 있는지 + 보러 가기, 비공개면 공개하면 어디에 올라가는지.
 */
function AudienceControl({ photo, onGoToCourse }: { photo: ViewerPhoto; onGoToCourse: (slug: string) => void }) {
    const { toast } = useToast();
    const setPublic = useSetPhotoPublic();
    const on = !!photo.isPublic;
    const course = photo.courseName || "이 골프장";
    const pick = (v: boolean) => {
        if (v === on || setPublic.isPending) return;
        setPublic.mutate({ id: photo.id, isPublic: v }, {
            onError: (e: any) => toast({ variant: "destructive", title: e?.message || "바꾸지 못했어요" }),
        });
    };
    const seg = (active: boolean, pub: boolean) => cn(
        "relative h-11 rounded-[14px] inline-flex items-center justify-center gap-1.5 text-[14px] font-semibold transition-colors disabled:opacity-60",
        active
            ? pub ? "bg-[#1F3316] text-[#DDF8C8] ring-1 ring-inset ring-[#64DD1747]" : "bg-[#3A3A3C] text-[#ffffff]"
            : "text-[#FFFFFF80] active:bg-[#FFFFFF0A]",
    );

    return (
        <div className="mt-4">
            <div role="radiogroup" aria-label="공개 범위" className="grid grid-cols-2 gap-1 p-1 rounded-[18px] bg-[#1C1C1E] ring-1 ring-inset ring-[#FFFFFF0F]">
                <button type="button" role="radio" aria-checked={!on} disabled={setPublic.isPending} onClick={() => pick(false)} className={seg(!on, false)}>
                    <LucideLock className="w-4 h-4" />나와 동반자만
                </button>
                <button type="button" role="radio" aria-checked={on} disabled={setPublic.isPending} onClick={() => pick(true)} className={seg(on, true)}>
                    {setPublic.isPending && !on
                        ? <LucideLoader2 className="w-4 h-4 animate-spin" />
                        : <LucideGlobe className={cn("w-4 h-4", on && "text-[#9BEF5C]")} />}
                    골프장에 공개
                </button>
            </div>
            {/* 신고로 가려진 사진은 '올라가 있어요'가 거짓이다 — 아래 HiddenNotice 가 사정과 이의제기를 말한다 */}
            {photo.hidden ? null : on ? (
                <p className="mt-2.5 text-[13px] leading-[1.5] text-[#FFFFFFA6] break-keep">
                    <span className="text-[#ffffff]">{course}</span> 페이지에 올라가 있어요
                    {photo.courseSlug && (
                        <>
                            <span aria-hidden className="text-[#FFFFFF40]"> · </span>
                            <button type="button" onClick={() => onGoToCourse(photo.courseSlug!)} className="inline-flex items-center gap-0.5 font-medium text-[#9BEF5C] active:opacity-70">
                                보러 가기<LucideChevronRight weight="bold" className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </p>
            ) : (
                <p className="mt-2.5 text-[13px] leading-[1.5] text-[#FFFFFF8C] break-keep">
                    공개하면 <span className="text-[#FFFFFFCC]">{course}</span> 페이지 ‘라운드 사진’에 올라가요
                </p>
            )}
            {on && !photo.hidden && <FaceNotice className="mt-1.5" />}
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

/** 남의 사진 ⋯ — 로그인했으면 신고·차단, 아니면 로그인 안내. 골프장 페이지·뷰어가 같이 쓴다 */
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

/** 지우기 확인 — 뷰어 안의 카드(엄지 닿는 아래쪽). 공개 사진이면 골프장 페이지에서도 사라진다고 말한다 */
function DeleteConfirm({ photo, busy, onCancel, onConfirm }: { photo: ViewerPhoto; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
    const cancelRef = useRef<HTMLButtonElement>(null);
    useEffect(() => { cancelRef.current?.focus(); }, []);
    return (
        <div className="absolute inset-0 z-10 flex items-end justify-center bg-[#000000B8] px-4" onClick={onCancel}
            style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
            <div role="alertdialog" aria-modal="true" aria-labelledby="photo-del-title" aria-describedby="photo-del-desc"
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-sm rounded-[24px] bg-[#1C1C1E] ring-1 ring-inset ring-[#FFFFFF14] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.6)]">
                <div className="flex items-center gap-3.5">
                    <img src={photo.thumbUrl} alt="" className="w-14 h-14 shrink-0 rounded-[14px] object-cover bg-[#FFFFFF0F]" />
                    <div className="min-w-0">
                        <p id="photo-del-title" className="text-[16px] font-semibold text-[#ffffff]">이 사진을 지울까요?</p>
                        <p id="photo-del-desc" className="mt-1 text-[13px] leading-[1.45] text-[#FFFFFF99] break-keep">
                            <span className="block">{photo.isPublic ? "앨범과 골프장 페이지에서 모두 사라져요" : "앨범에서 사라져요"}</span>
                            <span className="block">되돌릴 수 없어요</span>
                        </p>
                    </div>
                </div>
                <div className="mt-5 grid grid-cols-2 gap-2">
                    <button ref={cancelRef} type="button" onClick={onCancel} className="h-12 rounded-2xl bg-[#FFFFFF14] text-[15px] font-semibold text-[#ffffff] active:bg-[#FFFFFF24]">취소</button>
                    <button type="button" onClick={onConfirm} disabled={busy}
                        className="h-12 rounded-2xl bg-[#FF453A] text-[15px] font-semibold text-[#ffffff] active:bg-[#E03B31] disabled:opacity-70 inline-flex items-center justify-center">
                        {busy ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : "지우기"}
                    </button>
                </div>
            </div>
        </div>
    );
}

/** 사진 밑 두 줄 — 앨범이면 "골프장 · N번 홀 · 날" + 크레딧, 골프장 페이지면 크레딧 + 달 */
function Caption({ p }: { p: ViewerPhoto }) {
    const where = [p.courseName, p.holeNo ? `${p.holeNo}번 홀` : null, p.dateLabel].filter(Boolean).join(" · ");
    const credit = p.mine ? "내 사진" : `사진 · ${p.name}`;
    if (where) {
        return (
            <div>
                <p className="text-[15px] font-semibold tracking-[-0.01em] text-[#ffffff] truncate">{where}</p>
                <p className="mt-0.5 text-[13px] text-[#FFFFFF8C] truncate">{credit}</p>
            </div>
        );
    }
    return (
        <div>
            <p className="text-[15px] font-semibold text-[#ffffff] truncate">{credit}</p>
            {(p.month || p.holeNo) && <p className="mt-0.5 text-[13px] text-[#FFFFFF8C] truncate">{[p.holeNo ? `${p.holeNo}번 홀` : null, p.month].filter(Boolean).join(" · ")}</p>}
        </div>
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
    const [confirmDel, setConfirmDel] = useState(false);
    const qc = useQueryClient();
    const del = useDeletePhoto();
    const { toast } = useToast();
    const [, setLocation] = useLocation();

    // 열 때 그 사진으로 바로 간다(애니메이션 없이)
    useEffect(() => {
        if (!open || !track.current) return;
        const el = track.current;
        const i = Math.min(index!, photos.length - 1);
        setCur(i);
        setConfirmDel(false);
        requestAnimationFrame(() => { el.scrollLeft = i * el.clientWidth; });
    }, [open, index]); // eslint-disable-line react-hooks/exhaustive-deps

    // 지워서 줄면 범위 안으로. 마지막 한 장까지 지웠으면 닫는다 — 부모의 번호가 남아 있으면 다음 사진이 올라올 때 저절로 열린다
    useEffect(() => {
        if (index != null && photos.length === 0) { onClose(); return; }
        if (open && cur > photos.length - 1) setCur(Math.max(0, photos.length - 1));
    }, [photos.length]); // eslint-disable-line react-hooks/exhaustive-deps

    // 뒤 화면이 같이 스크롤되지 않게, Esc(확인 카드부터 닫는다)·방향키
    useEffect(() => {
        if (!open) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") { if (confirmDel) setConfirmDel(false); else onClose(); return; }
            const el = track.current;
            if (!el || confirmDel) return;
            if (e.key === "ArrowRight") el.scrollTo({ left: el.scrollLeft + el.clientWidth, behavior: "smooth" });
            if (e.key === "ArrowLeft") el.scrollTo({ left: el.scrollLeft - el.clientWidth, behavior: "smooth" });
        };
        window.addEventListener("keydown", onKey);
        return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
    }, [open, onClose, confirmDel]);

    if (!open) return null;
    const p = photos[Math.min(cur, photos.length - 1)];
    const onScroll = () => {
        const el = track.current;
        if (!el || !el.clientWidth) return;
        const i = Math.round(el.scrollLeft / el.clientWidth);
        if (i !== cur) setCur(i);
    };
    const remove = () => {
        del.mutate(p.id, {
            onSuccess: () => { setConfirmDel(false); toast({ title: "사진을 지웠어요" }); },
            onError: (e: any) => toast({ variant: "destructive", title: e?.message || "지우지 못했어요" }),
        });
    };
    const goToCourse = (slug: string) => {
        onClose();
        setLocation(`${coursePath(slug)}#${ROUND_PHOTOS_ANCHOR}`);
    };
    const ownControls = p.mine && p.isPublic !== undefined;

    return createPortal(
        // z-50 + 문서 끝(포털): 밑에 열린 시트(z-50)보다 위, 여기서 여는 신고 창(z-50, 더 나중에 붙는다)보다 아래.
        // pointer-events:auto — 시트(Radix 모달)가 열려 있으면 body 가 pointer-events:none 이라 명시해야 눌린다.
        <div role="dialog" aria-modal="true" aria-label="사진 보기" style={{ pointerEvents: "auto" }} className="fixed inset-0 z-50 bg-[#000000] text-[#ffffff] flex flex-col">
            <div className="shrink-0 flex items-center gap-1 px-2" style={{ paddingTop: "calc(6px + env(safe-area-inset-top))" }}>
                <button type="button" onClick={onClose} aria-label="닫기" className="w-11 h-11 rounded-full flex items-center justify-center active:bg-[#FFFFFF1A]">
                    <LucideX weight="bold" className="w-[22px] h-[22px]" />
                </button>
                <span className="flex-1 text-center text-[14px] font-medium text-[#FFFFFFB3] tabular-nums">{Math.min(cur, photos.length - 1) + 1} / {photos.length}</span>
                <span className="w-11 h-11 flex items-center justify-center">
                    {p.mine ? (
                        ownControls && (
                            <button type="button" onClick={() => setConfirmDel(true)} aria-label="사진 지우기"
                                className="w-11 h-11 rounded-full flex items-center justify-center text-[#FFFFFFCC] active:bg-[#FFFFFF1A]">
                                <LucideTrash2 className="w-[21px] h-[21px]" />
                            </button>
                        )
                    ) : (
                        <PhotoUgcButton photo={p} onBlocked={() => { void invalidatePhotos(qc); onClose(); }} />
                    )}
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

            <div className="shrink-0 px-5 pt-4" style={{ paddingBottom: "calc(18px + env(safe-area-inset-bottom))" }}>
                <Caption p={p} />
                {ownControls && (p.hasCoursePage ? (
                    <AudienceControl photo={p} onGoToCourse={goToCourse} />
                ) : (
                    // 공개할 곳이 없는 골프장 — 고를 게 없으니 조용히 사실만
                    <p className="mt-3.5 flex items-center gap-1.5 text-[13px] text-[#FFFFFF8C] break-keep">
                        <LucideLock className="w-4 h-4 shrink-0" />골프장 페이지가 없는 곳이라 앨범에만 보여요
                    </p>
                ))}
                {/* 공개할 곳이 없어도 동반자 신고로 가려질 수는 있다 — 이의제기는 어느 경우든 보여야 한다 */}
                {p.mine && p.hidden && <HiddenNotice photo={p} />}
            </div>

            {confirmDel && <DeleteConfirm photo={p} busy={del.isPending} onCancel={() => setConfirmDel(false)} onConfirm={remove} />}
        </div>,
        document.body,
    );
}
