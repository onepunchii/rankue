/**
 * /hiking/visited — 다녀온 산 한 번에 고르기(2026-11-04 오너: "다녀온 산 한 번에 고르기 진행"). 규칙과 글은 shared/hikingVisited.
 *
 * 위에서부터: 100대 명산 중 몇 곳(고를 때마다 숫자와 띠가 늘어난다) → 권역 칩 → 와펜 판(누르면 제 색 + 표시) → 다른 산 이름으로 찾기 → 고른 다른 산.
 * 바닥 줄: 회원은 'N곳 도장첩에 남기기'(POST /summits/record-many — 흐린 도장), 방문자는 '가입하고 N곳 남기기'(고른 것을 기기에 적고 가입 팝업,
 * 가입하고 이 화면으로 돌아오면 남긴다). 이미 남긴 산은 '인증' · '기록'으로 잠겨 있다. 와펜 판의 누름은 발자국에 남기지 않는다(data-notrack — 백 번 눌린다).
 * 하단 탭은 그리지 않는다 — 고르고 남기는 데만 쓰는 화면이다. 검색에는 싣지 않는다(noindex).
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useSeo } from "@/hooks/useSeo";
import { goLoginPage } from "@/components/hiq/LoginGate";
import { openLoginSheet } from "@/components/hiq/LoginSheet";
import { LucideX } from "@/lib/icons";
import { HIKING_REGIONS, heightText, hikingRegion, mountainLabel, mountainPlace } from "@shared/hikingMountains";
import { HIKING_VISITED_PATH, VISITED_AFTER_LOGIN_KEY, VISITED_LABEL as L, VISITED_MAX, visitedAfterLoginRead, visitedAfterLoginRecord, visitedLoginAsk } from "@shared/hikingVisited";
import { HikingShell, HkSkel } from "../components/HikingShell";
import { MountainPatch } from "../stamps/MountainPatch";
import { HIKING_STAMPS_PATH } from "../stamps/StampParts";
import { MY_STAMPS_KEY, useHikingStamps } from "../stamps/useHikingStamps";
import { HIKING_HUB_KEY, mountainsKey, type HikingHubData, type MountainSummary } from "../lib/api";

const Check = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="#2A1208" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

export default function VisitedPage() {
    const search = useSearch();
    const [, setLocation] = useLocation();
    const qc = useQueryClient();
    const { member, isLoading: authLoading } = useAuth();
    const my = useHikingStamps();
    useSeo({ title: `${L.title} | 랭큐 등산`, description: L.sub, path: HIKING_VISITED_PATH, noindex: true });
    const hub = useQuery<HikingHubData>({ queryKey: HIKING_HUB_KEY, staleTime: 10 * 60_000 });
    const kfs = useMemo(() => (hub.data?.famous ?? []).filter((m) => m.lists.includes("kfs100")).sort((a, b) => (a.kfsNo ?? 999) - (b.kfsNo ?? 999)), [hub.data]);
    const [region, setRegion] = useState<string | null>(() => hikingRegion(new URLSearchParams(search).get("region"))?.id ?? null);
    // 이미 남긴 산 — 인증이면 true, 기록이면 false
    const had = useMemo(() => new Map(my.member ? my.stamps.map((s) => [s.mountainId, s.verified] as const) : []), [my.member, my.stamps]);
    const [picked, setPicked] = useState<ReadonlyMap<string, MountainSummary>>(new Map());
    const [result, setResult] = useState<number | null>(null);

    const save = useMutation({
        mutationFn: (ids: string[]) => apiRequest("/api/hiq/hiking/summits/record-many", { method: "POST", body: JSON.stringify({ mountainIds: ids }) }) as Promise<{ added: number }>,
        onSuccess: (r) => {
            setResult(Number(r?.added) || 0);
            setPicked(new Map());
            void qc.invalidateQueries({ queryKey: MY_STAMPS_KEY });
            window.scrollTo(0, 0);
        },
    });

    // 가입하고 돌아왔으면 — 방문자 때 고른 것을 남긴다(한 번만). 적어 둔 것은 읽자마자 지운다
    const resumed = useRef(false);
    useEffect(() => {
        if (!my.member || resumed.current) return;
        let raw: string | null = null;
        try { raw = localStorage.getItem(VISITED_AFTER_LOGIN_KEY); } catch { return; }
        if (!raw) return;
        resumed.current = true;
        try { localStorage.removeItem(VISITED_AFTER_LOGIN_KEY); } catch { /* 오래되면 버려진다 */ }
        const ids = visitedAfterLoginRead(raw, Date.now());
        if (ids) save.mutate(ids);
    }, [my.member, save.mutate]);

    const toggle = (m: MountainSummary) => {
        if (had.has(m.id)) return;
        setResult(null);
        setPicked((prev) => {
            const next = new Map(prev);
            if (next.has(m.id)) next.delete(m.id);
            else if (next.size < VISITED_MAX) next.set(m.id, m);
            return next;
        });
    };

    // 다른 산 — 이름으로(잠깐 멈췄을 때 묻는다)
    const [q, setQ] = useState("");
    const [term, setTerm] = useState("");
    useEffect(() => { const t = setTimeout(() => setTerm(q.trim().slice(0, 30)), 250); return () => clearTimeout(t); }, [q]);
    const found = useQuery<{ total: number; items: MountainSummary[] }>({ queryKey: mountainsKey({ q: term }), enabled: term.length > 0, staleTime: 60_000 });
    const others = [...picked.values()].filter((m) => !m.lists.includes("kfs100"));

    const n = picked.size;
    const kfsHad = kfs.filter((m) => had.has(m.id)).length;
    const kfsPicked = kfs.filter((m) => picked.has(m.id)).length;
    const kfsNow = kfsHad + kfsPicked;
    const grid = region ? kfs.filter((m) => m.region === region) : kfs;
    const guest = !authLoading && !member;

    const submit = () => {
        if (!n || save.isPending) return;
        const ids = [...picked.keys()];
        if (my.member) { save.mutate(ids); return; }
        try { localStorage.setItem(VISITED_AFTER_LOGIN_KEY, visitedAfterLoginRecord(ids, Date.now())); } catch { /* 적지 못해도 가입은 이어진다 */ }
        if (!openLoginSheet(visitedLoginAsk(n))) goLoginPage(setLocation);
    };
    const bar = (
        <div className="mx-auto flex max-w-[688px] items-center gap-3">
            <button type="button" onClick={submit} disabled={!n || save.isPending} data-track-as={my.member ? "hiking-visited-save" : "hiking-join-visited"} data-testid="visited-save"
                className="h-12 min-w-0 flex-1 truncate rounded-xl bg-[#F28C6A] px-3 text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59] disabled:bg-[#FFFFFF1F] disabled:text-[#F4EFE399]">
                {save.isPending ? L.saving : !n ? L.pickFirst : my.member ? L.save(n) : L.join(n)}
            </button>
        </div>
    );

    return (
        <HikingShell title={L.title} nav={false} cta={null} bar={guest ? bar : undefined}>
            <div data-testid="visited-page">
                {/* 남긴 뒤 */}
                {result != null && (
                    <div className="mx-5 mt-4 rounded-2xl bg-[#F4EFE3] p-4 text-[#0E2A33]" role="status" data-testid="visited-done" data-added={result}>
                        <p className="text-[17px] font-semibold break-keep">{L.done(result)}</p>
                        <p className="mt-1 text-[13.5px] leading-snug text-[#0E2A33B3] break-keep">{L.doneSub}</p>
                        <div className="mt-3 flex gap-2">
                            <Link href={HIKING_STAMPS_PATH} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-[#0E2A33] text-[14.5px] font-semibold text-[#F4EFE3] active:bg-[#16404D]" data-track-as="hiking-visited-book">도장첩 보기</Link>
                            <button type="button" onClick={() => setResult(null)} className="h-11 flex-1 rounded-xl bg-[#0E2A3314] text-[14.5px] text-[#0E2A33] active:bg-[#0E2A3324]">더 고르기</button>
                        </div>
                    </div>
                )}

                {/* 머리 — 100대 명산 중 몇 곳 */}
                <div className="px-5 pt-5">
                    <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{L.lead}</h1>
                    <p className="mt-1.5 text-[13.5px] leading-snug text-[#F4EFE3B3] break-keep">{L.sub}</p>
                    <div className="mt-4 rounded-2xl px-4 py-3.5" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="visited-count" data-count={kfsNow}>
                        <div className="flex items-baseline justify-between gap-2">
                            <span className="text-[13.5px] text-[#F4EFE3CC]">{L.kfs}</span>
                            <span className="tabular-nums"><span className="text-[26px] font-semibold leading-none text-[#F4EFE3]">{kfsNow}</span><span className="text-[14px] text-[#F4EFE399]"> / {kfs.length || 100}</span></span>
                        </div>
                        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#FFFFFF1F]">
                            <div className="h-full rounded-full bg-[#F28C6A] transition-[width] duration-300" style={{ width: `${Math.round((kfsNow / Math.max(1, kfs.length || 100)) * 100)}%` }} />
                        </div>
                        {(kfsHad > 0 || others.length > 0) && (
                            <p className="mt-2 text-[12.5px] tabular-nums text-[#F4EFE399]">{[kfsHad ? `${L.had} ${kfsHad}` : "", kfsPicked ? `새로 고른 산 ${kfsPicked}` : "", others.length ? `${L.others} ${others.length}` : ""].filter(Boolean).join(" · ")}</p>
                        )}
                    </div>
                </div>

                {/* 권역 칩 */}
                <div className="-mx-0 mt-4 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="권역 고르기">
                    {[{ id: null as string | null, name: "전국" }, ...HIKING_REGIONS.map((r) => ({ id: r.id as string | null, name: r.name }))].map((r) => {
                        const on = region === r.id;
                        const inR = r.id ? kfs.filter((m) => m.region === r.id) : kfs;
                        const got = inR.filter((m) => had.has(m.id) || picked.has(m.id)).length;
                        return (
                            <button key={r.id ?? "all"} type="button" onClick={() => setRegion(r.id)} aria-pressed={on} data-testid={`visited-region-${r.id ?? "all"}`}
                                className="flex h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px]" style={{ background: on ? "#F28C6A" : "#FFFFFF14", color: on ? "#2A1208" : "#F4EFE3", fontWeight: on ? 600 : 400 }}>
                                {r.name}{got > 0 && <span className="tabular-nums text-[12.5px]" style={{ color: on ? "#2A1208" : "#F6D9A8" }}>{got}</span>}
                            </button>
                        );
                    })}
                </div>

                {/* 와펜 판 */}
                <div className="px-5 pt-3">
                    {hub.isLoading || my.isLoading ? (
                        <HkSkel className="h-[420px]" />
                    ) : (
                        <ul className="grid grid-cols-4 gap-x-2 gap-y-3" data-testid="visited-grid">
                            {grid.map((m) => {
                                const h = had.get(m.id);
                                const on = picked.has(m.id);
                                return (
                                    <li key={m.id}>
                                        <button type="button" data-notrack onClick={() => toggle(m)} aria-pressed={on || h !== undefined} disabled={h !== undefined}
                                            data-testid={`visited-${m.slug}`} data-state={h !== undefined ? "had" : on ? "on" : "off"} aria-label={`${m.name}${h !== undefined ? ` — ${h ? L.verified : L.recorded}` : on ? " — 골랐어요" : ""}`}
                                            className="flex w-full flex-col items-center gap-1 rounded-2xl pb-1.5 pt-2 active:opacity-80" style={on ? { background: "#F28C6A1F", boxShadow: "inset 0 0 0 1.5px #F28C6A" } : undefined}>
                                            <span className="relative">
                                                <MountainPatch id={m.id} region={m.region} size={54} earned={on || h !== undefined} />
                                                {(on || h !== undefined) && (
                                                    <span className="absolute -right-1.5 -top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full" style={{ background: h !== undefined ? "#F6D9A8" : "#F28C6A", boxShadow: "0 0 0 2px #0B1F26" }}><Check /></span>
                                                )}
                                            </span>
                                            <span className="w-full truncate px-0.5 text-center text-[12.5px] font-medium text-[#F4EFE3]">{m.name}</span>
                                            <span className="text-[12px] tabular-nums leading-none" style={{ color: h !== undefined ? "#F6D9A8" : "#F4EFE380" }}>{h !== undefined ? (h ? L.verified : L.recorded) : heightText(m.heightM) || " "}</span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                    <p className="mt-3 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">와펜은 정상에서 인증해야 배낭에 달려요. 여기서 고른 산은 도장첩에 흐린 도장으로 남아요.</p>
                </div>

                {/* 다른 산 */}
                <div className="px-5 pt-7">
                    <h2 className="text-[18px] font-semibold tracking-tight text-[#F4EFE3]">{L.others}</h2>
                    {others.length > 0 && (
                        <ul className="mt-2.5 flex flex-wrap gap-1.5" data-testid="visited-others">
                            {others.map((m) => (
                                <li key={m.id}>
                                    <button type="button" data-notrack onClick={() => toggle(m)} className="flex h-9 items-center gap-1 rounded-full bg-[#F28C6A] pl-3 pr-2 text-[13.5px] font-semibold text-[#2A1208]" aria-label={`${m.name} 빼기`}>
                                        {mountainLabel(m)}<LucideX className="h-3.5 w-3.5" aria-hidden />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                    <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={L.search} aria-label={L.search} data-testid="visited-search"
                        className="mt-3 h-12 w-full rounded-xl border border-[#FFFFFF1F] bg-[#FFFFFF0A] px-4 text-[15px] text-[#F4EFE3] outline-none placeholder:text-[#F4EFE399] focus:border-[#F28C6A]" />
                    {term && found.data && (
                        found.data.items.length === 0 ? (
                            <p className="mt-2 rounded-2xl bg-[#FFFFFF0A] px-4 py-4 text-center text-[14px] text-[#F4EFE399]">{L.searchEmpty}</p>
                        ) : (
                            <ul className="mt-2 rounded-2xl bg-[#FFFFFF0A] px-3.5" data-testid="visited-found">
                                {found.data.items.slice(0, 12).map((m, i) => {
                                    const h = had.get(m.id);
                                    const on = picked.has(m.id);
                                    return (
                                        <li key={m.id} className={i ? "border-t border-[#FFFFFF14]" : ""}>
                                            <button type="button" data-notrack onClick={() => toggle(m)} disabled={h !== undefined} aria-pressed={on || h !== undefined} className="flex min-h-[56px] w-full items-center gap-3 py-2 text-left active:opacity-70">
                                                <span className="min-w-0 flex-1">
                                                    <span className="block truncate text-[15px] font-semibold text-[#F4EFE3]">{mountainLabel(m)}</span>
                                                    <span className="block truncate text-[12.5px] text-[#F4EFE399]">{[heightText(m.heightM), mountainPlace(m)].filter(Boolean).join(" · ")}</span>
                                                </span>
                                                {h !== undefined
                                                    ? <span className="shrink-0 text-[12.5px] text-[#F6D9A8]">{h ? L.verified : L.recorded}</span>
                                                    : <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={on ? { background: "#F28C6A" } : { boxShadow: "inset 0 0 0 1.5px #F4EFE366" }}>{on && <Check />}</span>}
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )
                    )}
                </div>

                {/* 회원의 바닥 줄 — 방문자는 틀(HikingShell)이 같은 줄을 그린다(설치 팝업이 겹치지 않는 표식과 함께) */}
                {my.member && (
                    <>
                        <div className="h-24" aria-hidden />
                        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[#FFFFFF14] bg-[#0B1F26F2] px-4 pt-3" style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}>{bar}</div>
                    </>
                )}
            </div>
        </HikingShell>
    );
}
