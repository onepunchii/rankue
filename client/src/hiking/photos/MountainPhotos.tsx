/**
 * 이 산의 사진(2026-10-13) — 회원이 올린 공개 산행 사진. 산 화면에서 **누구에게나**(방문자에게도) 보인다. 한 장도 없으면 구역을 그리지 않는다.
 *
 * 오너: "사진 공개가 기본인데 본인이 공개 비공개 할 수 있게, 골프에 골프장 목록에 사진 올리는 것처럼." — 사전 승인 없이 바로 뜬다.
 * 그래서 남의 사진을 열면 오른쪽 위 ⋯ 에 [신고] [차단]이 있다(공용 UgcActionMenu · 신고 대상 hiking_photo). 서로 다른 3명이 신고하면 서버가 가린다.
 * 로그인하지 않은 사람에게도 ⋯ 는 보이고, 누르면 로그인으로 간다. 내 사진이면 그 자리에서 비공개로 돌릴 수 있다(올리기는 '내 산행 사진'에서).
 * 싣는 것은 사진 · 올린 사람의 이름 · **달까지의 날짜**뿐이다 — 정확한 날 · 시각은 그날 그 산에 있었다는 기록이 된다.
 * 누른 것의 기록에 사람 이름이 섞이지 않게 구역 이름만 남긴다(data-track-as).
 * 골프의 사진 화면을 가져다 쓰지 않는다. ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { UgcActionMenu } from "@/components/hiq/community/UgcActionMenu";
import { LucideMoreVertical } from "@/lib/icons";
import { HIKING_PHOTO_LABEL, HIKING_PHOTO_REPORT_TARGET, type MountainPhoto } from "@shared/hikingPhotos";
import { HkSection } from "../components/HikingShell";
import { PhotoStage } from "./PhotoStage";
import { fetchMountainPhotos, mountainPhotosKey, refreshHikingPhotos, setHikingPhotoPublic } from "./photoApi";

type Gallery = { photos: MountainPhoto[] };

/** 로그인하지 않은 사람의 ⋯ — 신고 · 차단의 자리는 그대로 보여 주고, 누르면 로그인으로 */
function LoginMenu({ onLogin }: { onLogin: () => void }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen(!open)} aria-label="더보기" aria-haspopup="menu" aria-expanded={open} data-testid="hk-photo-more"
                className="flex h-10 w-10 items-center justify-center rounded-full text-[#F4EFE3CC] active:bg-[#FFFFFF1A]">
                <LucideMoreVertical className="h-5 w-5" aria-hidden />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div role="menu" className="absolute right-0 top-11 z-50 w-44 overflow-hidden rounded-2xl bg-[#0E2A33]" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF1F, 0 8px 30px #00000066" }}>
                        {(["신고", "차단"] as const).map((l) => (
                            <button key={`login-menu:${l}`} type="button" role="menuitem" onClick={onLogin}
                                className={`h-11 w-full px-4 text-left text-[14px] font-semibold active:bg-[#FFFFFF14] ${l === "차단" ? "text-[#FF9C8A]" : "text-[#F4EFE3]"}`}>{l}</button>
                        ))}
                        <p className="px-4 pb-3 pt-1 text-[12.5px] text-[#F4EFE399]">로그인하면 할 수 있어요</p>
                    </div>
                </>
            )}
        </div>
    );
}

export function MountainPhotos({ slug, name }: { slug: string; name: string }) {
    const qc = useQueryClient();
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const viewer = member?.id ?? "guest";
    // 로그인 확인이 끝난 뒤에 받는다 — 확인 중에 받으면 차단한 회원의 사진이 든 답이 '방문자' 칸에 잘못 들어간다
    const key = mountainPhotosKey(slug, viewer);
    const { data } = useQuery<Gallery>({ queryKey: key, queryFn: () => fetchMountainPhotos(slug), enabled: !!slug && !isLoading, staleTime: 60_000 });
    const photos = data?.photos ?? [];
    const [openId, setOpenId] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const at = openId ? photos.findIndex((p) => p.id === openId) : -1;
    const open = at >= 0 ? photos[at] : null;
    const close = () => { setOpenId(null); setNote(null); };

    // 내 사진을 여기서 거둔다 — 비공개로 돌리면 이 목록에서 내려간다(다음 사진으로, 마지막 한 장이었으면 닫는다)
    const toPrivate = useMutation({
        mutationFn: (id: string) => setHikingPhotoPublic(id, false),
        onSuccess: (_r, id) => {
            const i = photos.findIndex((p) => p.id === id);
            setOpenId(i < 0 ? null : photos[i + 1]?.id ?? photos[i - 1]?.id ?? null);
            setNote(null);
            qc.setQueryData<Gallery>(key, (old) => (old ? { photos: old.photos.filter((p) => p.id !== id) } : old));
            refreshHikingPhotos(qc);
        },
        onError: (e: unknown) => setNote(e instanceof Error && e.message ? e.message : "지금은 바꾸지 못했어요."),
    });

    if (photos.length === 0) return null;
    const mine = !!open && !!member && member.id === open.memberId;

    return (
        <HkSection title={HIKING_PHOTO_LABEL.galleryTitle} aside={HIKING_PHOTO_LABEL.galleryAside} id="sec-mountain-photos">
            <div data-testid="hk-mountain-photos" data-count={photos.length} data-track-as="hiking-photos">
                <ul className="grid grid-cols-3 gap-1.5">
                    {photos.map((p) => (
                        <li key={`pub:${p.id}`}>
                            <button type="button" onClick={() => { setNote(null); setOpenId(p.id); }} aria-label={`${name} 사진 크게 보기`} data-testid={`hk-mountain-photo-${p.id}`}
                                className="block aspect-square w-full overflow-hidden rounded-xl bg-[#FFFFFF0F] active:opacity-80">
                                <img src={p.thumbUrl} alt={`${name} 산행 사진`} loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
                            </button>
                        </li>
                    ))}
                </ul>
                <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">{HIKING_PHOTO_LABEL.galleryNote}</p>
            </div>

            {open && (
                <PhotoStage photos={photos} index={at} onIndex={(i) => { setNote(null); setOpenId(photos[i]?.id ?? null); }} onClose={close} label={`${name} 사진`}
                    action={isLoading || mine ? null : !member ? (
                        <LoginMenu key={`login:${open.id}`} onLogin={() => { close(); goLogin(setLocation, window.location.pathname + window.location.search); }} />
                    ) : (
                        // 차단하면 그 사람의 사진이 이 목록에서 빠진다 — 닫고 다시 받는다
                        <UgcActionMenu key={`ugc:${open.id}`} targetType={HIKING_PHOTO_REPORT_TARGET} targetId={open.id} authorId={open.memberId} authorName={open.credit}
                            onBlocked={() => { close(); refreshHikingPhotos(qc); }}
                            className="h-10 w-10 rounded-full text-[#F4EFE3CC] hover:text-[#F4EFE3] active:bg-[#FFFFFF1A]" iconClassName="h-5 w-5" />
                    )}>
                    {mine ? (
                        <>
                            <p className="truncate text-[15px] font-semibold text-[#F4EFE3]">내 사진</p>
                            <p className="mt-0.5 truncate text-[13px] text-[#F4EFE399]">{[name, open.month].filter(Boolean).join(" · ")}</p>
                            <button type="button" disabled={toPrivate.isPending} onClick={() => toPrivate.mutate(open.id)} data-testid="hk-mountain-photo-private"
                                className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-[#FFFFFF14] text-[14.5px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24] disabled:opacity-50">비공개로 돌리기</button>
                            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">비공개로 돌리면 이 산의 화면에서 내려가고, 내 산행 사진에만 남아요.</p>
                        </>
                    ) : (
                        <>
                            <p className="truncate text-[15px] text-[#F4EFE3B3]">사진 · <span className="font-semibold text-[#F4EFE3]">{open.credit}</span></p>
                            <p className="mt-0.5 truncate text-[13px] text-[#F4EFE399]">{[name, open.month].filter(Boolean).join(" · ")}</p>
                        </>
                    )}
                    {note && <p className="mt-2 text-[13px] leading-snug text-[#F6D9A8] break-keep" role="status">{note}</p>}
                </PhotoStage>
            )}
        </HkSection>
    );
}
