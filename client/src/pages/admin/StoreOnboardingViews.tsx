/**
 * 어드민 · 매장 들이기 세 화면(2026-09-26 정리) — 매장 클레임 · 신규 매장 등록 · 입점 문의.
 * 셋 다 "들어온 신청을 보고 → 전화 → 승인/거절" 흐름이라 같은 모양으로 맞췄다.
 *  - 위: 대기/처리됨/전체 거르기 + 검색
 *  - 카드: 무엇(매장) · 누가(신청자·전화) · 언제 · 할 일(버튼) 순서
 *  - 거절은 되돌릴 수 없으니 한 번 묻는다. 승인 결과(임시 PIN)는 닫기 전까지 맨 위에 남긴다.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, CallButton, kstDateTime, agoLabel } from "./adminUtils";

// --- 공용: 승인 결과 상자 ---
type IssueResult = { listingCode?: string; storeSlug?: string; partnerPhone?: string; issuedPin?: string | null; notified?: boolean; kind?: "owner" | "report" };

function IssueResultBox({ r, onClose }: { r: IssueResult; onClose: () => void }) {
    if (r.kind === "report") {
        return (
            <div className="bg-brand/[0.06] border border-brand/30 p-5 rounded-2xl">
                <p className="font-bold text-brand mb-2">✓ 디렉토리에 추가했습니다 — 권한·PIN 은 발급하지 않았습니다(이용자 제보)</p>
                {r.listingCode && <p className="text-[14px]">매장 페이지: <a className="text-brand font-bold underline" href={`/stores/${r.listingCode}`} target="_blank" rel="noreferrer">/stores/{r.listingCode}</a></p>}
                <p className="text-[13px] text-black/55 mt-1">사장님이 나중에 "사장님이신가요?"로 클레임하면 그때 권한이 나갑니다.</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>닫기</Button>
            </div>
        );
    }
    return (
        <div className="bg-brand/[0.06] border border-brand/30 p-5 rounded-2xl">
            {/* 신청자가 회원이면 앱 알림으로 통보가 끝난다 — 전화할 필요가 없다. 비회원일 때만 PIN 을 전화로 불러줘야 한다. */}
            <p className="font-bold text-brand mb-2">
                {r.notified ? "✓ 승인 완료 — 사장님께 앱 알림을 보냈습니다" : "✓ 승인 완료 — 사장님께 전화로 전달하세요"}
            </p>
            <div className="text-[14px] space-y-1 tabular-nums">
                {r.listingCode && <p>매장 페이지: <a className="text-brand font-bold underline" href={`/stores/${r.listingCode}`} target="_blank" rel="noreferrer">/stores/{r.listingCode}</a></p>}
                {r.notified ? (
                    <p className="text-black/60">따로 연락하지 않으셔도 됩니다. 사장님이 앱 전체 메뉴 → 내 매장 관리에서 바로 들어갑니다.</p>
                ) : (
                    <>
                        <p>파트너 로그인 전화번호: <b>{r.partnerPhone}</b></p>
                        {r.issuedPin
                            ? <p>임시 PIN: <b className="text-[19px] text-brand">{r.issuedPin}</b> <span className="text-black/45 text-[12px]">— 이 상자를 닫으면 다시 볼 수 없습니다</span></p>
                            : <p className="text-black/55">기존 계정 재사용 — 쓰던 비밀번호로 로그인</p>}
                        <p className="text-black/55 text-[13px]">파트너 포털: /partner/login</p>
                    </>
                )}
            </div>
            <Button variant="ghost" size="sm" className="mt-2" onClick={onClose}>닫기</Button>
        </div>
    );
}

type StatusFilter = "pending" | "done" | "all";
const statusOptions = (pending: number, done: number) => [
    { id: "pending" as const, label: "대기", count: pending, alert: true },
    { id: "done" as const, label: "처리됨", count: done },
    { id: "all" as const, label: "전체", count: pending + done },
];

// ================= 매장 클레임 =================
export type Claim = {
    id: string; listingCode: string; applicantName: string; applicantPhone: string;
    message: string | null; status: string; issuedPin: string | null; createdAt: string;
    listingName: string | null; listingRegion: string | null; listingAddress: string | null;
};
export const CLAIMS_KEY = ["/api/hiq/admin/listing-claims"] as const;

export function ClaimsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: claims = [], isLoading } = useQuery<Claim[]>({ queryKey: CLAIMS_KEY });
    const [filter, setFilter] = useState<StatusFilter>("pending");
    const [q, setQ] = useState("");
    const [result, setResult] = useState<IssueResult | null>(null);

    const approve = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/listing-claims/${id}/approve`, { method: "POST" }),
        onSuccess: (r: any) => { setResult(r); qc.invalidateQueries({ queryKey: CLAIMS_KEY }); window.scrollTo({ top: 0, behavior: "smooth" }); },
        onError: (e: any) => toast({ title: e?.message || "승인 실패", variant: "destructive" }),
    });
    const reject = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/listing-claims/${id}/reject`, { method: "POST" }),
        onSuccess: () => { toast({ title: "거절했습니다" }); qc.invalidateQueries({ queryKey: CLAIMS_KEY }); },
        onError: (e: any) => toast({ title: e?.message || "거절 실패", variant: "destructive" }),
    });

    const pendingN = claims.filter((c) => c.status === "pending").length;
    const rows = useMemo(() => {
        const s = q.trim();
        return claims
            .filter((c) => filter === "all" || (filter === "pending" ? c.status === "pending" : c.status !== "pending"))
            .filter((c) => !s || [c.listingName, c.applicantName, c.applicantPhone, c.listingRegion, c.listingCode].some((v) => v?.includes(s)));
    }, [claims, filter, q]);

    return (
        <div className="space-y-3">
            {result && <IssueResultBox r={result} onClose={() => setResult(null)} />}
            <p className="text-[13px] text-black/50">사장님이 매장 페이지에서 '내 매장 정보 관리 신청'을 하면 들어옵니다. 승인하면 사장님 계정과 파트너 매장이 한 번에 만들어집니다.</p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={statusOptions(pendingN, claims.length - pendingN)} />
                <SearchBox value={q} onChange={setQ} placeholder="매장·신청자·전화" className="sm:ml-auto sm:w-64" />
            </div>
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? (
                <EmptyState>{filter === "pending" ? "대기 중인 클레임이 없습니다." : "해당하는 클레임이 없습니다."}</EmptyState>
            ) : rows.map((c) => (
                <Panel key={c.id} className={`p-4 ${c.status !== "pending" ? "opacity-70" : ""}`}>
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {c.status === "pending" ? <Pill tone="alert">대기</Pill> : c.status === "approved" ? <Pill tone="brand">승인됨</Pill> : <Pill>거절됨</Pill>}
                        {c.issuedPin && <span title="발급 당시 초기 PIN — 사장님이 바꿨다면 낡은 값일 수 있습니다"><Pill tone="neutral">초기 PIN {c.issuedPin}</Pill></span>}
                        <span className="ml-auto text-[12px] text-black/40 tabular-nums" title={kstDateTime(c.createdAt)}>{agoLabel(c.createdAt)}</span>
                    </div>
                    <h3 className="text-[16px] font-bold truncate">
                        {c.listingName ?? c.listingCode}
                        <a href={`/stores/${c.listingCode}`} target="_blank" rel="noreferrer" className="ml-2 text-[12px] font-bold text-brand">페이지 ↗</a>
                    </h3>
                    <p className="text-[12.5px] text-black/45 truncate">{[c.listingRegion, c.listingAddress].filter(Boolean).join(" · ")}</p>
                    <p className="mt-1.5 text-[13.5px] font-semibold text-black/75">{c.applicantName} 사장님 · <span className="tabular-nums">{c.applicantPhone}</span></p>
                    {c.message && <p className="mt-1 text-[13px] text-black/60 bg-black/[0.03] rounded-lg px-3 py-2 whitespace-pre-wrap">"{c.message}"</p>}
                    {c.status === "pending" && (
                        <div className="mt-3 flex gap-2">
                            <CallButton phone={c.applicantPhone} />
                            <Button size="sm" variant="ghost" className="h-9 text-red-500 ml-auto" disabled={reject.isPending}
                                onClick={() => { if (window.confirm(`'${c.listingName ?? c.listingCode}' 클레임을 거절할까요?`)) reject.mutate(c.id); }}>거절</Button>
                            <Button size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>
                                {approve.isPending ? "처리 중…" : "승인·계정 발급"}
                            </Button>
                        </div>
                    )}
                </Panel>
            ))}
        </div>
    );
}

// ================= 신규 매장 등록 =================
export type Registration = {
    id: string; name: string; region: string; address: string; phone: string | null;
    openHours: string | null;
    tableLarge: number | null; tableMedium: number | null; tablePocket: number | null;
    rate10Large: number | null; rate10Medium: number | null; rate10Pocket: number | null;
    flatLarge: number | null; flatMedium: number | null; flatPocket: number | null;
    applicantName: string; applicantPhone: string;
    status: "pending" | "approved" | "rejected"; listingCode: string | null; issuedPin: string | null; createdAt: string;
    kind?: "owner" | "report";
};
export const REGISTRATIONS_KEY = ["/api/hiq/admin/store-registrations"] as const;

export function RegistrationsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: regs = [], isLoading } = useQuery<Registration[]>({ queryKey: REGISTRATIONS_KEY });
    const [filter, setFilter] = useState<StatusFilter>("pending");
    const [kind, setKind] = useState<"all" | "owner" | "report">("all");
    const [q, setQ] = useState("");
    const [result, setResult] = useState<IssueResult | null>(null);

    const approve = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/store-registrations/${id}/approve`, { method: "POST" }),
        onSuccess: (r: any) => { setResult(r); qc.invalidateQueries({ queryKey: REGISTRATIONS_KEY }); window.scrollTo({ top: 0, behavior: "smooth" }); },
        onError: (e: any) => toast({ title: e?.message || "승인 실패", variant: "destructive" }),
    });
    const reject = useMutation({
        mutationFn: async (id: string) => apiRequest(`/api/hiq/admin/store-registrations/${id}/reject`, { method: "POST" }),
        onSuccess: () => { toast({ title: "거절했습니다" }); qc.invalidateQueries({ queryKey: REGISTRATIONS_KEY }); },
        onError: (e: any) => toast({ title: e?.message || "거절 실패", variant: "destructive" }),
    });

    const pendingN = regs.filter((r) => r.status === "pending").length;
    const rows = useMemo(() => {
        const s = q.trim();
        return regs
            .filter((r) => filter === "all" || (filter === "pending" ? r.status === "pending" : r.status !== "pending"))
            .filter((r) => kind === "all" || (r.kind ?? "owner") === kind)
            .filter((r) => !s || [r.name, r.region, r.address, r.applicantName, r.applicantPhone].some((v) => v?.includes(s)));
    }, [regs, filter, kind, q]);

    const won = (n: number | null) => (n ? `${n.toLocaleString()}원` : null);

    return (
        <div className="space-y-3">
            {result && <IssueResultBox r={result} onClose={() => setResult(null)} />}
            <p className="text-[13px] text-black/50">디렉토리에 없는 매장 등록 신청입니다. 사장님 신청은 승인하면 매장 페이지와 사장님 권한이 함께 나가고, 이용자 제보는 페이지만 만듭니다.</p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={statusOptions(pendingN, regs.length - pendingN)} />
                <FilterChips value={kind} onChange={setKind} options={[{ id: "all", label: "모두" }, { id: "owner", label: "사장님 신청" }, { id: "report", label: "이용자 제보" }]} />
                <SearchBox value={q} onChange={setQ} placeholder="매장·지역·신청자" className="sm:ml-auto sm:w-56" />
            </div>
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? (
                <EmptyState>{filter === "pending" ? "대기 중인 등록 신청이 없습니다." : "해당하는 신청이 없습니다."}</EmptyState>
            ) : rows.map((r) => {
                const tables = [r.tableLarge && `대대 ${r.tableLarge}`, r.tableMedium && `중대 ${r.tableMedium}`, r.tablePocket && `포켓 ${r.tablePocket}`].filter(Boolean).join(" · ");
                const rates = [won(r.rate10Large) && `대대 ${won(r.rate10Large)}/10분`, won(r.rate10Medium) && `중대 ${won(r.rate10Medium)}/10분`, won(r.rate10Pocket) && `포켓 ${won(r.rate10Pocket)}/10분`].filter(Boolean).join(" · ");
                return (
                    <Panel key={r.id} className={`p-4 ${r.status !== "pending" ? "opacity-70" : ""}`}>
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            {r.status === "pending" ? <Pill tone="alert">대기</Pill> : r.status === "approved" ? <Pill tone="brand">등록됨{r.listingCode ? ` · ${r.listingCode}` : ""}</Pill> : <Pill>거절됨</Pill>}
                            {r.kind === "report" ? <Pill tone="warn">이용자 제보 · 권한 없음</Pill> : <Pill tone="info">사장님 신청</Pill>}
                            {r.issuedPin && <Pill>초기 PIN {r.issuedPin}</Pill>}
                            <span className="ml-auto text-[12px] text-black/40 tabular-nums" title={kstDateTime(r.createdAt)}>{agoLabel(r.createdAt)}</span>
                        </div>
                        <h3 className="text-[16px] font-bold">{r.name} <span className="text-[12.5px] font-semibold text-black/45">{r.region}</span></h3>
                        <p className="text-[12.5px] text-black/50">{[r.address, r.phone, r.openHours].filter(Boolean).join(" · ")}</p>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[12.5px]">
                            <div className="rounded-lg bg-black/[0.03] px-3 py-2"><p className="font-bold text-black/45 text-[11px]">테이블</p><p className="tabular-nums">{tables || "미입력"}</p></div>
                            <div className="rounded-lg bg-black/[0.03] px-3 py-2"><p className="font-bold text-black/45 text-[11px]">요금</p><p className="tabular-nums">{rates || "미입력"}</p></div>
                        </div>
                        <p className="mt-2 text-[13.5px] font-semibold text-black/75">신청자 {r.applicantName} · <span className="tabular-nums">{r.applicantPhone}</span></p>
                        {r.status === "pending" && (
                            <div className="mt-3 flex gap-2">
                                <CallButton phone={r.applicantPhone} />
                                <Button size="sm" variant="ghost" className="h-9 text-red-500 ml-auto" disabled={reject.isPending}
                                    onClick={() => { if (window.confirm(`'${r.name}' 등록 신청을 거절할까요?`)) reject.mutate(r.id); }}>거절</Button>
                                <Button size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                                    {approve.isPending ? "처리 중…" : r.kind === "report" ? "승인·디렉토리 추가" : "승인·페이지 생성"}
                                </Button>
                            </div>
                        )}
                        {r.status === "approved" && r.listingCode && (
                            <a href={`/stores/${r.listingCode}`} target="_blank" rel="noreferrer" className="mt-2 inline-block text-[12.5px] font-bold text-brand">매장 페이지 보기 ↗</a>
                        )}
                    </Panel>
                );
            })}
        </div>
    );
}

// ================= 입점 문의 =================
export type PartnerLead = {
    id: string; ownerName: string; phoneNumber: string; storeName: string | null; region: string | null;
    regionDetail?: string | null; businessNumber?: string | null;
    status: "NEW" | "CONTACTED" | "REGISTERED"; createdAt: string;
};
export const LEADS_KEY = ["/api/hiq/admin/leads"] as const;
export const LEAD_STATUS_LABEL: Record<string, string> = { NEW: "신규", CONTACTED: "연락함", REGISTERED: "등록 완료" };

export function LeadsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data: leads = [], isLoading } = useQuery<PartnerLead[]>({ queryKey: LEADS_KEY });
    const [filter, setFilter] = useState<"NEW" | "CONTACTED" | "REGISTERED" | "all">("NEW");
    const [q, setQ] = useState("");

    const update = useMutation({
        mutationFn: async ({ id, status }: { id: string; status: string }) => apiRequest(`/api/hiq/admin/leads/${id}/status`, { method: "POST", body: { status } }),
        onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: LEADS_KEY }); toast({ title: `'${LEAD_STATUS_LABEL[v.status]}'(으)로 바꿨습니다` }); },
        onError: (e: any) => toast({ title: e?.message || "변경 실패", variant: "destructive" }),
    });

    const count = (s: string) => leads.filter((l) => l.status === s).length;
    const rows = useMemo(() => {
        const s = q.trim();
        return leads
            .filter((l) => filter === "all" || l.status === filter)
            .filter((l) => !s || [l.ownerName, l.phoneNumber, l.storeName, l.region].some((v) => v?.includes(s)));
    }, [leads, filter, q]);

    return (
        <div className="space-y-3">
            <div className="bg-amber-400/[0.12] p-4 rounded-2xl text-[13px] text-[#7a5d08] leading-relaxed">
                입점 문의는 <b>연락처 접수함</b>입니다 — 상태를 바꿔도 계정은 발급되지 않습니다.
                사장님께 전화드려 <b>매장 찾기에서 본인 매장을 '관리 신청'(클레임)</b>하도록 안내하면, '매장 클레임'에서 승인 한 번으로 계정·매장이 발급됩니다.
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={[
                    { id: "NEW", label: "신규", count: count("NEW"), alert: true },
                    { id: "CONTACTED", label: "연락함", count: count("CONTACTED") },
                    { id: "REGISTERED", label: "등록 완료", count: count("REGISTERED") },
                    { id: "all", label: "전체", count: leads.length },
                ]} />
                <SearchBox value={q} onChange={setQ} placeholder="이름·전화·매장" className="sm:ml-auto sm:w-64" />
            </div>
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>해당하는 문의가 없습니다.</EmptyState> : rows.map((l) => (
                <Panel key={l.id} className="p-4">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Pill tone={l.status === "NEW" ? "alert" : l.status === "REGISTERED" ? "brand" : "neutral"}>{LEAD_STATUS_LABEL[l.status] ?? l.status}</Pill>
                        <span className="ml-auto text-[12px] text-black/40 tabular-nums" title={kstDateTime(l.createdAt)}>{agoLabel(l.createdAt)}</span>
                    </div>
                    <h3 className="text-[16px] font-bold">{l.ownerName} <span className="text-[13px] font-medium text-black/50">사장님</span></h3>
                    <p className="text-[13px] text-black/60 tabular-nums">{l.phoneNumber}</p>
                    <p className="text-[12.5px] text-black/45">{[l.region, l.regionDetail, l.storeName, l.businessNumber && `사업자 ${l.businessNumber}`].filter(Boolean).join(" · ") || "매장 정보 없음"}</p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                        <CallButton phone={l.phoneNumber} />
                        <div className="ml-auto flex gap-1.5">
                            {l.status !== "CONTACTED" && <Button size="sm" variant="outline" className="h-9" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "CONTACTED" })}>연락함</Button>}
                            {l.status !== "REGISTERED" && <Button size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "REGISTERED" })}>등록 완료</Button>}
                            {l.status !== "NEW" && <Button size="sm" variant="ghost" className="h-9 text-black/50" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "NEW" })}>신규로</Button>}
                        </div>
                    </div>
                </Panel>
            ))}
        </div>
    );
}
