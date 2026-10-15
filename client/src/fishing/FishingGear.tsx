import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { GEAR_KINDS, GEAR_LABEL, daysSince, type FishingGear as Gear, type GearKind } from "@shared/fishingGear";

const KEY = ["/api/hiq/fishing/gear"];
const field = "h-11 w-full rounded-xl bg-[#FFFFFF0F] px-3.5 text-[14.5px] text-[#F3ECDD] placeholder:text-[#F3ECDD59] outline-none";

export function FishingGear({ today }: { today: string }) {
    const { data: gear = [], isLoading } = useQuery<Gear[]>({ queryKey: KEY });
    const [kind, setKind] = useState<GearKind>("rod");
    const [name, setName] = useState("");
    const [brand, setBrand] = useState("");
    const [spec, setSpec] = useState("");
    const [error, setError] = useState<string | null>(null);
    const refresh = () => queryClient.invalidateQueries({ queryKey: KEY });

    const add = useMutation({
        mutationFn: () => apiRequest("/api/hiq/fishing/gear", { method: "POST", body: { kind, name, brand, spec } }),
        onSuccess: () => { setName(""); setBrand(""); setSpec(""); setError(null); void refresh(); },
        onError: (e: Error) => setError(e.message || "적지 못했어요"),
    });
    const remove = useMutation({ mutationFn: (id: string) => apiRequest(`/api/hiq/fishing/gear/${id}`, { method: "DELETE" }), onSuccess: () => void refresh() });
    const lineChanged = useMutation({ mutationFn: (id: string) => apiRequest(`/api/hiq/fishing/gear/${id}/line`, { method: "POST", body: { day: today } }), onSuccess: () => void refresh() });

    return (
        <div data-testid="fishing-gear">
            <div className="rounded-2xl bg-[#FFFFFF0A] p-3.5">
                <div className="flex gap-1.5" role="group" aria-label="장비 종류">
                    {GEAR_KINDS.map((k) => (
                        <button key={k} type="button" onClick={() => setKind(k)} aria-pressed={kind === k} className="h-10 flex-1 rounded-full text-[13.5px] font-semibold"
                            style={kind === k ? { background: "#F4A963", color: "#2A1606" } : { background: "#FFFFFF14", color: "#F3ECDDCC" }}>{GEAR_LABEL[k]}</button>
                    ))}
                </div>
                <div className="mt-3 space-y-2">
                    <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder={kind === "combo" ? "이름 (예: 감성돔 찌낚시)" : "모델 이름"} className={field} data-testid="gear-name" />
                    <div className="flex gap-2">
                        <input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={30} placeholder="브랜드" className={field} />
                        <input value={spec} onChange={(e) => setSpec(e.target.value)} maxLength={60} placeholder={kind === "rod" ? "길이 · 호수" : kind === "reel" ? "크기 (예: 2500)" : kind === "line" ? "종류 · 호수" : "대 · 릴 · 줄"} className={field} />
                    </div>
                </div>
                {error && <p role="alert" className="mt-2 text-[13px] text-[#FF9C9C]">{error}</p>}
                <button type="button" onClick={() => add.mutate()} disabled={!name.trim() || add.isPending} className="mt-3 h-12 w-full rounded-xl text-[15px] font-semibold disabled:opacity-50" style={{ background: "#F4A963", color: "#2A1606" }} data-testid="gear-add">
                    {GEAR_LABEL[kind]} 적기
                </button>
            </div>

            {isLoading ? <div className="mt-4 h-24 rounded-2xl bg-[#FFFFFF0A]" aria-busy="true" /> : gear.length === 0 ? (
                <p className="mt-4 text-[13.5px] leading-relaxed text-[#F3ECDD99] break-keep">아직 적은 장비가 없어요. 대 · 릴 · 줄을 적어 두면 릴마다 줄을 언제 갈았는지 볼 수 있어요.</p>
            ) : GEAR_KINDS.map((k) => {
                const rows = gear.filter((g) => g.kind === k);
                if (!rows.length) return null;
                return (
                    <section key={k} className="mt-5">
                        <h3 className="mb-2 text-[14px] font-semibold text-[#F3ECDDCC]">{GEAR_LABEL[k]} <span className="text-[12.5px] font-normal text-[#F3ECDD80]">{rows.length}</span></h3>
                        <ul className="overflow-hidden rounded-2xl bg-[#FFFFFF0A]">
                            {rows.map((g, i) => {
                                const last = g.lineLog[0];
                                return (
                                    <li key={g.id} className={`flex min-h-[60px] items-center gap-3 px-3.5 py-2.5 ${i ? "border-t border-[#FFFFFF14]" : ""}`}>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[15px] font-semibold text-[#F3ECDD]">{g.name}</span>
                                            <span className="block truncate text-[12.5px] text-[#F3ECDD80]">{[g.brand, g.spec].filter(Boolean).join(" · ") || "\u00a0"}</span>
                                            {g.kind === "reel" && <span className="block text-[12.5px] text-[#F4A963]">{last ? `줄 간 지 ${daysSince(last.day, today)}일 (${last.day})` : "줄을 간 기록이 없어요"}</span>}
                                        </span>
                                        {g.kind === "reel" && <button type="button" onClick={() => lineChanged.mutate(g.id)} disabled={lineChanged.isPending} className="h-10 shrink-0 rounded-full bg-[#FFFFFF14] px-3 text-[13px] font-semibold text-[#F3ECDD]">줄 갈았어요</button>}
                                        <button type="button" onClick={() => remove.mutate(g.id)} aria-label={`${g.name} 지우기`} className="h-10 shrink-0 rounded-full px-3 text-[13px] text-[#F3ECDD80]">지우기</button>
                                    </li>
                                );
                            })}
                        </ul>
                    </section>
                );
            })}
        </div>
    );
}
