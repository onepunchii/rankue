/**
 * 지역 알림(2026-10-05 오너: "2단계까지 진행") — "이 지역에 조인·부킹이 올라오면 알려 주세요".
 *
 * 검색으로 들어온 사람이 가장 자주 보는 화면은 **빈 목록**이다(전국에 글이 한두 건). 그 자리에서 할 수 있는 일이 이것이다.
 * 관심 골프장(☆)은 골프장 하나를 고르는 일이고, 이건 지역(+시군)을 통째로 건다. 조건·제한·조용한 시간은 관심 골프장과 같다
 * (서버 services/golfCourseWatch — 같은 지역 20분에 한 통, 관심 알림과 합쳐 하루 20통, 밤엔 알림함에만).
 *
 *   AreaAlertButton variant="big"   빈 목록 안의 큰 단추
 *   AreaAlertButton variant="chip"  글이 있을 때 제목 옆 작은 단추
 *   AreaAlertButton variant="row"   전체 골프장 허브의 한 줄
 * 한 화면에 하나만 둔다 — 로그인에서 돌아와 시트를 이어 여는 표시(?alert=1)를 하나가 받아야 한다.
 *
 * ⚠️ 비로그인(당구 테마)에서도 열리는 화면 — 색은 리터럴만(CourseShell 머리말).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LucideBellRing, LucideCheck, LucideChevronRight, LucideLoader2 } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { goLogin } from "@/components/hiq/LoginGate";
import { cn } from "@/lib/utils";
import { GOLF_REGIONS, REGION_LABEL, type GolfIntent } from "@shared/golfCourse";
import { useAreaAlert, useMyAreaAlerts, type AreaAlert, type RegionNode, type WatchFilters } from "@/golf/lib/courseApi";
import { DAY_OPTS, FEE_OPTS, Field, KIND_OPTS, Multi, PART_OPTS, SEAT_OPTS, Single, cleanWatchFilters, watchSummary } from "./WatchSheet";
import { announceAlertOn } from "./AlertReach";

/** 로그인에서 돌아오면 시트를 열라는 표시 */
const RESUME = "alert";

interface Scope {
    /** 화면의 지역. 없으면(전국) 시트에서 고른다 */
    region: string | null;
    /** 화면의 시군(짧은 이름 또는 전체 이름) */
    city: string | null;
    /** 화면의 의도 — 처음 켤 때 그 종류만 받게 맞춰 둔다(조인 페이지 → 조인) */
    intent: GolfIntent | null;
    regions: RegionNode[] | undefined;
}

const fullCity = (regions: RegionNode[] | undefined, region: string | null, city: string | null): string | null => {
    if (!region || !city) return null;
    return regions?.find((r) => r.region === region)?.cities.find((c) => c.city === city || c.short === city)?.city ?? null;
};

function AreaAlertSheet({ open, onOpenChange, region, city, intent, regions, mine }: Scope & { open: boolean; onOpenChange: (v: boolean) => void; mine: AreaAlert[] | undefined }) {
    const { toast } = useToast();
    const { save, remove } = useAreaAlert();
    const [pick, setPick] = useState<string | null>(region);
    const [cities, setCities] = useState<string[]>([]);
    const [f, setF] = useState<WatchFilters>({});

    // 열 때(그리고 지역을 바꿀 때) 저장된 값으로 채운다. 없으면 화면의 범위·의도가 기본값.
    const mineRef = useRef(mine); mineRef.current = mine;
    const load = (r: string | null) => {
        const saved = r ? mineRef.current?.find((a) => a.region === r) : undefined;
        if (saved) { setCities(saved.cities); setF({ ...saved.filters }); return; }
        const c = r === region ? fullCity(regions, region, city) : null;
        setCities(c ? [c] : []);
        setF(intent ? { kinds: [intent] } : {});
    };
    useEffect(() => {
        if (!open) return;
        const r = region ?? mineRef.current?.[0]?.region ?? null;
        setPick(r); load(r);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const node = pick ? regions?.find((r) => r.region === pick) : undefined;
    const existing = pick ? mine?.find((a) => a.region === pick) : undefined;
    const cleaned = useMemo(() => cleanWatchFilters(f), [f]);
    const joinish = !cleaned.kinds || cleaned.kinds.includes("join") || cleaned.kinds.includes("urgent");
    const busy = save.isPending || remove.isPending;

    const label = pick ? (REGION_LABEL[pick] ?? pick) : "";
    const cityText = cities.length && node
        ? cities.map((c) => node.cities.find((x) => x.city === c)?.short ?? c).slice(0, 3).join("·") + (cities.length > 3 ? ` 외 ${cities.length - 3}곳` : "")
        : "";
    const cond = watchSummary(cleaned);
    const place = cityText || label;
    const desc = !pick ? "알림을 받을 지역을 골라 주세요"
        : cond ? `${place} · ${cond} 티타임이 올라오면 알려 드려요`
        : `${place}에 새 티타임이 올라오면 알려 드려요`;

    const onSave = () => {
        if (!pick) return;
        save.mutate({ region: pick, cities, filters: cleaned }, {
            onSuccess: () => {
                onOpenChange(false);
                // 새로 켰으면 그 알림이 어떻게 닿는지까지(브라우저엔 푸시가 없다 — AlertReach)
                if (existing) toast({ title: "조건을 바꿨어요" });
                else void announceAlertOn(`${label} 알림을 켰어요`);
            },
            onError: (e: any) => toast({ variant: "destructive", title: e?.message || "저장하지 못했어요" }),
        });
    };
    const onRemove = () => {
        if (!pick) return;
        remove.mutate(pick, {
            onSuccess: () => { toast({ title: `${label} 알림을 껐어요` }); onOpenChange(false); },
            onError: (e: any) => toast({ variant: "destructive", title: e?.message || "끄지 못했어요" }),
        });
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="bottom" className="bg-[#121212] text-white border-[#FFFFFF1A] rounded-t-2xl p-0 max-h-[88dvh] flex flex-col">
                <SheetHeader className="px-5 pt-5 pb-3 text-left shrink-0">
                    <SheetTitle className="text-[17px] font-semibold text-white pr-8 truncate">{pick ? `${label} 알림` : "지역 알림"}</SheetTitle>
                    <SheetDescription className="text-[13px] text-[#FFFFFF99] break-keep">{desc}</SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-6">
                    {!region && (
                        <Field label="지역">
                            <Single
                                opts={GOLF_REGIONS.map((r) => ({ v: r as string, label: r as string }))}
                                value={pick as string}
                                onChange={(r) => { setPick(r); load(r); }}
                            />
                        </Field>
                    )}
                    {pick && node && node.cities.length > 1 && (
                        <Field label="시군">
                            <Multi
                                opts={node.cities.map((c) => ({ v: c.city, label: c.short }))}
                                value={cities.length ? cities : undefined}
                                onChange={(v) => setCities(v ?? [])}
                            />
                        </Field>
                    )}
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
                    <p className="text-[12.5px] leading-relaxed text-[#FFFFFF73] break-keep">
                        같은 지역은 20분에 한 번만 울리고, 밤 9시부터 아침 8시까지는 소리 없이 알림함에만 남겨요.
                    </p>
                </div>

                <div className="px-5 pt-3 shrink-0 border-t border-[#FFFFFF0F] flex gap-2" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                    {existing && (
                        <button type="button" onClick={onRemove} disabled={busy} className="h-12 px-4 rounded-xl bg-[#FFFFFF0F] text-[15px] font-medium text-[#FFFFFFB3] disabled:opacity-50">
                            {remove.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : "끄기"}
                        </button>
                    )}
                    <button type="button" onClick={onSave} disabled={busy || !pick} className="flex-1 h-12 rounded-xl bg-[#FFC43D] text-[#1F1500] text-[15px] font-semibold disabled:opacity-60 inline-flex items-center justify-center gap-2 active:bg-[#F0B22A]">
                        {save.isPending ? <LucideLoader2 className="w-5 h-5 animate-spin" /> : <LucideBellRing className="w-5 h-5" />}
                        {existing ? "조건 저장" : "알림 받기"}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

interface ButtonProps extends Scope {
    variant: "big" | "chip" | "row";
    /** "경기 조인" · "용인 부킹" · "전국 골프장" — 단추에 적는 말 */
    what: string;
    className?: string;
}

export function AreaAlertButton({ variant, what, className, ...scope }: ButtonProps) {
    const [, setLocation] = useLocation();
    const { member, isLoading } = useAuth();
    const mine = useMyAreaAlerts(!!member);
    const [open, setOpen] = useState(false);

    // 이 화면의 범위에 알림이 켜져 있나 — 지역 전체를 켰으면 그 안의 시군 화면도 켜진 것이다.
    const cityFull = fullCity(scope.regions, scope.region, scope.city);
    const on = !!member && (scope.region
        ? !!mine.data?.some((a) => a.region === scope.region && (!cityFull || !a.cities.length || a.cities.includes(cityFull)))
        : (mine.data?.length ?? 0) > 0);

    // 로그인하고 돌아온 사람 — 누르려던 시트를 이어서 연다. 표시는 지운다(새로고침하면 또 열리지 않게).
    useEffect(() => {
        if (isLoading || !member) return;
        const u = new URL(window.location.href);
        if (u.searchParams.get(RESUME) !== "1") return;
        u.searchParams.delete(RESUME);
        window.history.replaceState(window.history.state, "", u.pathname + u.search + u.hash);
        setOpen(true);
    }, [isLoading, member]);

    const press = () => {
        if (isLoading) return;
        if (!member) {
            const u = new URL(window.location.href); u.searchParams.set(RESUME, "1");
            goLogin(setLocation, u.pathname + u.search);
            return;
        }
        setOpen(true);
    };

    const sheet = <AreaAlertSheet open={open} onOpenChange={setOpen} mine={mine.data} {...scope} />;

    if (variant === "chip") {
        return (
            <>
                <button
                    type="button" onClick={press} aria-pressed={on}
                    className={cn(
                        "shrink-0 h-8 pl-2.5 pr-3 rounded-full inline-flex items-center gap-1 text-[13px] font-medium transition-colors",
                        on ? "bg-[#FFC43D1F] text-[#FFD266] ring-1 ring-inset ring-[#FFC43D4D]" : "bg-[#FFFFFF0F] text-[#FFFFFFCC] active:bg-[#FFFFFF1A]",
                        className,
                    )}
                >
                    <LucideBellRing weight={on ? "fill" : "regular"} className="w-4 h-4" />
                    {on ? "알림 켜짐" : "알림 받기"}
                </button>
                {sheet}
            </>
        );
    }

    if (variant === "row") {
        return (
            <>
                <button
                    type="button" onClick={press}
                    className={cn(
                        "w-full h-12 px-4 rounded-2xl flex items-center gap-2.5 text-left transition-colors",
                        on ? "bg-[#FFC43D14] ring-1 ring-inset ring-[#FFC43D4D] active:bg-[#FFC43D24]" : "bg-[#FFFFFF0A] active:bg-[#FFFFFF14]",
                        className,
                    )}
                >
                    <LucideBellRing weight={on ? "fill" : "regular"} className={cn("w-[18px] h-[18px] shrink-0", on ? "text-[#FFC43D]" : "text-[#FFFFFF99]")} />
                    <span className={cn("flex-1 min-w-0 truncate text-[14px]", on ? "text-[#FFD266] font-semibold" : "text-[#FFFFFFCC] font-medium")}>
                        {on ? `${what} 알림 켜짐` : `${what}에 새 티타임이 올라오면 알림 받기`}
                    </span>
                    <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF4D]" />
                </button>
                {sheet}
            </>
        );
    }

    return (
        <>
            {on ? (
                <button
                    type="button" onClick={press}
                    className={cn("w-full h-12 px-4 rounded-xl bg-[#FFC43D14] ring-1 ring-inset ring-[#FFC43D4D] flex items-center gap-2.5 text-left active:bg-[#FFC43D24]", className)}
                >
                    <span className="w-6 h-6 rounded-full bg-[#FFC43D] flex items-center justify-center shrink-0">
                        <LucideCheck weight="bold" className="w-3.5 h-3.5 text-[#1F1500]" />
                    </span>
                    <span className="flex-1 min-w-0 truncate text-[15px] font-semibold text-[#FFD266]">{what} 알림 켜짐</span>
                    <span className="text-[13px] text-[#FFFFFF80] flex items-center shrink-0">조건<LucideChevronRight weight="bold" className="w-3.5 h-3.5 ml-0.5" /></span>
                </button>
            ) : (
                <button
                    type="button" onClick={press}
                    className={cn("w-full h-12 rounded-xl bg-[#FFC43D] text-[#1F1500] text-[15px] font-semibold flex items-center justify-center gap-2 active:bg-[#F0B22A] transition-colors", className)}
                >
                    <LucideBellRing weight="fill" className="w-[18px] h-[18px]" />
                    {what} 알림 받기
                </button>
            )}
            {sheet}
        </>
    );
}
