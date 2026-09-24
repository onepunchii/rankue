/**
 * 관심 골프장(2026-09-24) — 이 기능의 주 행동이다. 누르면 "그 골프장에 티타임이 올라오면 알림".
 *
 *   WatchButton size="lg"  상세 머리의 큰 단추. 누르면 조건 시트가 열린다(비로그인이면 로그인 → 돌아와서 시트가 열린다).
 *   WatchButton size="sm"  목록 카드의 별. 한 번 누르면 **바로 등록**(조건 없이 전부), 등록된 별을 누르면 조건 시트.
 *
 * 조건을 안 고르면 전부 받는다 — 그게 기본이다. 서버(cleanFilters)는 아는 칸만 받으므로 여기서도 빈 칸은 보내지 않는다.
 *
 * ⚠️ 이 페이지들은 비로그인(당구 테마)에서도 열린다 — 색은 리터럴만(CourseShell 머리말).
 * ⚠️ 목록에서는 이 단추가 카드 링크 안에 있다. 시트는 portal 이지만 React 이벤트는 React 나무를 따라 올라가
 *    카드의 Link 에 닿는다 — 시트 안을 누를 때마다 골프장으로 넘어가 버린다. 그래서 감싸서 끊는다(stop).
 */
import { useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode, type SyntheticEvent } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LucideBellRing, LucideCheck, LucideChevronRight, LucideLoader2, LucideStar } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { goLogin } from "@/components/hiq/LoginGate";
import { cn } from "@/lib/utils";
import { useCourseWatch, type WatchFilters } from "@/golf/lib/courseApi";
import type { GolfIntent } from "@shared/golfCourse";

type Day = NonNullable<WatchFilters["days"]>[number];
type Part = NonNullable<WatchFilters["parts"]>[number];

const KIND_OPTS: { v: GolfIntent; label: string }[] = [
    { v: "booking", label: "부킹" }, { v: "join", label: "조인" }, { v: "urgent", label: "긴급·취소티" },
];
const DAY_OPTS: { v: Day; label: string }[] = [{ v: "weekday", label: "주중" }, { v: "weekend", label: "주말" }];
const PART_OPTS: { v: Part; label: string }[] = [{ v: "1", label: "1부" }, { v: "2", label: "2부" }, { v: "3", label: "3부" }];
const FEE_OPTS: { v: number | undefined; label: string }[] = [
    { v: undefined, label: "상관없음" }, { v: 100_000, label: "10만원" }, { v: 150_000, label: "15만원" }, { v: 200_000, label: "20만원" },
];
/** 조인 빈자리 — '1자리'는 모든 조인이라 '혼자'(=상관없음)로 둔다. 사람은 "몇 명이 가나"로 생각한다. */
const SEAT_OPTS: { v: number | undefined; label: string }[] = [
    { v: undefined, label: "혼자" }, { v: 2, label: "2명" }, { v: 3, label: "3명" },
];

const stop = (e: SyntheticEvent) => e.stopPropagation();

/** 조건 한 줄 — 시트 머리와 상세의 '관심 중' 단추가 같은 말을 쓴다. 비었으면 "". */
export function watchSummary(f: WatchFilters | null | undefined): string {
    if (!f) return "";
    const bits: string[] = [];
    if (f.kinds?.length && f.kinds.length < 3) bits.push(f.kinds.map((k) => KIND_OPTS.find((o) => o.v === k)!.label.replace("·취소티", "")).join("·"));
    if (f.days?.length === 1) bits.push(f.days[0] === "weekday" ? "주중" : "주말");
    if (f.parts?.length && f.parts.length < 3) bits.push([...f.parts].sort().map((p) => `${p}부`).join("·"));
    if (f.maxFee) bits.push(`${f.maxFee / 10000}만원 이하`);
    if (f.minSeats && f.minSeats > 1) bits.push(`${f.minSeats}자리 이상`);
    return bits.join(" · ");
}

/** 보낼 꼴로 — 빈 칸·전부 고른 칸은 뺀다(전부 = 조건 없음). */
function clean(f: WatchFilters): WatchFilters {
    const out: WatchFilters = {};
    if (f.kinds?.length && f.kinds.length < KIND_OPTS.length) out.kinds = f.kinds;
    if (f.days?.length && f.days.length < DAY_OPTS.length) out.days = f.days;
    if (f.parts?.length && f.parts.length < PART_OPTS.length) out.parts = f.parts;
    if (f.maxFee) out.maxFee = f.maxFee;
    const joinish = !out.kinds || out.kinds.includes("join") || out.kinds.includes("urgent");
    if (joinish && f.minSeats && f.minSeats > 1) out.minSeats = f.minSeats;
    return out;
}

const chipCls = (on: boolean) => cn(
    "h-10 px-3.5 rounded-full text-[14px] font-medium border transition-colors whitespace-nowrap",
    on ? "bg-[#64DD17] border-[#64DD17] text-[#051907]" : "bg-[#FFFFFF08] border-[#FFFFFF1A] text-[#FFFFFFB3] active:bg-[#FFFFFF14]",
);

/** 여러 개 고르는 칩 — '전부'가 켜져 있으면 조건 없음. 다 고르면 다시 '전부'로 접는다. */
function Multi<T extends string>({ opts, value, onChange }: { opts: { v: T; label: string }[]; value: T[] | undefined; onChange: (v: T[] | undefined) => void }) {
    const cur = value ?? [];
    const toggle = (v: T) => {
        const next = cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v];
        onChange(next.length === 0 || next.length === opts.length ? undefined : next);
    };
    return (
        <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => onChange(undefined)} aria-pressed={cur.length === 0} className={chipCls(cur.length === 0)}>전부</button>
            {opts.map((o) => (
                <button key={o.v} type="button" onClick={() => toggle(o.v)} aria-pressed={cur.includes(o.v)} className={chipCls(cur.includes(o.v))}>{o.label}</button>
            ))}
        </div>
    );
}
function Single<T>({ opts, value, onChange }: { opts: { v: T; label: string }[]; value: T; onChange: (v: T) => void }) {
    return (
        <div className="flex flex-wrap gap-2">
            {opts.map((o) => (
                <button key={o.label} type="button" onClick={() => onChange(o.v)} aria-pressed={value === o.v} className={chipCls(value === o.v)}>{o.label}</button>
            ))}
        </div>
    );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <section className="space-y-2.5">
            <h3 className="text-[13px] font-medium text-[#FFFFFF80]">{label}</h3>
            {children}
        </section>
    );
}

interface SheetProps {
    slug: string;
    name?: string;
    open: boolean;
    onOpenChange: (v: boolean) => void;
    myWatch: { filters: WatchFilters } | null | undefined;
}

export function WatchSheet({ slug, name, open, onOpenChange, myWatch }: SheetProps) {
    const { toast } = useToast();
    const { watch, unwatch } = useCourseWatch(slug);
    const [f, setF] = useState<WatchFilters>({});
    // 열 때마다 지금 조건으로 채운다 — 닫았다 다시 열면 고르다 만 값이 아니라 저장된 값이 보여야 한다.
    // myWatch 는 30초마다 새로 받는 상세에서 온다 — 의존성에 넣으면 고르는 도중에 값이 되돌아갈 수 있어 '열릴 때'만 본다.
    const saved = useRef(myWatch); saved.current = myWatch;
    useEffect(() => { if (open) setF({ ...(saved.current?.filters ?? {}) }); }, [open]);

    const cleaned = useMemo(() => clean(f), [f]);
    const summary = watchSummary(cleaned);
    const joinish = !cleaned.kinds || cleaned.kinds.includes("join") || cleaned.kinds.includes("urgent");
    const busy = watch.isPending || unwatch.isPending;

    const save = () => watch.mutate(cleaned, {
        onSuccess: () => {
            toast({ title: myWatch ? "조건을 바꿨어요" : "관심 등록했어요 — 올라오면 바로 알려 드려요" });
            onOpenChange(false);
        },
        onError: (e: any) => toast({ variant: "destructive", title: e?.message || "등록하지 못했어요" }),
    });
    const remove = () => unwatch.mutate(undefined, {
        onSuccess: () => { toast({ title: "관심을 해제했어요" }); onOpenChange(false); },
        onError: (e: any) => toast({ variant: "destructive", title: e?.message || "해제하지 못했어요" }),
    });

    return (
        <span onClick={stop} onPointerDown={stop} className="contents">
            <Sheet open={open} onOpenChange={onOpenChange}>
                <SheetContent side="bottom" onClick={stop} className="bg-[#121212] text-white border-[#FFFFFF1A] rounded-t-2xl p-0 max-h-[88dvh] flex flex-col">
                    <SheetHeader className="px-5 pt-5 pb-3 text-left shrink-0">
                        <SheetTitle className="text-[17px] font-semibold text-white pr-8 truncate">{name ? `${name} 알림` : "티타임 알림"}</SheetTitle>
                        <SheetDescription className="text-[13px] text-[#FFFFFF99] break-keep">
                            {summary ? `${summary} 티타임이 올라오면 알려 드려요` : "새 티타임이 올라오면 전부 알려 드려요"}
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-6">
                        <Field label="종류">
                            <Multi opts={KIND_OPTS} value={f.kinds} onChange={(kinds) => setF((x) => ({ ...x, kinds }))} />
                        </Field>
                        <Field label="요일">
                            <Multi opts={DAY_OPTS} value={f.days} onChange={(days) => setF((x) => ({ ...x, days }))} />
                        </Field>
                        <Field label="시간">
                            <Multi opts={PART_OPTS} value={f.parts} onChange={(parts) => setF((x) => ({ ...x, parts }))} />
                        </Field>
                        <Field label="1인 그린피">
                            <Single opts={FEE_OPTS.map((o) => ({ ...o, label: o.v ? `${o.label} 이하` : o.label }))} value={f.maxFee} onChange={(maxFee) => setF((x) => ({ ...x, maxFee }))} />
                        </Field>
                        {joinish && (
                            <Field label="조인 — 몇 명이 가요">
                                <Single opts={SEAT_OPTS} value={f.minSeats && f.minSeats > 1 ? f.minSeats : undefined} onChange={(minSeats) => setF((x) => ({ ...x, minSeats }))} />
                            </Field>
                        )}
                    </div>

                    <div className="px-5 pt-3 shrink-0 border-t border-[#FFFFFF0F] flex gap-2" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                        {myWatch && (
                            <button type="button" onClick={remove} disabled={busy} className="h-12 px-4 rounded-xl bg-[#FFFFFF0F] text-[15px] font-medium text-[#FFFFFFB3] disabled:opacity-50">
                                {unwatch.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : "해제"}
                            </button>
                        )}
                        <button type="button" onClick={save} disabled={busy} className="flex-1 h-12 rounded-xl bg-[#64DD17] text-[#051907] text-[15px] font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2">
                            {watch.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : <LucideBellRing className="w-5 h-5" />}
                            {myWatch ? "조건 저장" : "알림 받기"}
                        </button>
                    </div>
                </SheetContent>
            </Sheet>
        </span>
    );
}

interface ButtonProps {
    slug: string;
    myWatch: { filters: WatchFilters } | null | undefined;
    watchers: number;
    size?: "lg" | "sm";
    /** 시트 제목에 쓴다 */
    name?: string;
    className?: string;
    /** 로그인에서 돌아왔을 때 시트를 이어서 열까(lg 기본 true). 한 화면에 lg 가 둘이면 하나만 켠다. */
    resumeAfterLogin?: boolean;
}

/** 로그인에서 돌아오면 시트를 열라는 표시(상세의 큰 단추만) */
const RESUME = "watch";

export function WatchButton({ slug, myWatch, watchers, size = "lg", name, className, resumeAfterLogin = size === "lg" }: ButtonProps) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const { toast } = useToast();
    const { watch } = useCourseWatch(slug);
    const [open, setOpen] = useState(false);
    const on = !!myWatch;

    // 로그인하고 돌아온 사람 — 누르려던 시트를 이어서 연다. 표시는 지운다(새로고침하면 또 열리지 않게).
    useEffect(() => {
        if (!resumeAfterLogin || isLoading || !member) return;
        const u = new URL(window.location.href);
        if (u.searchParams.get(RESUME) !== "1") return;
        u.searchParams.delete(RESUME);
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
        setOpen(true);
    }, [resumeAfterLogin, isLoading, member]);

    const press = (e: MouseEvent) => {
        e.preventDefault(); e.stopPropagation();
        if (isLoading) return;
        if (!member) {
            if (size === "lg") {
                const u = new URL(window.location.href); u.searchParams.set(RESUME, "1");
                goLogin(setLocation, u.pathname + u.search);
            } else goLogin(setLocation);
            return;
        }
        // 목록의 별: 한 번에 등록(전부 받기). 이미 켜진 별은 조건을 고치러 들어간다.
        if (size === "sm" && !on) {
            watch.mutate({}, {
                onSuccess: () => toast({ title: `${name ?? "관심 골프장"} — 티타임이 올라오면 알려 드려요` }),
                onError: (err: any) => toast({ variant: "destructive", title: err?.message || "등록하지 못했어요" }),
            });
            return;
        }
        setOpen(true);
    };

    const sheet = <WatchSheet slug={slug} name={name} open={open} onOpenChange={setOpen} myWatch={myWatch} />;

    if (size === "sm") {
        return (
            <>
                <button
                    type="button" onClick={press} aria-pressed={on}
                    aria-label={on ? "관심 골프장 — 알림 조건" : `관심 골프장으로 등록${watchers > 0 ? ` (관심 ${watchers}명)` : ""}`}
                    className={cn("shrink-0 w-10 h-10 -m-1 rounded-full flex items-center justify-center active:bg-[#FFFFFF14]", className)}
                >
                    {watch.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin text-[#FFFFFF80]" />
                        : <LucideStar weight={on ? "fill" : "regular"} className={cn("w-[22px] h-[22px]", on ? "text-[#64DD17]" : "text-[#FFFFFF66]")} />}
                </button>
                {sheet}
            </>
        );
    }

    const summary = watchSummary(myWatch?.filters);
    return (
        <>
            {on ? (
                <button
                    type="button" onClick={press}
                    className={cn("w-full h-[52px] px-4 rounded-2xl bg-[#64DD171A] ring-1 ring-inset ring-[#64DD174D] flex items-center gap-2.5 text-left active:bg-[#64DD1729]", className)}
                >
                    <span className="w-7 h-7 rounded-full bg-[#64DD17] flex items-center justify-center shrink-0">
                        <LucideCheck weight="bold" className="w-4 h-4 text-[#051907]" />
                    </span>
                    <span className="flex-1 min-w-0">
                        <span className="block text-[15px] font-semibold text-[#8BE84A] leading-tight">관심 골프장 · 알림 켜짐</span>
                        <span className="block text-[12px] text-[#FFFFFF80] truncate">{summary || "모든 티타임"}</span>
                    </span>
                    <span className="text-[13px] text-[#FFFFFF80] flex items-center shrink-0">조건<LucideChevronRight className="w-4 h-4" /></span>
                </button>
            ) : (
                <button
                    type="button" onClick={press}
                    className={cn("w-full h-[52px] rounded-2xl bg-[#64DD17] text-[#051907] text-[16px] font-semibold tracking-tight flex items-center justify-center gap-2 active:bg-[#58C414] transition-colors", className)}
                >
                    <LucideBellRing weight="fill" className="w-[18px] h-[18px]" />
                    관심 등록하고 취소티 알림 받기
                </button>
            )}
            {sheet}
        </>
    );
}
