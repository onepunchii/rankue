/**
 * 바다 한 칸의 팝업(2026-10-14 오너: "해당 픽셀을 찍으면 팝업으로 디자인 이쁘게 어류 사진도 나오면서 파고 바람 수온 이런 것도 버튼형으로 세련되고 이미지 제작해서").
 *
 * 아래에서 올라오는 한 장 — 위에서부터:
 *  1. 그 바다 구역의 표지(판화 · sea-<구역>.webp) 위에 지점 이름 · 구역 · 고른 칸에서의 거리 · 풍랑특보 꼬리표
 *  2. 오늘 이 바다의 어종 — 사진 카드(위키미디어 공용 · 사진마다 작가와 라이선스를 아래에 적는다. 사진이 없는 어종은 우리 어탁) · 오전/오후 지수
 *  3. 파고 · 바람 · 수온 · 물때 단추(그림은 같은 손의 판화) — 누르면 그 아래에 자세히(예보 범위 · 가까운 부이의 지금 값 · 만조/간조)
 *  4. 이 근처에서 적은 내 조과(위치를 재지 않으니 적은 곳 이름이 근처 지명과 같은 줄)
 *  5. 여기서 낚았어요 — 조과 적기
 * 지수는 국립해양조사원이 매긴 값이라고 적는다(랭큐가 매긴 값이 아니다). ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LucidePlus, LucideX } from "@/lib/icons";
import { FISHING_COLORS as C, fishingDayLabel, type FishingCatch } from "@shared/fishing";
import { fishByName, fishValue, fishValueText } from "@shared/fishingFish";
import { FISH_GUIDE_NAME } from "@shared/fishingFishInfo";
import { hhmm, rangeText, windDirKo, type FishingIndexStep, type IndexSpot, type PortBrief } from "@shared/fishingPort";
import { tideOf, TIDE_PHASE_TEXT } from "@shared/fishingTide";
import { seaVerdict } from "@shared/fishingPort";
import type { SeaArea } from "@shared/fishingSea";
import { FISHING_PORTS } from "@shared/fishingStations";
import { INK, PAPER, art } from "./ink";
import { PhotoCredit, guidePhoto, useGuideIndex, type GuidePhotoCredit } from "./Guide";
import { seaTagText, zoneAt } from "./SeaChart";

const STEP_TONE: Readonly<Record<FishingIndexStep, { bg: string; text: string }>> = {
    매우좋음: { bg: "#0F4A66", text: "#F3ECDD" }, 좋음: { bg: "#3F86A8", text: "#F3ECDD" }, 보통: { bg: "#A9C9D3", text: "#0F2838" },
    나쁨: { bg: "#E2D0A8", text: "#5E4520" }, 매우나쁨: { bg: "#CDB487", text: "#4A3416" },
};
const short = (n: string) => n.replace(/\(.*\)$/, "").replace(/(북동|남동|북서|남서|북북서|남남동|남남서|동북동|동남동|동측|서측|남측|북측)$/, "");
const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => Math.hypot((a.lng - b.lng) * 88.8, (a.lat - b.lat) * 111);


function Pill({ step, label }: { step: FishingIndexStep | null; label: string }) {
    const t = step ? STEP_TONE[step] : null;
    return (
        <span className="flex min-w-0 flex-1 flex-col items-center rounded-lg py-1" style={{ background: t?.bg ?? "#0F28380F", color: t?.text ?? "#0F283880" }}>
            <span className="text-[12px] leading-tight opacity-80">{label}</span>
            <span className="text-[12.5px] font-semibold leading-tight">{step ?? "–"}</span>
        </span>
    );
}

export function SeaPopup({ spot, fish, day, today, cell, list, areas, onClose, onAdd, onFish, fromMe = null }: {
    /** 내 위치에서의 거리(km) — 내 위치를 켰을 때만 */ fromMe?: number | null;
    spot: IndexSpot; fish: string; day: string; today: string;
    /** 픽셀을 눌러 왔으면 그 칸 */ cell: { lat: number; lng: number; km: number } | null;
    list: readonly FishingCatch[]; areas: readonly SeaArea[];
    onClose: () => void; onAdd: (species: string | undefined) => void; /** 어탁이 있는 어종의 한 장으로 */ onFish: (name: string) => void;
}) {
    const at = cell ?? { lat: spot.lat, lng: spot.lng, km: 0 };
    const zone = zoneAt(at.lat, at.lng) ?? zoneAt(spot.lat, spot.lng);
    const state = zone ? areas.find((a) => a.id === zone.id)?.state ?? "clear" : "clear";
    const tag = seaTagText(state);
    // 가까운 조위 관측소 — 만조 · 간조 · 지금의 부이
    const port = useMemo(() => {
        let best: { code: string; name: string; km: number } | null = null;
        for (const p of FISHING_PORTS) { const km = Math.round(kmBetween(p, spot)); if (!best || km < best.km) best = { code: p.code, name: p.name, km }; }
        return best && best.km <= 80 ? best : null;
    }, [spot]);
    const { data: brief } = useQuery<PortBrief | null>({ queryKey: port ? ["/api/hiq/fishing/ports", port.code, day] : ["/api/hiq/fishing/ports", "none"], queryFn: () => apiRequest(`/api/hiq/fishing/ports/${port!.code}?day=${day}`), enabled: !!port, staleTime: 5 * 60_000 });
    const { data: guide } = useGuideIndex();

    // 어종 카드 — 고른 어종이 먼저. 사진은 도감(위키미디어 공용)에서, 없으면 우리 어탁
    const names = [fish, ...Object.keys(spot.fish).filter((f) => f !== fish)].filter((f) => spot.fish[f]);
    const cardOf = (name: string) => {
        const ours = fishByName(name);
        const gname = ours ? FISH_GUIDE_NAME[ours.id] : null;
        const row = gname && guide ? guide.find((g) => g.name === gname) ?? null : null;
        return { name, ours, photo: row?.photo ? guidePhoto(row.key) : null, credit: row?.photo ?? null as GuidePhotoCredit | null };
    };
    const cards = names.map(cardOf);

    // 이 근처 내 기록 — 적은 곳 이름이 근처 지명(낚시지수 지점 · 30km 안의 조위 관측소)과 같은 줄
    const nearNames = useMemo(() => {
        const out = new Set<string>([short(spot.name)]);
        for (const p of FISHING_PORTS) if (kmBetween(p, at) <= 30) out.add(p.name);
        return [...out].filter((n) => n.length >= 2);
    }, [spot.name, at.lat, at.lng]);
    const mine = list.filter((c) => nearNames.some((n) => c.place.replace(/\s+/g, "").includes(n)));

    const sea = zone?.id.startsWith("west") ? "west" : "south";
    const tide = tideOf(day, sea);
    const buoy = brief?.now?.buoy ?? null;
    // 네 칸 — 예보 범위(국립해양조사원) + 그 아래 지금 잰 값(가까운 부이 · 관측소). 누르는 단추가 아니라 한눈 표(예전엔 누르면 같은 값을 한 번 더 적었다)
    const conds: { id: string; icon: string; label: string; value: string; now: string | null }[] = [
        { id: "wave", icon: "wave", label: "파고", value: spot.wave ? `${rangeText(spot.wave)}m` : "–", now: buoy?.wave != null ? `지금 ${buoy.wave.toFixed(1)}m · ${buoy.name}` : null },
        { id: "wind", icon: "wind", label: "바람", value: spot.wind ? `${rangeText(spot.wind)}m/s` : "–", now: buoy?.wind != null ? `지금 ${[windDirKo(buoy.windDir), `${buoy.wind.toFixed(1)}m/s`].filter(Boolean).join(" ")}` : null },
        { id: "temp", icon: "temp", label: "수온", value: spot.wtemp ? `${rangeText(spot.wtemp)}°` : brief?.now?.wtemp != null ? `${brief.now.wtemp.toFixed(1)}°` : "–", now: brief?.now?.wtemp != null && port ? `지금 ${brief.now.wtemp.toFixed(1)}° · ${port.name}` : null },
        { id: "tide", icon: "tide", label: "물때", value: tide?.name ?? spot.tide ?? "–", now: tide ? TIDE_PHASE_TEXT[tide.phase] : null },
    ];
    const verdict = seaVerdict(spot.fish[fish], spot, tag);
    const VERDICT_TONE = { good: { bg: "#0F4A66", text: "#F3ECDD" }, mid: { bg: "#A9C9D333", text: "#F3ECDD" }, bad: { bg: "#E2D0A81F", text: "#F8DDB0" } } as const;
    const dayWord = day === today ? "오늘" : fishingDayLabel(day, today);

    return (
        <div className="fixed inset-0 z-[65] flex flex-col justify-end" role="dialog" aria-modal="true" aria-label={`${short(spot.name)} 바다`} data-testid="fishing-sea-popup">
            <button type="button" aria-label="닫기" onClick={onClose} className="absolute inset-0" style={{ background: "#071521B3" }} />
            <div className="relative flex max-h-[88dvh] flex-col overflow-hidden rounded-t-[28px]" style={{ background: C.bg, color: C.foam, boxShadow: "0 -12px 40px #00000066" }}>
                {/* 1. 표지 — 그 바다 구역의 판화 */}
                <div className="relative h-[150px] shrink-0 overflow-hidden">
                    <img src={`/fishing/art/sea-${zone?.id ?? "south-west"}.webp`} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 55%" }} draggable={false} />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D33 0%,#0B1E2D00 30%,#0B1E2DCC 78%,#0B1E2D 100%)" }} aria-hidden />
                    <i aria-hidden className="absolute left-1/2 top-2 h-1 w-10 -translate-x-1/2 rounded-full" style={{ background: "#F3ECDD99" }} />
                    <button type="button" onClick={onClose} aria-label="닫기" className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "#0B1E2D99" }} data-testid="fishing-sea-popup-close"><LucideX className="h-4 w-4" /></button>
                    {tag && (
                        <span className="absolute left-4 top-3.5 flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 text-[12.5px] font-semibold" style={{ background: "#FBF7EE", color: state === "warn" || state === "alert" ? "#8E2A14" : "#7A5510" }} data-testid="fishing-sea-popup-tag">
                            <img src="/fishing/art/icon-storm.webp" alt="" width={128} height={128} className="h-6 w-6" />{tag}
                        </span>
                    )}
                    <div className="absolute inset-x-4 bottom-3">
                        <p className="text-[24px] font-semibold leading-tight tracking-tight">{short(spot.name)}</p>
                        <p className="mt-0.5 text-[13px] [word-break:keep-all]" style={{ color: "#F3ECDDCC" }}>{[zone ? `${zone.name} 쪽 바다` : null, fromMe != null ? `나에게서 ${fromMe}km` : cell && cell.km > 0 ? `고른 칸에서 ${cell.km}km` : null, dayWord].filter(Boolean).join(" · ")}</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto pb-4">
                    {/* 그날의 한 줄 평 — 고른 어종 */}
                    <div className="mx-4 mt-3.5 rounded-2xl px-3.5 py-3" style={{ background: VERDICT_TONE[verdict.tone].bg, color: VERDICT_TONE[verdict.tone].text }} data-testid="fishing-sea-verdict" data-tone={verdict.tone}>
                        <p className="text-[12.5px] opacity-80">{dayWord} {fish === "기타어종" ? "그 밖의 어종" : fish}</p>
                        <p className="mt-0.5 text-[17px] font-semibold leading-snug">{verdict.head}</p>
                        {verdict.why && <p className="mt-0.5 text-[13.5px] [word-break:keep-all] opacity-90">{verdict.why}</p>}
                    </div>
                    {/* 2. 어종 카드 */}
                    <p className="px-4 pb-2 pt-4 text-[13px]" style={{ color: C.dim }}>{dayWord} 이 바다의 어종 · 국립해양조사원 낚시지수</p>
                    {/* 고른 카드의 테두리(바깥 2.5px)가 가로 줄에 잘리지 않게 위아래로 숨 쉴 틈(2026-10-18 오너 "테두리가 짤려보임") */}
                    <div className="flex gap-2.5 overflow-x-auto px-4 pb-1.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="fishing-sea-popup-fish">
                        {cards.map((c) => {
                            const on = c.name === fish, v = spot.fish[c.name];
                            return (
                                <button key={c.name} type="button" disabled={!c.ours} onClick={() => onFish(c.name)} className="w-[150px] shrink-0 overflow-hidden rounded-2xl text-left active:opacity-85"
                                    style={{ background: PAPER, color: INK, boxShadow: on ? `0 0 0 2.5px ${C.brand}` : "inset 0 0 0 1px #0F28381F" }} data-testid="fishing-sea-popup-card" data-photo={c.photo ? "1" : "0"}>
                                    <span className="relative block h-[96px] overflow-hidden" style={{ background: c.photo ? "#0F2838" : PAPER }}>
                                        {c.photo ? <img src={c.photo} alt={`${c.name} 사진`} loading="lazy" decoding="async" className="h-full w-full object-cover" />
                                            : c.ours ? <img src={art(c.ours.id)} alt="" width={640} height={400} className="mx-auto h-full w-[86%] object-contain" style={{ mixBlendMode: "multiply" }} />
                                                : <span className="relative block h-full" aria-hidden>{["bollak", "godeungeo", "gwangeo"].map((id, i) => <img key={id} src={art(id)} alt="" width={640} height={400} className="absolute h-[46px] w-[74px] object-contain" style={{ left: 8 + i * 30, top: i % 2 ? 40 : 8, mixBlendMode: "multiply", transform: `rotate(${i * 8 - 8}deg)` }} />)}</span>}
                                        {on && <span className="absolute left-2 top-2 rounded-full px-2 py-0.5 text-[12px] font-semibold" style={{ background: C.brand, color: C.onBrand }}>고른 어종</span>}
                                    </span>
                                    <span className="block px-2.5 pb-2.5 pt-2">
                                        <span className="block truncate text-[15px] font-semibold">{c.name === "기타어종" ? "그 밖의 어종" : c.name}</span>
                                        <span className="mt-1.5 flex gap-1"><Pill step={v.am} label="오전" /><Pill step={v.pm} label="오후" /></span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 3. 파고 · 바람 · 수온 · 물때 — 예보 + 지금 잰 값 */}
                    <div className="mt-4 grid grid-cols-2 gap-2 px-4" aria-label="바다의 상태" data-testid="fishing-sea-conds">
                        {conds.map((c) => (
                            <div key={c.id} className="flex min-h-[64px] items-center gap-2.5 rounded-2xl px-2.5 py-2" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF1A" }} data-testid={`fishing-sea-cond-${c.id}`}>
                                <img src={`/fishing/art/icon-${c.icon}.webp`} alt="" width={128} height={128} className="h-10 w-10 shrink-0" />
                                <span className="min-w-0">
                                    <span className="block text-[12px]" style={{ color: C.dim }}>{c.label}</span>
                                    <span className="block truncate text-[15.5px] font-semibold tabular-nums">{c.value}</span>
                                    {c.now && <span className="block text-[12px] leading-snug tabular-nums [word-break:keep-all]" style={{ color: C.soft }}>{c.now}</span>}
                                </span>
                            </div>
                        ))}
                    </div>
                    {/* 물때 시간표 — 만조 · 간조(가까운 조위 관측소의 예보) */}
                    {port && brief && brief.turns.length > 0 && (
                        <div className="mx-4 mt-2.5 rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0A" }} data-testid="fishing-sea-turns">
                            <p className="text-[12.5px]" style={{ color: C.dim }}>{dayWord} 만조 · 간조 — {port.name}({port.km}km){spot.tide ? ` · ${spot.tide}` : ""}</p>
                            <p className="mt-1.5 flex flex-wrap gap-1.5">{brief.turns.map((t) => <span key={`${t.kind}${t.min}`} className="rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums" style={{ background: t.kind === "high" ? "#3F86A84D" : "#FFFFFF14", color: C.foam }}>{t.kind === "high" ? "만조" : "간조"} {hhmm(t.min)}</span>)}</p>
                        </div>
                    )}

                    {/* 4. 이 근처 내 기록 */}
                    <div className="mx-4 mt-2.5 rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0A" }} data-testid="fishing-spot-mine">
                        <p className="text-[13px]" style={{ color: C.dim }}>이 근처에서 적은 내 조과{mine.length ? ` ${mine.length}줄` : ""}</p>
                        {mine.length === 0 ? <p className="mt-0.5 text-[13.5px] [word-break:keep-all]" style={{ color: C.soft }}>{nearNames.slice(0, 3).join(" · ")} 이름으로 적은 조과가 아직 없어요</p> : (
                            <ul className="mt-1 space-y-1">
                                {mine.slice(0, 3).map((c) => { const f = fishByName(c.species); const v = f ? fishValue(f, c) : c.lengthCm; return (
                                    <li key={c.id} className="flex items-baseline gap-2 text-[13.5px]"><span className="min-w-0 flex-1 truncate" style={{ color: C.soft }}>{[fishingDayLabel(c.day, today), c.place].join(" · ")}</span><span className="shrink-0 font-semibold tabular-nums">{c.species} {v != null ? fishValueText(f?.unit ?? "cm", v) : `${c.count}수`}</span></li>
                                ); })}
                            </ul>
                        )}
                    </div>
                    <p className="px-4 pt-3 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>
                        지수 · 파고 · 바람 · 수온 예보는 국립해양조사원 바다낚시지수예요. 랭큐가 매긴 값이 아니에요.
                    </p>
                    {cards.some((c) => c.credit) && (
                        <div className="space-y-0.5 px-4 pt-1.5" data-testid="fishing-sea-popup-credits">
                            {cards.filter((c) => c.credit).map((c) => <PhotoCredit key={c.name} author={`${c.name} — ${c.credit!.a}`} license={c.credit!.l} page={c.credit!.p} dark />)}
                        </div>
                    )}
                </div>

                <div className="shrink-0 border-t px-4 pt-3" style={{ borderColor: C.line, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                    <button type="button" onClick={() => onAdd(fishByName(fish)?.name)} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-spot-add">
                        <LucidePlus weight="bold" className="h-5 w-5" />여기서 낚았어요 — 조과 적기
                    </button>
                </div>
            </div>
        </div>
    );
}
