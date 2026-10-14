/**
 * 어종 한 장(2026-10-14 오너: "물고기에 관한 정보도 없고 … 잡은 물고기의 기록과 사진, 어디 바다에서 잘 잡히는가가 제일 중요").
 *
 * 한 어종에 대해 우리가 아는 것을 한 화면에 모은다 — 위에서부터:
 *  1. 종이 위의 어탁 · 이름 · 낙관의 사다리(몇 짜부터 무슨 낙관인가, 나는 어디까지 찍었나)
 *  2. 내 기록 — 가장 큰 한 마리의 사진(인화지처럼) · 숫자 셋 · 남긴 사진들 · 최근 줄
 *  3. 오늘 좋은 곳 — 국립해양조사원 바다낚시지수(지수가 매겨지는 어종만). 랭큐가 매긴 값이 아니라고 적는다
 *  4. 위판장 — 지난 이레의 경매 건수(해양수산부). 어선의 위판이지 낚시 조과가 아니라고 적는다
 *  5. 어종 이야기 — shared/fishingFishInfo 의 **받은 자료만**. 채워진 칸만 그리고, 비어 있으면 준비 중이라고 적는다(지어 쓰지 않는다)
 * 다른 화면으로 보내지 않는다 — 여기서 바로 그 어종의 조과를 적는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { LucidePlus, LucideX } from "@/lib/icons";
import { FISHING_COLORS as C, fishingDayLabel, type FishingCatch } from "@shared/fishing";
import { fishByName, fishValue, fishValueText, type FishKind, type FishRecord, type FishUnit } from "@shared/fishingFish";
import { fishInfoOf, hasFishInfo, type FishInfo } from "@shared/fishingFishInfo";
import { goodSpots, rangeText, type IndexMap } from "@shared/fishingPort";
import { MARKET_NOTE, MARKET_SOURCE, type MarketWeek } from "@shared/fishingMarket";
import { INDEX_TONE, INK, PAPER, PhotoZoom, SEAL, Seal, art } from "./ink";

const UNIT_NOUN: Readonly<Record<FishUnit, string>> = { cm: "길이", count: "마릿수", kg: "무게", ji: "굵기" };
const UNIT_WORD: Readonly<Record<FishUnit, string>> = { cm: "길이로 겨뤄요", count: "하루 마릿수로 겨뤄요", kg: "무게로 겨뤄요", ji: "굵기(손가락 너비)로 겨뤄요" };
const SHEET = { background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" } as const;
const RULE = "1px dashed #0F283826";

/** 구역의 제목 줄(어두운 바탕) */
function Head({ title, aside }: { title: string; aside?: React.ReactNode }) {
    return (
        <div className="mb-2.5 mt-7 flex items-baseline justify-between gap-3 px-1">
            <h3 className="text-[17px] font-semibold tracking-tight">{title}</h3>
            {aside && <span className="shrink-0 text-[12.5px]" style={{ color: C.dim }}>{aside}</span>}
        </div>
    );
}

/** 어종 이야기 — 받은 자료에서 채워진 칸만. 제철은 열두 달의 띠로 그린다 */
function Story({ info, month }: { info: FishInfo; month: number }) {
    const rows: [string, React.ReactNode][] = [];
    const chips = (list: string[]) => <span className="flex flex-wrap gap-1.5">{list.map((x) => <span key={x} className="rounded-full px-2.5 py-1 text-[13px]" style={{ background: "#0F28380F" }}>{x}</span>)}</span>;
    if (info.habitat) rows.push(["사는 곳", info.habitat]);
    if (info.methods?.length) rows.push(["낚시 방법", chips(info.methods)]);
    if (info.bait?.length) rows.push(["미끼", chips(info.bait)]);
    if (info.timing) rows.push(["물때 · 시간", info.timing]);
    if (info.taste) rows.push(["맛", info.taste]);
    const inSeason = info.season?.includes(month);
    return (
        <div className="overflow-hidden rounded-2xl" style={SHEET} data-testid="fishing-fish-story">
            {info.season?.length ? (
                <div className="px-3.5 pb-3 pt-3.5" data-testid="fishing-fish-season">
                    <p className="flex items-baseline justify-between text-[13px]" style={{ color: "#0F283899" }}><span>제철</span>{inSeason ? <span className="font-semibold" style={{ color: SEAL }}>지금이 제철</span> : <span>지금은 {month}월</span>}</p>
                    <div className="mt-2 grid grid-cols-12 gap-px" role="img" aria-label={`제철은 ${info.season.join(" · ")}월`}>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                            const on = info.season!.includes(m);
                            return (
                                <span key={m} className="flex flex-col items-center gap-1">
                                    <span className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] tabular-nums" style={on ? { background: "#0F2838", color: "#F3ECDD", fontWeight: 600 } : { color: "#0F283873" }}>{m}</span>
                                    <i aria-hidden className="h-1 w-1 rounded-full" style={{ background: m === month ? SEAL : "transparent" }} />
                                </span>
                            );
                        })}
                    </div>
                </div>
            ) : null}
            {rows.map(([label, value], i) => (
                <div key={label} className="flex gap-3 px-3.5 py-3" style={{ borderTop: i || info.season?.length ? RULE : undefined }}>
                    <span className="w-[68px] shrink-0 pt-0.5 text-[13px]" style={{ color: "#0F283899" }}>{label}</span>
                    <span className="min-w-0 flex-1 text-[14.5px] leading-relaxed [word-break:keep-all]">{value}</span>
                </div>
            ))}
            {info.tips?.length ? (
                <div className="px-3.5 py-3" style={{ borderTop: rows.length || info.season?.length ? RULE : undefined }}>
                    <p className="text-[13px]" style={{ color: "#0F283899" }}>요령</p>
                    <ul className="mt-1.5 space-y-1.5">{info.tips.map((t, i) => <li key={t} className="flex gap-2 text-[14.5px] leading-relaxed [word-break:keep-all]"><span className="shrink-0 tabular-nums" style={{ color: "#0F283873" }}>{i + 1}</span><span>{t}</span></li>)}</ul>
                </div>
            ) : null}
            {/* 금어기 · 금지체장 — 법이 정한 값이라 출처와 같이만 싣는다 */}
            {info.ban && (
                <div className="mx-3.5 mb-3.5 mt-1 rounded-xl px-3 py-2.5" style={{ border: `1.5px solid ${SEAL}`, background: "#C8372D0D" }} data-testid="fishing-fish-ban">
                    <p className="text-[14.5px] font-semibold [word-break:keep-all]" style={{ color: SEAL }}>
                        {[info.ban.period ? `금어기 ${info.ban.period}` : null, info.ban.minCm != null ? `금지체장 ${info.ban.minCm}cm 이하` : null].filter(Boolean).join(" · ")}
                    </p>
                    <p className="mt-0.5 text-[13px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838B3" }}>{info.ban.minCm != null ? "이보다 작으면 놓아 줘요. " : ""}{info.ban.note ?? ""}</p>
                    <p className="mt-1 text-[12px] [word-break:keep-all]" style={{ color: "#0F283899" }}>출처: {info.ban.source}</p>
                </div>
            )}
            {info.sources?.length ? <p className="border-t px-3.5 py-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ borderColor: "#0F28381F", color: "#0F283899" }}>자료: {info.sources.join(" · ")}</p> : null}
        </div>
    );
}

export function FishSheet({ fish, rec, list, today, onClose, onAdd, onMap }: {
    fish: FishKind; rec: FishRecord<FishingCatch> | null; list: readonly FishingCatch[]; today: string;
    onClose: () => void; onAdd: () => void; /** 홈의 지도를 이 어종으로 */ onMap: () => void;
}) {
    const info = fishInfoOf(fish.id);
    const month = Number(today.slice(5, 7));
    const mine = list.filter((c) => fishByName(c.species)?.id === fish.id);
    const photos = mine.filter((c) => c.photoUrl || c.thumbUrl);
    const [zoom, setZoom] = useState<string | null>(null);
    // 바다 어종만 — 지수가 매겨지는 어종인지는 받은 표가 말해 준다
    const { data: map } = useQuery<IndexMap | null>({ queryKey: ["/api/hiq/fishing/index-map", today], queryFn: () => apiRequest(`/api/hiq/fishing/index-map?day=${today}`), staleTime: 10 * 60_000, enabled: fish.water === "sea" });
    const { data: market } = useQuery<MarketWeek | null>({ queryKey: ["/api/hiq/fishing/market"], staleTime: 15 * 60_000, enabled: fish.water === "sea" });
    const indexed = !!map?.fishes.includes(fish.name);
    const good = map && indexed ? goodSpots(map, fish.name, 3) : [];
    const week = market?.fish.find((f) => f.id === fish.id) ?? null;
    const reached = rec ? rec.tierIndex + 1 : 0;
    const best = rec?.best ?? null;
    const bestPhoto = best?.photoUrl ?? best?.thumbUrl ?? null;
    const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;

    return (
        <div role="dialog" aria-modal="true" aria-label={`${fish.name} 한 장`} className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.bg, color: C.foam }} data-testid="fishing-fish-sheet" data-fish={fish.id}>
            <div className="h-[env(safe-area-inset-top)] shrink-0" aria-hidden />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: C.line }}>
                <h2 className="flex-1 text-[16px] font-semibold">어종 한 장</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF0F] active:bg-[#FFFFFF1F]" data-testid="fishing-fish-close"><LucideX className="h-5 w-5" /></button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
                {/* 1. 종이 위의 어탁 · 이름 · 낙관의 사다리 */}
                <div className="overflow-hidden rounded-2xl" style={{ ...SHEET, background: `radial-gradient(120% 70% at 20% 0%, #F6F0E2 0%, ${PAPER} 55%, #E7DEC9 100%)` }}>
                    <div className="relative px-4 pt-3.5">
                        <p className="text-[12.5px]" style={{ color: "#0F283899" }}>{fish.water === "sea" ? "바다" : "민물"}{info?.aka?.length ? ` · ${info.aka.join(" · ")}` : ""}</p>
                        <img src={art(fish.id)} alt={`${fish.name} 어탁`} width={640} height={400} decoding="async" className="mx-auto mt-1 block h-[172px] w-full object-contain" style={{ mixBlendMode: "multiply" }} />
                        <div className="flex items-end justify-between gap-3">
                            <p className="min-w-0 text-[27px] font-semibold leading-tight tracking-tight">{fish.name}</p>
                            {rec?.value != null && <p className="shrink-0 text-right leading-none"><span className="block text-[12px]" style={{ color: "#0F283899" }}>내 기록</span><span className="mt-1 block text-[26px] font-semibold tabular-nums tracking-tight">{fishValueText(fish.unit, rec.value)}</span></p>}
                        </div>
                        {info?.intro && <p className="mt-1.5 text-[14px] leading-relaxed [word-break:keep-all]" style={{ color: "#0F2838CC" }} data-testid="fishing-fish-intro">{info.intro}</p>}
                        <div className="h-3.5" aria-hidden />
                    </div>
                    {/* 낙관의 사다리 — 칸마다 한 단계. 찍은 것은 붉게, 아직인 것은 테두리만 */}
                    <div className="px-3 pb-3.5 pt-3" style={{ borderTop: RULE }} data-testid="fishing-fish-ladder">
                        <p className="flex items-baseline justify-between px-1 text-[13px]" style={{ color: "#0F283899" }}><span>낙관 {reached}/{fish.tiers.length}</span><span>{UNIT_WORD[fish.unit]}</span></p>
                        <div className="relative mt-3 flex">
                            <i aria-hidden className="absolute left-[10%] right-[10%] top-[21px] border-t border-dashed" style={{ borderColor: "#0F283840" }} />
                            {fish.tiers.map((t, i) => (
                                <div key={t.name} className="relative flex flex-1 flex-col items-center gap-1.5" data-got={i < reached ? "1" : "0"}>
                                    <span className="rounded-[6px]" style={{ background: i < reached ? "transparent" : "#EFE8D8" }}><Seal text={t.name} size={42} faint={i >= reached} /></span>
                                    <span className="text-[12.5px] tabular-nums" style={{ color: i < reached ? INK : "#0F283899" }}>{fishValueText(fish.unit, t.min)}</span>
                                </div>
                            ))}
                        </div>
                        <p className="mt-3 px-1 text-[13.5px] [word-break:keep-all]" style={{ color: "#0F2838CC" }}>
                            {rec?.next && rec.gap != null ? <>다음 낙관 <span className="font-semibold" style={{ color: INK }}>{rec.next.name}</span>까지 <span className="font-semibold tabular-nums" style={{ color: SEAL }}>{fishValueText(fish.unit, rec.gap)}</span></>
                                : rec?.tier ? "이 어종의 가장 높은 낙관까지 찍었어요"
                                    : `${fish.tiers[0].name} 낙관은 ${fishValueText(fish.unit, fish.tiers[0].min)}부터 찍혀요`}
                        </p>
                    </div>
                </div>

                {/* 2. 내 기록 — 사진이 먼저 */}
                <Head title="내 기록" aside={mine.length ? `${mine.length}줄 · 처음 만난 날 ${fishingDayLabel(rec?.first ?? mine[mine.length - 1].day, today)}` : undefined} />
                {mine.length === 0 ? (
                    <div className="rounded-2xl px-4 py-6 text-center" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="fishing-fish-none">
                        <p className="text-[14.5px]" style={{ color: C.soft }}>아직 만나지 못한 어종이에요</p>
                        <p className="mt-1 text-[13px] [word-break:keep-all]" style={{ color: C.dim }}>사진과 {UNIT_NOUN[fish.unit]}를 적으면 어탁첩의 이 칸에 어탁이 찍혀요</p>
                    </div>
                ) : (
                    <>
                        {bestPhoto && best && (
                            <button type="button" onClick={() => setZoom(best.photoUrl ?? best.thumbUrl)} className="mx-auto block w-full max-w-[320px] rounded-[4px] p-2 pb-0 text-left active:opacity-90" style={{ background: "#F6F0E2", color: INK, transform: "rotate(-1.2deg)", boxShadow: "0 8px 22px #00000059" }} data-testid="fishing-fish-print">
                                <img src={bestPhoto} alt={`${fish.name} 사진`} className="block aspect-[4/3] w-full object-cover" />
                                <span className="flex items-baseline justify-between gap-2 px-1 py-2.5">
                                    <span className="min-w-0 truncate text-[13px]" style={{ color: "#0F2838B3" }}>{[fishingDayLabel(best.day, today), best.place].filter(Boolean).join(" · ")}</span>
                                    {rec?.value != null && <span className="shrink-0 text-[17px] font-semibold tabular-nums">{fishValueText(fish.unit, rec.value)}</span>}
                                </span>
                            </button>
                        )}
                        {photos.length > (bestPhoto ? 1 : 0) && (
                            <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-testid="fishing-fish-photos">
                                {photos.filter((c) => c.id !== (bestPhoto ? best?.id : null)).map((c) => (
                                    <button key={c.id} type="button" onClick={() => setZoom(c.photoUrl ?? c.thumbUrl)} className="h-[92px] w-[92px] shrink-0 overflow-hidden rounded-xl active:opacity-80" style={{ background: "#FFFFFF14" }}>
                                        <img src={c.thumbUrl ?? c.photoUrl ?? ""} alt={`${fishingDayLabel(c.day, today)} ${fish.name}`} loading="lazy" className="h-full w-full object-cover" />
                                    </button>
                                ))}
                            </div>
                        )}
                        <ul className="mt-3.5 divide-y divide-[#FFFFFF14] rounded-2xl bg-[#FFFFFF0A] px-3.5" data-testid="fishing-fish-rows">
                            {mine.slice(0, 4).map((c) => {
                                const v = fishValue(fish, c);
                                return (
                                    <li key={c.id} className="flex min-h-[48px] items-center gap-3 py-2">
                                        <span className="min-w-0 flex-1 truncate text-[14px]" style={{ color: C.soft }}>{[fishingDayLabel(c.day, today), c.place].filter(Boolean).join(" · ")}</span>
                                        <span className="shrink-0 text-[15px] font-semibold tabular-nums">{v != null ? fishValueText(fish.unit, v) : `${c.count}수`}{c.released ? <span className="ml-1.5 text-[12.5px] font-normal" style={{ color: C.dim }}>방류</span> : null}</span>
                                    </li>
                                );
                            })}
                        </ul>
                        {!photos.length && <p className="mt-2 px-1 text-[12.5px] [word-break:keep-all]" style={{ color: C.dim }}>사진을 같이 남기면 여기에 인화지처럼 걸려요.</p>}
                    </>
                )}

                {/* 3. 오늘 좋은 곳 — 지수가 매겨지는 어종만 */}
                {indexed && map && (
                    <>
                        <Head title="오늘 좋은 곳" aside={<button type="button" onClick={onMap} style={{ color: C.sun }} data-testid="fishing-fish-to-map">지도에서 보기</button>} />
                        <div className="rounded-2xl bg-[#FFFFFF0A] px-3.5" data-testid="fishing-fish-good">
                            {good.length === 0 ? <p className="py-4 text-[14px]" style={{ color: C.soft }}>오늘은 좋음 이상인 곳이 없어요</p> : (
                                <ul className="divide-y divide-[#FFFFFF14]">
                                    {good.map((g, i) => (
                                        <li key={g.spot.name} className="flex min-h-[52px] items-center gap-3 py-2">
                                            <span className="w-4 shrink-0 text-center text-[13px] tabular-nums" style={{ color: C.dim }}>{i + 1}</span>
                                            <span className="min-w-0 flex-1"><span className="block truncate text-[15.5px] font-semibold">{g.spot.name}</span>
                                                <span className="mt-0.5 block truncate text-[13px] tabular-nums" style={{ color: C.dim }}>{[g.spot.wave ? `파고 ${rangeText(g.spot.wave)}m` : null, g.spot.wtemp ? `수온 ${rangeText(g.spot.wtemp)}°` : null].filter(Boolean).join(" · ")}</span></span>
                                            <span className="flex h-7 shrink-0 items-center rounded-full px-2.5 text-[12.5px]" style={{ background: INDEX_TONE[g.step].bg, color: INDEX_TONE[g.step].text }}>{g.step}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                        <p className="mt-2 px-1 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>국립해양조사원이 매긴 바다낚시지수예요(물때 · 파고 · 수온 · 바람). 랭큐가 매긴 값이 아니에요.</p>
                    </>
                )}

                {/* 4. 위판장 — 지난 이레 */}
                {week && market && (
                    <>
                        <Head title="위판장" aside={`${md(market.days[0])}~${md(market.days[market.days.length - 1])}`} />
                        <div className="rounded-2xl bg-[#FFFFFF0A] px-3.5 py-3.5" data-testid="fishing-fish-market">
                            <div className="flex items-end gap-3">
                                <div className="flex h-[64px] flex-1 items-end gap-1.5" aria-hidden>
                                    {week.counts.map((n, k) => <i key={market.days[k]} className="flex-1 rounded-t-[3px]" style={{ height: `${Math.max(3, Math.round((n / Math.max(1, ...week.counts)) * 62))}px`, background: C.brand, opacity: k === week.counts.length - 1 ? 0.4 : 0.9 }} />)}
                                </div>
                                <p className="shrink-0 text-right leading-none"><span className="block text-[12px]" style={{ color: C.dim }}>이레 동안</span><span className="mt-1.5 block text-[22px] font-semibold tabular-nums">{week.total.toLocaleString("en-US")}<span className="text-[13px] font-normal" style={{ color: C.dim }}>건</span></span></p>
                            </div>
                            <p className="mt-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>{MARKET_NOTE} 출처: {MARKET_SOURCE}.</p>
                        </div>
                    </>
                )}

                {/* 5. 어종 이야기 — 받은 자료만 */}
                <Head title="어종 이야기" />
                {info && hasFishInfo(info) ? <Story info={info} month={month} /> : (
                    <p className="rounded-2xl px-4 py-5 text-[13.5px] leading-relaxed [word-break:keep-all]" style={{ border: "1px dashed #FFFFFF2E", color: C.dim }} data-testid="fishing-fish-story-empty">
                        어종 이야기는 준비 중이에요.<br />제철 · 낚시 방법 · 미끼 · 금어기가 여기에 실려요.
                    </p>
                )}
            </div>

            <div className="shrink-0 border-t px-4 pt-3" style={{ borderColor: C.line, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <button type="button" onClick={onAdd} className="flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-fish-add">
                    <LucidePlus weight="bold" className="h-5 w-5" />{fish.name} 조과 적기
                </button>
            </div>

            {zoom && <PhotoZoom src={zoom} alt={`${fish.name} 사진`} onClose={() => setZoom(null)} />}
        </div>
    );
}
