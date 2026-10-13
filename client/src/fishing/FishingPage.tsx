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
import { LucideChevronLeft, LucideChevronRight, LucideFlag, LucideHome, LucideImage, LucideMap, LucideMessageSquare, LucidePlus, LucideX } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
    FISHING_COLORS as C, FISHING_PHOTO_CATEGORY, FISHING_PHOTO_LONG_SIDE, FISHING_PLACE_SOURCE, FISHING_SPOTS, FISHING_THUMB_CATEGORY, FISHING_THUMB_LONG_SIDE,
    cleanCatch, fishingDayLabel, fishingKstDay, fishingSidoShort, fishingSpotName,
    type FishingCatch, type FishingPlace, type FishingSpotId,
} from "@shared/fishing";
import { FISH, FISH_BOOKS, FISH_UNIT_LABEL, fishByName, fishRecords, fishTier, fishValue, fishValueText, nearestPromotion, type FishKind, type FishRecord } from "@shared/fishingFish";

const KEY = ["/api/hiq/fishing/catches"];
type Tab = "home" | "book" | "log" | "points";
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
                    <p className={cn("truncate", big ? "mt-0.5 text-[13px]" : "text-[12px]")} style={{ color: "#1B1B1F99" }}>{[fishingDayLabel(rec.best.day, today), rec.best.place].filter(Boolean).join(" · ")}</p>
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

export default function FishingPage() {
    const [, setLocation] = useLocation();
    const { data: me, isLoading: meLoading } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    const allowed = me?.fishingAccess === true;
    const { data, isLoading } = useQuery<FishingCatch[]>({ queryKey: KEY, enabled: allowed });
    const list = data ?? [];
    const [tab, setTab] = useState<Tab>("home");
    const [adding, setAdding] = useState(false);
    const [preset, setPreset] = useState<{ place: string; spot: FishingSpotId } | null>(null);
    // 방금 오른 단계 — 승급 창
    const [promoted, setPromoted] = useState<FishRecord<FishingCatch> | null>(null);
    const today = fishingKstDay(Date.now());
    const empty = !isLoading && list.length === 0;
    const records = useMemo(() => fishRecords(list), [list]);
    const sampleRecords = useMemo(() => fishRecords(SAMPLE), []);
    const shown = empty ? sampleRecords : records;
    const near = useMemo(() => nearestPromotion(records), [records]);
    const trips = useMemo(() => new Set(list.map((c) => c.day)).size, [list]);

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
            <li key={c.id} className="flex items-center gap-3 px-4 py-3" data-testid="fishing-catch">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg" style={{ background: PAPER }}>
                    {c.thumbUrl ? <img src={c.thumbUrl} alt="" className="h-full w-full object-cover" /> : fish ? <img src={art(fish.id)} alt="" className="h-9 w-11 object-contain" style={{ mixBlendMode: "multiply" }} /> : <span className="text-[12px]" style={{ color: INK }}>{c.species.slice(0, 2)}</span>}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold" style={{ color: C.foam }}>
                        {c.species} <span className="font-normal tabular-nums" style={{ color: C.soft }}>{v != null ? fishValueText(fish?.unit ?? "cm", v) : `${c.count}수`}{fish && fish.unit !== "count" && c.count > 1 ? ` · ${c.count}수` : ""}{c.released ? " · 방류" : ""}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.dim }}>{[fishingDayLabel(c.day, today), c.place, fishingSpotName(c.spot)].filter(Boolean).join(" · ")}</span>
                    {c.note ? <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.soft }}>{c.note}</span> : null}
                </span>
                <button type="button" aria-label="이 기록 지우기" data-testid="fishing-catch-delete"
                    onClick={() => { void appConfirm({ title: "이 기록을 지울까요?", message: "지우면 되돌릴 수 없어요.", tone: "danger", confirmText: "지우기", cancelText: "그대로" }).then((ok) => { if (ok) remove.mutate(c.id); }); }}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-[#FFFFFF14]"><LucideX className="h-4 w-4" style={{ color: C.dim }} /></button>
            </li>
        );
    };

    return (
        <div className="min-h-screen pb-[calc(84px+env(safe-area-inset-bottom))] font-sans" style={{ background: C.bg, color: C.foam }} data-fishing="1">
            <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)", background: "#071A2BE6", borderColor: C.line }}>
                <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1.5 px-3">
                    <button type="button" onClick={() => (tab === "home" ? setLocation("/dashboard") : setTab("home"))} aria-label="뒤로" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full active:bg-[#FFFFFF14]"><LucideChevronLeft weight="bold" className="h-5 w-5" aria-hidden /></button>
                    <div className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">{tab === "book" ? "어탁첩" : tab === "log" ? "내 조과" : tab === "points" ? "낚시터" : "랭큐 낚시"}</div>
                    <span className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: "#FFC8571F", color: C.sun }}>운영자만 보는 중</span>
                </div>
            </header>

            <main className="mx-auto max-w-[720px]">
                {tab === "home" && (
                    <>
                        {/* 새벽 바다 — 먹으로 그린 수평선 위에 내 기록어 */}
                        <section className="relative isolate overflow-hidden px-4 pb-5 pt-5" data-testid="fishing-hero">
                            <img src="/fishing/art/sea.webp" alt="" width={900} height={520} decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover" />
                            <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "linear-gradient(180deg,#071A2B59 0%,#071A2B00 40%,#071A2B 100%)" }} />
                            <p className="text-[13px]" style={{ color: C.soft }}>{empty ? "이렇게 쌓여요" : "내 기록어"}</p>
                            <p className="mt-1 text-[22px] font-semibold tracking-tight">
                                {empty ? "잡은 고기가 어탁 한 장이 돼요" : `${records.length}어종 · ${trips}번 출조`}
                            </p>
                            <div className="mt-4">{shown[0] && <Eotak rec={shown[0]} today={today} big sample={empty} />}</div>
                            {empty ? (
                                <button type="button" onClick={() => setAdding(true)} className="mt-3 flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-add-first">
                                    <LucidePlus weight="bold" className="h-5 w-5" />첫 조과 적고 어탁 받기
                                </button>
                            ) : near && (
                                <div className="mt-3 flex items-center gap-3 rounded-2xl px-4 py-3" style={{ background: "#0E2A44E6" }} data-testid="fishing-near">
                                    <Seal text={near.next!.name} size={40} faint />
                                    <p className="min-w-0 flex-1 text-[14px]"><span className="font-semibold">{near.fish.name} {near.next!.name}</span>까지 <span className="font-semibold tabular-nums" style={{ color: C.sun }}>{fishValueText(near.fish.unit, near.gap!)}</span></p>
                                </div>
                            )}
                        </section>

                        {/* 어탁 벽 — 어종마다 한 장 */}
                        <section className="px-4 pt-6">
                            <div className="mb-3 flex items-baseline justify-between">
                                <h2 className="text-[17px] font-semibold tracking-tight">어탁 벽{empty && <span className="ml-2 rounded-full px-2 py-0.5 text-[12px] font-normal" style={{ background: "#FFFFFF14", color: C.soft }}>예시</span>}</h2>
                                <button type="button" onClick={() => setTab("book")} className="flex items-center text-[13px]" style={{ color: C.brand }} data-testid="fishing-to-book">어탁첩 {records.length}/{FISH.length}<LucideChevronRight className="h-4 w-4" /></button>
                            </div>
                            <div className="grid grid-cols-2 gap-2.5">{shown.slice(1, 7).map((r) => <Eotak key={r.fish.id} rec={r} today={today} sample={empty} />)}</div>
                            {!empty && shown.length === 1 && <p className="rounded-2xl px-4 py-5 text-center text-[13.5px]" style={{ background: C.card, color: C.soft }}>다른 어종을 만나면 여기에 한 장씩 걸려요.</p>}
                        </section>

                        {!empty && (
                            <section className="px-4 pt-7">
                                <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">최근 조과</h2>
                                    <button type="button" onClick={() => setTab("log")} className="flex items-center text-[13px]" style={{ color: C.brand }}>전부 {list.length}줄<LucideChevronRight className="h-4 w-4" /></button>
                                </div>
                                <ul className="divide-y overflow-hidden rounded-2xl" style={{ background: C.card, borderColor: C.line }}>{list.slice(0, 3).map(row)}</ul>
                            </section>
                        )}

                        <section className="px-4 pt-7">
                            <button type="button" onClick={() => setTab("points")} className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left active:opacity-90" style={{ background: C.card }} data-testid="fishing-to-points">
                                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ background: "#38BDF81F" }}><LucideMap className="h-5 w-5" style={{ color: C.brand }} /></span>
                                <span className="min-w-0 flex-1"><span className="block text-[15px] font-semibold">낚시터 찾기</span><span className="mt-0.5 block text-[12.5px]" style={{ color: C.dim }}>등록된 낚시터 1,151곳 · 어종과 요금</span></span>
                                <LucideChevronRight className="h-5 w-5 shrink-0" style={{ color: C.dim }} />
                            </button>
                        </section>
                    </>
                )}

                {tab === "book" && (
                    <div className="px-4 pb-4" data-testid="fishing-book">
                        {FISH_BOOKS.map((b) => {
                            const got = new Map(records.map((r) => [r.fish.id, r]));
                            const n = b.fish.filter((f) => got.has(f.id)).length;
                            return (
                                <section key={b.id} className="pt-6" data-testid={`fishing-book-${b.id}`}>
                                    <div className="flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">{b.name}</h2><span className="text-[13px] tabular-nums" style={{ color: C.soft }}>{n}/{b.fish.length}</span></div>
                                    <p className="mt-0.5 text-[12.5px]" style={{ color: C.dim }}>{b.note}</p>
                                    <div className="mt-2 h-1.5 overflow-hidden rounded-full" style={{ background: "#FFFFFF14" }}><div className="h-full rounded-full" style={{ width: `${Math.round((n / b.fish.length) * 100)}%`, background: C.brand }} /></div>
                                    <div className="mt-3 grid grid-cols-3 gap-2">
                                        {b.fish.map((f) => {
                                            const r = got.get(f.id);
                                            return (
                                                <div key={f.id} className="relative overflow-hidden rounded-xl px-1.5 pb-2 pt-2 text-center" data-testid={`fishing-slot-${f.id}`} data-got={r ? "1" : "0"}
                                                    style={r ? { background: PAPER, color: INK } : { background: "#0E2A44", color: C.dim }}>
                                                    {r?.tier && <span className="absolute right-1 top-1"><Seal text={r.tier.name} size={26} /></span>}
                                                    <img src={art(f.id)} alt="" width={640} height={400} loading="lazy" decoding="async" className="mx-auto h-[52px] w-full object-contain" style={r ? { mixBlendMode: "multiply" } : { opacity: 0.22, filter: "invert(1)", mixBlendMode: "screen" }} />
                                                    <p className="mt-1 truncate text-[13px] font-semibold">{f.name}</p>
                                                    <p className="truncate text-[12px] tabular-nums" style={{ color: r ? "#1B1B1F99" : C.dim }}>{r ? (r.value != null ? fishValueText(f.unit, r.value) : "만남") : `${f.tiers[0].name}부터`}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </section>
                            );
                        })}
                        <p className="pt-5 text-[12px] leading-relaxed" style={{ color: C.dim }}>조과를 적으면 그 어종의 칸에 어탁이 찍혀요. 단계(월척 · 런커 · 5짜 …)에 오르면 붉은 낙관이 붙어요.</p>
                    </div>
                )}

                {tab === "log" && (
                    <section className="px-4 pt-5">
                        {list.length === 0 ? <p className="rounded-2xl px-5 py-8 text-center text-[14px]" style={{ background: C.card, color: C.soft }}>아직 적은 조과가 없어요.</p>
                            : <ul className="divide-y overflow-hidden rounded-2xl" style={{ background: C.card, borderColor: C.line }}>{list.map(row)}</ul>}
                    </section>
                )}

                {tab === "points" && <div className="px-4"><Points onPick={(p) => { setPreset({ place: p.name, spot: "pay" }); setAdding(true); }} /></div>}
            </main>

            {/* 하단 탭 — 홈 · 크루 · 기록 · 어탁첩 · 채팅 */}
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t" style={{ background: C.bar, borderColor: C.line, paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="낚시 메뉴" data-testid="fishing-nav">
                <div className="mx-auto grid h-[64px] max-w-[720px] grid-cols-5 items-center">
                    <TabButton id="home" label="홈" on={tab === "home"} onClick={() => setTab("home")} icon={<LucideHome className="h-5 w-5" />} />
                    <TabButton id="crew" label="크루" on={false} onClick={() => setLocation("/club")} icon={<LucideFlag className="h-5 w-5" />} />
                    <button type="button" onClick={() => setAdding(true)} aria-label="조과 적기" data-testid="fishing-add" className="mx-auto -mt-5 flex h-14 w-14 items-center justify-center rounded-full shadow-lg active:scale-95" style={{ background: C.brand, color: C.onBrand, boxShadow: "0 6px 18px #38BDF859" }}>
                        <LucidePlus weight="bold" className="h-6 w-6" />
                    </button>
                    <TabButton id="book" label="어탁첩" on={tab === "book"} onClick={() => setTab("book")} icon={<span className="flex h-5 w-5 items-center justify-center rounded-[4px] text-[12px] font-semibold" style={{ border: "1.5px solid currentColor" }} aria-hidden>拓</span>} />
                    <TabButton id="chat" label="채팅" on={false} onClick={() => setLocation("/chat")} icon={<LucideMessageSquare className="h-5 w-5" />} />
                </div>
            </nav>

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
                <div role="dialog" aria-modal="true" aria-label="새 어탁" className="fixed inset-0 z-[70] flex flex-col items-center justify-center px-6" style={{ background: "#071A2BF2" }} data-testid="fishing-promoted" onClick={() => setPromoted(null)}>
                    <p className="text-[14px]" style={{ color: C.soft }}>{promoted.tier ? "승급" : "새 어탁"}</p>
                    <p className="mt-1 text-center text-[26px] font-semibold tracking-tight">{promoted.tier ? `${promoted.fish.name} ${promoted.tier.name}` : `${promoted.fish.name} 첫 수`}</p>
                    <div className="mt-5 w-full max-w-[340px]" style={{ transform: "rotate(-1.5deg)" }}><Eotak rec={promoted} today={today} big /></div>
                    {promoted.next && promoted.gap != null && <p className="mt-5 text-[14px]" style={{ color: C.soft }}>다음은 <span className="font-semibold" style={{ color: C.foam }}>{promoted.next.name}</span> — {fishValueText(promoted.fish.unit, promoted.gap)} 남았어요</p>}
                    <button type="button" onClick={() => setPromoted(null)} className="mt-6 h-12 rounded-2xl px-8 text-[15px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-promoted-close">어탁첩에 걸기</button>
                </div>
            )}
        </div>
    );
}

function TabButton({ id, label, on, onClick, icon }: { id: string; label: string; on: boolean; onClick: () => void; icon: ReactNode }) {
    return (
        <button type="button" onClick={onClick} aria-current={on ? "page" : undefined} data-testid={`fishing-tab-${id}`} className="flex h-full flex-col items-center justify-center gap-1 text-[12px]" style={{ color: on ? C.brand : C.dim }}>
            {icon}{label}
        </button>
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
                    className="h-11 min-w-0 flex-1 rounded-xl px-3.5 text-[14px] outline-none placeholder:text-[#E6F6FF59]" style={{ background: "#FFFFFF0F", color: C.foam }} data-testid="fishing-place-q" />
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
                                <button type="button" onClick={() => onPick(p)} className="h-9 shrink-0 rounded-full px-3 text-[13px] font-semibold" style={{ background: "#38BDF826", color: C.brand }} data-testid="fishing-place-pick">조과 적기</button>
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
    today: string; onClose: () => void; preset?: { place: string; spot: FishingSpotId } | null; before: readonly FishRecord<FishingCatch>[];
    onSaved: (saved: FishingCatch, all: FishingCatch[]) => void;
}) {
    const [day, setDay] = useState(today);
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
    const fileRef = useRef<HTMLInputElement>(null);
    const fish: FishKind | null = fishByName(species);
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
        const body: Record<string, unknown> = { day, place, spot, species, note, released, count: unit === "count" ? (value || count) : count, lengthCm: unit === "cm" ? value : "", weightKg: unit === "kg" ? value : "", ji: unit === "ji" ? value : "" };
        const c = cleanCatch(body, today);
        if (!c.ok) { setError(c.error); return; }
        setError(null); setBusy(true);
        try {
            const photo = file ? await uploadPhoto(file).catch(() => { throw new Error("사진을 올리지 못했어요. 다시 해 보거나 사진 없이 적어 주세요."); }) : null;
            const saved = await apiRequest("/api/hiq/fishing/catches", { method: "POST", body: { ...c.value, ...(photo ?? {}) } }) as FishingCatch;
            const all = [saved, ...(queryClient.getQueryData<FishingCatch[]>(KEY) ?? [])];
            queryClient.setQueryData(KEY, all);
            void queryClient.invalidateQueries({ queryKey: KEY });
            onSaved(saved, all);
            onClose();
        } catch (e: any) {
            setError(e?.message || "적지 못했어요. 잠시 뒤에 다시 해 주세요.");
        } finally { setBusy(false); }
    };
    const field = "h-12 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-[#E6F6FF59]";
    const fieldStyle = { background: "#FFFFFF0F", color: C.foam } as const;
    const chipOn = { background: C.brand, color: C.onBrand }, chipOff = { background: "#FFFFFF0F", color: C.soft };
    return (
        <div role="dialog" aria-modal="true" aria-label="조과 적기" className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.bg, color: C.foam }} data-testid="fishing-sheet">
            <div className="h-[env(safe-area-inset-top)] shrink-0" aria-hidden />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: C.line }}>
                <h2 className="flex-1 text-[16px] font-semibold">조과 적기</h2>
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

                {/* 그 어종이 자랑하는 값 — 적는 대로 몇 짜인지 보인다 */}
                <div className="rounded-2xl p-3.5" style={{ background: C.card }}>
                    <div className="flex items-end gap-3">
                        <label className="min-w-0 flex-1"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>{unit === "cm" ? "가장 큰 것의 길이" : unit === "count" ? "마릿수" : unit === "kg" ? "가장 큰 것의 무게" : "굵기(지)"}</span>
                            <div className="flex items-baseline gap-2">
                                <input inputMode={unit === "count" || unit === "ji" ? "numeric" : "decimal"} value={value} onChange={(e) => setValue(e.target.value.replace(unit === "count" || unit === "ji" ? /[^\d]/g : /[^\d.]/g, "").slice(0, 5))} placeholder="0"
                                    className="h-14 w-[120px] rounded-xl px-3 text-[28px] font-semibold tabular-nums outline-none" style={fieldStyle} data-testid="fishing-value" />
                                <span className="text-[16px]" style={{ color: C.soft }}>{FISH_UNIT_LABEL[unit]}</span>
                            </div>
                        </label>
                        {live?.tier ? <Seal text={live.tier.name} size={56} /> : fish ? <Seal text={fish.tiers[0].name} size={56} faint /> : null}
                    </div>
                    {fish && (
                        <p className="mt-2.5 text-[13px]" style={{ color: C.soft }} data-testid="fishing-live">
                            {live?.tier ? <><span className="font-semibold" style={{ color: C.foam }}>{live.tier.name}</span>{live.next && live.gap != null ? ` — ${live.next.name}까지 ${fishValueText(unit, live.gap)}` : " — 이 어종의 가장 높은 단계예요"}</> : `${fish.tiers[0].name}는 ${fishValueText(unit, fish.tiers[0].min)}부터예요`}
                            {prev?.value != null && num != null && num > prev.value ? <span style={{ color: C.sun }}> · 내 기록 {fishValueText(unit, prev.value)}을 넘어요</span> : null}
                        </p>
                    )}
                    {unit !== "count" && (
                        <label className="mt-3 flex items-center gap-3"><span className="text-[13px]" style={{ color: C.soft }}>마릿수</span>
                            <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} className="h-10 w-[72px] rounded-lg px-3 text-[15px] tabular-nums outline-none" style={fieldStyle} data-testid="fishing-count" /></label>
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
                <button type="button" aria-pressed={released} onClick={() => setReleased((v) => !v)} className="flex h-12 w-full items-center justify-between rounded-xl px-3.5 text-[14px]" style={fieldStyle} data-testid="fishing-released">
                    <span>놓아 줬어요(방류)</span>
                    <span className="flex h-6 w-11 items-center rounded-full p-0.5" style={{ background: released ? C.brand : "#FFFFFF24" }}><i className="h-5 w-5 rounded-full bg-[#FFFFFF] transition-transform" style={{ transform: released ? "translateX(20px)" : "none" }} /></span>
                </button>
                <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>한마디</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="물때 · 채비 · 날씨 같은 것" className={field} style={fieldStyle} data-testid="fishing-note" /></label>
                <p className="text-[12px] leading-relaxed" style={{ color: C.dim }}>잡은 곳은 적은 이름만 남고 위치는 재지 않아요. 사진은 나만 봐요.</p>
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
