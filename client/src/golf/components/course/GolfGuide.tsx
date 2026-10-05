/**
 * 골프 공개 페이지의 소개·이용 방법·한눈에·자주 묻는 것(2026-10-05 오너: "부킹·조인이 사이트맵에 들어가 검색이 는다 —
 * 비로그인 방문자에게 랭큐 골프를 알릴 배너와 당구처럼 설명 버튼" → "수수료 없음, 2단계까지 진행").
 *
 *   GolfGuestIntro    배너 + 이용 방법 시트 한 묶음(비로그인만 그린다) — 골프장 상세처럼 자기 상태를 두지 않는 화면용
 *   GolfIntroBanner   비로그인 방문자에게만. 랭큐 골프가 뭔지 한 줄 + [이용 방법] [내 티타임 올리기]
 *   GolfGuideSheet    '이용 방법' — 조인·부킹·긴급·올리기 탭. 실제 글 줄(HubListingRow)을 예시로 보여 준다.
 *   RegionGlance      그 지역 골프장을 숫자 넷으로(그린피 최저 · 노캐디 · 2인 · 3인 가능). 누르면 그 조건으로 걸러진다.
 *   GolfFaq           페이지 아래 자주 묻는 것(의도별 순서)
 * 글은 shared/golfGuide — 서버 프리렌더가 같은 글을 쓴다. 숫자는 전부 목록 응답에서 센 실제 값이다(지어내지 않는다).
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말).
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { goLogin } from "@/components/hiq/LoginGate";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LucideChevronDown, LucideChevronRight } from "@/lib/icons";
import { cn } from "@/lib/utils";
import { wonShort, type GolfIntent } from "@shared/golfCourse";
import { GOLF_GUIDE, GOLF_INTRO, golfFaq, guideTabFor, type GuideTab } from "@shared/golfGuide";
import type { CourseListItem, HubListing } from "@/golf/lib/courseApi";
import { HubListingRow } from "./list/HubListingRow";

// ── 소개 배너 ─────────────────────────────────────────────────────
// 흰 카드 · 검은 단추 · 포인트는 주황 단추 하나(2026-10-05 오너: "그린 배경 빼고 흰색 카드에 검은 버튼, 포인트는 주황 버튼").
// 어두운 화면에서 이 카드만 밝아 검색으로 들어온 사람 눈에 먼저 들어온다 — 색을 더 얹지 않는다.
export function GolfIntroBanner({ onGuide, onPost, className }: { onGuide: () => void; onPost: () => void; className?: string }) {
    return (
        <section aria-label={GOLF_INTRO.name} className={cn("rounded-2xl p-4 bg-[#FFFFFF]", className)}>
            <span className="text-[13px] font-semibold text-[#0A0A0A99]">{GOLF_INTRO.name}</span>
            <p className="mt-1 text-[18px] leading-snug font-bold tracking-tight text-[#0A0A0A] break-keep">{GOLF_INTRO.line}</p>
            <ul className="mt-2.5 flex flex-wrap gap-1.5">
                {GOLF_INTRO.points.map((p) => (
                    <li key={p} className="h-7 px-2.5 rounded-full bg-[#0A0A0A0D] text-[12.5px] font-medium text-[#0A0A0AB3] inline-flex items-center whitespace-nowrap">{p}</li>
                ))}
            </ul>
            <div className="mt-3.5 flex gap-2">
                <button type="button" onClick={onGuide} className="h-10 px-4 rounded-full bg-[#0A0A0A] text-[#FFFFFF] text-[14px] font-semibold active:bg-[#2B2B2B] transition-colors">
                    이용 방법
                </button>
                <button type="button" onClick={onPost} className="h-10 px-4 rounded-full bg-[#FF6B00] text-[#FFFFFF] text-[14px] font-semibold active:bg-[#E86100] transition-colors">
                    내 티타임 올리기
                </button>
            </div>
        </section>
    );
}

// ── 이용 방법 ─────────────────────────────────────────────────────
const TAB_COLOR: Record<GuideTab, string> = { join: "#FF6B00", booking: "#64DD17", urgent: "#FF3B30", post: "#FFC43D" };
const TAB_INK: Record<GuideTab, string> = { join: "#FFFFFF", booking: "#0A0A0A", urgent: "#FFFFFF", post: "#1F1500" };

/** 예시 글 — 실제 글 줄(HubListingRow)에 그대로 넣는다. 날짜는 오늘 기준으로 만든다(긴급 = 오늘, 나머지 = 이번 토요일). */
function sampleListing(tab: GuideTab, now: number): HubListing | null {
    if (tab === "post") return null;
    const kst = new Date(now + 9 * 3600_000);
    const sat = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + ((6 - kst.getUTCDay() + 7) % 7 || 7), 7 - 9, 12));
    const base = { id: "sample", slug: "sample", courseName: "예시 컨트리클럽", region: "경기", city: "용인시", options: [], joinType: "FIELD" } as const;
    if (tab === "urgent") {
        return { ...base, listingType: "JOIN", datetime: new Date(now + 3 * 3600_000 + 20 * 60_000).toISOString(), costMode: "FIXED", greenFee: 30000,
            slots: [{ role: "HOST", gender: "ANY" }, { role: "GUEST", gender: "ANY" }, { role: "GUEST", gender: "ANY" }, { role: "OPEN", gender: "ANY" }],
            sellerType: null, joinApplied: 0, joinCapacity: 1, isUrgent: true } as unknown as HubListing;
    }
    if (tab === "booking") {
        return { ...base, listingType: "BOOKING", datetime: sat.toISOString(), costMode: null, greenFee: 165000, slots: null,
            sellerType: null, joinApplied: 0, joinCapacity: 1, isUrgent: false } as unknown as HubListing;
    }
    return { ...base, listingType: "JOIN", datetime: sat.toISOString(), costMode: "SPLIT", greenFee: null,
        slots: [{ role: "HOST", gender: "ANY" }, { role: "GUEST", gender: "ANY" }, { role: "OPEN", gender: "ANY" }, { role: "OPEN", gender: "ANY" }],
        sellerType: null, joinApplied: 0, joinCapacity: 2, isUrgent: false } as unknown as HubListing;
}

export function GolfGuideSheet({ open, onOpenChange, initialTab, primary }: {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    initialTab: GuideTab;
    /** 아래 큰 단추 — 탭마다 다르다(로그인 전이면 "로그인하고 시작하기") */
    primary: (tab: GuideTab) => { label: string; onClick: () => void } | null;
}) {
    const [tab, setTab] = useState<GuideTab>(initialTab);
    useEffect(() => { if (open) setTab(initialTab); }, [open, initialTab]);
    const sec = GOLF_GUIDE.find((g) => g.tab === tab)!;
    const now = useMemo(() => Date.now(), [open]); // eslint-disable-line react-hooks/exhaustive-deps
    const sample = sampleListing(tab, now);
    const action = primary(tab);
    const faq = golfFaq(tab === "post" ? "join" : tab).slice(0, 4);

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="bg-[#121212] text-white border-[#FFFFFF1A] rounded-t-2xl p-0 max-h-[90dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-3 text-left shrink-0">
                    <SheetTitle className="text-[18px] font-semibold text-white pr-8">랭큐 골프 이용 방법</SheetTitle>
                    <SheetDescription className="text-[13px] text-[#FFFFFF99] break-keep">{GOLF_INTRO.line}</SheetDescription>
                </SheetHeader>

                <div role="tablist" aria-label="이용 방법" className="px-5 shrink-0 flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {GOLF_GUIDE.map((g) => {
                        const on = g.tab === tab;
                        return (
                            <button
                                key={g.tab} type="button" role="tab" aria-selected={on} onClick={() => setTab(g.tab)}
                                className={cn("h-9 px-4 rounded-full text-[14px] whitespace-nowrap shrink-0 transition-colors", on ? "font-semibold" : "bg-[#FFFFFF0F] text-[#FFFFFFB3] font-medium active:bg-[#FFFFFF1A]")}
                                style={on ? { backgroundColor: TAB_COLOR[g.tab], color: TAB_INK[g.tab] } : undefined}
                            >{g.label}</button>
                        );
                    })}
                </div>

                <div className="flex-1 overflow-y-auto px-5 pt-4 pb-5">
                    <p className="text-[15px] leading-relaxed text-[#FFFFFFE6] break-keep">{sec.lead}</p>

                    {sample && (
                        <figure className="mt-4">
                            <ul aria-hidden="true" className="rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] overflow-hidden pointer-events-none">
                                <HubListingRow l={sample} now={now} onOpen={() => {}} />
                            </ul>
                            <figcaption className="mt-1.5 text-[12px] text-[#FFFFFF66]">예시 화면 — 글 한 줄에 날짜, 골프장, 비용, 남은 자리가 보여요</figcaption>
                        </figure>
                    )}

                    <ol className="mt-5 space-y-3">
                        {sec.steps.map((s, i) => (
                            <li key={s} className="flex gap-3">
                                <span className="w-6 h-6 shrink-0 rounded-full text-[12.5px] font-semibold tabular-nums flex items-center justify-center" style={{ backgroundColor: TAB_COLOR[tab], color: TAB_INK[tab] }}>{i + 1}</span>
                                <span className="pt-0.5 text-[14.5px] leading-snug text-[#FFFFFFE6] break-keep">{s}</span>
                            </li>
                        ))}
                    </ol>
                    {sec.note && <p className="mt-4 rounded-xl bg-[#FFFFFF08] px-3.5 py-3 text-[13px] leading-relaxed text-[#FFFFFF99] break-keep">{sec.note}</p>}

                    <h3 className="mt-7 mb-2 text-[13px] font-medium text-[#FFFFFF80]">자주 묻는 것</h3>
                    <FaqList items={faq} />
                </div>

                {action && (
                    <div className="px-5 pt-3 shrink-0 border-t border-[#FFFFFF0F]" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                        <button type="button" onClick={action.onClick} className="w-full h-12 rounded-xl bg-[#FFC43D] text-[#1F1500] text-[15px] font-semibold active:bg-[#F0B22A] transition-colors">
                            {action.label}
                        </button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}

/** 조인 올리기 시트가 바로 열리는 주소(BookingList 가 ?new=1 을 받는다) */
export const GOLF_POST_PATH = "/golf/booking-list?view=JOIN&new=1";

/** 비로그인 방문자용 한 묶음 — 배너 + 이용 방법 시트. 로그인했거나 확인 중이면 아무것도 그리지 않는다. */
export function GolfGuestIntro({ className, intent = null }: { className?: string; intent?: GolfIntent | null }) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const [open, setOpen] = useState(false);
    if (isLoading || member) return null;
    return (
        <>
            <GolfIntroBanner className={className} onGuide={() => setOpen(true)} onPost={() => goLogin(setLocation, GOLF_POST_PATH)} />
            <GolfGuideSheet
                open={open} onOpenChange={setOpen} initialTab={guideTabFor(intent)}
                primary={(tab) => ({ label: "로그인하고 시작하기", onClick: () => goLogin(setLocation, tab === "post" ? GOLF_POST_PATH : undefined) })}
            />
        </>
    );
}

// ── 자주 묻는 것 ──────────────────────────────────────────────────
function FaqList({ items }: { items: { q: string; a: string }[] }) {
    return (
        <div className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
            {items.map((f) => (
                <details key={f.q} className="group">
                    <summary className="list-none [&::-webkit-details-marker]:hidden px-4 py-3.5 flex items-center justify-between gap-3 cursor-pointer text-[14.5px] font-medium text-[#FFFFFFE6] active:bg-[#FFFFFF08]">
                        <span className="break-keep">{f.q}</span>
                        <LucideChevronDown weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF66] transition-transform group-open:rotate-180" />
                    </summary>
                    <p className="px-4 pb-4 text-[14px] leading-relaxed text-[#FFFFFF99] break-keep">{f.a}</p>
                </details>
            ))}
        </div>
    );
}

export function GolfFaq({ intent, onGuide, className }: { intent: GolfIntent | null; onGuide: () => void; className?: string }) {
    return (
        <section className={cn("px-5", className)}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[19px] font-bold tracking-tight text-[#FFFFFF]">자주 묻는 것</h2>
                <button type="button" onClick={onGuide} className="text-[13px] font-medium text-[#FFFFFF99] inline-flex items-center active:text-[#FFFFFF]">
                    이용 방법<LucideChevronRight weight="bold" className="w-3.5 h-3.5 ml-0.5" />
                </button>
            </div>
            <FaqList items={golfFaq(intent)} />
        </section>
    );
}

// ── 지역 한눈에 ───────────────────────────────────────────────────
/** 골프장 줄의 태그 이름(자료 그대로) */
const GLANCE_FEATS: [string, string][] = [["노캐디", "노캐디"], ["2인가능", "2인 가능"], ["3인가능", "3인 가능"]];

export function RegionGlance({ items, where, feats, onFeat, feeSort, onFeeSort, className }: {
    items: CourseListItem[];
    where: string;
    feats: string[];
    onFeat: (k: string) => void;
    feeSort: boolean;
    onFeeSort: () => void;
    className?: string;
}) {
    const fees = useMemo(() => items.map((c) => c.feeFrom).filter((n): n is number => typeof n === "number" && n > 0), [items]);
    const counts = useMemo(() => GLANCE_FEATS.map(([k, label]) => ({ k, label, n: items.filter((c) => (c.play ?? []).includes(k)).length })), [items]);
    const tiles = counts.filter((c) => c.n > 0);
    if (!fees.length && !tiles.length) return null;
    const tile = (on: boolean) => cn(
        "min-w-0 rounded-2xl px-3.5 py-3 text-left transition-colors",
        on ? "bg-[#64DD171F] ring-1 ring-inset ring-[#64DD1766]" : "bg-[#FFFFFF08] active:bg-[#FFFFFF12]",
    );
    return (
        <section aria-label={`${where} 골프장 한눈에`} className={cn("px-5", className)}>
            <h2 className="mb-3 text-[19px] font-bold tracking-tight text-[#FFFFFF]">{where} 골프장 한눈에</h2>
            <div className="grid grid-cols-2 gap-2">
                {fees.length > 0 && (
                    <button type="button" onClick={onFeeSort} aria-pressed={feeSort} className={tile(feeSort)}>
                        <span className="block text-[12.5px] text-[#FFFFFF80]">그린피</span>
                        <span className="block mt-0.5 text-[17px] font-semibold text-[#FFFFFF] tabular-nums truncate">{wonShort(Math.min(...fees))}부터</span>
                        <span className="block mt-0.5 text-[12px] text-[#FFFFFF59] tabular-nums">{fees.length}곳 기준 · 낮은 순 보기</span>
                    </button>
                )}
                {tiles.map((c) => {
                    const on = feats.includes(c.k);
                    return (
                        <button key={c.k} type="button" onClick={() => onFeat(c.k)} aria-pressed={on} className={tile(on)}>
                            <span className="block text-[12.5px] text-[#FFFFFF80]">{c.label}</span>
                            <span className="block mt-0.5 text-[17px] font-semibold text-[#FFFFFF] tabular-nums">{c.n}곳</span>
                            <span className={cn("block mt-0.5 text-[12px]", on ? "text-[#9BEF5C]" : "text-[#FFFFFF59]")}>{on ? "이 조건으로 보는 중" : "이 조건으로 보기"}</span>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
