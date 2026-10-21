/**
 * 어드민 · 매장 들이기 세 화면(2026-09-26 정리) — 매장 클레임 · 신규 매장 등록 · 입점 문의.
 * 셋 다 "들어온 신청을 보고 → 전화 → 승인/거절" 흐름이라 같은 모양으로 맞췄다.
 *  - 위: 대기/처리됨/전체 거르기 + 검색
 *  - 카드: 무엇(매장) · 누가(신청자·전화) · 언제 · 할 일(버튼) 순서
 *  - 거절은 되돌릴 수 없으니 한 번 묻는다. 승인 결과(임시 PIN)는 닫기 전까지 맨 위에 남긴다.
 *
 * 2026-10-07 오너 "앞으로 사장님들이 신청·승인했을 때를 생각해서": 사장님 신청은 이제 **랭큐 계정으로** 들어온다.
 *  - 그런 신청('랭큐 계정으로 신청' 표시)은 승인하면 그 계정에 권한이 열린다 — PIN 도, 전화로 불러 줄 것도 없다.
 *  - 거절할 때 사유를 적을 수 있다(선택) — 신청자의 알림과 '내 신청'에 그대로 보인다.
 */
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, CallButton, kstDateTime, agoLabel } from "./adminUtils";

// --- 공용: 승인 결과 상자 ---
type IssueResult = { listingCode?: string; storeSlug?: string; partnerPhone?: string; issuedPin?: string | null; notified?: boolean; kind?: "owner" | "report"; accountLinked?: boolean };

/** 거절 — 사유(선택)를 받아 확정한다. 사유는 신청자에게 그대로 보인다(알림 · 내 신청). 브라우저 기본 창을 쓰지 않고 카드 안에서 받는다 */
function RejectBox({ pending, onConfirm, onCancel }: { pending: boolean; onConfirm: (reason: string) => void; onCancel: () => void }) {
    const [reason, setReason] = useState("");
    return (
        <form
            onSubmit={(e) => { e.preventDefault(); onConfirm(reason.trim()); }}
            className="mt-3 rounded-xl bg-red-500/[0.05] border border-red-500/20 p-3"
        >
            <p className="text-[12.5px] font-semibold text-black/70 mb-2">거절 사유 <span className="font-medium text-black/45">(선택 — 신청자에게 그대로 보입니다)</span></p>
            <input
                value={reason}
                onChange={(e) => setReason(e.target.value.slice(0, 200))}
                autoFocus
                placeholder="예: 통화로 사장님 확인이 되지 않았어요"
                aria-label="거절 사유"
                className="w-full h-10 px-3 rounded-lg bg-white border border-black/10 text-[13.5px] outline-none focus:border-red-400"
            />
            <div className="mt-2 flex justify-end gap-2">
                <Button type="button" size="sm" variant="ghost" className="h-9" onClick={onCancel}>취소</Button>
                <Button type="submit" size="sm" className="h-9 bg-red-500 hover:bg-red-600 text-white" disabled={pending}>{pending ? "처리 중…" : "거절 확정"}</Button>
            </div>
        </form>
    );
}

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
    // 랭큐 계정으로 받은 신청 — 그 계정에 권한이 열렸다. PIN 도, 전화로 전할 것도 없다
    if (r.accountLinked) {
        return (
            <div className="bg-brand/[0.06] border border-brand/30 p-5 rounded-2xl">
                <p className="font-bold text-brand mb-2">✓ 승인 완료 — 신청한 랭큐 계정에 '내 매장 관리'가 열렸습니다</p>
                <div className="text-[14px] space-y-1">
                    {r.listingCode && <p>매장 페이지: <a className="text-brand font-bold underline" href={`/stores/${r.listingCode}`} target="_blank" rel="noreferrer">/stores/{r.listingCode}</a></p>}
                    <p className="text-black/60">
                        {r.notified
                            ? "앱 알림을 보냈습니다. 따로 연락하지 않으셔도 됩니다 — 사장님이 평소 쓰는 계정의 전체 메뉴 → 내 매장 관리로 들어옵니다."
                            : "앱 알림은 가지 못했습니다(알림이 꺼져 있을 수 있어요). 그래도 사장님이 평소 쓰는 계정의 전체 메뉴 → 내 매장 관리로 바로 들어옵니다."}
                    </p>
                </div>
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
    /** 랭큐 계정으로 받은 신청 — 승인하면 그 계정에 권한이 열린다 */
    accountLinked?: boolean; rejectReason?: string | null;
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
    const [rejecting, setRejecting] = useState<string | null>(null);
    const reject = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => apiRequest(`/api/hiq/admin/listing-claims/${id}/reject`, { method: "POST", body: { reason } }),
        onSuccess: (r: any) => { toast({ title: r?.notified ? "거절했습니다 — 신청자에게 알렸어요" : "거절했습니다" }); setRejecting(null); qc.invalidateQueries({ queryKey: CLAIMS_KEY }); },
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
            <p className="text-[13px] text-black/50">사장님이 매장 페이지에서 '내 매장 정보 관리 신청'을 하면 들어옵니다. 신청은 랭큐 계정으로 받습니다 — 승인하면 그 계정에 '내 매장 관리'가 열리고 파트너 매장이 만들어집니다(PIN 없음). 통화로 사장님이 맞는지 확인한 뒤 승인해 주세요.</p>
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
                        {c.accountLinked && <span title="승인하면 신청한 그 계정에 권한이 열립니다 — PIN 을 만들지 않습니다"><Pill tone="info">랭큐 계정으로 신청</Pill></span>}
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
                    {c.status === "rejected" && c.rejectReason && <p className="mt-1 text-[12.5px] text-black/55">거절 사유: {c.rejectReason}</p>}
                    {c.status === "pending" && rejecting === c.id && (
                        <RejectBox pending={reject.isPending} onCancel={() => setRejecting(null)} onConfirm={(reason) => reject.mutate({ id: c.id, reason })} />
                    )}
                    {c.status === "pending" && rejecting !== c.id && (
                        <div className="mt-3 flex gap-2">
                            <CallButton phone={c.applicantPhone} />
                            <Button data-admin-write size="sm" variant="ghost" className="h-9 text-red-500 ml-auto" disabled={reject.isPending}
                                onClick={() => setRejecting(c.id)}>거절</Button>
                            <Button data-admin-write size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={approve.isPending} onClick={() => approve.mutate(c.id)}>
                                {approve.isPending ? "처리 중…" : c.accountLinked ? "승인·권한 열기" : "승인·계정 발급"}
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
    /** 신청한 랭큐 계정(사장님 신청) — 있으면 승인이 그 계정에 권한을 연다 */
    applicantProfileId?: string | null; rejectReason?: string | null;
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
    const [rejecting, setRejecting] = useState<string | null>(null);
    const reject = useMutation({
        mutationFn: async ({ id, reason }: { id: string; reason: string }) => apiRequest(`/api/hiq/admin/store-registrations/${id}/reject`, { method: "POST", body: { reason } }),
        onSuccess: (r: any) => { toast({ title: r?.notified ? "거절했습니다 — 신청자에게 알렸어요" : "거절했습니다" }); setRejecting(null); qc.invalidateQueries({ queryKey: REGISTRATIONS_KEY }); },
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
                            {r.kind !== "report" && r.applicantProfileId && <span title="승인하면 신청한 그 계정에 권한이 열립니다 — PIN 을 만들지 않습니다"><Pill tone="info">랭큐 계정으로 신청</Pill></span>}
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
                        {r.status === "rejected" && r.rejectReason && <p className="mt-1 text-[12.5px] text-black/55">거절 사유: {r.rejectReason}</p>}
                        {r.status === "pending" && rejecting === r.id && (
                            <RejectBox pending={reject.isPending} onCancel={() => setRejecting(null)} onConfirm={(reason) => reject.mutate({ id: r.id, reason })} />
                        )}
                        {r.status === "pending" && rejecting !== r.id && (
                            <div className="mt-3 flex gap-2">
                                <CallButton phone={r.applicantPhone} />
                                <Button data-admin-write size="sm" variant="ghost" className="h-9 text-red-500 ml-auto" disabled={reject.isPending}
                                    onClick={() => setRejecting(r.id)}>거절</Button>
                                <Button data-admin-write size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={approve.isPending} onClick={() => approve.mutate(r.id)}>
                                    {approve.isPending ? "처리 중…" : r.kind === "report" ? "승인·디렉토리 추가" : r.applicantProfileId ? "승인·페이지 생성·권한 열기" : "승인·페이지 생성"}
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
                    {/* 매장 페이지의 '연락처만 남기기'(2026-10-18)는 이름이 없을 수 있고, 매장은 코드로 남는다(regionDetail '매장 코드 …') */}
                    <h3 className="text-[16px] font-bold">{l.ownerName || l.storeName || "이름 안 남김"} <span className="text-[13px] font-medium text-black/50">{l.ownerName ? "사장님" : "매장 · 연락처만 남김"}</span></h3>
                    <p className="text-[13px] text-black/60 tabular-nums">{l.phoneNumber}</p>
                    <p className="text-[12.5px] text-black/45">{[l.region, l.regionDetail, l.storeName, l.businessNumber && `사업자 ${l.businessNumber}`].filter(Boolean).join(" · ") || "매장 정보 없음"}</p>
                    <div className="mt-3 flex gap-2 flex-wrap">
                        <CallButton phone={l.phoneNumber} />
                        {(() => { const m = /^매장 코드 ([A-Za-z0-9_-]+)$/.exec(l.regionDetail ?? ""); return m ? <a href={`/stores/${encodeURIComponent(m[1])}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-black/10 px-3 text-[13px] font-bold text-black/65">매장 페이지</a> : null; })()}
                        <div className="ml-auto flex gap-1.5">
                            {l.status !== "CONTACTED" && <Button data-admin-write size="sm" variant="outline" className="h-9" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "CONTACTED" })}>연락함</Button>}
                            {l.status !== "REGISTERED" && <Button data-admin-write size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "REGISTERED" })}>등록 완료</Button>}
                            {l.status !== "NEW" && <Button data-admin-write size="sm" variant="ghost" className="h-9 text-black/50" disabled={update.isPending} onClick={() => update.mutate({ id: l.id, status: "NEW" })}>신규로</Button>}
                        </div>
                    </div>
                </Panel>
            ))}
        </div>
    );
}

// ================= 매장 정보 제보(2026-10-21) =================
// 매장 페이지의 '수정 제안' · '아는 만큼 알려 주기'가 쌓이는 곳(예전엔 보는 화면이 없어 아무도 못 봤다 — 2건).
// 처리 = 표시만. 실제로 고치는 것은 '매장 리스트'(또는 사장님 인증 뒤 사장님이). 연락처가 있으면 전화 단추.
export type ListingSuggestion = {
    id: string; listingCode: string; message: string; contact: string | null; createdAt: string; handledAt: string | null;
    listingName: string | null; listingAddress: string | null; listingSource: string | null; listingClaimed: boolean | null;
};
export const LISTING_SUGGESTIONS_KEY = ["/api/hiq/admin/listing-suggestions"] as const;

/** 제보를 확인하고 고치기 — 영업시간 · 전화 · 테이블 수 · 10분 요금만(서버 PATCH /admin/listings/:code, 사장님 인증 매장은 거절) */
const EDIT_FIELDS = [
    ["openHours", "영업시간", "예: 12:00 ~ 02:00", "text"], ["phone", "전화", "02-000-0000", "tel"],
    // 빈 칸의 회색 글씨가 값처럼 읽히지 않게 — 숫자 칸은 '—' · '예:'
    ["tableLarge", "대대 수", "—", "num"], ["tableMedium", "중대 수", "—", "num"], ["tablePocket", "포켓 수", "—", "num"],
    ["rate10Large", "대대 10분(원)", "예: 2500", "num"], ["rate10Medium", "중대 10분(원)", "예: 2000", "num"], ["rate10Pocket", "포켓 10분(원)", "예: 2000", "num"],
] as const;
type EditKey = (typeof EDIT_FIELDS)[number][0];
function ListingEditor({ code, suggestionId, onDone }: { code: string; suggestionId: string; onDone: () => void }) {
    const { toast } = useToast();
    const qc = useQueryClient();
    // 지금 값 — 공개 매장 상세(같은 값을 매장 페이지가 그린다)
    const cur = useQuery<Record<string, unknown>>({ queryKey: [`/api/hiq/listings/${code}`] });
    const [form, setForm] = useState<Partial<Record<EditKey, string>> | null>(null);
    const base = useMemo(() => {
        const d = cur.data ?? {};
        return Object.fromEntries(EDIT_FIELDS.map(([k]) => [k, d[k] == null ? "" : String(d[k])])) as Record<EditKey, string>;
    }, [cur.data]);
    const f = form ?? base;
    const save = useMutation({
        mutationFn: async () => {
            // 바뀐 칸만 보낸다(빈 칸 = 지우기)
            const body: Record<string, unknown> = { suggestionId };
            for (const [k, , , kind] of EDIT_FIELDS) if (f[k] !== base[k]) body[k] = kind === "num" ? (f[k] === "" ? null : Number(f[k])) : f[k];
            if (Object.keys(body).length === 1) throw new Error("바뀐 칸이 없습니다");
            return apiRequest(`/api/hiq/admin/listings/${code}`, { method: "PATCH", body });
        },
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: LISTING_SUGGESTIONS_KEY }); qc.invalidateQueries({ queryKey: [`/api/hiq/listings/${code}`] });
            toast({ title: "매장 정보를 고치고 처리함으로 표시했습니다" }); onDone();
        },
        onError: (e: any) => toast({ title: e?.message || "저장 실패", variant: "destructive" }),
    });
    if (cur.isLoading) return <p className="mt-3 text-[12.5px] text-black/45">지금 값을 불러오는 중…</p>;
    return (
        <div className="mt-3 rounded-xl border border-black/10 p-3" data-testid="listing-editor">
            <div className="grid grid-cols-2 gap-2">
                {EDIT_FIELDS.map(([k, label, ph, kind]) => (
                    <label key={k} className={k === "openHours" ? "col-span-2" : ""}>
                        <span className="block text-[12px] font-bold text-black/50">{label}</span>
                        <input value={f[k] ?? ""} placeholder={ph} inputMode={kind === "num" ? "numeric" : kind === "tel" ? "tel" : "text"}
                            onChange={(e) => setForm({ ...f, [k]: kind === "num" ? e.target.value.replace(/[^0-9]/g, "") : e.target.value })}
                            className="mt-0.5 h-10 w-full rounded-lg bg-black/[0.04] px-3 text-[14px] font-medium outline-none focus:bg-black/[0.06] tabular-nums" />
                    </label>
                ))}
            </div>
            <p className="mt-2 text-[12px] text-black/45">제보 내용을 확인한 것만 적어 주세요. 빈 칸은 지우기입니다.</p>
            <div className="mt-2 flex justify-end gap-1.5">
                <Button size="sm" variant="ghost" className="h-9 text-black/50" onClick={onDone}>닫기</Button>
                <Button data-admin-write size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" disabled={save.isPending} onClick={() => save.mutate()}>고치고 처리함</Button>
            </div>
        </div>
    );
}

export function ListingSuggestionsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const { data, isLoading } = useQuery<ListingSuggestion[]>({ queryKey: LISTING_SUGGESTIONS_KEY });
    const list = Array.isArray(data) ? data : [];
    const [filter, setFilter] = useState<"new" | "done" | "all">("new");
    const [q, setQ] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    const mark = useMutation({
        mutationFn: async ({ id, handled }: { id: string; handled: boolean }) => apiRequest(`/api/hiq/admin/listing-suggestions/${id}/handled`, { method: "POST", body: { handled } }),
        onSuccess: (_r, v) => { qc.invalidateQueries({ queryKey: LISTING_SUGGESTIONS_KEY }); toast({ title: v.handled ? "처리함으로 표시했습니다(매장 정보는 그대로)" : "새 제보로 되돌렸습니다" }); },
        onError: (e: any) => toast({ title: e?.message || "변경 실패", variant: "destructive" }),
    });
    const rows = useMemo(() => {
        const s = q.trim();
        return list
            .filter((x) => filter === "all" || (filter === "new" ? !x.handledAt : !!x.handledAt))
            .filter((x) => !s || [x.listingName, x.listingAddress, x.message, x.listingCode].some((v) => v?.includes(s)));
    }, [list, filter, q]);
    const fresh = list.filter((x) => !x.handledAt).length;
    return (
        <div className="space-y-3">
            <div className="bg-black/[0.04] p-4 rounded-2xl text-[13px] text-black/65 leading-relaxed">
                매장 페이지의 <b>'정보가 다른가요? 수정 제안'</b>과, 요금 · 영업시간이 비어 있는 매장의 <b>'아는 만큼 알려 주기'</b>가 여기로 옵니다.
                확인한 것만 <b>정보 고치기</b>로 싣습니다(영업시간 · 전화 · 테이블 · 10분 요금). 요금이나 영업시간이 들어간 매장은 검색 색인에도 다시 들어갑니다.
                폐업 · 이전처럼 고칠 칸이 없는 제보는 확인 뒤 <b>고칠 것 없이 처리</b>를 누르세요 — 이 단추는 매장 정보를 바꾸지 않습니다. 사장님 인증 매장은 사장님이 고칩니다.
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                <FilterChips value={filter} onChange={setFilter} options={[
                    { id: "new", label: "새 제보", count: fresh, alert: true },
                    { id: "done", label: "처리함", count: list.length - fresh },
                    { id: "all", label: "전체", count: list.length },
                ]} />
                <SearchBox value={q} onChange={setQ} placeholder="매장·주소·내용" className="sm:ml-auto sm:w-64" />
            </div>
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>해당하는 제보가 없습니다.</EmptyState> : rows.map((x) => (
                <Panel key={x.id} className="p-4" data-testid="listing-suggestion">
                    <div className="flex items-center gap-1.5 mb-1">
                        <Pill tone={x.handledAt ? "neutral" : "alert"}>{x.handledAt ? "처리함" : "새 제보"}</Pill>
                        {x.listingSource === "gov" && <Pill tone="info">인허가 정보만</Pill>}
                        {x.listingClaimed && <Pill tone="brand">사장님 인증</Pill>}
                        <span className="ml-auto text-[12px] text-black/40 tabular-nums" title={kstDateTime(x.createdAt)}>{agoLabel(x.createdAt)}</span>
                    </div>
                    <h3 className="text-[16px] font-bold">{x.listingName ?? `매장 코드 ${x.listingCode}`}</h3>
                    {x.listingAddress && <p className="text-[12.5px] text-black/45">{x.listingAddress}</p>}
                    <p className="mt-2 whitespace-pre-wrap rounded-xl bg-black/[0.03] px-3 py-2.5 text-[14px] leading-relaxed">{x.message}</p>
                    <div className="mt-3 flex gap-2 flex-wrap items-center">
                        {x.contact && <CallButton phone={x.contact} label={`회신 ${x.contact}`} />}
                        <a href={`/stores/${encodeURIComponent(x.listingCode)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-black/10 px-3 text-[13px] font-bold text-black/65">매장 페이지</a>
                        {!x.listingClaimed && x.listingName && editing !== x.id && (
                            // 정보 고치기가 주 단추(2026-10-21 — '처리함'만 눌러 표시만 바뀌고 매장 정보는 그대로였던 일: 위너스 당구클럽)
                            <Button data-admin-write size="sm" className="h-9 bg-brand hover:bg-brand-strong text-white" onClick={() => setEditing(x.id)}>정보 고치기</Button>
                        )}
                        <div className="ml-auto">
                            {x.handledAt
                                ? <Button data-admin-write size="sm" variant="ghost" className="h-9 text-black/50" disabled={mark.isPending} onClick={() => mark.mutate({ id: x.id, handled: false })}>새 제보로</Button>
                                : <Button data-admin-write size="sm" variant="ghost" className="h-9 text-black/55" disabled={mark.isPending} onClick={() => mark.mutate({ id: x.id, handled: true })} title="매장 정보는 바꾸지 않고 처리했다고만 표시">고칠 것 없이 처리</Button>}
                        </div>
                    </div>
                    {editing === x.id && <ListingEditor code={x.listingCode} suggestionId={x.id} onDone={() => setEditing(null)} />}
                </Panel>
            ))}
        </div>
    );
}
