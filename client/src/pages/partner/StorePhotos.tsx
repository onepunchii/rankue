/**
 * 매장 사진 올리기(2026-11-06 — shared/storePhotos). 사장님 '매장 정보 수정' 맨 위. 올리거나 지우면 바로 저장된다(아래 '저장' 단추와 따로).
 * 공개 매장 페이지(/stores/<code>)의 맨 위 사진 줄에 이 순서대로 뜬다. 최대 STORE_PHOTO_MAX 장.
 * 올리기는 회원 공용 업로드(EXIF · 위치 정보를 걷는다) — 랭큐 계정으로 들어온 사장님만 된다(예전 번호 + PIN 으로만 들어온 경우는 안내).
 */
import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { uploadImage } from "@/lib/imageUtils";
import { useToast } from "@/hooks/use-toast";
import { STORE_PHOTO_CATEGORY, STORE_PHOTO_MAX, storePhotosOf } from "@shared/storePhotos";

export function StorePhotos({ images }: { images: unknown }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const input = useRef<HTMLInputElement>(null);
    const [busy, setBusy] = useState(false);
    const photos = storePhotosOf(images);

    const save = async (next: string[]) => {
        await apiRequest("/api/hiq/partner/store", { method: "PATCH", body: { images: next } });
        await qc.invalidateQueries({ queryKey: ["/api/hiq/partner/store"] });
    };
    const add = async (files: FileList | null) => {
        if (!files?.length || busy) return;
        const room = STORE_PHOTO_MAX - photos.length;
        const picked = Array.from(files).slice(0, Math.max(0, room));
        if (picked.length === 0) { toast({ title: `사진은 ${STORE_PHOTO_MAX}장까지 올릴 수 있어요` }); return; }
        setBusy(true);
        try {
            const urls: string[] = [];
            for (const f of picked) urls.push(await uploadImage(f, STORE_PHOTO_CATEGORY, { maxSize: 1600, quality: 0.82 }));
            await save([...photos, ...urls]);
            toast({ title: "사진을 올렸어요", description: "매장 페이지 맨 위에 보여요." });
        } catch (e: any) {
            const msg = String(e?.message ?? "");
            toast({ title: /401|로그인/.test(msg) ? "랭큐 계정으로 로그인한 뒤 올릴 수 있어요" : "사진을 올리지 못했어요", variant: "destructive" });
        } finally {
            setBusy(false);
            if (input.current) input.current.value = "";
        }
    };
    const remove = async (url: string) => {
        if (busy) return;
        setBusy(true);
        try { await save(photos.filter((p) => p !== url)); }
        catch { toast({ title: "지우지 못했어요", variant: "destructive" }); }
        finally { setBusy(false); }
    };

    return (
        <div className="space-y-3" data-testid="partner-store-photos">
            <div className="flex items-baseline justify-between">
                <h2 className="text-brand font-bold text-sm">매장 사진</h2>
                <span className="text-[12px] text-black/45 tabular-nums">{photos.length}/{STORE_PHOTO_MAX}</span>
            </div>
            <div className="bg-white p-4 rounded-2xl shadow-[0_1px_2px_rgba(0,0,0,0.05)]">
                <p className="text-[12.5px] text-black/55 break-keep">매장 페이지 맨 위에 보여요. 당구대 · 입구 · 간판처럼 손님이 알아볼 사진이 좋아요. 올리면 바로 저장돼요.</p>
                <div className="mt-3 grid grid-cols-3 gap-2">
                    {photos.map((url) => (
                        <div key={url} className="relative aspect-square overflow-hidden rounded-xl bg-black/[0.04]">
                            <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
                            <button type="button" onClick={() => void remove(url)} disabled={busy} aria-label="사진 지우기"
                                className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-[15px] leading-none text-white disabled:opacity-50">×</button>
                        </div>
                    ))}
                    {photos.length < STORE_PHOTO_MAX && (
                        <button type="button" onClick={() => input.current?.click()} disabled={busy} data-testid="partner-photo-add"
                            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-black/20 text-[12.5px] font-semibold text-black/55 disabled:opacity-50">
                            <span className="text-[22px] leading-none">{busy ? "…" : "+"}</span>{busy ? "올리는 중" : "사진 추가"}
                        </button>
                    )}
                </div>
                <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void add(e.target.files)} />
            </div>
        </div>
    );
}
