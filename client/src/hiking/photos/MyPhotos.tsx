/**
 * 내 산행 사진(2026-10-13) — 그 산에서 찍은 사진을 담아 두는 내 사진첩. 산 화면과 산행 중 화면에 놓인다.
 *
 * 올린 사람에게만 목록이 보인다(남에게 보이는 자리는 아직 없다 — shared/hikingPhotos). 사진의 위치 정보는 올릴 때 지우고, 좌표는 저장하지 않는다.
 * compact 는 산행 중 화면용 — 단추와 최근 몇 장만.
 * 등산을 쓸 수 있는 회원에게만 그린다(부르는 쪽이 가른다). ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appConfirm } from "@/components/AppDialog";
import { HIKING_PHOTO_LABEL, HIKING_PHOTO_PER_MOUNTAIN_MAX, type HikingPhoto } from "@shared/hikingPhotos";
import { stampDate } from "../lib/date";
import { HikingPhotoError, deleteHikingPhoto, myPhotosKey, uploadHikingPhoto } from "./photoApi";

export function MyPhotos({ mountainId, name, compact }: { mountainId: string; name: string; compact?: boolean }) {
    const qc = useQueryClient();
    const key = myPhotosKey(mountainId);
    const { data } = useQuery<{ photos: HikingPhoto[] }>({ queryKey: key, staleTime: 60_000 });
    const photos = data?.photos ?? [];
    const input = useRef<HTMLInputElement>(null);
    const [msg, setMsg] = useState<string | null>(null);
    const [open, setOpen] = useState<HikingPhoto | null>(null);

    const add = useMutation({
        mutationFn: async (files: File[]) => {
            // 한 장씩 차례로 — 산에서는 통신이 약하다. 하나가 안 되면 거기서 멈추고 까닭을 알린다
            let done = 0;
            for (const f of files) { await uploadHikingPhoto(mountainId, f); done++; qc.invalidateQueries({ queryKey: key }); }
            return done;
        },
        onSuccess: (n) => setMsg(n > 1 ? `사진 ${n}장을 담았어요.` : "사진을 담았어요."),
        onError: (e: unknown) => { qc.invalidateQueries({ queryKey: key }); setMsg(e instanceof HikingPhotoError || e instanceof Error ? e.message : "사진을 올리지 못했어요. 통신이 되는 곳에서 다시 올려 주세요."); },
    });
    const remove = useMutation({
        mutationFn: (id: string) => deleteHikingPhoto(id),
        onSuccess: () => { setOpen(null); qc.invalidateQueries({ queryKey: key }); },
        onError: () => setMsg("지금은 지우지 못했어요."),
    });
    const pick = (list: FileList | null) => {
        const files = Array.from(list ?? []).slice(0, 10);
        if (input.current) input.current.value = "";
        if (files.length === 0) return;
        setMsg(null);
        add.mutate(files);
    };
    const full = photos.length >= HIKING_PHOTO_PER_MOUNTAIN_MAX;
    const shown = compact ? photos.slice(0, 4) : photos;

    return (
        <div data-testid="hk-my-photos" data-count={photos.length}>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} data-testid="hk-photo-input" />
            {photos.length === 0 && !compact && <p className="mb-3 rounded-2xl bg-[#FFFFFF0A] px-4 py-3.5 text-[14px] leading-relaxed text-[#F4EFE3B3] break-keep">{HIKING_PHOTO_LABEL.empty}</p>}
            {shown.length > 0 && (
                <ul className={`grid gap-1.5 ${compact ? "grid-cols-4" : "grid-cols-3"}`}>
                    {shown.map((p) => (
                        <li key={p.id}>
                            <button type="button" onClick={() => setOpen(p)} aria-label={`${name} 사진 크게 보기 · ${stampDate(p.takenAt)}`} className="block aspect-square w-full overflow-hidden rounded-xl bg-[#FFFFFF0F] active:opacity-80" data-testid={`hk-photo-${p.id}`}>
                                <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false} className="h-full w-full object-cover" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <button type="button" disabled={add.isPending || full} onClick={() => input.current?.click()} data-track-as="hiking-photo-add" data-testid="hk-photo-add"
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24] disabled:opacity-50 ${shown.length > 0 ? "mt-2.5" : ""}`}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4Z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
                {add.isPending ? "사진을 담는 중…" : compact && photos.length > 0 ? `${HIKING_PHOTO_LABEL.add} · ${photos.length}장` : HIKING_PHOTO_LABEL.add}
            </button>
            {msg && <p className="mt-2 text-[13.5px] leading-snug text-[#F6D9A8] break-keep" role="status" data-testid="hk-photo-msg">{msg}</p>}
            {full && <p className="mt-2 text-[13px] text-[#F4EFE399] break-keep">{HIKING_PHOTO_LABEL.full}</p>}
            {!compact && <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">{HIKING_PHOTO_LABEL.note}</p>}

            {/* 크게 보기 — 화면 전체. 바깥을 누르면 닫힌다 */}
            {open && (
                <div className="fixed inset-0 z-[80] flex flex-col bg-[#050F13F2]" role="dialog" aria-modal="true" aria-label={`${name} 사진`} onClick={() => setOpen(null)} data-testid="hk-photo-view">
                    <div className="flex h-14 shrink-0 items-center justify-between px-3" style={{ paddingTop: "env(safe-area-inset-top)" }} onClick={(e) => e.stopPropagation()}>
                        <button type="button" onClick={() => setOpen(null)} className="h-10 rounded-full px-3.5 text-[15px] text-[#F4EFE3] active:bg-[#FFFFFF14]">닫기</button>
                        <span className="text-[13.5px] text-[#F4EFE3B3]">{name} · {stampDate(open.takenAt)}</span>
                        <button type="button" disabled={remove.isPending} data-testid="hk-photo-delete"
                            onClick={async () => { if (await appConfirm({ title: "이 사진을 지울까요?", message: "지우면 되돌릴 수 없어요.", confirmText: "지우기", cancelText: "그대로 두기", tone: "danger" })) remove.mutate(open.id); }}
                            className="h-10 rounded-full px-3.5 text-[15px] text-[#FF9C8A] active:bg-[#FFFFFF14] disabled:opacity-50">지우기</button>
                    </div>
                    <div className="flex min-h-0 flex-1 items-center justify-center px-2 pb-6">
                        <img src={open.url} alt="" width={open.width} height={open.height} className="max-h-full max-w-full rounded-lg object-contain" draggable={false} onClick={(e) => e.stopPropagation()} />
                    </div>
                </div>
            )}
        </div>
    );
}
