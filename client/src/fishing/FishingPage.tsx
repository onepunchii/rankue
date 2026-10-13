/**
 * 낚시 — 기록어 · 어탁 · 크루 정출(2026-10-14 둘째 판. 기획서: docs/01-plan/features/fishing-category.md).
 * 지금은 운영자에게만 보인다(/me 의 fishingAccess).
 *
 * 골프 · 등산이 '다녀온 곳'을 모은다면 낚시는 '잡은 크기'를 모은다:
 *  - 홈: 내 기록어 — 가장 높은 단계의 어탁 한 장을 크게, 가장 가까운 승급, 어탁 벽(어종마다 한 장).
 *        기록이 없으면 빈 화면이 아니라 **예시**를 먼저 보여 준다('예시'라고 적는다 — 오너: "하고 싶게 만드는 게 중요해").
 *  - 기록(가운데 단추): 사진 한 장 · 어종 · 그 어종이 자랑하는 값(길이 · 마릿수 · 무게 · 지). 적는 동안 몇 짜인지 바로 보인다.
 *        새 단계에 오르면 승급 창이 뜬다 — 이 종목의 '도장 찍히는 순간'.
 *  - 어탁첩: 바다 · 민물 두 권. 만난 어종은 한지 위의 먹, 못 만난 어종은 물속의 그림자.
 *  - 크루 · 채팅: 있는 화면으로 간다(정출판은 다음 단계).
 * 그림: 먹으로 찍은 어탁(client/public/fishing/art/gyotaku-<id>.webp — 흰 바탕의 먹)을 한지색 카드에 곱하기로 얹고, 단계는 붉은 낙관으로 찍는다.
 * 글자 · 숫자는 전부 화면이 얹는다(그림에는 글자가 없다). 색은 남색 바다 + 한지 + 먹 + 낙관의 붉은색 — 골프의 포스터 · 등산의 자수와 겹치지 않는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { appConfirm } from "@/components/AppDialog";
import { LucideChevronLeft, LucideChevronRight, LucideImage, LucideMap, LucidePlus, LucideX } from "@/lib/icons";
import { SportBackHeader, SportHeader } from "@/components/hiq/SportHeader";
import { HiqNavigation } from "@/components/hiq/HiqNavigation";
import { cn } from "@/lib/utils";
import {
    FISHING_COLORS as C, FISHING_PUBLIC, FISHING_PHOTO_CATEGORY, FISHING_PHOTO_LONG_SIDE, FISHING_PLACE_SOURCE, FISHING_SPOTS, FISHING_THUMB_CATEGORY, FISHING_THUMB_LONG_SIDE,
    cleanCatch, fishingDayLabel, fishingKstDay, fishingSidoShort, fishingSpotName,
    type FishingCatch, type FishingPlace, type FishingSpotId,
} from "@shared/fishing";
import { FISH, FISH_BOOKS, FISH_UNIT_LABEL, fishByName, fishRecords, fishTier, fishValue, fishValueText, nearestPromotion, type FishKind, type FishRecord } from "@shared/fishingFish";
import { TRIP_AWARD_NAME, TRIP_POINTS, cleanTrip, type SeasonRow, type TripAward, type TripBoard } from "@shared/fishingTrip";
import { TIDE_PHASE_TEXT, TIDE_SEAS, nextTideMark, tideDays, tideOf, tideTally, tideWeekday, type TideSea } from "@shared/fishingTide";
import { SEA_AREAS, SEA_CAUTION, SEA_SOURCE, seaHeadline, seaNotes, seaWord, type SeaNow, type SeaState } from "@shared/fishingSea";
import { SEA_LEGEND, SeaChart, seaWashColor, seaWashLine } from "./SeaChart";
import { TideCurve } from "./TideCurve";
import { MARKET_NOTE, MARKET_SOURCE, type MarketWeek } from "@shared/fishingMarket";
import { FISHING_PORTS, FISHING_PORT_SOURCE, fishingPort, portsOfArea } from "@shared/fishingStations";
import { durationKo, hhmm, indexOutlook, rangeText, tideFlowAt, tideRange, visibilityText, windDirKo, type FishingIndexStep, type PortBrief } from "@shared/fishingPort";

const KEY = ["/api/hiq/fishing/catches"];
type Tab = "home" | "trip" | "book" | "log" | "points";
/** 화면마다 주소가 있다 — 홈은 공용 홈 주소(/dashboard)에서 종목이 낚시일 때 그려진다 */
const TAB_PATH: Readonly<Record<Tab, string>> = { home: "/dashboard", trip: "/fishing/trip", book: "/fishing/book", log: "/fishing/log", points: "/fishing/points" };
const TAB_TITLE: Readonly<Record<Tab, string>> = { home: "랭큐 낚시", trip: "출조", book: "어탁첩", log: "내 조과", points: "낚시터" };
/** 표지 그림(client/public/fishing/art) — 등산의 표지와 같은 손(판화)으로 그린 새벽 바다. 그림에는 글자가 없다 */
/** 바다 일곱 곳의 표지(같은 손의 판화) */
const seaCover = (id: string) => `/fishing/art/sea-${id}.webp`;
const FS_HERO = "/fishing/art/hero.webp", FS_COVER_TRIP = "/fishing/art/cover-trip.webp", FS_COVER_BOOK = "/fishing/art/cover-book.webp";
/** 조과 적기에 미리 들어가는 것 — 낚시터에서 왔으면 그 이름, 정출에서 왔으면 그 날 · 출조지 · 정출 */
interface Preset { place: string; spot?: FishingSpotId | null; day?: string; tripId?: string }
const PAPER = "#EFE8D8", INK = "#1B1B1F", SEAL = "#C8372D";
const art = (id: string) => `/fishing/art/gyotaku-${id}.webp`;

/** 기록이 없는 사람에게 먼저 보여 주는 예시 — 지어낸 기록이고 화면에 '예시'라고 적는다 */
const SAMPLE: FishingCatch[] = [
    { id: "s1", day: "2026-09-21", place: "예당저수지", spot: "lake", species: "붕어", lengthCm: 41.5, count: 1, weightKg: null, ji: null, released: true, photoUrl: null, thumbUrl: null, note: null, createdAt: "" },
    { id: "s2", day: "2026-10-03", place: "추자도", spot: "rock", species: "감성돔", lengthCm: 47, count: 2, weightKg: null, ji: null, released: false, photoUrl: null, thumbUrl: null, note: null, createdAt: "" },
    { id: "s3", day: "2026-06-14", place: "안동호", spot: "lake", species: "배스", lengthCm: 51, count: 3, weightKg: null, ji: null, released: true, photoUrl: null, thumbUrl: null, note: null, createdAt: "" },
    { id: "s4", day: "2026-09-28", place: "오천항", spot: "boat", species: "주꾸미", lengthCm: null, count: 62, weightKg: null, ji: null, released: false, photoUrl: null, thumbUrl: null, note: null, createdAt: "" },
    { id: "s5", day: "2026-08-09", place: "통영", spot: "boat", species: "무늬오징어", lengthCm: null, count: 4, weightKg: 1.2, ji: null, released: false, photoUrl: null, thumbUrl: null, note: null, createdAt: "" },
];

/** 붉은 낙관 — 단계의 이름을 찍는다 */
function Seal({ text, size = 44, faint }: { text: string; size?: number; faint?: boolean }) {
    return (
        <span className="inline-flex shrink-0 items-center justify-center rounded-[5px] text-center leading-[1.05]" aria-label={`${text} 낙관`}
            style={{ width: size, height: size, background: faint ? "transparent" : SEAL, color: faint ? SEAL : "#FFF4EC", border: `1.5px solid ${SEAL}`, fontSize: Math.max(12, Math.round(size / (text.length > 3 ? 3.6 : 2.9))), fontWeight: 600, transform: "rotate(-4deg)", wordBreak: "keep-all", padding: 2 }}>
            {text}
        </span>
    );
}

/** 어탁 한 장 — 한지 위의 먹, 길이는 크게, 단계는 낙관으로 */
function Eotak({ rec, today, big, sample }: { rec: FishRecord<FishingCatch>; today: string; big?: boolean; sample?: boolean }) {
    const v = rec.value != null ? fishValueText(rec.fish.unit, rec.value) : null;
    return (
        <div className={cn("relative overflow-hidden", big ? "rounded-2xl px-4 pb-4 pt-3" : "rounded-xl px-2.5 pb-2.5 pt-2")} data-testid="fishing-eotak" data-fish={rec.fish.id}
            style={{ background: `radial-gradient(120% 90% at 20% 10%, #F6F0E2 0%, ${PAPER} 55%, #E4DAC4 100%)`, color: INK, boxShadow: "inset 0 0 0 1px #00000014" }}>
            {sample && <span className="absolute left-2.5 top-2.5 z-10 rounded-full px-2 py-0.5 text-[12px]" style={{ background: "#1B1B1FCC", color: "#F6F0E2" }}>예시</span>}
            <div className={cn("absolute z-10", big ? "right-3 top-3" : "right-2 top-2")}>
                {rec.tier ? <Seal text={rec.tier.name} size={big ? 52 : 36} /> : <Seal text="첫 수" size={big ? 52 : 36} faint />}
            </div>
            <img src={art(rec.fish.id)} alt="" width={640} height={400} decoding="async" className={cn("mx-auto block w-full object-contain", big ? "h-[150px]" : "h-[74px]")} style={{ mixBlendMode: "multiply" }} />
            <div className={cn("flex items-end justify-between gap-2", big ? "mt-1" : "mt-0.5")}>
                <div className="min-w-0">
                    <p className={cn("truncate font-semibold tracking-tight", big ? "text-[20px]" : "text-[14px]")}>{rec.fish.name}</p>
                    <p className={cn("truncate", big ? "mt-0.5 text-[13px]" : "text-[12px]")} style={{ color: "#0F283899" }}>{[fishingDayLabel(rec.best.day, today), rec.best.place].filter(Boolean).join(" · ")}</p>
                </div>
                {v && <p className={cn("shrink-0 font-semibold tabular-nums leading-none tracking-tight", big ? "text-[34px]" : "text-[18px]")}>{v}</p>}
            </div>
        </div>
    );
}

/** 사진을 줄여 올린다 — 캔버스로 다시 그리니 위치 꼬리표가 따라가지 않는다. 큰 것과 작은 것 두 장 */
async function uploadPhoto(file: File): Promise<{ photoUrl: string; thumbUrl: string }> {
    const src = URL.createObjectURL(file);
    try {
        const img = await new Promise<HTMLImageElement>((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => no(new Error("image")); i.src = src; });
        const draw = (long: number) => {
            const k = Math.min(1, long / Math.max(img.naturalWidth, img.naturalHeight, 1));
            const cv = document.createElement("canvas");
            cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
            cv.getContext("2d")?.drawImage(img, 0, 0, cv.width, cv.height);
            let d = cv.toDataURL("image/webp", 0.82);
            if (!d.startsWith("data:image/webp")) d = cv.toDataURL("image/jpeg", 0.82);
            return d;
        };
        const put = async (dataUrl: string, category: string) => { const r = await apiRequest("/api/hiq/upload", { method: "POST", body: { dataUrl, category } }); const url = r?.url ?? r?.data?.url; if (!url) throw new Error("upload"); return String(url); };
        const [photoUrl, thumbUrl] = await Promise.all([put(draw(FISHING_PHOTO_LONG_SIDE), FISHING_PHOTO_CATEGORY), put(draw(FISHING_THUMB_LONG_SIDE), FISHING_THUMB_CATEGORY)]);
        return { photoUrl, thumbUrl };
    } finally { URL.revokeObjectURL(src); }
}

export default function FishingPage({ view = "home" }: { view?: Tab }) {
    const [, setLocation] = useLocation();
    const tab = view;
    const setTab = (t: Tab) => setLocation(TAB_PATH[t]);
    const { data: me, isLoading: meLoading } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    const allowed = me?.fishingAccess === true;
    const { data, isLoading } = useQuery<FishingCatch[]>({ queryKey: KEY, enabled: allowed });
    const list = data ?? [];
    const [adding, setAdding] = useState(false);
    const [preset, setPreset] = useState<Preset | null>(null);
    // 방금 오른 단계 — 승급 창
    const [promoted, setPromoted] = useState<FishRecord<FishingCatch> | null>(null);
    const today = fishingKstDay(Date.now());
    const empty = !isLoading && list.length === 0;
    const records = useMemo(() => fishRecords(list), [list]);
    const sampleRecords = useMemo(() => fishRecords(SAMPLE), []);
    const shown = empty ? sampleRecords : records;
    const near = useMemo(() => nearestPromotion(records), [records]);
    const trips = useMemo(() => new Set(list.map((c) => c.day)).size, [list]);
    const seals = useMemo(() => records.filter((r) => r.tier).length, [records]);
    const name = String(me?.nickname ?? me?.name ?? "");
    const top = shown[0] ?? null;

    const remove = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/fishing/catches/${id}`, { method: "DELETE" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });

    if (!meLoading && !allowed) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: C.bg, color: C.foam }}>
                <p className="text-[15px]">낚시는 아직 준비 중이에요.</p>
                <button type="button" onClick={() => setLocation("/dashboard")} className="h-11 rounded-xl px-5 text-[14px] font-semibold" style={{ background: C.brand, color: C.onBrand }}>홈으로</button>
            </div>
        );
    }

    const row = (c: FishingCatch) => {
        const fish = fishByName(c.species);
        const v = fish ? fishValue(fish, c) : c.lengthCm;
        return (
            <li key={c.id} className="flex min-h-[60px] items-center gap-3 py-2.5" data-testid="fishing-catch">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: PAPER }}>
                    {c.thumbUrl ? <img src={c.thumbUrl} alt="" className="h-full w-full object-cover" /> : fish ? <img src={art(fish.id)} alt="" className="h-9 w-11 object-contain" style={{ mixBlendMode: "multiply" }} /> : <span className="text-[12px]" style={{ color: INK }}>{c.species.slice(0, 2)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold" style={{ color: C.foam }}>
                        {c.species} <span className="font-normal tabular-nums" style={{ color: C.soft }}>{v != null ? fishValueText(fish?.unit ?? "cm", v) : `${c.count}수`}{fish && fish.unit !== "count" && c.count > 1 ? ` · ${c.count}수` : ""}{c.released ? " · 방류" : ""}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[13px]" style={{ color: C.dim }}>{[fishingDayLabel(c.day, today), c.place, fishingSpotName(c.spot), c.tideSea ? tideOf(c.day, c.tideSea)?.name : null].filter(Boolean).join(" · ")}</span>
                    {c.note ? <span className="mt-0.5 block truncate text-[13px]" style={{ color: C.soft }}>{c.note}</span> : null}
                </span>
                <button type="button" aria-label="이 기록 지우기" data-testid="fishing-catch-delete"
                    onClick={() => { void appConfirm({ title: "이 기록을 지울까요?", message: "지우면 되돌릴 수 없어요.", tone: "danger", confirmText: "지우기", cancelText: "그대로" }).then((ok) => { if (ok) remove.mutate(c.id); }); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-[#FFFFFF14]"><LucideX className="h-4 w-4" style={{ color: C.dim }} /></button>
            </li>
        );
    };
    const LIST = "divide-y divide-[#FFFFFF14] rounded-2xl bg-[#FFFFFF0A] px-3.5";
    const addButton = (label: string, testid: string) => (
        <button type="button" onClick={() => setAdding(true)} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid={testid}>
            <LucidePlus weight="bold" className="h-5 w-5" />{label}
        </button>
    );

    return (
        <div className="min-h-screen pb-nav font-sans" style={{ background: C.bg, color: C.foam }} data-fishing="1" data-testid={`fishing-${tab}`}>
            {/* 머리줄 — 다른 종목과 같은 것(홈: 워드마크 · 종목 전환 · 알림 · 전체 메뉴, 그 밖: 뒤로 · 제목) */}
            {tab === "home" ? <SportHeader sport="FISHING" /> : <SportBackHeader sport="FISHING" title={TAB_TITLE[tab]} inner="mx-auto max-w-[720px]" />}

            <main className="mx-auto max-w-[720px]">
                {tab === "home" && (
                    <>
                        {/* 표지 위의 내 기록 — 등산 홈과 같은 짜임(인사 · 대표 한 장 · 숫자 셋 · 단추 셋) */}
                        <div className="relative overflow-hidden" data-testid="fishing-hero">
                            <img src={FS_HERO} alt="" width={880} height={880} className="absolute inset-x-0 top-0 h-[340px] w-full object-cover" style={{ objectPosition: "50% 62%" }} draggable={false} decoding="async" />
                            <div className="absolute inset-x-0 top-0 h-[341px]" style={{ background: "linear-gradient(180deg,#0B1E2D1F 0%,#0B1E2D00 30%,#0B1E2D8C 62%,#0B1E2D 100%)" }} aria-hidden />
                            <div className="relative px-5 pb-5 pt-[168px]">
                                {!FISHING_PUBLIC && <span className="absolute right-5 top-4 rounded-full px-2.5 py-1 text-[12px]" style={{ background: "#0B1E2DB3", color: C.sun }} data-testid="fishing-owner-only">운영자만 보는 중</span>}
                                <p className="text-[14px] break-keep" style={{ color: "#F3ECDDE6", textShadow: "0 1px 10px #0B1E2D" }}>{name ? `${name} 님, ` : ""}{empty ? "첫 조과를 적어 볼까요?" : "다음은 어느 물로 나갈까요?"}</p>
                                {top && (
                                    <button type="button" onClick={() => setTab("book")} className="mt-3 flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left backdrop-blur-sm active:opacity-80" style={{ background: "#0B1E2DB3", boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="fishing-top">
                                        <span className="flex h-[56px] w-[72px] shrink-0 items-center justify-center rounded-lg" style={{ background: PAPER }}><img src={art(top.fish.id)} alt="" className="h-11 w-[62px] object-contain" style={{ mixBlendMode: "multiply" }} /></span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-[12.5px]" style={{ color: "#F3ECDD99" }}>{empty ? "예시 · 대표 기록어" : "대표 기록어"}</span>
                                            <span className="mt-0.5 block truncate text-[18px] font-semibold tracking-tight">{top.fish.name} <span className="tabular-nums" style={{ color: C.sun }}>{top.value != null ? fishValueText(top.fish.unit, top.value) : ""}</span></span>
                                        </span>
                                        {top.tier && <Seal text={top.tier.name} size={40} />}
                                    </button>
                                )}
                                <div className="mt-2.5 flex rounded-2xl py-3.5 backdrop-blur-sm" style={{ background: "#0B1E2DB3", boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="fishing-summary">
                                    {([[empty ? "-" : `${records.length}/${FISH.length}`, "만난 어종"], [empty ? "-" : trips, "출조"], [empty ? "-" : seals, "낙관"]] as const).map(([n, label]) => (
                                        <div key={label} className="flex-1 text-center">
                                            <div className="text-[24px] font-semibold tabular-nums leading-none">{n}</div>
                                            <div className="mt-1.5 text-[12px]" style={{ color: "#F3ECDD99" }}>{label}</div>
                                        </div>
                                    ))}
                                </div>
                                <div className="mt-3 flex gap-2">
                                    <button type="button" onClick={() => setAdding(true)} className="flex h-12 flex-1 items-center justify-center rounded-xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-add">조과 적기</button>
                                    <button type="button" onClick={() => setTab("book")} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#FFFFFF1F] text-[15px] font-medium active:bg-[#FFFFFF2E]" data-testid="fishing-to-book">어탁첩</button>
                                    <button type="button" onClick={() => setTab("log")} className="flex h-12 flex-1 items-center justify-center rounded-xl bg-[#FFFFFF1F] text-[15px] font-medium active:bg-[#FFFFFF2E]" data-testid="fishing-to-log">내 조과</button>
                                </div>
                            </div>
                        </div>

                        {/* 가장 가까운 승급 */}
                        {near && (
                            <div className="px-5 pt-2">
                                <button type="button" onClick={() => setTab("book")} className="flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left active:opacity-80" style={{ background: "#FFFFFF0A", boxShadow: `inset 0 0 0 1px ${C.brand}66` }} data-testid="fishing-near">
                                    <Seal text={near.next!.name} size={48} faint />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-[15.5px] font-semibold break-keep">{near.fish.name} {near.next!.name}까지 <span className="tabular-nums" style={{ color: C.sun }}>{fishValueText(near.fish.unit, near.gap!)}</span></span>
                                        <span className="mt-0.5 block text-[13px] break-keep" style={{ color: "#F3ECDD99" }}>지금 기록은 {near.value != null ? fishValueText(near.fish.unit, near.value) : "-"} — 넘으면 붉은 낙관이 찍혀요</span>
                                    </span>
                                    <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: C.brand }} aria-hidden />
                                </button>
                            </div>
                        )}

                        {/* 오늘의 바다 — 종이 해도(등산 홈의 '내 산 지도' 자리) */}
                        <Today today={today} list={list} onOpenTrip={() => setTab("trip")} />

                        <FsSection title="어탁 벽" aside={empty ? "예시" : <button type="button" onClick={() => setTab("book")} style={{ color: C.sun }}>어탁첩 보기</button>}>
                            <div className="grid grid-cols-2 gap-2.5">{shown.slice(0, 6).map((r) => <Eotak key={r.fish.id} rec={r} today={today} sample={empty} />)}</div>
                            <p className="mt-2 text-[12.5px] break-keep" style={{ color: C.dim }}>{empty ? "조과를 적으면 어종마다 어탁이 한 장씩 걸려요. 단계에 오르면 붉은 낙관이 찍혀요." : "어종마다 가장 큰 한 마리가 걸려요."}</p>
                        </FsSection>

                        {!empty && (
                            <FsSection title="최근 조과" aside={<button type="button" onClick={() => setTab("log")} style={{ color: C.sun }}>전부 {list.length}줄</button>}>
                                <ul className={LIST}>{list.slice(0, 3).map(row)}</ul>
                            </FsSection>
                        )}
                    </>
                )}

                {tab === "trip" && (
                    <>
                        <FsCover src={FS_COVER_TRIP} line="나가기 전에 보는 것 — 바다의 특보와 물때" />
                        <Today today={today} list={list} />
                        <MarketBoard />
                        <FsSection title="낚시터" aside="등록된 1,151곳">
                            <button type="button" onClick={() => setTab("points")} className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl bg-[#FFFFFF0A] px-3.5 py-2.5 text-left active:opacity-80" data-testid="fishing-to-points">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "#FFFFFF14" }}><LucideMap className="h-5 w-5" style={{ color: C.sun }} /></span>
                                <span className="min-w-0 flex-1"><span className="block text-[15.5px] font-semibold">낚시터 찾기</span><span className="mt-0.5 block text-[13px]" style={{ color: C.dim }}>지역 · 이름 · 어종으로 찾고 요금 보기</span></span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: "#F3ECDD66" }} />
                            </button>
                        </FsSection>
                    </>
                )}

                {tab === "book" && (
                    <div data-testid="fishing-book">
                        <FsCover src={FS_COVER_BOOK} at="50% 34%" line={records.length ? `어종 ${records.length}/${FISH.length} · 낙관 ${seals}개` : "조과를 적으면 그 어종의 칸에 어탁이 찍혀요"} />
                        {FISH_BOOKS.map((b) => {
                            const got = new Map(records.map((r) => [r.fish.id, r]));
                            const n = b.fish.filter((f) => got.has(f.id)).length;
                            return (
                                <FsSection key={b.id} title={b.name} aside={`${n}/${b.fish.length}`} testid={`fishing-book-${b.id}`}>
                                    <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "#FFFFFF14" }}><div className="h-full rounded-full" style={{ width: `${Math.round((n / b.fish.length) * 100)}%`, background: C.brand }} /></div>
                                    {/* 종이 한 장 — 칸마다 어탁이 찍힌다(등산의 도장첩과 같은 종이). 아직 못 만난 어종은 옅은 밑그림이다 */}
                                    <div className="mt-3 overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                                        <div className="grid grid-cols-3">
                                            {b.fish.map((f, i) => {
                                                const r = got.get(f.id);
                                                return (
                                                    <div key={f.id} className="relative px-1.5 pb-2.5 pt-3 text-center" data-testid={`fishing-slot-${f.id}`} data-got={r ? "1" : "0"}
                                                        style={{ color: INK, borderLeft: i % 3 ? "1px dashed #0F283826" : undefined, borderTop: i >= 3 ? "1px dashed #0F283826" : undefined }}>
                                                        {r?.tier && <span className="absolute right-1.5 top-1.5" style={{ transform: "rotate(6deg)" }}><Seal text={r.tier.name} size={28} /></span>}
                                                        <img src={art(f.id)} alt="" width={640} height={400} loading="lazy" decoding="async" className="mx-auto h-[54px] w-full object-contain" style={{ mixBlendMode: "multiply", opacity: r ? 1 : 0.14 }} />
                                                        <p className="mt-1 truncate text-[13px] font-semibold" style={{ color: r ? INK : "#0F283873" }}>{f.name}</p>
                                                        <p className="truncate text-[12px] tabular-nums" style={{ color: r ? "#0F283899" : "#0F283866" }}>{r ? (r.value != null ? fishValueText(f.unit, r.value) : "만남") : `${f.tiers[0].name}부터`}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </FsSection>
                            );
                        })}
                        <div className="px-5 pt-6">{addButton("조과 적고 어탁 받기", "fishing-book-add")}</div>
                        <p className="px-5 pt-3 text-[12.5px] leading-relaxed break-keep" style={{ color: C.dim }}>단계(월척 · 런커 · 5짜 …)에 오르면 붉은 낙관이 붙어요.</p>
                    </div>
                )}

                {tab === "log" && (
                    <FsSection title="내 조과" aside={list.length ? `${list.length}줄 · ${trips}번 출조` : undefined}>
                        {addButton("조과 적기", "fishing-log-add")}
                        {list.length === 0 ? <p className="mt-3 rounded-2xl bg-[#FFFFFF0A] px-5 py-8 text-center text-[14px]" style={{ color: C.soft }}>아직 적은 조과가 없어요.</p>
                            : <ul className={`mt-3 ${LIST}`}>{list.map(row)}</ul>}
                    </FsSection>
                )}

                {tab === "points" && <div className="px-5"><Points onPick={(p) => { setPreset({ place: p.name, spot: "pay" }); setAdding(true); }} /></div>}

                <div className="h-6" aria-hidden />
            </main>

            {/* 하단 탭 — 다른 종목과 같은 것(홈 · 크루 · 출조 · 어탁첩 · 채팅) */}
            <HiqNavigation />

            {adding && (
                <CatchSheet today={today} preset={preset} before={records}
                    onClose={() => { setAdding(false); setPreset(null); }}
                    onSaved={(saved, all) => {
                        // 새 단계에 올랐는가 — 적기 전의 단계와 견준다(처음 만난 어종도 한 장 찍힌 것이니 보여 준다)
                        const fish = fishByName(saved.species);
                        const after = fish ? fishRecords(all).find((r) => r.fish.id === fish.id) : null;
                        const was = fish ? records.find((r) => r.fish.id === fish.id) : null;
                        if (after && (!was || after.tierIndex > was.tierIndex)) setPromoted(after);
                    }} />
            )}

            {promoted && (
                <div role="dialog" aria-modal="true" aria-label="새 어탁" className="fixed inset-0 z-[70] flex flex-col items-center justify-center px-6" style={{ background: "#0B1E2DF2" }} data-testid="fishing-promoted" onClick={() => setPromoted(null)}>
                    <p className="text-[14px]" style={{ color: C.soft }}>{promoted.tier ? "승급" : "새 어탁"}</p>
                    <p className="mt-1 text-center text-[26px] font-semibold tracking-tight">{promoted.tier ? `${promoted.fish.name} ${promoted.tier.name}` : `${promoted.fish.name} 첫 수`}</p>
                    <div className="mt-5 w-full max-w-[340px]" style={{ transform: "rotate(-1.5deg)" }}><Eotak rec={promoted} today={today} big /></div>
                    {promoted.next && promoted.gap != null && <p className="mt-5 text-[14px]" style={{ color: C.soft }}>다음은 <span className="font-semibold" style={{ color: C.foam }}>{promoted.next.name}</span> — {fishValueText(promoted.fish.unit, promoted.gap)} 남았어요</p>}
                    <button type="button" onClick={() => setPromoted(null)} className="mt-6 h-12 rounded-xl px-8 text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-promoted-close">어탁첩에 걸기</button>
                </div>
            )}
        </div>
    );
}

/**
 * 위판장 소식 — 지난 이레 동안 전국 위판장에 어떤 어종이 얼마나 자주 올랐는가(해양수산부). 종이 한 장의 장부로 그린다:
 * 어탁 한 점 · 이름 · 날마다의 막대 일곱 개 · 한 주의 건수. 조황 글과 달리 꾸밀 수 없는 숫자지만 **어선의 위판**이지 낚시 조과가 아니다 — 그렇게 적는다.
 * 받은 것이 없으면 아무것도 그리지 않는다.
 */
function MarketBoard() {
    const { data } = useQuery<MarketWeek | null>({ queryKey: ["/api/hiq/fishing/market"], staleTime: 15 * 60_000 });
    if (!data?.fish?.length) return null;
    const rows = data.fish.slice(0, 8);
    const first = data.days[0], last = data.days[data.days.length - 1];
    const md = (d: string) => `${Number(d.slice(5, 7))}.${Number(d.slice(8))}`;
    return (
        <FsSection title="위판장 소식" aside={`${md(first)}~${md(last)} · 경매 건수`} testid="fishing-market">
            <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                <p className="px-3.5 pb-1 pt-3 text-[13px] break-keep" style={{ color: "#0F2838B3" }}>지난 이레, 전국 위판장에 많이 오른 어종</p>
                <ul>
                    {rows.map((f, i) => {
                        const max = Math.max(1, ...f.counts);
                        return (
                            <li key={f.id} className="flex items-center gap-3 px-3.5 py-2.5" style={{ borderTop: i ? "1px dashed #0F283826" : undefined }} data-testid="fishing-market-row">
                                <span className="w-4 shrink-0 text-center text-[13px] tabular-nums" style={{ color: "#0F283880" }}>{i + 1}</span>
                                <img src={art(f.id)} alt="" width={640} height={400} loading="lazy" decoding="async" className="h-9 w-[52px] shrink-0 object-contain" style={{ mixBlendMode: "multiply" }} />
                                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{f.name}</span>
                                {/* 날마다의 막대 — 오래된 날부터. 어제 것은 덜 들어왔을 수 있어 옅게 */}
                                <span className="flex h-8 shrink-0 items-end gap-[3px]" aria-hidden>
                                    {f.counts.map((n, k) => <i key={data.days[k]} className="w-[5px] rounded-t-[2px]" style={{ height: `${Math.max(2, Math.round((n / max) * 30))}px`, background: "#1F5A78", opacity: k === f.counts.length - 1 ? 0.4 : 0.85 }} />)}
                                </span>
                                <span className="w-[58px] shrink-0 text-right text-[14px] font-semibold tabular-nums">{f.total.toLocaleString("en-US")}<span className="text-[12px] font-normal" style={{ color: "#0F283880" }}>건</span></span>
                            </li>
                        );
                    })}
                </ul>
                <p className="border-t px-3.5 py-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ borderColor: "#0F28381F", color: "#0F283899" }}>{MARKET_NOTE} 출처: {MARKET_SOURCE}.</p>
            </div>
        </FsSection>
    );
}

/** 구역 하나 — 제목과 오른쪽 한 줄(등산의 HkSection 과 같은 치수) */
function FsSection({ title, aside, children, testid }: { title: string; aside?: ReactNode; children: ReactNode; testid?: string }) {
    return (
        <section className="px-5 pt-8" data-testid={testid}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
                {aside && <span className="shrink-0 text-[12.5px]" style={{ color: C.dim }}>{aside}</span>}
            </div>
            {children}
        </section>
    );
}

/** 화면 머리의 그림 띠 — 그림에는 글자가 없고, 한 줄만 얹는다 */
function FsCover({ src, line, at = "50% 42%" }: { src: string; line: string; /** 그림의 어디를 보일까(object-position) */ at?: string }) {
    return (
        <div className="relative h-[176px] overflow-hidden">
            <img src={src} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: at }} draggable={false} decoding="async" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D1A 0%,#0B1E2D99 68%,#0B1E2D 100%)" }} aria-hidden />
            <p className="absolute inset-x-5 bottom-3 text-[14px] break-keep" style={{ color: "#F3ECDDCC" }}>{line}</p>
        </div>
    );
}

/** 홈의 물때 한 줄 — 오늘 몇 물인지와 사리 · 조금까지. 누르면 출조 탭(이레 띠 · 바다) */
function TodayStrip({ today, sea, onOpen }: { today: string; sea: TideSea; onOpen: () => void }) {
    const t = tideOf(today, sea);
    if (!t) return null;
    const spring = nextTideMark(today, "사리"), neap = nextTideMark(today, "조금");
    const until = (m: { inDays: number } | null, name: string) => (!m ? null : m.inDays === 0 ? `오늘이 ${name}` : `${name}까지 ${m.inDays}일`);
    const head = TIDE_PHASE_TEXT[t.phase];
    return (
        <div className="px-5 pt-2">
            <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-2xl bg-[#FFFFFF0A] px-3.5 py-3 text-left active:opacity-80" data-testid="fishing-today">
                <span className="flex h-[52px] w-[60px] shrink-0 flex-col items-center justify-center rounded-xl" style={{ background: "#1F5A7880" }}>
                    <span className="text-[12px]" style={{ color: "#F3ECDD99" }}>오늘</span>
                    <span className="text-[17px] font-semibold tabular-nums leading-tight">{t.name}</span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold">{head}</span>
                    <span className="mt-0.5 block truncate text-[13px]" style={{ color: "#F3ECDD99" }}>{[until(spring, "사리"), until(neap, "조금")].filter(Boolean).join(" · ")}</span>
                </span>
                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: "#F3ECDD66" }} aria-hidden />
            </button>
        </div>
    );
}

const SEA_KEY = "rankue-fishing-sea", AREA_KEY = "rankue-fishing-area", PORT_KEY = "rankue-fishing-port";
function readPort(): string | null { try { return fishingPort(localStorage.getItem(PORT_KEY))?.code ?? null; } catch { return null; } }
function readSea(): TideSea { try { return localStorage.getItem(SEA_KEY) === "south" ? "south" : "west"; } catch { return "west"; } }
function readArea(): string | null { try { const v = localStorage.getItem(AREA_KEY); return SEA_AREAS.some((a) => a.id === v) ? v : null; } catch { return null; } }
const keep = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* 저장을 못 해도 화면은 바뀐다 */ } };

/** 날마다 먼저 보는 묶음 — 오늘의 바다(특보) + 물때. 바다를 고르면 물때도 그 바다의 식으로 센다 */
function Today({ today, list, onOpenTrip }: { today: string; list: readonly FishingCatch[]; /** 홈 — 바다 지도와 물때 한 줄만 그리고, 그 줄을 누르면 출조 탭으로 간다 */ onOpenTrip?: () => void }) {
    const [sea, setSea] = useState<TideSea>(readSea);
    const [area, setArea] = useState<string | null>(readArea);
    const pickSea = (id: TideSea) => { setSea(id); keep(SEA_KEY, id); };
    const [port, setPort] = useState<string | null>(readPort);
    const pickPort = (code: string) => { setPort(code); keep(PORT_KEY, code); };
    const pickArea = (id: string) => {
        setArea(id); keep(AREA_KEY, id);
        const t = SEA_AREAS.find((a) => a.id === id)?.tide; if (t) pickSea(t);
        // 바다를 바꾸면 그 바다의 첫 항구로 — 고른 항구가 이미 그 바다에 있으면 그대로 둔다
        if (fishingPort(port)?.area !== id) { const first = portsOfArea(id)[0]; if (first) pickPort(first.code); }
    };
    return (
        <>
            <SeaBoard area={area} onArea={pickArea} port={port} onPort={pickPort} />
            {/* 내 항구 — 홈에서는 한 줄(누르면 출조 탭), 출조 탭에서는 한 장 */}
            {port && (onOpenTrip ? <PortStrip code={port} today={today} onOpen={onOpenTrip} /> : <PortCard code={port} today={today} />)}
            {onOpenTrip ? <TodayStrip today={today} sea={sea} onOpen={onOpenTrip} /> : <TideCard today={today} sea={sea} onSea={pickSea} list={list} />}
        </>
    );
}

// 색은 뜻 하나씩: 특보 없음(옅은 물빛) · 먼바다만/예비(모래빛) · 주의보(산호빛) · 경보(붉은색)
const SEA_TONE: Readonly<Record<SeaState, { bg: string; dot: string; text: string }>> = {
    clear: { bg: "#FFFFFF0F", dot: "#8FB3C2", text: "#F3ECDDB3" },
    pre: { bg: "#F8DDB01F", dot: "#F8DDB0", text: "#F8DDB0" },
    far: { bg: "#F8DDB01F", dot: "#F8DDB0", text: "#F8DDB0" },
    warn: { bg: "#EE7B5B33", dot: "#EE7B5B", text: "#F7B9A6" },
    alert: { bg: "#D8432F4D", dot: "#E0533B", text: "#F7B9A6" },
};

/**
 * 오늘의 바다 — 해역 일곱 곳을 서해 · 남해 · 동해 세 줄로(왼쪽이 서쪽). 점수 대신 특보가 있는가 없는가를 말로 적는다.
 * 받아 온 것이 없으면 아무것도 그리지 않는다(없는데 '특보 없음'으로 보이면 안 된다).
 */
function SeaBoard({ area, onArea, port, onPort }: { area: string | null; onArea: (id: string) => void; port: string | null; onPort: (code: string) => void }) {
    const { data } = useQuery<SeaNow | null>({ queryKey: ["/api/hiq/fishing/sea"], staleTime: 5 * 60_000 });
    if (!data?.areas?.length) return null;
    const by = new Map(data.areas.map((a) => [a.id, a]));
    const warned = data.areas.filter((a) => a.state === "warn" || a.state === "alert").length;
    const pickedDef = SEA_AREAS.find((a) => a.id === area) ?? null;
    const picked = pickedDef ? by.get(pickedDef.id) ?? null : null;
    return (
        <section className="px-5 pt-8" data-testid="fishing-sea">
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight">오늘의 바다</h2>
                <p className="shrink-0 text-[12.5px]" style={{ color: C.dim }} data-testid="fishing-sea-sum">{warned ? `앞바다 풍랑특보 ${warned}곳` : "앞바다 풍랑특보 없음"}</p>
            </div>
            {/* 종이 해도 — 구역을 누르면 그 바다를 고른다(등산의 '내 산 지도'와 같은 손) */}
            <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                <SeaChart areas={data.areas} picked={area} onPick={onArea} ports={FISHING_PORTS} port={port} />
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3.5 py-2.5" style={{ borderColor: "#0F28381F" }}>
                    {SEA_LEGEND.map((l) => (
                        <span key={l.state} className="flex items-center gap-1.5 text-[12px]" style={{ color: "#0F2838B3" }}>
                            <i aria-hidden className="h-3 w-3 rounded-[4px]" style={{ background: seaWashColor(l.state), boxShadow: `inset 0 0 0 1px ${seaWashLine(l.state)}` }} />{l.text}
                        </span>
                    ))}
                </div>
            </div>
            {/* 고른 바다 — 그 바다의 그림 위에 한 줄 */}
            <div className="mt-2.5 overflow-hidden rounded-2xl bg-[#FFFFFF0A]">
                {picked && pickedDef ? (
                    <div data-testid="fishing-sea-picked">
                        <div className="relative h-[112px] overflow-hidden">
                            <img key={pickedDef.id} src={seaCover(pickedDef.id)} alt="" width={640} height={640} decoding="async" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 46%" }} draggable={false} />
                            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D00 0%,#0B1E2D73 55%,#0B1E2DE6 100%)" }} aria-hidden />
                            <p className="absolute inset-x-3.5 bottom-2.5 text-[13px]" style={{ color: "#F3ECDDD9" }}><span className="text-[17px] font-semibold tracking-tight" style={{ color: C.foam }}>{pickedDef.name}</span> · {pickedDef.hint}</p>
                        </div>
                        <div className="px-3.5 pb-3 pt-3">
                            <p className="text-[16px] font-semibold" style={{ color: SEA_TONE[picked.state].text }}>{seaHeadline(picked)}</p>
                            {seaNotes(picked).map((n) => <p key={n} className="mt-0.5 text-[12.5px] leading-relaxed [word-break:keep-all]" style={{ color: C.soft }}>{n}</p>)}
                            {/* 이 바다의 항구 — 고르면 아래에 그 항구의 하루가 나온다 */}
                            <div className="-mx-3.5 mt-3 flex gap-1.5 overflow-x-auto px-3.5 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="항구" data-testid="fishing-ports">
                                {portsOfArea(pickedDef.id).map((p) => (
                                    <button key={p.code} type="button" aria-pressed={p.code === port} onClick={() => onPort(p.code)} data-testid={`fishing-port-${p.code}`}
                                        className={cn("h-9 shrink-0 rounded-full px-3 text-[13px]", p.code === port && "font-semibold")}
                                        style={p.code === port ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>{p.name}</button>
                                ))}
                            </div>
                        </div>
                    </div>
                ) : (
                    <p className="px-3.5 pt-3.5 text-[13px]" style={{ color: C.soft }}>지도에서 자주 가는 바다를 누르면 그 바다부터 보여요.</p>
                )}
                <p className="px-3.5 pb-3.5 text-[12px] leading-relaxed" style={{ color: C.dim, paddingTop: picked ? 0 : 10 }}>구역의 네모는 어림이에요. {SEA_SOURCE}{data.issued ? ` · ${data.issued} 발표` : ""}{data.stale ? " · 받아 온 지 오래됐어요" : ""}. {SEA_CAUTION}</p>
            </div>
        </section>
    );
}

const INDEX_TONE: Readonly<Record<FishingIndexStep, { bg: string; text: string }>> = {
    매우좋음: { bg: "#F4A96340", text: "#F8DDB0" }, 좋음: { bg: "#F4A96326", text: "#F8DDB0" }, 보통: { bg: "#FFFFFF14", text: "#F3ECDDCC" },
    나쁨: { bg: "#EE7B5B26", text: "#F7B9A6" }, 매우나쁨: { bg: "#EE7B5B40", text: "#F7B9A6" },
};
const portKey = (code: string, day: string) => ["/api/hiq/fishing/ports", code, day] as const;
const usePort = (code: string, day: string) => useQuery<PortBrief | null>({ queryKey: portKey(code, day), queryFn: () => apiRequest(`/api/hiq/fishing/ports/${code}?day=${day}`), staleTime: 5 * 60_000 });
/** 지금(한국 시각)이 그날의 몇 분째인가 */
const kstMinuteNow = () => Math.floor(((Date.now() + 9 * 3600_000) % 86_400_000) / 60_000);

/**
 * 항구의 하루 — 공공 자료를 엮은 한 장: 종이 위의 조석 곡선(만조 · 간조 · 지금 · 해 뜨고 지는 때), 지금의 바다(수온 · 파고 · 바람 · 시정),
 * 해와 달, 그리고 국립해양조사원의 바다낚시지수. 날짜를 넘겨 엿새까지 본다.
 * 낚시지수는 우리가 매긴 값이 아니다 — 출처를 적는다. 예측값이라고 적는다.
 */
function PortCard({ code, today }: { code: string; today: string }) {
    const [day, setDay] = useState(today);
    const def = fishingPort(code);
    const { data, isLoading } = usePort(code, day);
    if (!def) return null;
    const days = data?.days ?? [today];
    const isToday = (data?.day ?? day) === today;
    const nowMin = isToday ? kstMinuteNow() : null;
    const turns = data?.turns ?? [];
    const flow = nowMin != null ? tideFlowAt(turns, nowMin) : null;
    const range = tideRange(turns);
    const outlook = data?.index ? indexOutlook(data.index.rows) : null;
    const now = data?.now ?? null;
    const fishes = data?.index ? [...new Set(data.index.rows.map((r) => r.fish))] : [];
    const tidePart = data?.index?.rows.find((r) => r.tide)?.tide ?? null;
    const tiles: { label: string; value: string; sub?: string | null }[] = [];
    if (now?.wtemp != null) tiles.push({ label: "수온", value: `${now.wtemp.toFixed(1)}°`, sub: now.atemp != null ? `기온 ${now.atemp.toFixed(1)}°` : null });
    else if (outlook && data?.index?.rows.some((r) => r.wtemp)) { const w = data.index.rows.find((r) => r.wtemp)!.wtemp!; tiles.push({ label: "수온(예보)", value: `${rangeText(w)}°` }); }
    if (now?.buoy?.wave != null) tiles.push({ label: "파고", value: `${now.buoy.wave.toFixed(1)}m`, sub: `${now.buoy.name} 부이 · ${now.buoy.km}km` });
    else if (outlook?.wave) tiles.push({ label: "파고(예보)", value: `${rangeText(outlook.wave)}m`, sub: data?.index ? `${data.index.point}` : null });
    if (now?.buoy?.wind != null) tiles.push({ label: "바람", value: `${now.buoy.wind.toFixed(1)}m/s`, sub: [windDirKo(now.buoy.windDir), `${now.buoy.name} 부이`].filter(Boolean).join(" · ") });
    else if (outlook?.wind) tiles.push({ label: "바람(예보)", value: `${rangeText(outlook.wind)}m/s`, sub: data?.index ? `${data.index.point}` : null });
    if (now?.fog?.visM != null) tiles.push({ label: "시정", value: visibilityText(now.fog.visM) ?? "-", sub: `${now.fog.name} 해무관측소` });
    if (data?.sun?.rise != null && data.sun.set != null) tiles.push({ label: "해", value: `${hhmm(data.sun.rise)} – ${hhmm(data.sun.set)}`, sub: data.sun.dawn != null ? `여명 ${hhmm(data.sun.dawn)}` : null });
    if (data?.sun?.moonrise != null || data?.sun?.moonset != null) tiles.push({ label: "달", value: `${data!.sun!.moonrise != null ? hhmm(data!.sun!.moonrise!) : "–"} – ${data!.sun!.moonset != null ? hhmm(data!.sun!.moonset!) : "–"}`, sub: "뜨고 지는 때" });
    if (range != null) tiles.push({ label: "물높이 차", value: `${range}cm`, sub: tidePart });
    return (
        <section className="px-5 pt-8" data-testid="fishing-port">
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight">{def.name}의 하루</h2>
                <span className="shrink-0 text-[12.5px]" style={{ color: C.dim }}>{FISHING_PORT_SOURCE} 예측</span>
            </div>
            {/* 날짜 넘기기 — 오늘부터 엿새 */}
            <div className="-mx-5 mb-2.5 flex gap-1.5 overflow-x-auto px-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="날짜">
                {days.map((d, i) => {
                    const on = d === (data?.day ?? day), weekend = ["토", "일"].includes(tideWeekday(d));
                    return (
                        <button key={d} type="button" aria-pressed={on} onClick={() => setDay(d)} data-testid="fishing-port-day"
                            className={cn("h-9 shrink-0 rounded-full px-3 text-[13px] tabular-nums", on && "font-semibold")}
                            style={on ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: weekend ? C.sun : C.soft }}>{i === 0 ? "오늘" : i === 1 ? "내일" : `${Number(d.slice(8))} ${tideWeekday(d)}`}</button>
                    );
                })}
            </div>
            {isLoading && !data ? <div className="h-[260px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />
                : !data ? <p className="rounded-2xl bg-[#FFFFFF0A] px-5 py-7 text-center text-[13.5px]" style={{ color: C.soft }} data-testid="fishing-port-none">지금은 받아 오지 못했어요. 잠시 뒤에 다시 열어 주세요.</p>
                    : (
                        <>
                            <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                                <TideCurve points={data.points.map(([min, cm]) => ({ min, cm }))} turns={turns} nowMin={nowMin} sun={data.sun?.rise != null && data.sun.set != null ? { rise: data.sun.rise, set: data.sun.set } : null} />
                                <p className="border-t px-3.5 py-2.5 text-[13.5px] [word-break:keep-all]" style={{ borderColor: "#0F28381F", color: "#0F2838" }} data-testid="fishing-port-flow">
                                    {turns.length < 2 ? "물높이 차가 아주 작은 바다예요 — 만조 · 간조가 뚜렷하지 않아요."
                                        : flow ? <>지금은 <span className="font-semibold">{flow.flow}</span> — {flow.next.kind === "high" ? "만조" : "간조"}({hhmm(flow.next.min)})까지 <span className="font-semibold tabular-nums">{durationKo(flow.inMin)}</span></>
                                            : turns.map((t) => `${t.kind === "high" ? "만조" : "간조"} ${hhmm(t.min)}`).join(" · ")}
                                </p>
                            </div>

                            {/* 한 장의 표 — 칸 사이는 가는 줄(카드 여러 장으로 쪼개지 않는다). 칸이 홀수면 마지막 칸이 한 줄을 다 쓴다 */}
                            {tiles.length > 0 && (
                                <div className="mt-2.5 grid grid-cols-2 overflow-hidden rounded-2xl bg-[#FFFFFF0A]" data-testid="fishing-port-tiles">
                                    {tiles.map((t, i) => (
                                        <div key={t.label} className={cn("px-3.5 py-3", tiles.length % 2 === 1 && i === tiles.length - 1 && "col-span-2")}
                                            style={{ borderTop: i >= 2 ? "1px solid #FFFFFF14" : undefined, borderLeft: i % 2 === 1 ? "1px solid #FFFFFF14" : undefined }}>
                                            <p className="text-[12.5px]" style={{ color: C.dim }}>{t.label}</p>
                                            <p className="mt-0.5 text-[19px] font-semibold tabular-nums tracking-tight">{t.value}</p>
                                            {t.sub ? <p className="mt-0.5 truncate text-[12px]" style={{ color: C.dim }}>{t.sub}</p> : null}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {data.index && fishes.length > 0 && (
                                <div className="mt-2.5 rounded-2xl bg-[#FFFFFF0A] px-3.5 pb-3 pt-3" data-testid="fishing-port-index">
                                    <div className="flex items-baseline justify-between gap-2">
                                        <p className="text-[14px] font-semibold">바다낚시지수</p>
                                        <p className="truncate text-[12px]" style={{ color: C.dim }}>{data.index.point} 지점</p>
                                    </div>
                                    <div className="mt-2 grid grid-cols-[1fr_auto_auto] items-center gap-x-2 gap-y-1.5">
                                        <span />
                                        <span className="w-[68px] text-center text-[12px]" style={{ color: C.dim }}>오전</span>
                                        <span className="w-[68px] text-center text-[12px]" style={{ color: C.dim }}>오후</span>
                                        {fishes.map((f) => {
                                            const cell = (part: "오전" | "오후") => {
                                                const r = data.index!.rows.find((x) => x.fish === f && (x.part === part || x.part === "일"));
                                                return r ? <span key={part} className="flex h-7 w-[68px] items-center justify-center rounded-full text-[12.5px]" style={{ background: INDEX_TONE[r.index].bg, color: INDEX_TONE[r.index].text }}>{r.index}</span> : <span key={part} className="w-[68px] text-center text-[12.5px]" style={{ color: C.dim }}>–</span>;
                                            };
                                            return [<span key={f} className="truncate text-[14px]">{f}</span>, cell("오전"), cell("오후")];
                                        })}
                                    </div>
                                    <p className="mt-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>국립해양조사원이 물때 · 파고 · 수온 · 바람으로 매긴 지수예요. 랭큐가 매긴 값이 아니에요.</p>
                                </div>
                            )}
                            <p className="mt-2.5 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>
                                조석은 예측값이라 바람 · 기압에 따라 실제와 달라요. 출처: 국립해양조사원{data.sun ? ` · 한국천문연구원(해 · 달은 ${data.sun.at ?? def.name} 기준)` : ""}.
                            </p>
                        </>
                    )}
        </section>
    );
}

/** 홈의 '내 항구' 한 줄 — 다음 만조 · 간조와 수온. 누르면 출조 탭의 한 장 */
function PortStrip({ code, today, onOpen }: { code: string; today: string; onOpen: () => void }) {
    const def = fishingPort(code);
    const { data } = usePort(code, today);
    if (!def || !data) return null;
    const flow = tideFlowAt(data.turns, kstMinuteNow());
    const head = flow ? `${flow.flow} · ${flow.next.kind === "high" ? "만조" : "간조"} ${hhmm(flow.next.min)}` : data.turns.length ? data.turns.map((t) => `${t.kind === "high" ? "만조" : "간조"} ${hhmm(t.min)}`).slice(-2).join(" · ") : "오늘의 물높이";
    const facts = [data.now?.wtemp != null ? `수온 ${data.now.wtemp.toFixed(1)}°` : null, data.now?.buoy?.wave != null ? `파고 ${data.now.buoy.wave.toFixed(1)}m` : null, data.sun?.rise != null && data.sun.set != null ? `해 ${hhmm(data.sun.rise)}–${hhmm(data.sun.set)}` : null].filter(Boolean);
    return (
        <div className="px-5 pt-2.5">
            <button type="button" onClick={onOpen} className="flex w-full items-center gap-3.5 rounded-2xl bg-[#FFFFFF0A] px-3.5 py-3 text-left active:opacity-80" data-testid="fishing-port-strip">
                <span className="flex h-[52px] w-[60px] shrink-0 flex-col items-center justify-center rounded-xl px-1" style={{ background: "#C8372D33" }}>
                    <span className="text-[12px]" style={{ color: "#F3ECDD99" }}>내 항구</span>
                    <span className="max-w-full truncate text-[15px] font-semibold leading-tight">{def.name}</span>
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-semibold">{head}</span>
                    <span className="mt-0.5 block truncate text-[13px] tabular-nums" style={{ color: "#F3ECDD99" }}>{facts.join(" · ") || "조석 곡선 보기"}</span>
                </span>
                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: "#F3ECDD66" }} aria-hidden />
            </button>
        </div>
    );
}

/**
 * 오늘의 물때 — 몇 물인지 크게, 앞으로 이레를 띠로. 음력으로 세는 값이라 바깥 자료 없이 늘 나온다.
 * 말하는 것은 물의 세기뿐이다(잘 낚인다는 말은 하지 않는다). 달력을 못 쓰는 기기에서는 아무것도 그리지 않는다.
 */
function TideCard({ today, sea, onSea, list }: { today: string; sea: TideSea; onSea: (id: TideSea) => void; list: readonly FishingCatch[] }) {
    const days = useMemo(() => tideDays(today, sea, 7), [today, sea]);
    const tally = useMemo(() => tideTally(list), [list]);
    const now = days[0];
    if (!now || days.length < 7) return null;
    const spring = nextTideMark(today, "사리"), neap = nextTideMark(today, "조금");
    const until = (m: { inDays: number } | null, name: string) => (!m ? null : m.inDays === 0 ? `오늘이 ${name}` : `${name}까지 ${m.inDays}일`);
    return (
        <section className="px-5 pt-8" data-testid="fishing-tide">
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight">오늘의 물때</h2>
                <span className="shrink-0 text-[12.5px]" style={{ color: C.dim }}>음력 {now.lunar.leap ? "윤" : ""}{now.lunar.month}월 {now.lunar.day}일</span>
            </div>
            <div className="rounded-2xl bg-[#FFFFFF0A] px-4 pb-3.5 pt-3.5">
                <div className="flex items-center justify-end gap-2">
                    <div className="flex shrink-0 rounded-full p-0.5" style={{ background: "#FFFFFF0F" }} role="group" aria-label="바다">
                        {TIDE_SEAS.map((s) => (
                            <button key={s.id} type="button" aria-pressed={sea === s.id} onClick={() => onSea(s.id)} className={cn("h-8 rounded-full px-2.5 text-[12px]", sea === s.id && "font-semibold")}
                                style={sea === s.id ? { background: C.brand, color: C.onBrand } : { color: C.soft }} data-testid={`fishing-sea-${s.id}`}>{s.id === "west" ? "서해" : "남해 · 동해"}</button>
                        ))}
                    </div>
                </div>
                <div className="mt-2 flex items-end gap-3">
                    <p className="text-[34px] font-semibold leading-none tracking-tight tabular-nums" data-testid="fishing-tide-now">{now.name}</p>
                    <p className="min-w-0 flex-1 pb-0.5 text-[14px]" style={{ color: C.foam }}>{TIDE_PHASE_TEXT[now.phase]}</p>
                </div>
                <p className="mt-1.5 text-[12.5px]" style={{ color: C.dim }}>{[until(spring, "사리"), until(neap, "조금")].filter(Boolean).join(" · ")}</p>
                {/* 내 기록을 센 것 — 예보가 아니다. 물때가 붙은 조과가 셋은 쌓여야 말한다 */}
                {tally.total >= 3 && (tally.byPhase[now.phase] > 0 || tally.top) && (
                    <p className="mt-2 rounded-xl px-3 py-2 text-[12.5px] leading-relaxed [word-break:keep-all]" style={{ background: "#FFFFFF0A", color: C.soft }} data-testid="fishing-tide-mine">
                        {tally.byPhase[now.phase] > 0
                            ? <>내 조과 {tally.total}줄 가운데 <span className="font-semibold" style={{ color: C.foam }}>{tally.byPhase[now.phase]}줄</span>이 오늘 같은 날에 나왔어요{tally.top === now.phase ? " · 내 조과가 가장 많이 나온 물이에요" : tally.top ? ` · 가장 많이 나온 건 ${TIDE_PHASE_TEXT[tally.top]}(${tally.byPhase[tally.top]}줄)` : ""}</>
                            : <>내 조과 {tally.total}줄 가운데 가장 많이 나온 건 <span className="font-semibold" style={{ color: C.foam }}>{TIDE_PHASE_TEXT[tally.top!]}</span>({tally.byPhase[tally.top!]}줄)이에요</>}
                    </p>
                )}

                <ol className="mt-3.5 grid grid-cols-7 gap-1" aria-label="앞으로 이레의 물때">
                    {days.map((t, i) => {
                        const weekend = ["토", "일"].includes(tideWeekday(t.ymd));
                        return (
                            <li key={t.ymd} className="flex flex-col items-center rounded-xl pb-1.5 pt-2" style={i === 0 ? { background: "#FFFFFF14" } : undefined} data-testid="fishing-tide-day">
                                <span className="text-[12px]" style={{ color: weekend ? C.sun : C.dim }}>{i === 0 ? "오늘" : `${Number(t.ymd.slice(8))} ${tideWeekday(t.ymd)}`}</span>
                                <span aria-hidden className="mt-1.5 flex h-9 w-full items-end justify-center">
                                    <span className="w-[14px] rounded-t-[5px]" style={{ height: `${Math.round(5 + t.flow * 31)}px`, background: t.mark === "사리" ? C.sun : t.mark === "조금" ? "#F3ECDD4D" : "#8FB3C2", opacity: t.mark ? 1 : 0.35 + t.flow * 0.65 }} />
                                </span>
                                <span className={cn("mt-1.5 text-[12.5px] tabular-nums", (i === 0 || t.mark) && "font-semibold")} style={{ color: t.mark === "사리" ? C.sun : C.foam }}>{t.name}</span>
                                <span className="h-[16px] text-[12px] leading-[16px]" style={{ color: t.mark === "사리" ? C.sun : C.dim }}>{t.mark && t.mark !== t.name ? t.mark : ""}</span>
                            </li>
                        );
                    })}
                </ol>
                <p className="mt-1 text-[12px] leading-relaxed" style={{ color: C.dim }}>음력 날짜로 센 물때예요. 만조 · 간조 시각은 항구마다 달라요.</p>
            </div>
        </section>
    );
}

/**
 * 낚시 크루의 정출판 — 크루 화면(공용) 안에 들어간다. 그 크루의 정출 · 그날의 판 · 올해의 판, 그리고 '내 조과 올리기'.
 * 크루원만 본다(서버도 그 크루에 든 사람에게만 준다).
 */
export function FishingCrewTrips({ crewId, isMember }: { crewId: string; isMember: boolean }) {
    const { data: me } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    const { data } = useQuery<FishingCatch[]>({ queryKey: KEY, enabled: isMember });
    const records = useMemo(() => fishRecords(data ?? []), [data]);
    const [preset, setPreset] = useState<Preset | null>(null);
    const today = fishingKstDay(Date.now());
    if (!isMember) return <p className="rounded-2xl px-5 py-6 text-center text-[13.5px]" style={{ background: C.card, color: C.soft }} data-testid="fishing-trips-locked">정출판은 크루원만 봐요.</p>;
    return (
        <div style={{ color: C.foam }} data-fishing="1">
            <Crew crewId={crewId} meId={String(me?.id ?? "")} today={today} onAdd={setPreset} />
            {preset && <CatchSheet today={today} preset={preset} before={records} onClose={() => setPreset(null)} onSaved={() => { /* 판은 조과 창이 다시 받아 온다 */ }} />}
        </div>
    );
}

interface TripRow { id: string; crewId: string; day: string; place: string; title: string | null; people: number; fish: number; top: { name: string; best: { species: string; lengthCm: number } | null } | null }
interface TripCatchRow { id: string; memberId: string; name: string; species: string; lengthCm: number | null; count: number; weightKg: number | null; ji: number | null; released: boolean; thumbUrl: string | null }

/**
 * 크루 정출 — 동호회가 하는 방식 그대로: 정출마다 최대어 · 마릿수 · 잡어상, 한 해의 점수. 크루는 랭큐의 크루를 그대로 쓴다.
 * 정출에 붙인 조과만 크루가 본다(붙이지 않은 내 조과는 여전히 나만 본다). 상금 · 참가비는 없다 — 점수와 낙관뿐이다.
 */
function Crew({ crewId, meId, today, onAdd }: { crewId: string; meId: string; today: string; onAdd: (p: Preset) => void }) {
    const [tripId, setTripId] = useState<string | null>(null);
    const [making, setMaking] = useState(false);
    const { data: list } = useQuery<{ trips: TripRow[]; year: string; season: SeasonRow[] }>({
        queryKey: ["/api/hiq/fishing/trips", crewId], enabled: !!crewId,
        queryFn: () => apiRequest(`/api/hiq/fishing/trips?crewId=${crewId}`),
    });
    const { data: one } = useQuery<{ trip: TripRow; board: TripBoard; catches: TripCatchRow[] }>({
        queryKey: ["/api/hiq/fishing/trip", tripId], enabled: !!tripId,
        queryFn: () => apiRequest(`/api/hiq/fishing/trips/${tripId}`),
    });
    // 한 정출의 판
    if (tripId && one) {
        const nameOf = (id: string) => one.board.members.find((m) => m.memberId === id)?.name ?? "";
        const prize = (a: TripAward) => {
            const ids = one.board.awards[a];
            const m = one.board.members.find((x) => x.memberId === ids[0]);
            const value = !m ? "" : a === "biggest" ? `${m.best?.species ?? ""} ${m.best ? `${m.best.lengthCm}cm` : ""}` : a === "most" ? `${m.fish}수` : `${m.species}어종`;
            return (
                <div key={a} className="rounded-xl px-2 py-3 text-center" style={ids.length ? { background: PAPER, color: INK } : { background: "#FFFFFF0A", color: C.dim }} data-testid={`fishing-award-${a}`}>
                    <div className="flex justify-center"><Seal text={TRIP_AWARD_NAME[a]} size={38} faint={!ids.length} /></div>
                    <p className="mt-2 truncate text-[14px] font-semibold">{ids.length ? ids.map(nameOf).join(" · ") : "아직"}</p>
                    <p className="mt-0.5 truncate text-[12px] tabular-nums" style={{ color: ids.length ? "#0F283899" : C.dim }}>{ids.length ? value : `${TRIP_POINTS[a]}점`}</p>
                </div>
            );
        };
        return (
            <section data-testid="fishing-trip">
                <button type="button" onClick={() => setTripId(null)} className="flex items-center text-[13px]" style={{ color: C.brand }}><LucideChevronLeft className="h-4 w-4" />정출 목록</button>
                <h2 className="mt-2 text-[20px] font-semibold tracking-tight">{one.trip.title || `${one.trip.place} 정출`}</h2>
                <p className="mt-0.5 text-[13px]" style={{ color: C.soft }}>{fishingDayLabel(one.trip.day, today)} · {one.trip.place}</p>
                <div className="mt-4 grid grid-cols-3 gap-2">{(["biggest", "most", "variety"] as const).map(prize)}</div>
                <button type="button" onClick={() => onAdd({ place: one.trip.place, day: one.trip.day, tripId: one.trip.id })} className="mt-3 flex h-[50px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-trip-add">
                    <LucidePlus weight="bold" className="h-5 w-5" />이 정출에 내 조과 올리기
                </button>
                {one.board.members.length > 0 && (
                    <>
                        <h3 className="mt-6 text-[15px] font-semibold">그날의 판</h3>
                        <ul className="mt-2 divide-y overflow-hidden rounded-2xl" style={{ background: C.card, borderColor: C.line }}>
                            {one.board.members.map((m, i) => (
                                <li key={m.memberId} className="flex items-center gap-3 px-4 py-3" data-testid="fishing-trip-member">
                                    <span className="w-5 text-center text-[14px] tabular-nums" style={{ color: C.dim }}>{i + 1}</span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-[15px] font-semibold">{m.name}{m.memberId === meId ? <span className="ml-1.5 text-[12px] font-normal" style={{ color: C.brand }}>나</span> : null}</span>
                                        <span className="mt-0.5 block truncate text-[12.5px] tabular-nums" style={{ color: C.dim }}>{[m.best ? `${m.best.species} ${m.best.lengthCm}cm` : null, `${m.fish}수`, `${m.species}어종`].filter(Boolean).join(" · ")}</span>
                                    </span>
                                    <span className="shrink-0 text-[15px] font-semibold tabular-nums" style={{ color: C.sun }}>{m.points}점</span>
                                </li>
                            ))}
                        </ul>
                    </>
                )}
                <p className="mt-4 text-[12px] leading-relaxed" style={{ color: C.dim }}>참석 {TRIP_POINTS.attend}점 · 최대어 {TRIP_POINTS.biggest}점 · 마릿수 {TRIP_POINTS.most}점 · 잡어상 {TRIP_POINTS.variety}점. 최대어는 길이로 말하는 어종끼리 겨뤄요. 같은 값이면 같이 받아요.</p>
            </section>
        );
    }

    return (
        <section data-testid="fishing-crew">
            <div className="flex items-center justify-between gap-3">
                <p className="min-w-0 text-[13px]" style={{ color: C.soft }}>정출마다 최대어 · 마릿수 · 잡어상을 가려요</p>
                <button type="button" onClick={() => setMaking(true)} className="h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold" style={{ background: "#F4A96326", color: C.brand }} data-testid="fishing-trip-new">정출 만들기</button>
            </div>
            {!list?.trips.length ? (
                <p className="mt-3 rounded-2xl px-5 py-7 text-center text-[13.5px] leading-relaxed" style={{ background: C.card, color: C.soft }} data-testid="fishing-trip-none">아직 정출이 없어요. 날과 출조지만 정하면 판이 열려요.</p>
            ) : (
                <ul className="mt-3 space-y-2">
                    {list.trips.map((t) => (
                        <li key={t.id}>
                            <button type="button" onClick={() => setTripId(t.id)} className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left active:opacity-90" style={{ background: C.card }} data-testid="fishing-trip-row">
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-semibold">{t.title || `${t.place} 정출`}</span>
                                    <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.dim }}>{fishingDayLabel(t.day, today)} · {t.place}{t.people ? ` · ${t.people}명 ${t.fish}수` : t.day > today ? " · 예정" : ""}</span>
                                    {t.top?.best && <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.soft }}>최대어 {t.top.name} · {t.top.best.species} {t.top.best.lengthCm}cm</span>}
                                </span>
                                <LucideChevronRight className="h-5 w-5 shrink-0" style={{ color: C.dim }} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {!!list?.season.length && (
                <div className="mt-7" data-testid="fishing-season">
                    <div className="flex items-baseline justify-between"><h3 className="text-[17px] font-semibold tracking-tight">{list.year}년의 판</h3><span className="text-[12.5px]" style={{ color: C.dim }}>납회 때 장원을 가려요</span></div>
                    <ul className="mt-3 divide-y overflow-hidden rounded-2xl" style={{ background: C.card, borderColor: C.line }}>
                        {list.season.map((r, i) => (
                            <li key={r.memberId} className="flex items-center gap-3 px-4 py-3">
                                {i === 0 ? <Seal text="장원" size={34} /> : <span className="w-[34px] text-center text-[14px] tabular-nums" style={{ color: C.dim }}>{i + 1}</span>}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[15px] font-semibold">{r.name}</span>
                                    <span className="mt-0.5 block truncate text-[12.5px] tabular-nums" style={{ color: C.dim }}>{[`정출 ${r.trips}번`, r.awards.biggest ? `최대어 ${r.awards.biggest}` : null, r.awards.most ? `마릿수 ${r.awards.most}` : null, r.awards.variety ? `잡어상 ${r.awards.variety}` : null].filter(Boolean).join(" · ")}</span>
                                </span>
                                <span className="shrink-0 text-[15px] font-semibold tabular-nums" style={{ color: C.sun }}>{r.points}점</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {making && crewId && <TripForm crewId={crewId} today={today} onClose={() => setMaking(false)} onMade={(id) => { setMaking(false); setTripId(id); }} />}
        </section>
    );
}

/** 정출 만들기 — 날 · 출조지 · 이름(없어도 된다) */
function TripForm({ crewId, today, onClose, onMade }: { crewId: string; today: string; onClose: () => void; onMade: (id: string) => void }) {
    const [day, setDay] = useState(today);
    const [place, setPlace] = useState("");
    const [title, setTitle] = useState("");
    const [error, setError] = useState<string | null>(null);
    const make = useMutation({
        mutationFn: (body: unknown) => apiRequest("/api/hiq/fishing/trips", { method: "POST", body }),
        onSuccess: (t: any) => { void queryClient.invalidateQueries({ queryKey: ["/api/hiq/fishing/trips"] }); onMade(String(t.id)); },
        onError: (e: any) => setError(e?.message || "만들지 못했어요. 잠시 뒤에 다시 해 주세요."),
    });
    const field = "h-12 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-[#F3ECDD59]";
    const fieldStyle = { background: "#FFFFFF0F", color: C.foam } as const;
    return (
        <div role="dialog" aria-modal="true" aria-label="정출 만들기" className="fixed inset-0 z-[60] flex items-end" style={{ background: "#000000A6" }} data-testid="fishing-trip-form">
            <div className="w-full rounded-t-3xl px-4 pt-5" style={{ background: C.bg, color: C.foam, paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                <div className="flex items-center"><h2 className="flex-1 text-[17px] font-semibold">정출 만들기</h2>
                    <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF0F]"><LucideX className="h-5 w-5" /></button></div>
                <div className="mt-4 space-y-3">
                    <input type="date" value={day} onChange={(e) => setDay(e.target.value)} aria-label="날짜" className={field} style={{ ...fieldStyle, colorScheme: "dark" }} data-testid="fishing-trip-day" />
                    <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={40} placeholder="출조지(예: 추자도 · 예당저수지)" aria-label="출조지" className={field} style={fieldStyle} data-testid="fishing-trip-place" />
                    <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={30} placeholder="이름(없어도 돼요 — 예: 11월 정출)" aria-label="정출 이름" className={field} style={fieldStyle} data-testid="fishing-trip-title" />
                    {error && <p role="alert" className="rounded-xl bg-[#FF6E6E1F] px-3.5 py-3 text-[13px] text-[#FF9C9C]">{error}</p>}
                    <button type="button" disabled={make.isPending} onClick={() => { const c = cleanTrip({ day, place, title }, today); if (!c.ok) { setError(c.error); return; } setError(null); make.mutate({ crewId, ...c.value }); }}
                        className="flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-trip-make">{make.isPending ? "만드는 중…" : "정출 열기"}</button>
                </div>
            </div>
        </div>
    );
}

/**
 * 낚시터 — 실은 낚시터(지자체에 등록된 낚시터 1,151곳)를 지역 · 글자로 찾는다. 낚시어선 · 출항지는 아직 싣지 않았다.
 * 요금 · 전화는 오래된 값일 수 있어 자료 기준일을 같이 적는다. 방파제 · 갯바위 같은 자유 포인트는 이 자료에 없다 — 그렇다고 말한다.
 */
function Points({ onPick }: { onPick: (p: FishingPlace) => void }) {
    const [sido, setSido] = useState("");
    const [text, setText] = useState("");
    const [q, setQ] = useState("");
    const { data, isLoading } = useQuery<{ total: number; regions: { sido: string; n: number }[]; items: FishingPlace[] }>({
        queryKey: ["/api/hiq/fishing/places", sido, q],
        queryFn: () => apiRequest(`/api/hiq/fishing/places?sido=${encodeURIComponent(sido)}&q=${encodeURIComponent(q)}`),
    });
    const chip = "h-9 shrink-0 rounded-full px-3 text-[13px]";
    return (
        <section className="pt-5" data-testid="fishing-points">
            <div className="flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">낚시터</h2>{data && <span className="text-[12.5px] tabular-nums" style={{ color: C.dim }}>{data.total}곳</span>}</div>
            <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); setQ(text.trim()); }}>
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={30} placeholder="이름 · 시군구 · 어종(예: 붕어)" aria-label="낚시터 찾기"
                    className="h-11 min-w-0 flex-1 rounded-xl px-3.5 text-[14px] outline-none placeholder:text-[#F3ECDD59]" style={{ background: "#FFFFFF0F", color: C.foam }} data-testid="fishing-place-q" />
                <button type="submit" className="h-11 shrink-0 rounded-xl px-4 text-[14px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-place-find">찾기</button>
            </form>
            <div className="-mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="지역">
                <button type="button" aria-pressed={sido === ""} onClick={() => setSido("")} className={cn(chip, sido === "" && "font-semibold")} style={sido === "" ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>전체</button>
                {(data?.regions ?? []).map((r) => (
                    <button key={r.sido} type="button" aria-pressed={sido === r.sido} onClick={() => setSido(sido === r.sido ? "" : r.sido)} data-testid={`fishing-sido-${fishingSidoShort(r.sido)}`}
                        className={cn(chip, sido === r.sido && "font-semibold")} style={sido === r.sido ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>
                        {fishingSidoShort(r.sido)} <span className="tabular-nums opacity-70">{r.n}</span>
                    </button>
                ))}
            </div>
            {isLoading ? <div className="mt-3 h-40 animate-pulse rounded-2xl bg-[#FFFFFF0F]" /> : !data?.items.length ? (
                <p className="mt-3 rounded-2xl px-5 py-6 text-center text-[13.5px]" style={{ background: C.card, color: C.soft }} data-testid="fishing-place-none">찾는 낚시터가 없어요. 글자를 바꿔 보세요.</p>
            ) : (
                <ul className="mt-3 space-y-2">
                    {data.items.map((p) => (
                        <li key={p.id} className="rounded-2xl px-4 py-3.5" style={{ background: C.card }} data-testid="fishing-place-row">
                            <div className="flex items-start gap-3">
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[15px] font-semibold">{p.name}</p>
                                    <p className="mt-0.5 truncate text-[12.5px]" style={{ color: C.dim }}>{[p.kind, fishingSidoShort(p.sido), p.sigungu].filter(Boolean).join(" · ")}</p>
                                </div>
                                <button type="button" onClick={() => onPick(p)} className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={{ background: "#F4A96326", color: C.brand }} data-testid="fishing-place-pick">조과 적기</button>
                            </div>
                            {p.species.length > 0 && <p className="mt-2 truncate text-[13px]" style={{ color: C.soft }}>{p.species.slice(0, 6).join(" · ")}</p>}
                            {(p.fee || p.dataDate) && <p className="mt-1 truncate text-[12px]" style={{ color: C.dim }}>{[p.fee ? `요금 ${p.fee}` : null, p.dataDate ? `자료 기준 ${p.dataDate}` : null].filter(Boolean).join(" · ")}</p>}
                        </li>
                    ))}
                </ul>
            )}
            {data && data.total > data.items.length && <p className="mt-3 text-center text-[12.5px]" style={{ color: C.dim }}>{data.items.length}곳만 보여요. 글자나 지역으로 좁혀 보세요.</p>}
            <p className="mt-4 text-[12px] leading-relaxed" style={{ color: C.dim }}>출처: {FISHING_PLACE_SOURCE}. 방파제 · 갯바위 같은 자유 포인트와 낚시어선은 아직 없어요. 요금은 바뀌었을 수 있어요.</p>
        </section>
    );
}

/**
 * 조과 적기 — 사진 한 장(없어도 된다) · 어종 · 그 어종이 자랑하는 값. 적는 동안 몇 짜인지 낙관으로 미리 보인다.
 * 잡은 곳은 사람이 적은 이름만 받는다(위치를 재지 않는다 · 사진의 위치 꼬리표도 올리기 전에 떨어진다).
 */
function CatchSheet({ today, onClose, onSaved, preset, before }: {
    today: string; onClose: () => void; preset?: Preset | null; before: readonly FishRecord<FishingCatch>[];
    onSaved: (saved: FishingCatch, all: FishingCatch[]) => void;
}) {
    const [day, setDay] = useState(preset?.day && preset.day <= today ? preset.day : today);
    const [place, setPlace] = useState(preset?.place ?? "");
    const [spot, setSpot] = useState<FishingSpotId | null>(preset?.spot ?? null);
    const [species, setSpecies] = useState("");
    const [value, setValue] = useState("");
    const [count, setCount] = useState("1");
    const [released, setReleased] = useState(false);
    const [note, setNote] = useState("");
    const [file, setFile] = useState<File | null>(null);
    const [shot, setShot] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [tideSea, setTideSea] = useState<TideSea>(readSea);
    const fileRef = useRef<HTMLInputElement>(null);
    const fish: FishKind | null = fishByName(species);
    // 민물이면 물때가 없다 — 민물 어종이거나 저수지 · 강에서 낚았을 때
    const fresh = fish?.water === "fresh" || spot === "lake" || spot === "river";
    const dayTide = fresh ? null : tideOf(day, tideSea);
    const unit = fish?.unit ?? "cm";
    const num = value === "" ? null : Number(value);
    const live = fish && num != null && num > 0 ? fishTier(fish, num) : null;
    const prev = fish ? before.find((r) => r.fish.id === fish.id) ?? null : null;

    const pick = (f: File | undefined) => {
        if (!f) return;
        if (shot) URL.revokeObjectURL(shot);
        setFile(f); setShot(URL.createObjectURL(f));
    };
    const submit = async () => {
        if (busy) return;
        // 어종이 자랑하는 값은 그 단위의 칸으로 간다 — 마릿수 어종은 마릿수 칸 하나로
        const body: Record<string, unknown> = { day, place, spot, species, note, released, tideSea: dayTide ? tideSea : null, count: unit === "count" ? (value || count) : count, lengthCm: unit === "cm" ? value : "", weightKg: unit === "kg" ? value : "", ji: unit === "ji" ? value : "" };
        const c = cleanCatch(body, today);
        if (!c.ok) { setError(c.error); return; }
        setError(null); setBusy(true);
        try {
            const photo = file ? await uploadPhoto(file).catch(() => { throw new Error("사진을 올리지 못했어요. 다시 해 보거나 사진 없이 적어 주세요."); }) : null;
            const saved = await apiRequest("/api/hiq/fishing/catches", { method: "POST", body: { ...c.value, ...(photo ?? {}), ...(preset?.tripId ? { tripId: preset.tripId } : {}) } }) as FishingCatch;
            if (preset?.tripId) { void queryClient.invalidateQueries({ queryKey: ["/api/hiq/fishing/trips"] }); void queryClient.invalidateQueries({ queryKey: ["/api/hiq/fishing/trip", preset.tripId] }); }
            const all = [saved, ...(queryClient.getQueryData<FishingCatch[]>(KEY) ?? [])];
            queryClient.setQueryData(KEY, all);
            void queryClient.invalidateQueries({ queryKey: KEY });
            onSaved(saved, all);
            onClose();
        } catch (e: any) {
            setError(e?.message || "적지 못했어요. 잠시 뒤에 다시 해 주세요.");
        } finally { setBusy(false); }
    };
    const field = "h-12 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-[#F3ECDD59]";
    const fieldStyle = { background: "#FFFFFF0F", color: C.foam } as const;
    const chipOn = { background: C.brand, color: C.onBrand }, chipOff = { background: "#FFFFFF0F", color: C.soft };
    return (
        <div role="dialog" aria-modal="true" aria-label="조과 적기" className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.bg, color: C.foam }} data-testid="fishing-sheet">
            <div className="h-[env(safe-area-inset-top)] shrink-0" aria-hidden />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: C.line }}>
                <h2 className="flex-1 text-[16px] font-semibold">{preset?.tripId ? "정출 조과 적기" : "조과 적기"}</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF0F] active:bg-[#FFFFFF1F]"><LucideX className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
                {/* 사진 — 없어도 된다. 갤러리에서 고른다 */}
                <div>
                    <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => pick(e.target.files?.[0])} data-testid="fishing-photo-file" />
                    {shot ? (
                        <div className="relative overflow-hidden rounded-2xl" style={{ background: "#000000" }}>
                            <img src={shot} alt="고른 사진" className="mx-auto block max-h-[220px] w-full object-contain" />
                            <button type="button" onClick={() => { URL.revokeObjectURL(shot); setShot(null); setFile(null); if (fileRef.current) fileRef.current.value = ""; }} aria-label="사진 빼기" className="absolute right-2 top-2 flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "#000000A6" }}><LucideX className="h-4 w-4" /></button>
                        </div>
                    ) : (
                        <button type="button" onClick={() => fileRef.current?.click()} className="flex h-[88px] w-full items-center justify-center gap-2.5 rounded-2xl border border-dashed text-[14px]" style={{ borderColor: "#FFFFFF33", color: C.soft }} data-testid="fishing-photo-pick">
                            <LucideImage className="h-5 w-5" style={{ color: C.brand }} />사진 한 장(없어도 돼요)
                        </button>
                    )}
                </div>

                <div><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>어종</span>
                    {FISH_BOOKS.map((b) => (
                        <div key={b.id} className="mb-2 flex flex-wrap gap-1.5">
                            {b.fish.map((f) => (
                                <button key={f.id} type="button" aria-pressed={species === f.name} onClick={() => { setSpecies(f.name); setValue(""); }} data-testid={`fishing-species-${f.name}`}
                                    className={cn("h-9 rounded-full px-3 text-[13px]", species === f.name && "font-semibold")} style={species === f.name ? chipOn : chipOff}>{f.name}</button>
                            ))}
                        </div>
                    ))}
                    <input value={species} onChange={(e) => setSpecies(e.target.value)} maxLength={20} placeholder="목록에 없으면 직접 적기" className={field} style={fieldStyle} data-testid="fishing-species" />
                </div>

                {/* 그 어종이 자랑하는 값 — 종이 한 장 위에 적는다. 적는 대로 어탁이 진해지고 낙관이 찍힌다(받게 될 어탁의 미리 보기) */}
                <div className="rounded-2xl p-3.5" style={{ background: PAPER, color: INK, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }} data-testid="fishing-paper">
                    {fish && (
                        <div className="relative mb-1">
                            <img src={art(fish.id)} alt="" width={640} height={400} decoding="async" className="mx-auto h-[92px] w-full object-contain transition-opacity" style={{ mixBlendMode: "multiply", opacity: num != null && num > 0 ? 1 : 0.22 }} />
                            <span className="absolute right-0 top-0" style={{ transform: "rotate(5deg)" }}>{live?.tier ? <Seal text={live.tier.name} size={52} /> : <Seal text={fish.tiers[0].name} size={52} faint />}</span>
                        </div>
                    )}
                    <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: "#0F283899" }}>{unit === "cm" ? "가장 큰 것의 길이" : unit === "count" ? "마릿수" : unit === "kg" ? "가장 큰 것의 무게" : "굵기(지)"}</span>
                        <div className="flex items-baseline gap-2">
                            <input inputMode={unit === "count" || unit === "ji" ? "numeric" : "decimal"} value={value} onChange={(e) => setValue(e.target.value.replace(unit === "count" || unit === "ji" ? /[^\d]/g : /[^\d.]/g, "").slice(0, 5))} placeholder="0"
                                className="h-14 w-[132px] rounded-xl px-3 text-[30px] font-semibold tabular-nums outline-none placeholder:text-[#0F283840]" style={{ background: "#0F28380F", color: INK }} data-testid="fishing-value" />
                            <span className="text-[16px]" style={{ color: "#0F283899" }}>{FISH_UNIT_LABEL[unit]}</span>
                        </div>
                    </label>
                    {fish && (
                        <p className="mt-2.5 text-[13px]" style={{ color: "#0F2838B3" }} data-testid="fishing-live">
                            {live?.tier ? <><span className="font-semibold" style={{ color: INK }}>{live.tier.name}</span>{live.next && live.gap != null ? ` — ${live.next.name}까지 ${fishValueText(unit, live.gap)}` : " — 이 어종의 가장 높은 단계예요"}</> : `${fish.tiers[0].name}는 ${fishValueText(unit, fish.tiers[0].min)}부터예요`}
                            {prev?.value != null && num != null && num > prev.value ? <span className="font-semibold" style={{ color: SEAL }}> · 내 기록 {fishValueText(unit, prev.value)}을 넘어요</span> : null}
                        </p>
                    )}
                    {unit !== "count" && (
                        <label className="mt-3 flex items-center gap-3"><span className="text-[13px]" style={{ color: "#0F283899" }}>마릿수</span>
                            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} className="h-10 w-[72px] rounded-lg px-3 text-[15px] tabular-nums outline-none" style={{ background: "#0F28380F", color: INK }} data-testid="fishing-count" /></label>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>낚은 날</span>
                        <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={field} style={{ ...fieldStyle, colorScheme: "dark" }} data-testid="fishing-day" /></label>
                    <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>다녀온 곳</span>
                        <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={40} placeholder="예: 여수 국동항" className={field} style={fieldStyle} data-testid="fishing-place" /></label>
                </div>
                <div><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>어디서</span>
                    <div className="flex flex-wrap gap-1.5">
                        {FISHING_SPOTS.map((s) => (
                            <button key={s.id} type="button" aria-pressed={spot === s.id} onClick={() => setSpot(spot === s.id ? null : s.id)} className={cn("h-9 rounded-full px-3 text-[13px]", spot === s.id && "font-semibold")} style={spot === s.id ? chipOn : chipOff}>{s.name}</button>
                        ))}
                    </div>
                </div>
                {/* 그날의 물때 — 날짜로 저절로 센다. 바다만 맞는지 보면 된다 */}
                {dayTide && (
                    <div className="flex items-center gap-3 rounded-xl px-3.5 py-2.5" style={fieldStyle} data-testid="fishing-sheet-tide">
                        <span className="min-w-0 flex-1 text-[14px]">그날의 물때 <span className="ml-1 font-semibold tabular-nums" style={{ color: C.brand }}>{dayTide.name}</span></span>
                        <span className="flex shrink-0 rounded-full p-0.5" style={{ background: "#FFFFFF0F" }} role="group" aria-label="물때를 세는 바다">
                            {TIDE_SEAS.map((s) => <button key={s.id} type="button" aria-pressed={tideSea === s.id} onClick={() => setTideSea(s.id)} className={cn("h-8 rounded-full px-2.5 text-[12px]", tideSea === s.id && "font-semibold")} style={tideSea === s.id ? chipOn : { color: C.soft }} data-testid={`fishing-sheet-sea-${s.id}`}>{s.id === "west" ? "서해" : "남해 · 동해"}</button>)}
                        </span>
                    </div>
                )}
                <button type="button" aria-pressed={released} onClick={() => setReleased((v) => !v)} className="flex h-12 w-full items-center justify-between rounded-xl px-3.5 text-[14px]" style={fieldStyle} data-testid="fishing-released">
                    <span>놓아 줬어요(방류)</span>
                    <span className="flex h-6 w-11 items-center rounded-full p-0.5" style={{ background: released ? C.brand : "#FFFFFF24" }}><i className="h-5 w-5 rounded-full bg-[#FFFFFF] transition-transform" style={{ transform: released ? "translateX(20px)" : "none" }} /></span>
                </button>
                <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>한마디</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="물때 · 채비 · 날씨 같은 것" className={field} style={fieldStyle} data-testid="fishing-note" /></label>
                <p className="text-[12px] leading-relaxed" style={{ color: C.dim }}>{preset?.tripId ? "이 조과는 정출판에 올라가 크루가 같이 봐요. 위치는 재지 않아요." : "잡은 곳은 적은 이름만 남고 위치는 재지 않아요. 사진은 나만 봐요."}</p>
                {error && <p role="alert" className="rounded-xl bg-[#FF6E6E1F] px-3.5 py-3 text-[13px] text-[#FF9C9C]" data-testid="fishing-error">{error}</p>}
            </div>
            <div className="shrink-0 border-t px-4 pt-3" style={{ borderColor: C.line, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <button type="button" disabled={busy} onClick={() => { void submit(); }} className="flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-save">
                    {busy ? "적는 중…" : "적고 어탁 찍기"}
                </button>
            </div>
        </div>
    );
}
