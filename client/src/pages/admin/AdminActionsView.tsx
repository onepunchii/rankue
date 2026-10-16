/**
 * 어드민 · 작업 기록(2026-10-16 어드민 전수 조사 — "지우기 · 무효 · 수정이 서버 로그에만 남는다").
 * 관리자 가드를 지난 바꾸는 요청마다 한 줄(GET /api/hiq/admin/actions). 누가 · 언제 · 무엇을 · 결과(성공/실패) · 보낸 값(PIN · 전화 · 계좌는 지운 채).
 * 이름표는 shared/adminActions adminActionLabel — 모르는 주소는 방법과 주소를 그대로 보인다.
 */
import { useMemo, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { AdminActionRow } from "@shared/adminActions";
import { EmptyState, Panel, Pill, SearchBox, kstDateTime } from "./adminUtils";

const METHOD_TONE: Record<string, "alert" | "warn" | "info" | "neutral"> = { DELETE: "alert", POST: "info", PATCH: "warn", PUT: "warn" };

export default function AdminActionsView() {
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<string | null>(null);
    const list = useInfiniteQuery({
        queryKey: ["/api/hiq/admin/actions", q],
        initialPageParam: "" as string,
        queryFn: ({ pageParam }) => apiRequest(`/api/hiq/admin/actions?${new URLSearchParams({ ...(q ? { q } : {}), ...(pageParam ? { before: pageParam } : {}) })}`) as Promise<AdminActionRow[]>,
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
            {failed > 0 && <p className="text-[12.5px] text-black/50">이 목록의 실패 {failed}건 — 막혔거나 오류가 난 요청도 함께 남아요.</p>}
            {list.isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>아직 남은 작업이 없어요.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {rows.map((r) => (
                        <div key={r.id} className="px-4 py-3">
                            <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} className="flex w-full items-center gap-2.5 text-left" data-testid="admin-action-row">
                                <Pill tone={METHOD_TONE[r.method] ?? "neutral"}>{r.method}</Pill>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-bold text-black/85">{r.label ?? r.path.replace(/^\/api\/hiq/, "")}</span>
                                    <span className="block truncate text-[12px] text-black/45">{r.adminName} · {kstDateTime(r.at)}{r.label ? ` · ${r.path.replace(/^\/api\/hiq/, "")}` : ""}</span>
                                </span>
                                {r.status >= 400 ? <Pill tone="alert">실패 {r.status}</Pill> : <Pill tone="brand">완료</Pill>}
                            </button>
                            {open === r.id && (
                                <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-black/[0.04] p-3 text-[12px] leading-relaxed text-black/70 whitespace-pre-wrap break-all">{JSON.stringify(r.detail, null, 2)}</pre>
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
