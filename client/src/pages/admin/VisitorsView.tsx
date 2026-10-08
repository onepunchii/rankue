/**
 * 어드민 · 방문자 발자국(2026-10-08 오너: "[폴리] 어드민 보면 방문자 발자국 만들어 놓은 것처럼 우리 랭큐도 접목해 줘")
 * 가입하지 않은 사람이 어디로 들어와 무엇을 보고 무엇을 누르고 어디서 나가는지. 서버: /api/hiq/admin/visitors/*
 *
 * 화면이 답하는 순서: ① 몇 명이 왔나 → ② 가입까지 갔나 → ③ 어디로 들어왔나 · 어디서 왔나 → ④ 무엇을 봤나 · 어디서 나갔나 → ⑤ 무엇을 눌렀나.
 * 아래 목록에서 한 사람을 누르면 그 사람의 발자국이 시간순으로 열린다.
 *
 *  · 사람 = 브라우저 하나(난수 ID). 같은 사람이 폰·PC 로 오면 둘로 센다. 이름·IP 는 모으지 않는다(로그인한 사람만 회원 이름이 붙는다).
 *  · 주소는 화면 종류로 묶었다("/golf/course/…"). 낱개 주소는 한 사람의 발자국에서 본다.
 *  · 웹으로 온 사람만이다 — 앱 안의 움직임은 모으지 않는다(shared/uiTrail TRAIL_IN_APP). 채팅·경기 중 화면은 화면 이동만 남는다.
 *  · 자료는 2026-10-08 부터 쌓이고 60일이 지나면 지운다.
 *  · 회원 이름이 들어 있어 캐시에 남기지 않는다(gcTime 0 — localStorage 스냅샷에도 안 남는다).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { apiRequest } from "@/lib/queryClient";
import { LucideRefreshCw } from "@/lib/icons";
import { TRAIL_KEEP_DAYS, pageKind } from "@shared/uiTrail";
import { EmptyState, FilterChips, KpiTile, Panel, Pill } from "./adminUtils";

type Who = "guest" | "member" | "all";
type Days = "1" | "7" | "30";
interface Summary {
    days: number; who: Who;
    totals: { visitors: number; members: number; guests: number; picked: number; pv: number; one: number; more: number; clicked: number; opened: number; stay: number; cameGuest: number; guestMore: number; guestOpened: number; guestJoined: number };
    pages: { kind: string; views: number; people: number }[];
    clicks: { label: string; kind: string; to: string | null; n: number; people: number }[];
    entries: { kind: string; n: number }[]; exits: { kind: string; n: number }[];
    hourly: number[]; refs: { ref: string; n: number }[]; signups: number;
    daily: { d: string; guests: number; members: number }[];
}
interface Visitor { visitor: string; member: boolean; memberId: string | null; name: string | null; pages: number; clicks: number; opened: boolean; firstAt: string; lastAt: string; stay: number; entry: string | null; exit: string | null; ref: string | null; device: string | null }
interface Trail { visitor: string; firstDay: string | null; events: { id: number; name: string; path: string | null; meta: Record<string, unknown> | null; at: string; member: boolean }[] }

const BASE = "/api/hiq/admin/visitors";
const WHO: { id: Who; label: string }[] = [{ id: "guest", label: "비회원" }, { id: "member", label: "회원" }, { id: "all", label: "전체" }];
const DAYS: { id: Days; label: string }[] = [{ id: "1", label: "오늘" }, { id: "7", label: "7일" }, { id: "30", label: "30일" }];
const hm = (s: string) => s.slice(11, 16);
const md = (s: string) => `${Number(s.slice(5, 7))}/${Number(s.slice(8, 10))}`;
const dur = (sec: number) => (sec < 60 ? `${sec}초` : sec < 3600 ? `${Math.round(sec / 60)}분` : `${(sec / 3600).toFixed(1)}시간`);
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const show = (p: string | null | undefined) => { try { return decodeURIComponent(p ?? ""); } catch { return p ?? ""; } };
const list = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** 가로 막대 목록 — 가장 큰 값에 맞춘 길이 */
function Bars({ rows, unit }: { rows: { label: string; value: number; sub?: string }[]; unit: string }) {
    if (rows.length === 0) return <p className="px-4 py-6 text-center text-[13px] text-black/40">아직 쌓인 것이 없습니다.</p>;
    const max = Math.max(1, ...rows.map((r) => r.value));
    return (
        <ul className="divide-y divide-black/[0.05]">
            {rows.map((r, i) => (
                <li key={`${r.label}|${r.sub ?? ""}|${i}`} className="px-4 py-2.5">
                    <p className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0 text-[13px] font-bold text-black/80 break-all">{r.label}</span>
                        <span className="shrink-0 text-[13px] font-black tabular-nums">{r.value.toLocaleString()}<span className="ml-0.5 text-[11.5px] font-bold text-black/40">{unit}</span></span>
                    </p>
                    {r.sub && <p className="text-[12px] text-black/45 break-all">{r.sub}</p>}
                    <span className="mt-1.5 block h-1.5 rounded-full bg-black/[0.05]"><span className="block h-full rounded-full bg-brand/60" style={{ width: `${Math.max((r.value / max) * 100, 1.5)}%` }} /></span>
                </li>
            ))}
        </ul>
    );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
    return (
        <Panel className="overflow-hidden">
            <div className="px-4 pt-3.5 pb-2.5 border-b border-black/[0.06]">
                <p className="text-[13px] font-bold text-black/70">{title}</p>
                {note && <p className="mt-0.5 text-[12px] text-black/40 break-keep">{note}</p>}
            </div>
            {children}
        </Panel>
    );
}

function HourBars({ hourly }: { hourly: number[] }) {
    const max = Math.max(1, ...hourly);
    const nowH = new Date(Date.now() + 9 * 3600_000).getUTCHours();
    return (
        <div className="p-4">
            <div className="flex items-end gap-[3px] h-20" role="img" aria-label="시간대별 방문자 수">
                {hourly.map((n, h) => (
                    <div key={h} className="flex-1 flex flex-col items-center justify-end h-full" title={`${h}시 · ${n}명`}>
                        <div className={`w-full rounded-t-[3px] ${h === nowH ? "bg-brand" : h > nowH ? "bg-black/[0.04]" : n > 0 ? "bg-brand/35" : "bg-black/[0.06]"}`}
                            style={{ height: `${h > nowH ? 4 : Math.max(4, (n / max) * 100)}%` }} />
                    </div>
                ))}
            </div>
            <div className="mt-1 flex justify-between text-[10.5px] text-black/35 tabular-nums"><span>0시</span><span>6시</span><span>12시</span><span>18시</span><span>23시</span></div>
        </div>
    );
}

/** 가입까지 — 비회원으로 온 사람이 어디까지 갔나. 막대는 첫 줄에 맞춘 길이 */
function Funnel({ t, signups }: { t: Summary["totals"]; signups: number }) {
    const steps: [string, number][] = [
        ["비회원으로 온 사람", num(t.cameGuest)],
        ["두 장 넘게 본 사람", num(t.guestMore)],
        ["가입 창을 연 사람", num(t.guestOpened)],
        ["로그인·가입까지 간 사람", num(t.guestJoined)],
    ];
    const top = Math.max(1, steps[0][1]);
    return (
        <div className="p-4">
            <ol className="space-y-2.5">
                {steps.map(([k, v], i) => (
                    <li key={k} className="grid grid-cols-[1fr_auto] items-center gap-3">
                        <span className="min-w-0">
                            <span className="block text-[13px] font-bold text-black/75">{k}{i > 0 && <span className="ml-1.5 font-medium text-black/35">{pct(v, top)}%</span>}</span>
                            <span className="mt-1 block h-2.5 rounded-full bg-black/[0.05] overflow-hidden"><span className={`block h-full rounded-full ${i === steps.length - 1 ? "bg-emerald-500" : "bg-brand/70"}`} style={{ width: `${Math.min(100, v > 0 ? Math.max(pct(v, top), 2) : 0)}%` }} /></span>
                        </span>
                        <span className="text-[15px] font-black tabular-nums">{v.toLocaleString()}</span>
                    </li>
                ))}
            </ol>
            <p className="mt-3 text-[12px] leading-relaxed text-black/40 break-keep">
                같은 브라우저에서 이어진 것만 셉니다. 마지막 줄은 그 브라우저에서 로그인한 사람이라 예전 회원이 새 기기로 로그인한 것도 들어갑니다.
                같은 기간 새로 가입한 회원은 <b className="text-black/60">{signups.toLocaleString()}명</b>입니다(앱에서 가입한 사람 포함).
            </p>
        </div>
    );
}

export default function VisitorsView({ onOpenMember }: { onOpenMember?: (id: string) => void }) {
    const [who, setWho] = useState<Who>("guest");
    const [days, setDays] = useState<Days>("1");
    const [open, setOpen] = useState<string | null>(null);
    const qs = `days=${days}&who=${who}`;
    const sum = useQuery<Summary>({ queryKey: [BASE, "summary", qs], queryFn: () => apiRequest(`${BASE}/summary?${qs}`), refetchInterval: 60_000, staleTime: 0, gcTime: 0 });
    const rows = useQuery<Visitor[]>({ queryKey: [BASE, "list", qs], queryFn: () => apiRequest(`${BASE}/list?${qs}`), refetchInterval: 60_000, staleTime: 0, gcTime: 0 });
    const trail = useQuery<Trail>({ queryKey: [BASE, "trail", open], queryFn: () => apiRequest(`${BASE}/trail/${encodeURIComponent(open!)}`), enabled: !!open, staleTime: 0, gcTime: 0 });

    const s = sum.data, t = s?.totals;
    const ok = !!s && !!t && Array.isArray(s.hourly);
    const label = who === "guest" ? "비회원" : who === "member" ? "회원" : "방문자";
    const visitors = list<Visitor>(rows.data);
    const opened = visitors.find((v) => v.visitor === open) ?? null;
    const events = list<Trail["events"][number]>(trail.data?.events);

    return (
        <div className="space-y-3">
            <Panel className="p-4">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[15px] font-black text-black/85">방문자 발자국</p>
                        <p className="mt-1 text-[12.5px] leading-relaxed text-black/50 break-keep">
                            웹으로 온 사람이 어디로 들어와 무엇을 보고 무엇을 누르는지 봅니다. 사람은 브라우저 하나이고, 이름·IP 는 모으지 않습니다.
                            앱 안의 움직임은 모으지 않고, 채팅·경기 중 화면은 화면 이동만 남습니다. {TRAIL_KEEP_DAYS}일이 지나면 지웁니다.
                        </p>
                    </div>
                    <button onClick={() => { void sum.refetch(); void rows.refetch(); }} className="shrink-0 flex items-center gap-1 text-[12px] text-black/45 hover:text-brand" aria-label="새로고침">
                        <LucideRefreshCw className={`w-3.5 h-3.5 ${sum.isFetching ? "animate-spin" : ""}`} />새로고침
                    </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2">
                    <FilterChips value={who} onChange={setWho} options={WHO} />
                    <FilterChips value={days} onChange={setDays} options={DAYS} />
                </div>
            </Panel>

            {sum.isLoading && <EmptyState>방문자 발자국 불러오는 중…</EmptyState>}
            {!sum.isLoading && !ok && <EmptyState>불러오지 못했습니다. 잠시 뒤 다시 열어 주세요.</EmptyState>}
            {ok && t && s && (
                <>
                    {num(t.visitors) === 0 && (
                        <Panel className="px-4 py-3 text-[13px] text-black/60 break-keep">
                            아직 쌓인 발자국이 없습니다. 수집은 2026-10-08 에 켜졌고, 방문자가 화면을 5초 넘게 보면 20초 안에 올라오기 시작합니다.
                        </Panel>
                    )}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <KpiTile label={`${label} 수`} value={num(t.picked).toLocaleString()} unit="명" tone="brand" sub={`비회원 ${num(t.guests).toLocaleString()} · 회원 ${num(t.members).toLocaleString()}`} />
                        <KpiTile label="본 화면" value={num(t.pv).toLocaleString()} unit="장" sub={num(t.picked) ? `한 사람당 ${(num(t.pv) / num(t.picked)).toFixed(1)}장` : undefined} />
                        <KpiTile label="한 장만 보고 나감" value={pct(num(t.one), num(t.picked))} unit="%" tone={pct(num(t.one), num(t.picked)) >= 70 ? "alert" : "default"} sub={`${num(t.one).toLocaleString()}명`} />
                        <KpiTile label="무언가 누른 사람" value={pct(num(t.clicked), num(t.picked))} unit="%" sub={num(t.stay) ? `2장 넘게 본 사람 평균 ${dur(num(t.stay))}` : `${num(t.clicked).toLocaleString()}명`} />
                    </div>

                    <div className="grid gap-3 lg:grid-cols-2">
                        <Section title="가입까지" note="고른 기간에 비회원으로 온 사람 기준(위의 '누구' 거르기와 무관)"><Funnel t={t} signups={num(s.signups)} /></Section>
                        <Section title="오늘 시간대별" note="한국 시각 · 사람 수"><HourBars hourly={s.hourly.map(num)} /></Section>
                    </div>

                    {list<Summary["daily"][number]>(s.daily).length > 1 && (
                        <Section title="날짜별 방문자" note="비회원 · 회원(그날 로그인한 채로 본 사람)">
                            <Bars unit="명" rows={list<Summary["daily"][number]>(s.daily).slice().reverse().map((d) => ({ label: d.d, value: num(d.guests) + num(d.members), sub: `비회원 ${num(d.guests).toLocaleString()} · 회원 ${num(d.members).toLocaleString()}` }))} />
                        </Section>
                    )}

                    <div className="grid gap-3 lg:grid-cols-2">
                        <Section title="어디로 들어왔나" note="첫 화면"><Bars unit="명" rows={list<Summary["entries"][number]>(s.entries).map((e) => ({ label: e.kind, value: num(e.n) }))} /></Section>
                        <Section title="어디서 왔나" note="유입처(호스트). 주소를 직접 치거나 앱·메신저에서 열면 '(직접·앱)'"><Bars unit="명" rows={list<Summary["refs"][number]>(s.refs).map((r) => ({ label: r.ref, value: num(r.n) }))} /></Section>
                        <Section title="많이 본 화면"><Bars unit="회" rows={list<Summary["pages"][number]>(s.pages).map((p) => ({ label: p.kind, value: num(p.views), sub: `${num(p.people).toLocaleString()}명` }))} /></Section>
                        <Section title="어디서 나갔나" note="마지막 화면"><Bars unit="명" rows={list<Summary["exits"][number]>(s.exits).map((e) => ({ label: e.kind, value: num(e.n) }))} /></Section>
                    </div>

                    <Section title="많이 누른 것" note="단추·링크의 글자 → 간 곳. 숫자뿐인 단추와 입력칸은 남기지 않습니다">
                        <Bars unit="회" rows={list<Summary["clicks"][number]>(s.clicks).map((c) => ({ label: c.label, value: num(c.n), sub: `${c.kind}${c.to ? ` → ${c.to}` : ""} · ${num(c.people).toLocaleString()}명` }))} />
                    </Section>

                    <Section title={`최근 ${label} — 누르면 발자국`} note="마지막 활동 순 · 200명까지">
                        {rows.isLoading ? <p className="px-4 py-6 text-center text-[13px] text-black/40">불러오는 중…</p>
                            : visitors.length === 0 ? <p className="px-4 py-6 text-center text-[13px] text-black/40">아직 없습니다.</p>
                                : (
                                    <ul className="divide-y divide-black/[0.05]">
                                        {visitors.map((v) => (
                                            <li key={v.visitor}>
                                                <button type="button" onClick={() => setOpen(v.visitor)} className="w-full text-left px-4 py-3 hover:bg-black/[0.02] active:bg-black/[0.04]">
                                                    <p className="flex flex-wrap items-center gap-1.5">
                                                        <span className="text-[13px] font-black tabular-nums text-black/80">{md(v.lastAt)} {hm(v.lastAt)}</span>
                                                        {v.member ? <Pill tone="brand">{v.name ?? "회원"}</Pill> : <Pill>비회원</Pill>}
                                                        {v.device && <Pill>{v.device === "m" ? "폰" : "PC"}</Pill>}
                                                        {v.ref && <Pill tone="info">{v.ref}</Pill>}
                                                        {v.opened && <Pill tone="warn">가입 창</Pill>}
                                                        <span className="ml-auto text-[12px] text-black/45 tabular-nums">{v.pages}장 · {v.clicks}번 누름{v.stay > 0 ? ` · ${dur(v.stay)}` : ""}</span>
                                                    </p>
                                                    <p className="mt-1 text-[12.5px] text-black/50 break-all">
                                                        {show(v.entry)}{v.pages > 1 && v.exit !== v.entry ? <> <span aria-hidden>→ … →</span> {show(v.exit)}</> : null}
                                                    </p>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                    </Section>
                </>
            )}

            <Sheet open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
                <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto bg-[#F7F7F5] p-0">
                    <div className="sticky top-0 z-10 bg-white border-b border-black/[0.08] px-4 py-3.5 pr-12">
                        <SheetTitle className="text-[15px] font-black text-black/85">한 사람의 발자국</SheetTitle>
                        <SheetDescription className="mt-0.5 text-[12px] text-black/45">
                            {open ? `${open.slice(0, 8)}…` : ""}{trail.data?.firstDay ? ` · 처음 온 날 ${trail.data.firstDay}` : ""} · 최근 30일 {events.length}줄
                        </SheetDescription>
                        {opened?.member && opened.memberId && onOpenMember && (
                            <button type="button" onClick={() => { const id = opened.memberId!; setOpen(null); onOpenMember(id); }} className="mt-2 h-8 px-3 rounded-full bg-brand/10 text-brand text-[12.5px] font-bold">
                                {opened.name ?? "회원"} 회원 정보 보기
                            </button>
                        )}
                    </div>
                    <div className="p-3">
                        {trail.isLoading && <p className="p-6 text-center text-[13px] text-black/40">불러오는 중…</p>}
                        {trail.isError && <p className="p-6 text-center text-[13px] text-black/40">불러오지 못했습니다.</p>}
                        {events.length > 0 && (
                            <ol className="rounded-2xl bg-white border border-black/[0.07] overflow-hidden divide-y divide-black/[0.05]">
                                {events.map((e, i) => {
                                    const newDay = i === 0 || events[i - 1].at.slice(0, 10) !== e.at.slice(0, 10);
                                    const m = e.meta ?? {};
                                    return (
                                        <li key={e.id}>
                                            {newDay && <p className="px-3 py-1.5 bg-black/[0.04] text-[12px] font-black tabular-nums text-black/60">{e.at.slice(0, 10)}</p>}
                                            <div className="px-3 py-2 grid grid-cols-[40px_44px_1fr] gap-2 items-baseline">
                                                <span className="text-[12px] tabular-nums text-black/40">{hm(e.at)}</span>
                                                <span className={`text-[11.5px] font-black ${e.name === "page" ? "text-black/75" : e.name === "open" ? "text-amber-700" : "text-black/40"}`}>
                                                    {e.name === "page" ? "화면" : e.name === "click" ? "누름" : e.name === "scroll" ? "스크롤" : e.name === "open" ? "열림" : e.name}
                                                </span>
                                                <span className="min-w-0 text-[13px] text-black/80 break-all">
                                                    {e.name === "page" && <b title={pageKind(e.path)}>{show(e.path)}</b>}
                                                    {e.name === "page" && typeof m.ref === "string" && <span className="text-black/40"> · {m.ref}에서</span>}
                                                    {e.name === "click" && <>“{String(m.l ?? "")}”{typeof m.h === "string" && <span className="text-black/45"> → {show(m.h)}</span>}</>}
                                                    {e.name === "scroll" && <span className="text-black/45">{String(m.d ?? "")}%까지 내림</span>}
                                                    {e.name === "open" && <span className="text-amber-800">{String(m.l ?? "")}</span>}
                                                </span>
                                            </div>
                                        </li>
                                    );
                                })}
                            </ol>
                        )}
                        {!trail.isLoading && !trail.isError && events.length === 0 && open && <p className="p-6 text-center text-[13px] text-black/40">최근 30일 발자국이 없습니다.</p>}
                    </div>
                </SheetContent>
            </Sheet>
        </div>
    );
}
