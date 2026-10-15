import { useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { MARK_COLOR, MARK_KINDS, MARK_LABEL, type HikingMark, type MarkKind } from "@shared/hikingMarks";
import { aheadText, bearingDeg, compass } from "@shared/hikingTrail";
import { uploadMarkPhoto } from "../photos/photoApi";

const distM = (aLat: number, aLng: number, bLat: number, bLng: number) => {
    const r = Math.PI / 180, dLat = (bLat - aLat) * r, dLng = (bLng - aLng) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(dLng / 2) ** 2;
    return Math.round(6_371_000 * 2 * Math.asin(Math.min(1, Math.sqrt(h))));
};

export function MyMarks({ mountainId, here }: { mountainId: string; here: { lat: number; lng: number } | null }) {
    const key = ["/api/hiq/hiking/me/marks", mountainId];
    const { data: marks = [] } = useQuery<HikingMark[]>({ queryKey: key, queryFn: () => apiRequest(`/api/hiq/hiking/me/marks?mountainId=${encodeURIComponent(mountainId)}`) });
    const [adding, setAdding] = useState(false);
    const [kind, setKind] = useState<MarkKind>("water");
    const [note, setNote] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const fileRef = useRef<HTMLInputElement>(null);
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });

    const add = useMutation({
        mutationFn: async () => {
            if (!here) throw new Error("자리를 아직 받지 못했어요");
            const photoUrl = file ? await uploadMarkPhoto(file) : null;
            return apiRequest("/api/hiq/hiking/me/marks", { method: "POST", body: { mountainId, kind, lat: here.lat, lng: here.lng, note, photoUrl } });
        },
        onSuccess: () => { setAdding(false); setNote(""); setFile(null); setError(null); void refresh(); },
        onError: (e: Error) => setError(e.message || "표시하지 못했어요"),
    });
    const remove = useMutation({ mutationFn: (id: string) => apiRequest(`/api/hiq/hiking/me/marks/${id}`, { method: "DELETE" }), onSuccess: () => void refresh() });

    if (!here && marks.length === 0) return null;
    return (
        <section className="mt-5" aria-label="내 표시 지점" data-testid="hk-marks">
            <div className="mb-2 flex items-center justify-between">
                <h3 className="text-[14.5px] font-semibold text-[#F4EFE3]">내 표시 지점 <span className="text-[12.5px] font-normal text-[#F4EFE380]">나만 봐요</span></h3>
                {here && !adding && <button type="button" onClick={() => setAdding(true)} className="h-9 rounded-full bg-[#F28C6A] px-3.5 text-[13.5px] font-semibold text-[#2A1208]" data-testid="hk-mark-add">여기 표시하기</button>}
            </div>
            {adding && (
                <div className="mb-3 rounded-2xl bg-[#FFFFFF0A] p-3.5">
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label="종류">
                        {MARK_KINDS.map((k) => (
                            <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className="h-10 rounded-full px-3.5 text-[13.5px] font-semibold"
                                style={kind === k ? { background: MARK_COLOR[k], color: "#0E2A33" } : { background: "#FFFFFF14", color: "#F4EFE3CC" }}>{MARK_LABEL[k]}</button>
                        ))}
                    </div>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={120} placeholder="메모 (예: 물이 차가워요 · 왼쪽 길이 미끄러워요)" className="mt-2.5 h-11 w-full rounded-xl bg-[#FFFFFF14] px-3 text-[14.5px] text-[#F4EFE3] placeholder:text-[#F4EFE359] outline-none" />
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                    <button type="button" onClick={() => fileRef.current?.click()} className="mt-2 h-10 w-full rounded-xl bg-[#FFFFFF0F] text-[13.5px] text-[#F4EFE3CC]">{file ? `사진: ${file.name}` : "사진 한 장 (선택)"}</button>
                    {error && <p role="alert" className="mt-2 text-[13px] text-[#FFB4A6]">{error}</p>}
                    <div className="mt-2.5 flex gap-2">
                        <button type="button" onClick={() => { setAdding(false); setError(null); }} className="h-11 flex-1 rounded-xl bg-[#FFFFFF14] text-[14px] text-[#F4EFE3]">그만두기</button>
                        <button type="button" onClick={() => add.mutate()} disabled={add.isPending || !here} className="h-11 flex-1 rounded-xl bg-[#F28C6A] text-[14px] font-semibold text-[#2A1208] disabled:opacity-50" data-testid="hk-mark-save">{add.isPending ? "남기는 중…" : "지금 자리에 남기기"}</button>
                    </div>
                </div>
            )}
            {marks.length > 0 && (
                <ul className="overflow-hidden rounded-2xl bg-[#FFFFFF0A]">
                    {marks.map((m, i) => {
                        const away = here ? distM(here.lat, here.lng, m.lat, m.lng) : null;
                        return (
                            <li key={m.id} className={`flex min-h-[56px] items-center gap-3 px-3.5 py-2 ${i ? "border-t border-[#FFFFFF14]" : ""}`}>
                                <i aria-hidden className="h-3 w-3 shrink-0 rounded-full" style={{ background: MARK_COLOR[m.kind] }} />
                                {m.photoUrl && <img src={m.photoUrl} alt="" className="h-10 w-12 shrink-0 rounded-md object-cover" loading="lazy" />}
                                <span className="min-w-0 flex-1">
                                    <span className="block text-[14.5px] font-semibold text-[#F4EFE3]">{MARK_LABEL[m.kind]}{away != null && <span className="ml-1.5 text-[12.5px] font-normal text-[#F6D9A8]">{compass(bearingDeg(here!.lat, here!.lng, m.lat, m.lng))}쪽 {aheadText(away)}</span>}</span>
                                    {m.note && <span className="block truncate text-[12.5px] text-[#F4EFE399]">{m.note}</span>}
                                </span>
                                <button type="button" onClick={() => remove.mutate(m.id)} aria-label={`${MARK_LABEL[m.kind]} 표시 지우기`} className="h-9 shrink-0 rounded-full px-2.5 text-[12.5px] text-[#F4EFE380]">지우기</button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}
