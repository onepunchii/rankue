/**
 * 어드민 · 작업 기록(2026-10-16 어드민 전수 조사 — "지우기 · 무효 · 수정이 서버 로그에만 남는다").
 * 관리자 가드를 지난 바꾸는 요청마다 한 줄(GET /api/hiq/admin/actions). 누가 · 언제 · 무엇을 · 결과(성공/실패) · 보낸 값(PIN · 전화 · 계좌는 지운 채).
 * 이름표는 shared/adminActions adminActionLabel — 모르는 주소는 방법과 주소를 그대로 보인다.
 * 2026-10-17 골프 ④: 종목 칩(골프 메뉴의 '작업 기록'은 골프로 열린다) · 라우트가 남긴 '바뀐 것'(detail.result — 전 → 후)을 먼저 보인다.
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { ACTION_SPORTS, actionSport, type ActionSport, type AdminActionRow } from "@shared/adminActions";
import { GOODS_SPORT_NAME } from "@shared/goods";
import { EmptyState, FilterChips, Panel, Pill, SearchBox, kstDateTime } from "./adminUtils";

const PAIRS: readonly (readonly [string, string])[] = [["before", "after"], ["from", "to"], ["avgBefore", "avgAfter"]];
/** 자주 나오는 칸 이름 — 모르는 것은 그대로 */
const KEY_NAME: Record<string, string> = {
    reason: "까닭", members: "회원", sessionId: "라운드", name: "이름", slug: "골프장", rowId: "코스", clubId: "원장", clubName: "원장 이름", memberId: "회원",
    taken: "거둔 것", error: "오류", deletedRows: "지운 기록", detachedPosts: "떼어 낸 글", checked: "확인 후 저장", force: "합 무시", pagesUpdated: "바뀐 페이지",
    changeId: "기록", courseId: "코스", recorded: "기록한 회원", legacy: "옛 기록", abandoned: "접은 방", ids: "목록", count: "수", item: "물건", sport: "종목", serial: "번호",
};
const show = (v: unknown): string => {
    if (v == null) return "없음";
    if (typeof v === "boolean") return v ? "예" : "아니오";
    if (Array.isArray(v)) {
        if (v.every((x) => typeof x !== "object" || x == null)) return v.join(" ");
        // 회원 목록 같은 것 — "이름: 전 → 후"
        return v.map((x: any) => {
            const who = x?.name || x?.id || "";
            const pair = PAIRS.find(([a, b]) => x && (a in x || b in x));
            return pair ? `${who}: ${show(x[pair[0]])} → ${show(x[pair[1]])}${x.error ? ` (오류 ${x.error})` : ""}` : JSON.stringify(x);
        }).join(" · ");
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
};

/** 라우트가 남긴 '바뀐 것' — 전 → 후 짝은 한 줄로, 나머지는 이름: 값 */
function ResultLines({ result }: { result: unknown }) {
    const list = Array.isArray(result) ? result : [];
    if (!list.length) return null;
    return (
        <div className="mt-2 space-y-2" data-testid="admin-action-result">
            {list.map((r: any, i: number) => {
                const entries = Object.entries(r ?? {}).filter(([k]) => k !== "action");
                const paired = new Set<string>();
                const lines: { k: string; v: string; change?: boolean }[] = [];
                for (const [a, b] of PAIRS) if (a in (r ?? {}) || b in (r ?? {})) { paired.add(a); paired.add(b); lines.push({ k: a === "avgBefore" ? "평균" : "바뀜", v: `${show(r[a])} → ${show(r[b])}`, change: true }); }
                for (const [k, v] of entries) if (!paired.has(k)) lines.push({ k: KEY_NAME[k] ?? k, v: show(v) });
                return (
                    <div key={i} className="rounded-xl bg-white px-3 py-2 ring-1 ring-black/[0.06]">
                        <p className="text-[11.5px] font-bold text-black/40">{String(r?.action ?? "")}</p>
                        <ul className="mt-0.5 space-y-0.5">
                            {lines.map((l, j) => (
                                <li key={`${l.k}-${j}`} className="flex gap-2 text-[12.5px] leading-snug">
                                    <span className="w-20 shrink-0 truncate text-black/45">{l.k}</span>
                                    <span className={`min-w-0 flex-1 break-all tabular-nums ${l.change ? "font-bold text-amber-800" : "text-black/70"}`}>{l.v}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                );
            })}
        </div>
    );
}

const METHOD_TONE: Record<string, "alert" | "warn" | "info" | "neutral"> = { DELETE: "alert", POST: "info", PATCH: "warn", PUT: "warn" };

export default function AdminActionsView({ sport: initialSport }: { sport?: ActionSport } = {}) {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<string | null>(null);
    const [sport, setSport] = useState<ActionSport | "all">(initialSport ?? "all");
    const list = useInfiniteQuery({
        queryKey: ["/api/hiq/admin/actions", q, sport],
        initialPageParam: "" as string,
        queryFn: ({ pageParam }) => apiRequest(`/api/hiq/admin/actions?${new URLSearchParams({ ...(q ? { q } : {}), ...(sport !== "all" ? { sport } : {}), ...(pageParam ? { before: pageParam } : {}) })}`) as Promise<AdminActionRow[]>,
        getNextPageParam: (last) => (Array.isArray(last) && last.length === 100 ? last[last.length - 1].at : undefined),
    });
    const rows = useMemo(() => (list.data?.pages ?? []).flatMap((p) => (Array.isArray(p) ? p : [])), [list.data]);
    const failed = rows.filter((r) => r.status >= 400).length;

    return (
        <div className="space-y-3" data-testid="admin-actions">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <p className="text-[13px] text-black/55">관리자가 무언가를 바꿀 때마다 한 줄씩 남아요. PIN · 전화 · 계좌 같은 값은 지운 채로 남깁니다.</p>
                <SearchBox value={q} onChange={setQ} placeholder="주소 · 관리자 이름" className="sm:ml-auto sm:w-64" />
            </div>
            <FilterChips value={sport} onChange={setSport} options={[{ id: "all" as const, label: "전부" }, ...ACTION_SPORTS.map((s) => ({ id: s, label: GOODS_SPORT_NAME[s] }))]} />
            {failed > 0 && <p className="text-[12.5px] text-black/50">이 목록의 실패 {failed}건 — 막혔거나 오류가 난 요청도 함께 남아요.</p>}
            {list.isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>{sport === "all" ? "아직 남은 작업이 없어요." : `${GOODS_SPORT_NAME[sport]} 작업이 아직 없어요.`}</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {rows.map((r) => (
                        <div key={r.id} className="px-4 py-3">
                            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-2.5 text-left" data-testid="admin-action-row">
                                <Pill tone={METHOD_TONE[r.method] ?? "neutral"}>{r.method}</Pill>
                                {sport === "all" && actionSport(r.path, r.detail) && <span className="hidden shrink-0 text-[11.5px] font-bold text-black/40 sm:inline">{GOODS_SPORT_NAME[actionSport(r.path, r.detail)!]}</span>}
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-bold text-black/85">{r.label ?? r.path.replace(/^\/api\/hiq/, "")}</span>
                                    <span className="block truncate text-[12px] text-black/45">{r.adminName} · {kstDateTime(r.at)}{r.label ? ` · ${r.path.replace(/^\/api\/hiq/, "")}` : ""}</span>
                                </span>
                                {r.status >= 400 ? <Pill tone="alert">실패 {r.status}</Pill> : <Pill tone="brand">완료</Pill>}
                            </button>
                            {open === r.id && (
                                <>
                                    <ResultLines result={(r.detail as any)?.result} />
                                    <details className="mt-2" open={!(r.detail as any)?.result}>
                                        <summary className="cursor-pointer text-[12px] font-bold text-black/45">보낸 값</summary>
                                        <pre className="mt-1 max-h-64 overflow-auto rounded-xl bg-black/[0.04] p-3 text-[12px] leading-relaxed text-black/70 whitespace-pre-wrap break-all">{JSON.stringify({ ...(r.detail as any ?? {}), result: undefined }, null, 2)}</pre>
                                    </details>
                                </>
                            )}
                        </div>
                    ))}
                </Panel>
            )}
            {list.hasNextPage && (
                <button type="button" onClick={() => { void list.fetchNextPage(); }} disabled={list.isFetchingNextPage} className="h-10 w-full rounded-xl bg-black/[0.05] text-[13px] font-bold text-black/60">
                    {list.isFetchingNextPage ? "불러오는 중…" : "더 보기"}
                </button>
            )}
        </div>
    );
}
