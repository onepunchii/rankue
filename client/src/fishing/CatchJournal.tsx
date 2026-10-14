/**
 * 내 조과 — 출조 일지(2026-10-14 오너: "잡은 물고기의 기록과 사진 남기기 … 가 제일 중요").
 *
 * 줄의 목록이 아니라 **나간 날마다 종이 한 장**이다: 날짜 · 다녀온 곳 · 그날의 물때, 그날 남긴 사진, 그 아래에 낚은 것들.
 * 사진이 먼저 보인다 — 한 장이면 크게, 여러 장이면 옆으로 넘긴다. '사진'으로 바꾸면 남긴 사진만 모아 본다.
 * 줄을 누르면 그 어종의 한 장이 열린다. 사진은 나만 본다(화면에 그렇게 적는다).
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useMemo, useState } from "react";
import { LucideX } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { FISHING_COLORS as C, fishingDayLabel, fishingSpotName, type FishingCatch } from "@shared/fishing";
import { fishByName, fishTier, fishValue, fishValueText } from "@shared/fishingFish";
import { tideOf, tideWeekday } from "@shared/fishingTide";
import { INK, PAPER, PhotoZoom, Seal, art } from "./ink";

const RULE = "1px dashed #0F283826";
const photoOf = (c: FishingCatch) => c.photoUrl ?? c.thumbUrl;
const valueText = (c: FishingCatch): string => {
    const fish = fishByName(c.species);
    const v = fish ? fishValue(fish, c) : c.lengthCm;
    const main = v != null ? fishValueText(fish?.unit ?? "cm", v) : `${c.count}수`;
    return fish && fish.unit !== "count" && v != null && c.count > 1 ? `${main} · ${c.count}수` : main;
};
const caption = (c: FishingCatch, today: string) => [`${c.species} ${valueText(c)}`, fishingDayLabel(c.day, today), c.place].filter(Boolean).join(" · ");

export function CatchJournal({ list, today, onFish, onRemove }: { list: readonly FishingCatch[]; today: string; /** 그 어종의 한 장을 연다 */ onFish: (id: string) => void; onRemove: (id: string) => void }) {
    const [mode, setMode] = useState<"days" | "photos">("days");
    const [zoom, setZoom] = useState<FishingCatch | null>(null);
    const days = useMemo(() => {
        const by = new Map<string, FishingCatch[]>();
        for (const c of list) { const g = by.get(c.day); if (g) g.push(c); else by.set(c.day, [c]); }
        return [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
    }, [list]);
    const photos = useMemo(() => list.filter((c) => photoOf(c)), [list]);
    const tab = (id: "days" | "photos", label: string) => (
        <button type="button" aria-pressed={mode === id} onClick={() => setMode(id)} data-testid={`fishing-journal-${id}`}
            className={cn("h-9 flex-1 rounded-full text-[13.5px]", mode === id && "font-semibold")} style={mode === id ? { background: C.brand, color: C.onBrand } : { color: C.soft }}>{label}</button>
    );

    return (
        <div data-testid="fishing-journal">
            <div className="mt-3 flex rounded-full p-0.5" style={{ background: "#FFFFFF0F" }} role="group" aria-label="보는 방법">
                {tab("days", `출조 ${days.length}번`)}{tab("photos", `사진 ${photos.length}장`)}
            </div>

            {mode === "photos" ? (
                photos.length === 0 ? <p className="mt-3 rounded-2xl px-5 py-8 text-center text-[14px] [word-break:keep-all]" style={{ border: "1px dashed #FFFFFF2E", color: C.soft }}>아직 남긴 사진이 없어요. 조과를 적을 때 한 장 같이 남겨 보세요.</p> : (
                    <div className="mt-3 grid grid-cols-3 gap-[3px] overflow-hidden rounded-2xl" data-testid="fishing-journal-grid">
                        {photos.map((c) => (
                            <button key={c.id} type="button" onClick={() => setZoom(c)} className="relative aspect-square overflow-hidden active:opacity-85" style={{ background: "#FFFFFF14" }} aria-label={caption(c, today)}>
                                <img src={c.thumbUrl ?? c.photoUrl ?? ""} alt="" loading="lazy" className="h-full w-full object-cover" />
                                <span className="absolute inset-x-0 bottom-0 truncate px-1.5 pb-1 pt-4 text-left text-[12px] tabular-nums" style={{ background: "linear-gradient(180deg,#0B1E2D00 0%,#0B1E2DCC 100%)", color: "#F3ECDD" }}>{c.species} {valueText(c).split(" · ")[0]}</span>
                            </button>
                        ))}
                    </div>
                )
            ) : (
                <ol className="mt-1">
                    {days.map(([day, rows], gi) => {
                        const shots = rows.filter((c) => photoOf(c));
                        const places = [...new Set(rows.map((c) => c.place).filter(Boolean))];
                        const spots = [...new Set(rows.map((c) => fishingSpotName(c.spot)).filter(Boolean))];
                        const sea = rows.find((c) => c.tideSea)?.tideSea ?? null;
                        const tide = sea ? tideOf(day, sea) : null;
                        const month = day.slice(0, 7), newMonth = gi === 0 || days[gi - 1][0].slice(0, 7) !== month;
                        const weekend = ["토", "일"].includes(tideWeekday(day));
                        return (
                            <li key={day} data-testid="fishing-journal-day" data-day={day}>
                                {newMonth && <p className="px-1 pb-2 pt-5 text-[13px] tabular-nums" style={{ color: C.dim }}>{Number(month.slice(0, 4))}년 {Number(month.slice(5))}월</p>}
                                <div className={cn("overflow-hidden rounded-2xl", !newMonth && "mt-2.5")} style={{ background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                                    {/* 머리 — 날 · 곳 · 물때 */}
                                    <div className="flex items-center gap-3 px-3.5 pb-2.5 pt-3">
                                        <p className="w-[42px] shrink-0 text-center leading-none">
                                            <span className="block text-[26px] font-semibold tabular-nums tracking-tight">{Number(day.slice(8))}</span>
                                            <span className="mt-1 block text-[12px]" style={{ color: weekend ? "#B7462A" : "#0F283899" }}>{tideWeekday(day)}요일</span>
                                        </p>
                                        <p className="min-w-0 flex-1">
                                            <span className="block truncate text-[16px] font-semibold tracking-tight">{places.join(" · ") || "곳을 적지 않은 날"}</span>
                                            <span className="mt-0.5 block truncate text-[13px]" style={{ color: "#0F283899" }}>{[spots.join(" · "), `${rows.length}줄`].filter(Boolean).join(" · ")}</span>
                                        </p>
                                        {tide && <span className="shrink-0 rounded-full px-2.5 py-1 text-[12.5px] tabular-nums" style={{ boxShadow: "inset 0 0 0 1px #0F283840", color: "#0F2838CC" }}>{tide.name}</span>}
                                    </div>
                                    {/* 그날의 사진 — 한 장이면 크게, 여러 장이면 옆으로 */}
                                    {shots.length === 1 && (
                                        <button type="button" onClick={() => setZoom(shots[0])} className="block w-full px-3.5 pb-3 active:opacity-90" aria-label={caption(shots[0], today)} data-testid="fishing-journal-photo">
                                            <img src={photoOf(shots[0]) ?? ""} alt="" loading="lazy" className="aspect-[16/10] w-full rounded-lg object-cover" />
                                        </button>
                                    )}
                                    {shots.length > 1 && (
                                        <div className="flex gap-2 overflow-x-auto px-3.5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                            {shots.map((c) => (
                                                <button key={c.id} type="button" onClick={() => setZoom(c)} className="shrink-0 active:opacity-90" aria-label={caption(c, today)} data-testid="fishing-journal-photo">
                                                    <img src={c.thumbUrl ?? c.photoUrl ?? ""} alt="" loading="lazy" className="h-[132px] w-[176px] rounded-lg object-cover" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {/* 낚은 것 */}
                                    <ul>
                                        {rows.map((c) => {
                                            const fish = fishByName(c.species);
                                            const v = fish ? fishValue(fish, c) : null;
                                            const tier = fish && v != null ? fishTier(fish, v).tier : null;
                                            return (
                                                <li key={c.id} className="flex items-center gap-2.5 py-2 pl-3.5 pr-1.5" style={{ borderTop: RULE }} data-testid="fishing-catch">
                                                    <button type="button" disabled={!fish} onClick={() => fish && onFish(fish.id)} className="flex min-h-[44px] min-w-0 flex-1 items-center gap-2.5 text-left active:opacity-70" aria-label={fish ? `${fish.name} 한 장` : undefined}>
                                                        <span className="flex h-9 w-[50px] shrink-0 items-center justify-center">
                                                            {fish ? <img src={art(fish.id)} alt="" width={640} height={400} loading="lazy" decoding="async" className="h-9 w-[50px] object-contain" style={{ mixBlendMode: "multiply" }} /> : <i aria-hidden className="h-[2px] w-6 rounded-full" style={{ background: "#0F283840" }} />}
                                                        </span>
                                                        <span className="min-w-0 flex-1">
                                                            <span className="block truncate text-[15px] font-semibold">{c.species}{c.released ? <span className="ml-1.5 text-[12.5px] font-normal" style={{ color: "#0F283899" }}>방류</span> : null}</span>
                                                            {c.note ? <span className="mt-0.5 line-clamp-2 text-[13px] leading-snug [word-break:keep-all]" style={{ color: "#0F2838B3" }}>{c.note}</span> : null}
                                                        </span>
                                                        <span className="shrink-0 text-[15px] font-semibold tabular-nums">{valueText(c)}</span>
                                                        {tier && <Seal text={tier.name} size={30} />}
                                                    </button>
                                                    <button type="button" aria-label="이 기록 지우기" onClick={() => onRemove(c.id)} className="flex h-9 w-8 shrink-0 items-center justify-center rounded-full active:bg-[#0F283814]" data-testid="fishing-catch-delete"><LucideX className="h-4 w-4" style={{ color: "#0F283873" }} /></button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            </li>
                        );
                    })}
                </ol>
            )}
            <p className="mt-3 px-1 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>사진은 나만 봐요. 잡은 곳은 적은 이름만 남고 위치는 재지 않아요.</p>
            {zoom && photoOf(zoom) && <PhotoZoom src={photoOf(zoom)!} alt={`${zoom.species} 사진`} caption={caption(zoom, today)} onClose={() => setZoom(null)} />}
        </div>
    );
}
