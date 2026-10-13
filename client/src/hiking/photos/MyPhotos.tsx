/**
 * 내 산행 사진(2026-10-13) — 그 산에서 내가 올린 사진. 산 화면과 산행 중 화면에 놓인다.
 *
 * 같은 날 오너: "사진 공개가 기본인데 본인이 공개 비공개 할 수 있게." — 올린 사진은 그 산의 화면('이 산의 사진')에 바로 보이고,
 * 여기서 사진을 열어 사진마다 공개 · 비공개를 바꾼다. 비공개 사진에는 작은 자물쇠, 신고로 가려진 사진에는 '가려짐'이 붙는다.
 * 가려진 사진은 여기서만 보이고(올린 사람에게만), 열면 이의제기를 한 번에 낼 수 있다.
 * 사진의 위치 정보는 올릴 때 지우고, 좌표는 저장하지 않는다(shared/hikingPhotos).
 * compact 는 산행 중 화면용 — 단추와 최근 몇 장만.
 * 등산을 쓸 수 있는 회원에게만 그린다(부르는 쪽이 가른다). ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { appConfirm } from "@/components/AppDialog";
import { useTermsGate } from "@/components/hiq/TermsConsent";
import { LucideLock } from "@/lib/icons";
import { HIKING_PHOTOS_ANCHOR, HIKING_PHOTO_LABEL, HIKING_PHOTO_PER_MOUNTAIN_MAX, type HikingPhoto } from "@shared/hikingPhotos";
import { stampDate } from "../lib/date";
import { PhotoStage } from "./PhotoStage";
import { HikingPhotoError, appealHikingPhoto, deleteHikingPhoto, myPhotosKey, refreshHikingPhotos, setHikingPhotoPublic, uploadHikingPhoto } from "./photoApi";

type Album = { photos: HikingPhoto[] };
const said = (e: unknown, fallback: string) => (e instanceof Error && e.message ? e.message : fallback);

/** 공개 · 비공개 고르기 — 지금 어느 쪽인지가 늘 보인다 */
function Audience({ on, busy, onPick }: { on: boolean; busy: boolean; onPick: (isPublic: boolean) => void }) {
    const seg = (active: boolean) => `flex h-11 items-center justify-center gap-1.5 rounded-[11px] text-[14.5px] disabled:opacity-60 ${active ? "bg-[#F4EFE3] font-semibold text-[#0E2A33]" : "text-[#F4EFE3B3] active:bg-[#FFFFFF14]"}`;
    return (
        <div role="radiogroup" aria-label="공개 여부" className="grid grid-cols-2 gap-1 rounded-[14px] bg-[#FFFFFF14] p-1" data-testid="hk-photo-audience" data-public={on ? "1" : "0"}>
            <button type="button" role="radio" aria-checked={on} disabled={busy} onClick={() => { if (!on) onPick(true); }} className={seg(on)} data-testid="hk-photo-public">{HIKING_PHOTO_LABEL.public}</button>
            <button type="button" role="radio" aria-checked={!on} disabled={busy} onClick={() => { if (on) onPick(false); }} className={seg(!on)} data-testid="hk-photo-private">
                <LucideLock className="h-4 w-4" aria-hidden />{HIKING_PHOTO_LABEL.private}
            </button>
        </div>
    );
}

export function MyPhotos({ mountainId, name, compact }: { mountainId: string; name: string; compact?: boolean }) {
    const qc = useQueryClient();
    const key = myPhotosKey(mountainId);
    const { data } = useQuery<Album>({ queryKey: key, staleTime: 60_000 });
    const photos = data?.photos ?? [];
    const { needsConsent, ask } = useTermsGate();
    const input = useRef<HTMLInputElement>(null);
    const root = useRef<HTMLDivElement>(null);
    const [msg, setMsg] = useState<string | null>(null);
    // 열어 둔 사진은 id 로 기억한다 — 목록이 다시 와도(올리기 · 지우기) 같은 사진을 가리킨다
    const [openId, setOpenId] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const at = openId ? photos.findIndex((p) => p.id === openId) : -1;
    const open = at >= 0 ? photos[at] : null;
    const patch = (id: string, change: Partial<HikingPhoto>) => qc.setQueryData<Album>(key, (old) => (old ? { photos: old.photos.map((p) => (p.id === id ? { ...p, ...change } : p)) } : old));

    // 알림(가려진 사진 안내)이 이 구역으로 데려온다 — 사진이 온 뒤에 한 번만 내려간다
    const jumped = useRef(false);
    useEffect(() => {
        if (compact || jumped.current || !data || window.location.hash !== `#${HIKING_PHOTOS_ANCHOR}`) return;
        jumped.current = true;
        requestAnimationFrame(() => root.current?.scrollIntoView({ block: "center" }));
    }, [compact, data]);

    const add = useMutation({
        mutationFn: async (files: File[]) => {
            // 한 장씩 차례로 — 산에서는 통신이 약하다. 하나가 안 되면 거기서 멈추고 까닭을 알린다
            let done = 0;
            for (const f of files) { await uploadHikingPhoto(mountainId, f); done++; refreshHikingPhotos(qc); }
            return done;
        },
        onSuccess: (n) => setMsg(n > 1 ? `사진 ${n}장을 올렸어요. 이 산의 화면에 보여요.` : "사진을 올렸어요. 이 산의 화면에 보여요."),
        onError: (e: unknown) => { refreshHikingPhotos(qc); setMsg(e instanceof HikingPhotoError || e instanceof Error ? e.message : "사진을 올리지 못했어요. 통신이 되는 곳에서 다시 올려 주세요."); },
    });
    const remove = useMutation({
        mutationFn: (id: string) => deleteHikingPhoto(id),
        // 지운 자리의 다음 사진으로, 마지막 한 장이었으면 닫는다. 지운 사진은 다시 받기 전에 목록에서 먼저 뺀다
        onSuccess: (_r, id) => {
            const i = photos.findIndex((p) => p.id === id);
            setOpenId(i < 0 ? null : photos[i + 1]?.id ?? photos[i - 1]?.id ?? null);
            setNote(null);
            qc.setQueryData<Album>(key, (old) => (old ? { photos: old.photos.filter((p) => p.id !== id) } : old));
            refreshHikingPhotos(qc);
        },
        onError: (e: unknown) => setNote(said(e, "지금은 지우지 못했어요.")),
    });
    const audience = useMutation({
        mutationFn: (v: { id: string; isPublic: boolean }) => setHikingPhotoPublic(v.id, v.isPublic),
        // 누르자마자 바뀐 것처럼 — 안 되면 되돌린다
        onMutate: (v) => { setNote(null); const before = qc.getQueryData<Album>(key); patch(v.id, { isPublic: v.isPublic }); return { before }; },
        onError: (e: unknown, _v, ctx) => { if (ctx?.before) qc.setQueryData(key, ctx.before); setNote(said(e, "지금은 바꾸지 못했어요.")); },
        onSettled: () => refreshHikingPhotos(qc),
    });
    const appeal = useMutation({
        mutationFn: (id: string) => appealHikingPhoto(id),
        onSuccess: (_r, id) => { patch(id, { appealed: true }); refreshHikingPhotos(qc); },
        onError: (e: unknown) => setNote(said(e, "지금은 접수하지 못했어요.")),
    });

    const pick = (list: FileList | null) => {
        const files = Array.from(list ?? []).slice(0, 10);
        if (input.current) input.current.value = "";
        if (files.length === 0) return;
        setMsg(null);
        add.mutate(files);
    };
    // 남에게 보이는 사진을 올리는 일이다 — 약관에 동의하지 않았으면 먼저 묻는다(파일 고르기는 누른 그 자리에서만 열려서 다시 누르게 한다)
    const choose = () => {
        if (needsConsent) { void ask().then((ok) => { if (ok) setMsg("동의했어요. 사진 올리기를 한 번 더 눌러 주세요."); }); return; }
        input.current?.click();
    };
    const full = photos.length >= HIKING_PHOTO_PER_MOUNTAIN_MAX;
    const shown = compact ? photos.slice(0, 4) : photos;
    const close = () => { setOpenId(null); setNote(null); };

    return (
        <div ref={root} data-testid="hk-my-photos" data-count={photos.length}>
            <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => pick(e.target.files)} data-testid="hk-photo-input" />
            {photos.length === 0 && !compact && <p className="mb-3 rounded-2xl bg-[#FFFFFF0A] px-4 py-3.5 text-[14px] leading-relaxed text-[#F4EFE3B3] break-keep">{HIKING_PHOTO_LABEL.empty}</p>}
            {shown.length > 0 && (
                <ul className={`grid gap-1.5 ${compact ? "grid-cols-4" : "grid-cols-3"}`}>
                    {shown.map((p) => (
                        <li key={`mine:${p.id}`}>
                            <button type="button" onClick={() => { setNote(null); setOpenId(p.id); }} data-testid={`hk-photo-${p.id}`} data-public={p.isPublic ? "1" : "0"} data-hidden={p.hidden ? "1" : "0"}
                                aria-label={`${name} 사진 크게 보기 · ${stampDate(p.takenAt)} · ${p.hidden ? "가려짐" : p.isPublic ? HIKING_PHOTO_LABEL.public : HIKING_PHOTO_LABEL.private}`}
                                className="relative block aspect-square w-full overflow-hidden rounded-xl bg-[#FFFFFF0F] active:opacity-80">
                                <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" draggable={false} className={`h-full w-full object-cover ${p.hidden ? "opacity-50" : ""}`} />
                                {/* 지금 상태 — 가려진 사진은 글로, 비공개 사진은 작은 자물쇠로. 공개 사진에는 아무것도 붙이지 않는다 */}
                                {p.hidden
                                    ? <span className="absolute left-1 top-1 rounded-full bg-[#0B1F26D9] px-1.5 py-0.5 text-[12px] leading-tight text-[#FF9C8A]">가려짐</span>
                                    : !p.isPublic && <span className="absolute left-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-[#0B1F26D9] text-[#F6D9A8]" data-testid="hk-photo-lock"><LucideLock weight="fill" className="h-3 w-3" aria-hidden /></span>}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
            <button type="button" disabled={add.isPending || full} onClick={choose} data-track-as="hiking-photo-add" data-testid="hk-photo-add"
                className={`flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24] disabled:opacity-50 ${shown.length > 0 ? "mt-2.5" : ""}`}>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4Z" /><circle cx="12" cy="13.2" r="3.4" /></svg>
                {add.isPending ? "사진을 올리는 중…" : compact && photos.length > 0 ? `${HIKING_PHOTO_LABEL.add} · ${photos.length}장` : HIKING_PHOTO_LABEL.add}
            </button>
            {msg && <p className="mt-2 text-[13.5px] leading-snug text-[#F6D9A8] break-keep" role="status" data-testid="hk-photo-msg">{msg}</p>}
            {full && <p className="mt-2 text-[13px] text-[#F4EFE399] break-keep">{HIKING_PHOTO_LABEL.full}</p>}
            {/* 어디에 보이는지는 산행 중 화면에서도 말한다 — 올리는 순간 남에게 보이기 때문이다 */}
            <p className="mt-2 text-[12.5px] leading-snug text-[#F4EFE399] break-keep" data-testid="hk-photo-where">{HIKING_PHOTO_LABEL.where}</p>
            {!compact && <p className="mt-1 text-[12.5px] leading-snug text-[#F4EFE399] break-keep" data-testid="hk-photo-face">{HIKING_PHOTO_LABEL.faceShort}</p>}
            {!compact && <p className="mt-1 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">{HIKING_PHOTO_LABEL.note}</p>}

            {open && (
                <PhotoStage photos={photos} index={at} onIndex={(i) => { setNote(null); setOpenId(photos[i]?.id ?? null); }} onClose={close} label={`${name} 내 산행 사진`}
                    action={(
                        <button type="button" disabled={remove.isPending} data-testid="hk-photo-delete"
                            onClick={async () => { if (await appConfirm({ title: "이 사진을 지울까요?", message: open.isPublic && !open.hidden ? "이 산의 화면에서도 사라지고, 되돌릴 수 없어요." : "지우면 되돌릴 수 없어요.", confirmText: "지우기", cancelText: "그대로 두기", tone: "danger" })) remove.mutate(open.id); }}
                            className="h-10 rounded-full px-3.5 text-[15px] text-[#FF9C8A] active:bg-[#FFFFFF14] disabled:opacity-50">지우기</button>
                    )}>
                    <p className="truncate text-[15px] font-semibold text-[#F4EFE3]">{name}</p>
                    <p className="mt-0.5 text-[13px] text-[#F4EFE399]">내 사진 · {stampDate(open.takenAt)}</p>
                    <div className="mt-3.5"><Audience on={open.isPublic} busy={audience.isPending} onPick={(isPublic) => audience.mutate({ id: open.id, isPublic })} /></div>
                    {open.hidden ? (
                        // 신고로 가려진 내 사진 — 알림과 이의제기는 늘 한 벌이다(여럿이 짜고 신고하는 것을 막는 길)
                        <div className="mt-2.5 flex items-center gap-2.5 rounded-xl bg-[#FF9C8A1F] px-3.5 py-2.5" data-testid="hk-photo-hidden">
                            <p className="min-w-0 flex-1 text-[13px] leading-snug text-[#FFD3C9] break-keep">{open.appealed ? HIKING_PHOTO_LABEL.appealed : HIKING_PHOTO_LABEL.hidden}</p>
                            {!open.appealed && (
                                <button type="button" disabled={appeal.isPending} onClick={() => appeal.mutate(open.id)} data-testid="hk-photo-appeal"
                                    className="h-9 shrink-0 rounded-full bg-[#FFFFFF1F] px-3.5 text-[13.5px] font-semibold text-[#F4EFE3] active:bg-[#FFFFFF33] disabled:opacity-60">{HIKING_PHOTO_LABEL.appeal}</button>
                            )}
                        </div>
                    ) : (
                        // 지금 상태 한 줄 — 공개인 동안에는 어디에 보이는지와 얼굴 이야기가 늘 보인다
                        <p className="mt-2.5 text-[13px] leading-snug text-[#F4EFE3B3] break-keep" data-testid="hk-photo-state">{open.isPublic ? HIKING_PHOTO_LABEL.face : HIKING_PHOTO_LABEL.privateNow}</p>
                    )}
                    {note && <p className="mt-2 text-[13px] leading-snug text-[#F6D9A8] break-keep" role="status" data-testid="hk-photo-note">{note}</p>}
                </PhotoStage>
            )}
        </div>
    );
}
