/**
 * 낚시 — 네 번째 종목의 첫 화면(2026-10-14). 지금은 운영자에게만 보인다(오너: "낚시는 일단 나만 볼 수 있게").
 *
 * 중심은 조과 기록이다 — "이런 곳에 갔다 왔다 · 이런 물고기 잡았다". 하단 탭은 홈 · 크루 · 조과 · 포인트 · 채팅(오너: 크루와 채팅은 꼭).
 *  - 홈: 내 낚시 한눈에(출조 · 마릿수 · 어종 · 최대어) · 최근 조과 · 내 어종 도감
 *  - 조과: 내 기록 전부 + 적기
 *  - 포인트: 받아 둔 낚시터 · 낚시어선 자료를 싣는 자리(아직 비어 있다 — 그렇다고 말한다)
 *  - 크루 · 채팅: 있는 크루 · 채팅 화면으로 간다(낚시 크루를 따로 가르는 것은 다음 단계)
 * 색은 바다 — 남색 바탕에 물빛(shared/fishing FISHING_COLORS). 등산 · 골프 · 당구의 색을 쓰지 않는다.
 * ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지. 한국어만.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { appConfirm } from "@/components/AppDialog";
import { LucideChevronLeft, LucideFlag, LucideHome, LucideMap, LucideMessageSquare, LucidePlus, LucideX } from "@/lib/icons";
import { cn } from "@/lib/utils";
import {
    FISHING_COLORS as C, FISHING_SPECIES, FISHING_SPOTS, cleanCatch, fishingDayLabel, fishingDex, fishingKstDay, fishingSpotName, fishingSummary,
    type FishingCatch, type FishingSpotId,
} from "@shared/fishing";

const KEY = ["/api/hiq/fishing/catches"];
type Tab = "home" | "log" | "points";

/** 물고기 한 마리 — 탭 · 빈 화면의 표시(그림 파일 없이 선으로) */
function FishMark({ size = 20, color = C.brand }: { size?: number; color?: string }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 12c3-5 8-6 12-4l5-3-1.5 7L20 19l-5-3c-4 2-9 1-12-4Z" />
            <circle cx="8.2" cy="11" r="0.9" fill={color} stroke="none" />
        </svg>
    );
}

export default function FishingPage() {
    const [, setLocation] = useLocation();
    const { data: me, isLoading: meLoading } = useQuery<any>({ queryKey: ["/api/hiq/me"] });
    const allowed = me?.fishingAccess === true;
    const { data, isLoading } = useQuery<FishingCatch[]>({ queryKey: KEY, enabled: allowed });
    const list = data ?? [];
    const [tab, setTab] = useState<Tab>("home");
    const [adding, setAdding] = useState(false);
    const today = fishingKstDay(Date.now());
    const sum = useMemo(() => fishingSummary(list), [list]);
    const dex = useMemo(() => fishingDex(list), [list]);

    const remove = useMutation({
        mutationFn: (id: string) => apiRequest(`/api/hiq/fishing/catches/${id}`, { method: "DELETE" }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });

    // 쓸 수 없는 사람(아직 운영자만) — 홈으로 돌려보낸다. 있는 척하지 않는다
    if (!meLoading && !allowed) {
        return (
            <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-8 text-center" style={{ background: C.bg, color: C.foam }}>
                <FishMark size={36} />
                <p className="text-[15px]">낚시는 아직 준비 중이에요.</p>
                <button type="button" onClick={() => setLocation("/dashboard")} className="h-11 rounded-xl px-5 text-[14px] font-semibold" style={{ background: C.brand, color: C.onBrand }}>홈으로</button>
            </div>
        );
    }

    const row = (c: FishingCatch) => (
        <li key={c.id} className="flex items-center gap-3 px-4 py-3" data-testid="fishing-catch">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "#38BDF81F" }}><FishMark /></span>
            <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold" style={{ color: C.foam }}>
                    {c.species} <span className="font-normal tabular-nums" style={{ color: C.soft }}>{c.count}마리{c.lengthCm != null ? ` · ${c.lengthCm}cm` : ""}</span>
                </span>
                <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.dim }}>{[fishingDayLabel(c.day, today), c.place, fishingSpotName(c.spot)].filter(Boolean).join(" · ")}</span>
                {c.note ? <span className="mt-0.5 block truncate text-[12.5px]" style={{ color: C.soft }}>{c.note}</span> : null}
            </span>
            <button type="button" aria-label="이 기록 지우기" data-testid="fishing-catch-delete"
                onClick={() => { void appConfirm({ title: "이 기록을 지울까요?", message: "지우면 되돌릴 수 없어요.", tone: "danger", confirmText: "지우기", cancelText: "그대로" }).then((ok) => { if (ok) remove.mutate(c.id); }); }}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full active:bg-[#FFFFFF14]">
                <LucideX className="h-4 w-4" style={{ color: C.dim }} />
            </button>
        </li>
    );

    const empty = (
        <div className="rounded-2xl px-5 py-8 text-center" style={{ background: C.card }} data-testid="fishing-empty">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full" style={{ background: "#38BDF81F" }}><FishMark size={24} /></span>
            <p className="mt-3 text-[15px] font-semibold" style={{ color: C.foam }}>첫 조과를 적어 보세요</p>
            <p className="mt-1 text-[13px] leading-relaxed" style={{ color: C.soft }}>어디에 다녀왔고 무엇을 잡았는지 한 줄이면 돼요.</p>
            <button type="button" onClick={() => setAdding(true)} className="mt-4 h-11 rounded-xl px-5 text-[14px] font-semibold" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-add-first">조과 적기</button>
        </div>
    );

    return (
        <div className="min-h-screen pb-[calc(76px+env(safe-area-inset-bottom))] font-sans" style={{ background: C.bg, color: C.foam }} data-fishing="1">
            <header className="sticky top-0 z-40 border-b backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)", background: "#071A2BE6", borderColor: C.line }}>
                <div className="mx-auto flex h-14 max-w-[720px] items-center gap-1.5 px-3">
                    <button type="button" onClick={() => setLocation("/dashboard")} aria-label="홈으로" className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full active:bg-[#FFFFFF14]">
                        <LucideChevronLeft weight="bold" className="h-5 w-5" aria-hidden />
                    </button>
                    <div className="min-w-0 flex-1 truncate text-[16px] font-semibold tracking-tight">랭큐 낚시</div>
                    <span className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: "#FFC8571F", color: C.sun }}>운영자만 보는 중</span>
                </div>
            </header>

            <main className="mx-auto max-w-[720px] px-4">
                {tab === "home" && (
                    <>
                        {/* 물결 — 바다의 색으로 여는 머리 */}
                        <section className="relative mt-4 overflow-hidden rounded-3xl px-5 pb-5 pt-6" style={{ background: "linear-gradient(160deg,#0F3A5F 0%,#0A2238 70%)" }} data-testid="fishing-hero">
                            <svg aria-hidden viewBox="0 0 360 60" preserveAspectRatio="none" className="absolute inset-x-0 bottom-0 h-12 w-full opacity-60">
                                <path d="M0 30c30-14 60-14 90 0s60 14 90 0 60-14 90 0 60 14 90 0v30H0Z" fill="#38BDF826" />
                                <path d="M0 40c30-10 60-10 90 0s60 10 90 0 60-10 90 0 60 10 90 0v20H0Z" fill="#38BDF833" />
                            </svg>
                            <p className="text-[13px]" style={{ color: C.soft }}>내 낚시</p>
                            <p className="mt-1 text-[22px] font-semibold tracking-tight">{sum.trips ? `${sum.trips}번 나가 ${sum.fish}마리` : "아직 기록이 없어요"}</p>
                            <div className="relative mt-4 grid grid-cols-3 gap-2 text-center">
                                {([[sum.species, "만난 어종"], [sum.places, "다녀온 곳"], [sum.biggest ? `${sum.biggest.lengthCm}` : "–", sum.biggest ? `최대어 · ${sum.biggest.species}` : "최대어(cm)"]] as const).map(([n, label]) => (
                                    <div key={label} className="rounded-2xl px-2 py-3" style={{ background: "#FFFFFF0F" }}>
                                        <div className="text-[20px] font-semibold tabular-nums leading-none">{n}</div>
                                        <div className="mt-1.5 truncate text-[12px]" style={{ color: C.soft }}>{label}</div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        <section className="pt-7">
                            <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">최근 조과</h2>
                                {list.length > 3 && <button type="button" onClick={() => setTab("log")} className="text-[13px]" style={{ color: C.brand }}>전부 보기</button>}
                            </div>
                            {isLoading ? <div className="h-24 animate-pulse rounded-2xl bg-[#FFFFFF0F]" /> : list.length === 0 ? empty : (
                                <ul className="divide-y overflow-hidden rounded-2xl" style={{ background: C.card, borderColor: C.line }}>{list.slice(0, 3).map(row)}</ul>
                            )}
                        </section>

                        {dex.length > 0 && (
                            <section className="pt-7" data-testid="fishing-dex">
                                <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">내 어종 도감</h2><span className="text-[12.5px]" style={{ color: C.dim }}>{dex.length}종</span></div>
                                <div className="grid grid-cols-3 gap-2">
                                    {dex.map((d) => (
                                        <div key={d.species} className="rounded-2xl px-2 py-3 text-center" style={{ background: C.card }}>
                                            <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full" style={{ background: "#38BDF81F" }}><FishMark size={18} /></span>
                                            <p className="mt-2 truncate text-[14px] font-semibold">{d.species}</p>
                                            <p className="mt-0.5 truncate text-[12px] tabular-nums" style={{ color: C.soft }}>{d.count}마리{d.best != null ? ` · ${d.best}cm` : ""}</p>
                                        </div>
                                    ))}
                                </div>
                            </section>
                        )}
                    </>
                )}

                {tab === "log" && (
                    <section className="pt-5">
                        <div className="mb-3 flex items-baseline justify-between"><h2 className="text-[17px] font-semibold tracking-tight">내 조과</h2><span className="text-[12.5px] tabular-nums" style={{ color: C.dim }}>{list.length}줄</span></div>
                        {isLoading ? <div className="h-24 animate-pulse rounded-2xl bg-[#FFFFFF0F]" /> : list.length === 0 ? empty : (
                            <ul className="divide-y overflow-hidden rounded-2xl" style={{ background: C.card, borderColor: C.line }}>{list.map(row)}</ul>
                        )}
                    </section>
                )}

                {tab === "points" && (
                    <section className="pt-5" data-testid="fishing-points">
                        <h2 className="text-[17px] font-semibold tracking-tight">포인트</h2>
                        <div className="mt-3 rounded-2xl px-5 py-6" style={{ background: C.card }}>
                            <p className="text-[15px] font-semibold">낚시터 · 낚시어선 자료를 싣는 자리예요</p>
                            <p className="mt-2 text-[13px] leading-relaxed" style={{ color: C.soft }}>받아 둔 자료(낚시터 1,151곳 · 낚시어선 4,987척 · 출항지 960곳)를 다듬어 다음 단계에 실어요. 아직은 비어 있어요.</p>
                        </div>
                    </section>
                )}
            </main>

            {/* 조과 적기 — 어느 탭에서든 */}
            {tab !== "points" && list.length > 0 && (
                <button type="button" onClick={() => setAdding(true)} aria-label="조과 적기" data-testid="fishing-add"
                    className="fixed right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full shadow-lg active:scale-95" style={{ bottom: "calc(88px + env(safe-area-inset-bottom))", background: C.brand, color: C.onBrand }}>
                    <LucidePlus weight="bold" className="h-6 w-6" />
                </button>
            )}

            {/* 하단 탭 — 홈 · 크루 · 조과 · 포인트 · 채팅 */}
            <nav className="fixed inset-x-0 bottom-0 z-40 border-t" style={{ background: C.bar, borderColor: C.line, paddingBottom: "env(safe-area-inset-bottom)" }} aria-label="낚시 메뉴" data-testid="fishing-nav">
                <div className="mx-auto grid h-[64px] max-w-[720px] grid-cols-5">
                    {([
                        ["home", "홈", <LucideHome key="i" className="h-5 w-5" />, () => setTab("home")],
                        ["crew", "크루", <LucideFlag key="i" className="h-5 w-5" />, () => setLocation("/club")],
                        ["log", "조과", <FishMark key="i" size={22} color="currentColor" />, () => setTab("log")],
                        ["points", "포인트", <LucideMap key="i" className="h-5 w-5" />, () => setTab("points")],
                        ["chat", "채팅", <LucideMessageSquare key="i" className="h-5 w-5" />, () => setLocation("/chat")],
                    ] as const).map(([id, label, icon, go]) => {
                        const on = id === tab;
                        return (
                            <button key={id} type="button" onClick={go} aria-current={on ? "page" : undefined} data-testid={`fishing-tab-${id}`}
                                className="flex flex-col items-center justify-center gap-1 text-[12px]" style={{ color: on ? C.brand : C.dim }}>
                                {icon}{label}
                            </button>
                        );
                    })}
                </div>
            </nav>

            {adding && <CatchSheet today={today} onClose={() => setAdding(false)} />}
        </div>
    );
}

/** 조과 한 줄 적기 — 날짜 · 다녀온 곳 · 어디서 · 어종 · 마릿수 · 길이 · 한마디 */
function CatchSheet({ today, onClose }: { today: string; onClose: () => void }) {
    const [day, setDay] = useState(today);
    const [place, setPlace] = useState("");
    const [spot, setSpot] = useState<FishingSpotId | null>(null);
    const [species, setSpecies] = useState("");
    const [count, setCount] = useState("1");
    const [lengthCm, setLengthCm] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState<string | null>(null);
    const save = useMutation({
        mutationFn: (body: unknown) => apiRequest("/api/hiq/fishing/catches", { method: "POST", body }),
        onSuccess: () => { void queryClient.invalidateQueries({ queryKey: KEY }); onClose(); },
        onError: (e: any) => setError(e?.message || "적지 못했어요. 잠시 뒤에 다시 해 주세요."),
    });
    const submit = () => {
        const c = cleanCatch({ day, place, spot, species, count, lengthCm, note }, today);
        if (!c.ok) { setError(c.error); return; }
        setError(null);
        save.mutate(c.value);
    };
    const field = "h-12 w-full rounded-xl px-3.5 text-[15px] outline-none placeholder:text-[#E6F6FF59]";
    const fieldStyle = { background: "#FFFFFF0F", color: C.foam } as const;
    return (
        <div role="dialog" aria-modal="true" aria-label="조과 적기" className="fixed inset-0 z-[60] flex flex-col" style={{ background: C.bg, color: C.foam }} data-testid="fishing-sheet">
            <div className="h-[env(safe-area-inset-top)] shrink-0" aria-hidden />
            <header className="flex h-14 shrink-0 items-center gap-2 border-b px-4" style={{ borderColor: C.line }}>
                <h2 className="flex-1 text-[16px] font-semibold">조과 적기</h2>
                <button type="button" onClick={onClose} aria-label="닫기" className="flex h-10 w-10 items-center justify-center rounded-full bg-[#FFFFFF0F] active:bg-[#FFFFFF1F]"><LucideX className="h-5 w-5" /></button>
            </header>
            <div className="flex-1 space-y-5 overflow-y-auto px-4 py-5">
                <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>낚은 날</span>
                    <input type="date" value={day} max={today} onChange={(e) => setDay(e.target.value)} className={field} style={{ ...fieldStyle, colorScheme: "dark" }} data-testid="fishing-day" /></label>
                <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>다녀온 곳</span>
                    <input value={place} onChange={(e) => setPlace(e.target.value)} maxLength={40} placeholder="예: 여수 국동항 · 예당저수지" className={field} style={fieldStyle} data-testid="fishing-place" /></label>
                <div><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>어디서</span>
                    <div className="flex flex-wrap gap-1.5">
                        {FISHING_SPOTS.map((s) => (
                            <button key={s.id} type="button" aria-pressed={spot === s.id} onClick={() => setSpot(spot === s.id ? null : s.id)}
                                className={cn("h-9 rounded-full px-3 text-[13px]", spot === s.id && "font-semibold")} style={spot === s.id ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>{s.name}</button>
                        ))}
                    </div>
                </div>
                <div><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>어종</span>
                    <input value={species} onChange={(e) => setSpecies(e.target.value)} maxLength={20} placeholder="고르거나 직접 적기" className={field} style={fieldStyle} data-testid="fishing-species" />
                    <div className="mt-2 flex flex-wrap gap-1.5">
                        {FISHING_SPECIES.map((n) => (
                            <button key={n} type="button" aria-pressed={species === n} onClick={() => setSpecies(n)} data-testid={`fishing-species-${n}`}
                                className={cn("h-9 rounded-full px-3 text-[13px]", species === n && "font-semibold")} style={species === n ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>{n}</button>
                        ))}
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>마릿수</span>
                        <input inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} className={field} style={fieldStyle} data-testid="fishing-count" /></label>
                    <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>가장 큰 것(cm) · 안 쟀으면 비워 두기</span>
                        <input inputMode="decimal" value={lengthCm} onChange={(e) => setLengthCm(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} className={field} style={fieldStyle} data-testid="fishing-length" /></label>
                </div>
                <label className="block"><span className="mb-1.5 block text-[13px]" style={{ color: C.soft }}>한마디</span>
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} placeholder="물때 · 채비 · 날씨 같은 것" className={field} style={fieldStyle} data-testid="fishing-note" /></label>
                {error && <p role="alert" className="rounded-xl bg-[#FF6E6E1F] px-3.5 py-3 text-[13px] text-[#FF9C9C]" data-testid="fishing-error">{error}</p>}
            </div>
            <div className="shrink-0 border-t px-4 pt-3" style={{ borderColor: C.line, paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>
                <button type="button" disabled={save.isPending} onClick={submit} className="flex h-[52px] w-full items-center justify-center rounded-2xl text-[15px] font-semibold active:opacity-90" style={{ background: C.brand, color: C.onBrand }} data-testid="fishing-save">
                    {save.isPending ? "적는 중…" : "적기"}
                </button>
            </div>
        </div>
    );
}
