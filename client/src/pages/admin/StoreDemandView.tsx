/**
 * 어드민 · 손님이 찾는 매장(2026-10-18 오너: "당구장 사장님을 모집하기 위한 제안 — 지금 당구장 클릭수는 있는데").
 * 방문자 발자국을 매장 페이지별로 접은 목록 — 본 사람 순. 사장님께 전화 · 방문할 때 보여 드릴 리포트 카드를 여기서 받는다.
 * 연락은 운영자가 직접 한다(문자 · 메일을 대신 보내지 않는다). 셈의 규칙은 shared/storeDemand.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FilterChips, SearchBox, EmptyState, Panel, Pill, CallButton, KpiTile, agoLabel } from "./adminUtils";
import { demandRangeText, intentsOf, naverShare, storeReportPngPath, type StoreDemandList, type StoreDemandRow } from "@shared/storeDemand";

type Show = "open" | "claimed" | "all";

function ReportSheet({ row, days, onClose }: { row: StoreDemandRow; days: number; onClose: () => void }) {
    const src = storeReportPngPath(row.code, days);
    return (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={`${row.name} 리포트 카드`} onClick={onClose}>
            <div className="max-h-[92vh] w-full max-w-[460px] overflow-y-auto rounded-t-3xl bg-white p-4 sm:rounded-3xl" onClick={(e) => e.stopPropagation()} style={{ paddingBottom: "max(16px, env(safe-area-inset-bottom))" }}>
                <div className="mb-3 flex items-center gap-2">
                    <h3 className="text-[16px] font-bold">{row.name} 리포트 카드</h3>
                    <button type="button" onClick={onClose} className="ml-auto h-9 rounded-lg px-3 text-[13px] font-bold text-black/55" aria-label="닫기">닫기</button>
                </div>
                <img src={src} alt={`${row.name} 리포트 카드`} width={1200} height={1500} className="w-full rounded-2xl bg-[#062A1E]" data-testid="store-report-img" />
                <div className="mt-3 flex gap-2">
                    <a href={src} download={`rankue-report-${row.code}.png`} className="flex h-11 flex-1 items-center justify-center rounded-xl bg-brand text-[14px] font-bold text-white">그림 받기</a>
                    <a href={`/stores/${encodeURIComponent(row.code)}`} target="_blank" rel="noreferrer" className="flex h-11 flex-1 items-center justify-center rounded-xl border border-black/10 text-[14px] font-bold text-black/65">매장 페이지</a>
                </div>
                <p className="mt-2 text-[12px] leading-relaxed text-black/45">사장님께 보여 드리는 한 장이에요 — 공개 카드가 아니라 관리자만 받을 수 있어요. 숫자는 방문자 발자국 그대로예요.</p>
            </div>
        </div>
    );
}

export default function StoreDemandView() {
    const [days, setDays] = useState<"7" | "30">("30");
    const [show, setShow] = useState<Show>("open");
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<StoreDemandRow | null>(null);
    const { data, isLoading } = useQuery<StoreDemandList>({ queryKey: [`/api/hiq/admin/store-demand?days=${days}`] });
    const all = data?.rows ?? [];
    const top = Math.max(1, ...all.map((r) => r.visitors));
    const rows = useMemo(() => {
        const s = q.trim();
        return all.filter((r) => (show === "all" ? true : show === "claimed" ? r.claimed : !r.claimed)).filter((r) => !s || [r.name, r.region, r.address].some((v) => v?.includes(s)));
    }, [all, show, q]);
    const t = data?.totals;
    const share = t && t.visitors ? Math.round((t.naver / t.visitors) * 100) : null;

    return (
        <div className="space-y-3">
            <div className="rounded-2xl bg-brand/[0.07] p-4 text-[13px] leading-relaxed text-black/70">
                매장 페이지를 <b>본 사람</b>과 거기서 <b>가게로 가려고 누른 것</b>(길찾기 · 전화 · 주소)이에요. 방문자 발자국 기준({data ? demandRangeText(data.from, data.to) : "…"}).
                미등록 매장 사장님께 전화 · 방문할 때 <b>리포트 카드</b>를 보여 드리세요 — 연락은 직접 해 주세요.
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <KpiTile label="본 사람" value={t ? t.visitors.toLocaleString("ko-KR") : "-"} unit="명" sub={t ? `${t.views.toLocaleString("ko-KR")}번 열림` : undefined} tone="brand" />
                <KpiTile label="네이버 검색으로" value={share ?? "-"} unit={share == null ? undefined : "%"} />
                <KpiTile label="가게로 가려는 누름" value={t ? t.intents.toLocaleString("ko-KR") : "-"} unit="번" sub="길찾기 · 전화 · 주소" />
                <KpiTile label="열린 매장" value={t ? t.stores.toLocaleString("ko-KR") : "-"} unit="곳" />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <FilterChips value={days} onChange={setDays} options={[{ id: "7", label: "7일" }, { id: "30", label: "30일" }]} />
                <FilterChips value={show} onChange={setShow} options={[
                    { id: "open", label: "미등록", count: all.filter((r) => !r.claimed).length },
                    { id: "claimed", label: "등록됨", count: all.filter((r) => r.claimed).length },
                    { id: "all", label: "전체", count: all.length },
                ]} />
                <SearchBox value={q} onChange={setQ} placeholder="매장 · 지역" className="sm:ml-auto sm:w-56" />
            </div>
            {isLoading ? <EmptyState>불러오는 중…</EmptyState> : rows.length === 0 ? <EmptyState>해당하는 매장이 없습니다.</EmptyState> : (
                <ol className="space-y-2" data-testid="store-demand-list">
                    {rows.map((r, i) => {
                        const ns = naverShare(r), intents = intentsOf(r);
                        return (
                            <li key={r.code}>
                                <Panel className="p-4">
                                    <div className="flex items-start gap-3">
                                        <span className="mt-0.5 w-7 shrink-0 text-right text-[15px] font-black tabular-nums text-black/35">{i + 1}</span>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <h3 className="truncate text-[15.5px] font-bold">{r.name}</h3>
                                                {r.claimed && <Pill tone="brand">등록됨</Pill>}
                                                {r.claimTaps > 0 && <Pill tone="warn">관리 신청 누름 {r.claimTaps}</Pill>}
                                                <span className="ml-auto text-[12px] tabular-nums text-black/40">{agoLabel(r.lastAt)}</span>
                                            </div>
                                            <p className="truncate text-[12.5px] text-black/50">{r.address ?? r.region ?? ""}</p>
                                            {/* 본 사람 막대 — 1위에 견준 길이 */}
                                            <div className="mt-2 flex items-center gap-2">
                                                <div className="h-2 flex-1 overflow-hidden rounded-full bg-black/[0.05]"><div className="h-full rounded-full bg-brand" style={{ width: `${Math.max(3, Math.round((r.visitors / top) * 100))}%` }} /></div>
                                                <span className="w-[64px] shrink-0 text-right text-[14px] font-black tabular-nums">{r.visitors.toLocaleString("ko-KR")}<span className="ml-0.5 text-[11.5px] font-bold text-black/40">명</span></span>
                                            </div>
                                            <p className="mt-1.5 text-[12.5px] tabular-nums text-black/55">
                                                길찾기 {r.directions} · 주소 {r.addressTaps} · 전화 {r.calls}{intents ? <b className="text-black/75"> = {intents}번</b> : null}{ns != null ? ` · 네이버 ${ns}%` : ""} · {r.views}번 열림
                                            </p>
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                <button type="button" onClick={() => setOpen(r)} className="h-9 rounded-lg bg-brand px-3 text-[13px] font-bold text-white" data-testid="store-report-open">리포트 카드</button>
                                                <CallButton phone={r.phone} label="매장 전화" />
                                                <a href={`/stores/${encodeURIComponent(r.code)}`} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-lg border border-black/10 px-3 text-[13px] font-bold text-black/65">매장 페이지</a>
                                            </div>
                                        </div>
                                    </div>
                                </Panel>
                            </li>
                        );
                    })}
                </ol>
            )}
            {open && <ReportSheet row={open} days={Number(days)} onClose={() => setOpen(null)} />}
        </div>
    );
}
