/**
 * 어드민 · 가맹점 리스트와 결제 관리(2026-09-26 정리). 둘 다 GET /admin/stores 한 목록을 본다.
 *  - 가맹점: 검색 · 요금제 거르기 · 가입 회원 수 · 점주 연락 · 매장 페이지 · 사장님 화면(대리 접속)
 *  - 결제: 요금제·상태·다음 결제일 한눈에 — 과금 기준은 subscriptionTier(PREMIUM/BASIC). 옛 plan 칸은 쓰지 않는다.
 *    청구서 발송은 아직 연결된 기능이 없어 버튼을 두지 않는다(누르면 아무 일도 없는 버튼이었다).
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { LucideStore, LucideArrowRight } from "@/lib/icons";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, CallButton, KpiTile, kstDate, daysSince } from "./adminUtils";

export type AdminStore = {
    id: string; name: string; region: string | null; slug: string;
    plan: string | null; subscriptionTier: string | null;
    subscriptionStatus: "active" | "overdue" | "cancelled";
    nextBillingDate: string | null; createdAt: string | null;
    ownerName: string; ownerPhone: string | null;
    memberCount: number; listingCode: string | null;
};
export const STORES_KEY = ["/api/hiq/admin/stores"] as const;

const isPremium = (s: AdminStore) => s.subscriptionTier === "PREMIUM";
const STATUS_LABEL: Record<string, { label: string; tone: "brand" | "alert" | "neutral" }> = {
    active: { label: "정상", tone: "brand" },
    overdue: { label: "미납", tone: "alert" },
    cancelled: { label: "해지", tone: "neutral" },
};

export function StoresView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: stores = [], isLoading } = useQuery<AdminStore[]>({ queryKey: STORES_KEY });
    const [q, setQ] = useState("");
    const [tier, setTier] = useState<"all" | "premium" | "basic">("all");
    const [sort, setSort] = useState<"new" | "members" | "name">("new");

    const impersonate = useMutation({
        mutationFn: async (storeId: string) => apiRequest(`/api/hiq/admin/impersonate/${storeId}`, { method: "POST" }),
        onSuccess: () => {
            // 사장님 화면 위쪽 '관리자로 돌아가기' 띠로 되돌아온다(서버가 관리자 세션을 따로 적어 둔다).
            qc.clear();
            window.location.href = "/partner/dashboard";
        },
        onError: (e: any) => toast({ title: e?.message || "매장 접속 실패", variant: "destructive" }),
    });

    const rows = useMemo(() => {
        const s = q.trim();
        const list = stores
            .filter((st) => tier === "all" || (tier === "premium" ? isPremium(st) : !isPremium(st)))
            .filter((st) => !s || [st.name, st.region, st.ownerName, st.ownerPhone, st.slug].some((v) => v?.includes(s)));
        if (sort === "members") return [...list].sort((a, b) => b.memberCount - a.memberCount);
        if (sort === "name") return [...list].sort((a, b) => a.name.localeCompare(b.name, "ko"));
        return list; // 서버가 최근 등록순으로 준다
    }, [stores, q, tier, sort]);

    const premiumN = stores.filter(isPremium).length;

    return (
        <div className="space-y-3">
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label="가맹점" value={stores.length} unit="곳" />
                <KpiTile label="프리미엄" value={premiumN} unit="곳" tone="brand" />
                <KpiTile label="가입 회원 합" value={stores.reduce((a, s) => a + s.memberCount, 0).toLocaleString()} unit="명" />
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={tier} onChange={setTier} options={[
                    { id: "all", label: "전체", count: stores.length },
                    { id: "premium", label: "프리미엄", count: premiumN },
                    { id: "basic", label: "기본", count: stores.length - premiumN },
                ]} />
                <div className="flex gap-2 sm:ml-auto">
                    <SearchBox value={q} onChange={setQ} placeholder="매장·지역·점주·전화" className="flex-1 sm:w-60" />
                    <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="정렬"
                        className="h-10 px-2 rounded-xl bg-white border border-black/10 text-[13px] font-bold text-black/65 outline-none">
                        <option value="new">최근 등록순</option>
                        <option value="members">회원 많은순</option>
                        <option value="name">이름순</option>
                    </select>
                </div>
            </div>

            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>{stores.length ? "조건에 맞는 매장이 없습니다." : "등록된 가맹점이 없습니다."}</EmptyState> : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                    {rows.map((st) => (
                        <Panel key={st.id} className="p-4">
                            <div className="flex items-start gap-3">
                                <div className="w-10 h-10 shrink-0 rounded-full bg-brand/10 flex items-center justify-center">
                                    <LucideStore className="w-5 h-5 text-brand" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5">
                                        <h3 className="text-[16px] font-bold truncate">{st.name}</h3>
                                        {isPremium(st) ? <Pill tone="brand">프리미엄</Pill> : <Pill>기본</Pill>}
                                        {st.subscriptionStatus === "overdue" && <Pill tone="alert">미납</Pill>}
                                    </div>
                                    <p className="text-[12.5px] text-black/50 truncate">{st.region || "지역 미설정"} · 등록 {kstDate(st.createdAt)}</p>
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-lg bg-black/[0.03] py-2"><p className="text-[11px] font-bold text-black/45">가입 회원</p><p className="text-[15px] font-black tabular-nums">{st.memberCount}</p></div>
                                <div className="rounded-lg bg-black/[0.03] py-2 col-span-2 px-2 text-left">
                                    <p className="text-[11px] font-bold text-black/45">점주</p>
                                    <p className="text-[13.5px] font-bold truncate">{st.ownerName} <span className="font-medium text-black/50 tabular-nums">{st.ownerPhone ?? ""}</span></p>
                                </div>
                            </div>
                            <div className="mt-3 flex gap-2">
                                <CallButton phone={st.ownerPhone} />
                                <Button variant="outline" className="h-9 text-[13px]" onClick={() => window.open(st.listingCode ? `/stores/${st.listingCode}` : `/store/${st.slug}`, "_blank")}>
                                    매장 페이지
                                </Button>
                                <Button className="ml-auto h-9 text-[13px] bg-black/[0.06] text-[rgba(0,0,0,0.8)] hover:bg-brand hover:text-white" disabled={impersonate.isPending}
                                    onClick={() => { if (window.confirm(`'${st.name}' 사장님 화면으로 들어갑니다.\n돌아올 땐 사장님 화면 맨 위 '관리자로 돌아가기'를 누르세요.`)) impersonate.mutate(st.id); }}>
                                    사장님 화면 <LucideArrowRight className="w-4 h-4 ml-1" />
                                </Button>
                            </div>
                        </Panel>
                    ))}
                </div>
            )}
        </div>
    );
}

export function BillingView() {
    const { data: stores = [], isLoading } = useQuery<AdminStore[]>({ queryKey: STORES_KEY });
    const [filter, setFilter] = useState<"premium" | "overdue" | "all">("premium");

    const premium = stores.filter(isPremium);
    const overdue = stores.filter((s) => s.subscriptionStatus === "overdue");
    // 다음 결제일이 7일 안(또는 지남)인 프리미엄 매장
    const dueSoon = premium.filter((s) => s.nextBillingDate && -daysSince(s.nextBillingDate) <= 7);
    const rows = filter === "premium" ? premium : filter === "overdue" ? overdue : stores;

    return (
        <div className="space-y-3">
            <div className="bg-brand/[0.06] border border-brand/20 p-4 rounded-2xl text-[13px] text-black/60 leading-relaxed">
                매장별 요금제와 다음 결제일입니다. 정기 결제 청구·환불은 아직 이 화면에 연결되지 않았습니다 — 결제사(포트원) 관리 화면에서 처리해 주세요.
            </div>
            <div className="grid grid-cols-3 gap-2.5">
                <KpiTile label="프리미엄" value={premium.length} unit="곳" tone="brand" />
                <KpiTile label="7일 안 결제" value={dueSoon.length} unit="곳" />
                <KpiTile label="미납" value={overdue.length} unit="곳" tone={overdue.length ? "alert" : "default"} />
            </div>
            <FilterChips value={filter} onChange={setFilter} options={[
                { id: "premium", label: "프리미엄", count: premium.length },
                { id: "overdue", label: "미납", count: overdue.length, alert: true },
                { id: "all", label: "전체 매장", count: stores.length },
            ]} />
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>해당하는 매장이 없습니다.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06] overflow-hidden">
                    {rows.map((st) => {
                        const status = STATUS_LABEL[st.subscriptionStatus] ?? STATUS_LABEL.active;
                        const soon = st.nextBillingDate && -daysSince(st.nextBillingDate) <= 7;
                        return (
                            <div key={st.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-[14.5px] truncate">{st.name}</p>
                                    <p className="text-[12px] text-black/45 truncate">{st.ownerName}{st.ownerPhone ? ` · ${st.ownerPhone}` : ""}</p>
                                    <div className="mt-1 flex gap-1">
                                        {isPremium(st) ? <Pill tone="brand">프리미엄</Pill> : <Pill>기본</Pill>}
                                        <Pill tone={status.tone}>{status.label}</Pill>
                                    </div>
                                </div>
                                <div className="w-20 text-right">
                                    <p className="text-[11px] text-black/40">다음 결제</p>
                                    <p className={`text-[12.5px] font-bold tabular-nums ${soon ? "text-amber-700" : "text-black/65"}`}>{st.nextBillingDate ? kstDate(st.nextBillingDate) : "-"}</p>
                                </div>
                            </div>
                        );
                    })}
                </Panel>
            )}
        </div>
    );
}
