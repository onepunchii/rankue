/**
 * 어드민 · 회원 한 명의 '활동 기록'(2026-10-12 오너: "어드민 대시보드에 회원 내역 나오잖아 — 그거 클릭하면 관리에 탭 하나 더 만들어 줘.
 * 일자별로 어떠한 클릭을 했고 활동을 했는지").
 *
 * 회원 상세 창 → 관리 → '활동 기록'. 날짜별로 언제 들어와 무엇을 보고 누르고 무엇을 했는지 한 줄씩 읽는다.
 * 묶는 규칙·글은 shared/memberActivity, 질의는 server storage/adminMemberActivity — 여기는 그리기만 한다.
 *
 * 알아 둘 것(화면에도 적는다): 본 화면과 누른 것은 **모으기 시작한 날부터만** 있다 — 웹 2026-10-08, 앱 2026-10-12(shared/uiTrail TRAIL_SINCE).
 * 채팅·크루·경기 중 화면은 화면 이동만 남는다. 접속·경기·글 같은 기록은 그 전 것도 나온다. 채팅은 건수만 — 내용은 서버가 읽지 않는다.
 *
 * 조회뿐이라 보기 전용 관리자도 본다(고치는 단추 없음). 닫으면 캐시에서 바로 지운다(gcTime 0 — 남의 활동이 기기에 남지 않게).
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { LucideRefreshCw } from "@/lib/icons";
import { FilterChips, SHEET_SAFE_TOP } from "./adminUtils";
import {
    ACTIVITY_DAYS, ACTIVITY_DEFAULT_DAYS, ACTIVITY_GROUPS, PLATFORM_LABEL, activityDayLabel,
    type ActivityDay, type ActivityGroup, type ActivityItem, type ActivityTone, type MemberActivity,
} from "@shared/memberActivity";
import { TRAIL_IN_APP, TRAIL_KEEP_DAYS, TRAIL_SINCE } from "@shared/uiTrail";

export const memberActivityKey = (id: string, days: number) => ["/api/hiq/admin/members", id, "activity", days] as const;

type Pick = "all" | ActivityGroup;
type DaysId = `${(typeof ACTIVITY_DAYS)[number]}`;
const DAY_OPTIONS = ACTIVITY_DAYS.map((d) => ({ id: String(d) as DaysId, label: `${d}일` }));
/** 하루에 먼저 보여 주는 줄 수 — 넘으면 '더 보기' */
const DAY_FOLD = 30;

const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
/** "2026-10-08" → "10/8" */
const md = (day: string) => `${Number(day.slice(5, 7))}/${Number(day.slice(8, 10))}`;
const hours = (min: number) => (min < 60 ? `${min}분` : `${Math.floor(min / 60)}시간${min % 60 ? ` ${min % 60}분` : ""}`);

const TEXT_TONE: Record<ActivityTone, string> = {
    strong: "text-black/85",
    win: "text-brand",
    lose: "text-black/70",
    warn: "text-amber-800",
    dim: "text-black/45",
};
/** 이름표 색 — 묶음으로 가른다(색이 곧 종류) */
const TAG_TONE: Record<ActivityGroup, string> = {
    visit: "bg-black/[0.07] text-black/70",
    trail: "bg-transparent text-black/45",
    game: "bg-brand/10 text-brand",
    sim: "bg-blue-500/10 text-blue-700",
    golf: "bg-emerald-500/10 text-emerald-700",
    social: "bg-amber-500/15 text-amber-800",
    etc: "bg-black/[0.05] text-black/55",
};

function Row({ item }: { item: ActivityItem }) {
    return (
        <li className="px-3 py-2 grid grid-cols-[38px_52px_1fr] gap-2 items-baseline">
            <span className="text-[12px] tabular-nums text-black/40">{item.at.slice(11, 16)}</span>
            <span className={`justify-self-start rounded px-1.5 py-px text-[11px] font-black ${TAG_TONE[item.group]}`}>{item.tag}</span>
            <span className="min-w-0 text-[13px] leading-snug break-keep [overflow-wrap:anywhere]">
                <span className={`${item.tone ? TEXT_TONE[item.tone] : "text-black/75"} ${item.tone === "strong" || item.tone === "win" ? "font-bold" : ""}`}>{item.text}</span>
                {item.sub && <span className="text-black/40"> · {item.sub}</span>}
            </span>
        </li>
    );
}

function DayCard({ day, pick }: { day: ActivityDay; pick: Pick }) {
    const [open, setOpen] = useState(false);
    const items = useMemo(() => (pick === "all" ? list<ActivityItem>(day.items) : list<ActivityItem>(day.items).filter((i) => i.group === pick)), [day.items, pick]);
    if (items.length === 0) return null;
    const shown = open ? items : items.slice(0, DAY_FOLD);
    const c = day.counts ?? {};
    // 그날의 한 줄 요약 — 들어온 횟수·쓴 시간이 먼저, 그 다음에 한 일
    const sum = [
        day.visits > 0 ? `접속 ${day.visits}번${day.minutes > 0 ? ` · ${hours(day.minutes)}` : ""}` : "접속 기록 없음",
        list<string>(day.platforms).map((p) => PLATFORM_LABEL[p] ?? p).join("·"),
        day.pages > 0 ? `화면 ${day.pages}` : "",
        day.clicks > 0 ? `누름 ${day.clicks}` : "",
        num(c.game) > 0 ? `경기 ${num(c.game)}` : "",
        num(c.sim) > 0 ? `온라인게임 ${num(c.sim)}` : "",
        num(c.golf) > 0 ? `골프 ${num(c.golf)}` : "",
        num(c.social) > 0 ? `글·채팅 ${num(c.social)}` : "",
    ].filter(Boolean);
    return (
        <section data-activity-day={day.day} className="rounded-2xl bg-white border border-black/[0.07] overflow-hidden">
            <header className="px-3 py-2.5 bg-black/[0.035] border-b border-black/[0.05]">
                <p className="text-[13.5px] font-black tabular-nums text-black/85">{activityDayLabel(day.day)}</p>
                <p className="mt-0.5 text-[12px] text-black/50 break-keep">{sum.join(" · ")}</p>
            </header>
            <ol className="divide-y divide-black/[0.05]">
                {shown.map((it, i) => <Row key={`${it.at}:${it.group}:${it.tag}:${i}`} item={it} />)}
            </ol>
            {items.length > DAY_FOLD && (
                <button type="button" onClick={() => setOpen((v) => !v)} className="w-full h-10 border-t border-black/[0.05] text-[12.5px] font-bold text-black/55 hover:bg-black/[0.02]">
                    {open ? "접기" : `나머지 ${items.length - DAY_FOLD}줄 더 보기`}
                </button>
            )}
        </section>
    );
}

export default function MemberActivitySheet({ member, onClose }: { member: { id: string; name: string } | null; onClose: () => void }) {
    const [days, setDays] = useState<DaysId>(String(ACTIVITY_DEFAULT_DAYS) as DaysId);
    const [pick, setPick] = useState<Pick>("all");
    // 다른 회원을 열면 처음 보기로
    useEffect(() => { setDays(String(ACTIVITY_DEFAULT_DAYS) as DaysId); setPick("all"); }, [member?.id]);

    const id = member?.id ?? "";
    const q = useQuery<MemberActivity>({
        queryKey: memberActivityKey(id, Number(days)),
        queryFn: () => apiRequest(`/api/hiq/admin/members/${id}/activity?days=${days}`),
        enabled: !!member, staleTime: 0, gcTime: 0,
    });
    const a = q.data;
    const dayList = list<ActivityDay>(a?.list);
    const t = a?.totals;

    // 묶음별 줄 수 — 거르기 칩 옆 숫자. 없는 묶음의 칩은 내지 않는다
    const chips = useMemo(() => {
        const n: Partial<Record<ActivityGroup, number>> = {};
        let total = 0;
        for (const d of dayList) for (const it of list<ActivityItem>(d.items)) { n[it.group] = (n[it.group] ?? 0) + 1; total += 1; }
        return [{ id: "all" as Pick, label: "전체", count: total }, ...ACTIVITY_GROUPS.filter((g) => num(n[g.id]) > 0).map((g) => ({ id: g.id as Pick, label: g.label, count: num(n[g.id]) }))];
    }, [dayList]);
    // 고른 묶음이 이 기간에 없으면 전체로
    useEffect(() => { if (pick !== "all" && !chips.some((c) => c.id === pick)) setPick("all"); }, [chips, pick]);

    const visibleDays = pick === "all" ? dayList : dayList.filter((d) => list<ActivityItem>(d.items).some((i) => i.group === pick));

    return (
        <Sheet open={!!member} onOpenChange={(o) => { if (!o) onClose(); }}>
            {/* 창은 스크롤하지 않고 아래 목록만 스크롤한다 — 창 전체가 스크롤이면 붙는 머리줄이 닫기(X) 단추를 덮는다(폰에서는 창이 화면을 다 덮어 닫을 길이 없어진다) */}
            <SheetContent side="right" style={SHEET_SAFE_TOP} className="w-full sm:max-w-lg p-0 flex flex-col gap-0 bg-white">
                <div className="shrink-0 border-b border-black/[0.08] px-4 pt-3.5 pb-3">
                    <div className="flex items-start justify-between gap-3 pr-9">
                        <div className="min-w-0">
                            <SheetTitle className="text-[15px] font-black text-black/85 truncate">{member?.name ?? ""} 활동 기록</SheetTitle>
                            <SheetDescription className="mt-0.5 text-[12px] text-black/45">
                                날짜별 · 한국 시각{a?.from ? ` · ${a.from.slice(5).replace("-", ".")}부터` : ""}
                            </SheetDescription>
                        </div>
                        <button type="button" onClick={() => void q.refetch()} className="shrink-0 mt-0.5 flex items-center gap-1 text-[12px] text-black/45 hover:text-brand" aria-label="새로고침">
                            <LucideRefreshCw className={`w-3.5 h-3.5 ${q.isFetching ? "animate-spin" : ""}`} />새로고침
                        </button>
                    </div>
                    <div className="mt-2.5 space-y-2">
                        <FilterChips value={days} onChange={setDays} options={DAY_OPTIONS} />
                        {chips.length > 2 && <FilterChips value={pick} onChange={setPick} options={chips} />}
                    </div>
                </div>

                <div data-activity-scroll className="flex-1 min-h-0 overflow-y-auto bg-[#F7F7F5] p-3 space-y-3">
                    {q.isLoading && <p className="p-8 text-center text-[13px] text-black/40">활동 기록 불러오는 중…</p>}
                    {q.isError && (
                        <div className="p-8 text-center">
                            <p className="text-[13px] text-black/45">불러오지 못했습니다.</p>
                            <button type="button" onClick={() => void q.refetch()} className="mt-2 h-9 px-4 rounded-full bg-black/[0.06] text-[12.5px] font-bold text-black/65">다시 시도</button>
                        </div>
                    )}

                    {a && t && (
                        <>
                            <div data-activity-totals className="grid grid-cols-4 gap-1.5">
                                {([
                                    ["활동한 날", `${num(t.activeDays)}일`],
                                    ["접속", `${num(t.visits)}번`],
                                    ["쓴 시간", hours(num(t.minutes))],
                                    ["누름", `${num(t.clicks)}번`],
                                ] as const).map(([label, value]) => (
                                    <div key={label} className="rounded-xl bg-white border border-black/[0.07] px-2 py-2.5 text-center">
                                        <p className="text-[11px] font-bold text-black/45">{label}</p>
                                        <p className="mt-0.5 text-[14px] font-black tabular-nums text-black/85">{value}</p>
                                    </div>
                                ))}
                            </div>

                            <p data-activity-note className="rounded-xl bg-white border border-black/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-black/50 break-keep">
                                <b className="font-black text-black/65">본 화면과 누른 것은 {TRAIL_IN_APP ? `웹 ${md(TRAIL_SINCE.web)} · 앱 ${md(TRAIL_SINCE.app)}부터 남습니다` : "웹에서 쓴 것만 남습니다"}</b>({TRAIL_KEEP_DAYS}일 보관).
                                {" "}채팅 · 크루 · 경기 중 화면은 화면 이동만 남고 누른 것은 남기지 않습니다.
                                접속 · 경기 · 온라인게임 · 골프 · 글은 그 전 것도 나옵니다. 채팅은 보낸 건수만 세고 내용은 읽지 않습니다.
                            </p>

                            {list<ActivityGroup>(a.capped).length > 0 && (
                                <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[12px] text-amber-800 break-keep">기록이 많아 오래된 일부는 빠졌습니다. 기간을 줄이면 다 보입니다.</p>
                            )}

                            {visibleDays.length === 0
                                ? <p className="p-8 text-center text-[13px] text-black/40">이 기간에 남은 활동이 없습니다.</p>
                                : visibleDays.map((d) => <DayCard key={d.day} day={d} pick={pick} />)}
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
