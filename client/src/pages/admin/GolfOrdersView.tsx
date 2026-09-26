/**
 * 어드민 · 골프 회원권 접수(2026-09-26 정리).
 * 예전: 7칸 가로 표 — 폰에서 옆으로 밀어야 했고, 상태 거르기가 없어 끝난 건과 새 건이 섞였다.
 * 지금: 상태 거르기(대기·연락됨·완료·취소) · 매수/매도 · 검색 · 카드. 연락처가 전화번호면 바로 걸기.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, KpiTile, kstDateTime, agoLabel } from "./adminUtils";

type Order = { id: string; courseName: string; orderType: "BUY" | "SELL"; price: number; contact: string; status: Status; createdAt: string };
type Status = "PENDING" | "CONTACTED" | "COMPLETED" | "CANCELLED";
export const GOLF_ORDERS_KEY = ["/api/hiq/admin/membership/orders"] as const;

const STATUS: Record<Status, { label: string; tone: "alert" | "info" | "brand" | "neutral" }> = {
    PENDING: { label: "대기", tone: "alert" },
    CONTACTED: { label: "연락됨", tone: "info" },
    COMPLETED: { label: "거래 완료", tone: "brand" },
    CANCELLED: { label: "취소", tone: "neutral" },
};
const won = (n: number) => `${new Intl.NumberFormat("ko-KR").format(n)}원`;
const isPhone = (s: string) => /^[0-9+\-\s()]{8,}$/.test(s.trim());

export default function GolfOrdersView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: orders = [], isLoading } = useQuery<Order[]>({ queryKey: GOLF_ORDERS_KEY });
    const [filter, setFilter] = useState<Status | "all">("PENDING");
    const [side, setSide] = useState<"all" | "BUY" | "SELL">("all");
    const [q, setQ] = useState("");

    const update = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: Status }) => apiRequest(`/api/hiq/admin/membership/orders/${id}/status`, { method: "PATCH", body: { status } }),
        onSuccess: (_r, v) => { toast({ title: `'${STATUS[v.status].label}'(으)로 바꿨습니다` }); qc.invalidateQueries({ queryKey: GOLF_ORDERS_KEY }); },
        onError: () => toast({ title: "상태 변경에 실패했습니다", variant: "destructive" }),
    });

    const count = (st: Status) => orders.filter((o) => o.status === st).length;
    const rows = useMemo(() => {
        const s = q.trim();
        return [...orders]
            .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
            .filter((o) => filter === "all" || o.status === filter)
            .filter((o) => side === "all" || o.orderType === side)
            .filter((o) => !s || o.courseName.includes(s) || o.contact.includes(s));
    }, [orders, filter, side, q]);

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label="대기" value={count("PENDING")} unit="건" tone={count("PENDING") ? "alert" : "default"} />
                <KpiTile label="매수 문의" value={orders.filter((o) => o.orderType === "BUY").length} unit="건" />
                <KpiTile label="매도 문의" value={orders.filter((o) => o.orderType === "SELL").length} unit="건" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={[
                    { id: "PENDING", label: "대기", count: count("PENDING"), alert: true },
                    { id: "CONTACTED", label: "연락됨", count: count("CONTACTED") },
                    { id: "COMPLETED", label: "완료", count: count("COMPLETED") },
                    { id: "CANCELLED", label: "취소", count: count("CANCELLED") },
                    { id: "all", label: "전체", count: orders.length },
                ]} />
                <FilterChips value={side} onChange={setSide} options={[{ id: "all", label: "매수·매도" }, { id: "BUY", label: "매수" }, { id: "SELL", label: "매도" }]} />
                <SearchBox value={q} onChange={setQ} placeholder="골프장·연락처" className="sm:ml-auto sm:w-56" />
            </div>
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>해당하는 접수가 없습니다.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06] overflow-hidden">
                    {rows.map((o) => (
                        <div key={o.id} className="px-4 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2.5">
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                    <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11.5px] font-black ${o.orderType === "BUY" ? "bg-red-500/10 text-red-600" : "bg-blue-500/10 text-blue-700"}`}>
                                        {o.orderType === "BUY" ? "매수" : "매도"}
                                    </span>
                                    <span className="font-bold text-[15px] truncate">{o.courseName}</span>
                                    <Pill tone={STATUS[o.status]?.tone ?? "neutral"}>{STATUS[o.status]?.label ?? o.status}</Pill>
                                </div>
                                <p className="mt-0.5 text-[13px] tabular-nums">
                                    <b>{won(o.price)}</b>
                                    <span className="text-black/45"> · {o.contact} · </span>
                                    <span className="text-black/40" title={kstDateTime(o.createdAt)}>{agoLabel(o.createdAt)}</span>
                                </p>
                            </div>
                            <div className="flex gap-1.5 shrink-0">
                                {isPhone(o.contact) && (
                                    <a href={`tel:${o.contact.replace(/\s/g, "")}`} className="h-9 px-3 rounded-lg border border-black/10 inline-flex items-center text-[13px] font-bold text-black/65">전화</a>
                                )}
                                <select value={o.status} disabled={update.isPending} onChange={(e) => update.mutate({ id: o.id, status: e.target.value as Status })}
                                    aria-label="상태 변경" className="h-9 px-2 rounded-lg bg-white border border-black/10 text-[13px] font-bold text-black/70 outline-none">
                                    {(Object.keys(STATUS) as Status[]).map((st) => <option key={st} value={st}>{STATUS[st].label}</option>)}
                                </select>
                            </div>
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
