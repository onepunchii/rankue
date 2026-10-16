/**
 * 어드민 · 등산 › 산 자료(2026-10-17 어드민 전수 조사 — "정상 좌표를 판정하지 못한 산을 지금은 코드와 스크립트로 고쳐 배포해야 한다").
 * 100대 명산 점검표: 정상 150m 안을 코스가 지나는가(shared/hikingSummitFix 때의 심판과 같다). 산을 열면 우리 코스 선으로 그린 작은 지도 —
 * 지금 정상(붉은 점과 150m 원) · 정상 후보(코스마다 가장 높은 점, 산 높이 ±35m 면 진하게) · 새 자리(누르거나 붙여 넣기).
 * 고친 칸은 admin_keep 에 적혀 다시 적재해도 남는다. 바깥 지도는 쓰지 않는다(우리 자료만).
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { KEEP_LABEL, ON_COURSE_M, distM, nearestOnLine, parseSpot, type AdminMountainDetail, type AdminMountainRow, type KeepField, type LinePoint } from "@shared/hikingMountainEdit";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, SearchBox, kstDateTime } from "./adminUtils";

const LIST = "/api/hiq/admin/hiking/mountains";

function NearPill({ m }: { m: Pick<AdminMountainRow, "nearestM" | "courses"> }) {
    if (m.nearestM == null) return <Pill tone="neutral">코스 없음</Pill>;
    return m.nearestM <= ON_COURSE_M ? <Pill tone="brand">코스가 정상을 지남</Pill> : <Pill tone="alert">가장 가까운 코스 {m.nearestM.toLocaleString()}m</Pill>;
}

/** 우리 코스 선으로 그린 작은 지도 — 위도 · 경도를 그 자리의 평면으로(경도는 cos 위도만큼 줄인다) */
function MiniMap({ d, pick, onPick }: { d: AdminMountainDetail; pick: { lat: number; lng: number } | null; onPick: (p: { lat: number; lng: number }) => void }) {
    const W = 600, H = 360, PAD = 28;
    const pts = [...d.lines.flatMap((l) => l.line.map((p) => [p[0], p[1]] as const)), ...(d.lat != null && d.lng != null ? [[d.lat, d.lng] as const] : []), ...d.candidates.map((c) => [c.lat, c.lng] as const), ...(pick ? [[pick.lat, pick.lng] as const] : [])];
    if (pts.length === 0) return <EmptyState>그릴 코스가 없어요 — 정상 자리를 직접 적어 주세요.</EmptyState>;
    const lat0 = pts.reduce((s, p) => s + p[0], 0) / pts.length, k = Math.cos((lat0 * Math.PI) / 180);
    const xs = pts.map((p) => p[1] * k), ys = pts.map((p) => p[0]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const span = Math.max(maxX - minX, maxY - minY, 0.004);
    const sc = Math.min((W - PAD * 2) / span, (H - PAD * 2) / span);
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const X = (lng: number) => W / 2 + (lng * k - cx) * sc, Y = (lat: number) => H / 2 - (lat - cy) * sc;
    const r150 = (ON_COURSE_M / 111_320) * sc;
    const toSpot = (ev: React.MouseEvent<SVGSVGElement>) => {
        const box = ev.currentTarget.getBoundingClientRect();
        const x = ((ev.clientX - box.left) / box.width) * W, y = ((ev.clientY - box.top) / box.height) * H;
        onPick({ lat: Math.round((cy - (y - H / 2) / sc) * 1e6) / 1e6, lng: Math.round(((x - W / 2) / sc + cx) / k * 1e6) / 1e6 });
    };
    return (
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full cursor-crosshair rounded-xl bg-[#F4F1E8]" onClick={toSpot} data-testid="admin-mountain-map" role="img" aria-label="코스 선과 정상 자리">
            {d.lines.map((l) => <polyline key={l.id} points={l.line.map((p) => `${X(p[1]).toFixed(1)},${Y(p[0]).toFixed(1)}`).join(" ")} fill="none" stroke={l.nearestM != null && l.nearestM <= ON_COURSE_M ? "#3F7A5C" : "#9AA59D"} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />)}
            {d.candidates.map((c, i) => (
                <g key={i} onClick={(e) => { e.stopPropagation(); onPick({ lat: c.lat, lng: c.lng }); }} className="cursor-pointer">
                    <circle cx={X(c.lng)} cy={Y(c.lat)} r="9" fill={c.nearHeight ? "#2563EB" : "#FFFFFF"} stroke="#2563EB" strokeWidth="2.5" />
                    {/* 폰 폭에서도 읽히게 — 그림이 줄어드는 만큼 글자를 크게 둔다 */}
                    <text x={X(c.lng) + 13} y={Y(c.lat) + 6} fontSize="17" fontWeight="700" fill="#1E3A8A" stroke="#F4F1E8" strokeWidth="4" paintOrder="stroke">{c.ele}m</text>
                </g>
            ))}
            {d.lat != null && d.lng != null && <g><circle cx={X(d.lng)} cy={Y(d.lat)} r={r150} fill="#DC262614" stroke="#DC2626" strokeDasharray="4 3" /><circle cx={X(d.lng)} cy={Y(d.lat)} r="6" fill="#DC2626" stroke="#fff" strokeWidth="2" /></g>}
            {pick && <g><circle cx={X(pick.lng)} cy={Y(pick.lat)} r={r150} fill="#0A6B3F14" stroke="#0A6B3F" /><circle cx={X(pick.lng)} cy={Y(pick.lat)} r="6" fill="#0A6B3F" stroke="#fff" strokeWidth="2" /></g>}
        </svg>
    );
}

function MountainEdit({ id, onDone }: { id: string; onDone: () => void }) {
    const { toast } = useToast();
    const q = useQuery<AdminMountainDetail>({ queryKey: [`${LIST}/${id}`] });
    const d = q.data;
    const [spotText, setSpotText] = useState("");
    const [height, setHeight] = useState("");
    const [peak, setPeak] = useState("");
    const [reason, setReason] = useState("");
    useEffect(() => { if (d) { setSpotText(d.lat != null ? `${d.lat}, ${d.lng}` : ""); setHeight(d.heightM != null ? String(d.heightM) : ""); setPeak(d.peakName ?? ""); } }, [d?.id]);
    const pick = parseSpot(spotText);
    const check = useMemo(() => {
        if (!d || !pick) return null;
        const near = d.lines.length ? Math.min(...d.lines.map((l) => nearestOnLine(l.line.map((p) => [p[0], p[1], p[2], 0] as LinePoint), pick.lat, pick.lng)?.offM ?? Infinity)) : null;
        return { near: near == null || !Number.isFinite(near) ? null : Math.round(near), moved: d.lat != null && d.lng != null ? Math.round(distM(d.lat, d.lng, pick.lat, pick.lng)) : null };
    }, [d, pick?.lat, pick?.lng]);
    const save = useMutation({
        mutationFn: () => apiRequest(`${LIST}/${id}`, { method: "POST", body: { lat: pick?.lat, lng: pick?.lng, heightM: height.trim() === "" ? null : Number(height), peakName: peak, reason } }),
        onSuccess: (r: any) => { toast({ title: "고쳤어요", description: `${(r?.changed ?? []).map((k: KeepField) => KEEP_LABEL[k]).join(" · ")}${r?.movedM != null ? ` · ${r.movedM.toLocaleString()}m 옮김` : ""} · 다른 서버는 10분 안에 따라와요` }); setReason(""); onDone(); void q.refetch(); },
        onError: (e: any) => toast({ title: e?.message || "고치지 못했어요", variant: "destructive" }),
    });
    if (q.isLoading || !d) return <p className="mt-3 text-[12.5px] text-black/45">코스 선을 불러오는 중…</p>;
    return (
        <div className="mt-3 grid gap-3 rounded-2xl bg-black/[0.03] p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]" data-testid="admin-mountain-edit">
            <div>
                <MiniMap d={d} pick={pick && check?.moved !== 0 ? pick : null} onPick={(p) => setSpotText(`${p.lat}, ${p.lng}`)} />
                <p className="mt-1.5 text-[11.5px] leading-snug text-black/45"><b className="text-red-600">붉은 점</b> 지금 정상(점선 150m) · <b className="text-blue-700">파란 점</b> 코스마다 가장 높은 곳(진하면 산 높이 ±35m) · <b className="text-brand">초록 점</b> 새 자리 · 지도를 누르면 그 자리가 들어가요.</p>
            </div>
            <div className="space-y-2.5">
                <p className="text-[12.5px] text-black/60">코스 {d.lines.length}개 · 정상 인증 {d.summits}번{d.lines.length ? ` · 정상 150m 안을 지나는 코스 ${d.lines.filter((l) => l.nearestM != null && l.nearestM <= ON_COURSE_M).length}개` : ""}</p>
                {Object.entries(d.keep).map(([k, v]) => v && <p key={k} className="text-[12px] text-amber-700">고친 {KEEP_LABEL[k as KeepField]} — {kstDateTime(v.at)} {v.by} · {v.reason}(전: {v.was})</p>)}
                <label className="block text-[12px] font-bold text-black/60">정상 자리(위도, 경도)
                    <Input value={spotText} onChange={(e) => setSpotText(e.target.value)} placeholder="37.12345, 128.45678" className="mt-1 h-9 font-mono text-[13px]" />
                </label>
                {spotText && !pick && <p className="text-[12px] font-bold text-red-600">위도, 경도를 '37.12345, 128.45678' 처럼 적어 주세요(남한 안).</p>}
                {check && (
                    <p className={`text-[12.5px] font-bold ${check.near != null && check.near <= ON_COURSE_M ? "text-brand" : "text-red-600"}`}>
                        {check.near == null ? "그릴 코스가 없어 확인할 수 없어요" : check.near <= ON_COURSE_M ? `코스가 이 자리 ${check.near}m 옆을 지나요` : `가장 가까운 코스가 ${check.near.toLocaleString()}m 떨어져 있어요`}
                        {check.moved ? <span className="font-medium text-black/45"> · 지금 자리에서 {check.moved.toLocaleString()}m</span> : null}
                    </p>
                )}
                <div className="grid grid-cols-2 gap-2">
                    <label className="block text-[12px] font-bold text-black/60">높이(m)<Input value={height} onChange={(e) => setHeight(e.target.value.replace(/[^\d]/g, ""))} inputMode="numeric" className="mt-1 h-9 text-[13px]" /></label>
                    <label className="block text-[12px] font-bold text-black/60">정상 이름<Input value={peak} onChange={(e) => setPeak(e.target.value)} placeholder="비로봉" className="mt-1 h-9 text-[13px]" /></label>
                </div>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="고치는 까닭 · 근거(예: 공식 목록 · 코스 기록)" className="h-9 text-[13px]" />
                <Button data-admin-write variant="outline" disabled={!pick || !reason.trim() || save.isPending} className="h-9 w-full text-[13px] font-bold"
                    onClick={async () => { if (await appConfirm({ message: `${d.name} 자료를 고칠까요?\n\n정상 인증은 새 자리에서 150m 안으로 판정해요(이미 받은 인증은 그대로).\n다시 적재해도 고친 칸은 남아요.`, confirmText: "고치기" })) save.mutate(); }}>고치기</Button>
            </div>
        </div>
    );
}

export default function HikingMountainsView() {
    const qc = useQueryClient();
    const [view, setView] = useState<"kfs100" | "kept" | "all">("kfs100");
    const [offOnly, setOffOnly] = useState(false);
    const [q, setQ] = useState("");
    const [open, setOpen] = useState<string | null>(null);
    const list = useQuery<AdminMountainRow[]>({ queryKey: [LIST, { view, ...(q.trim() ? { q: q.trim() } : {}) }] });
    const rows = Array.isArray(list.data) ? list.data : [];
    const off = rows.filter((m) => m.nearestM == null || m.nearestM > ON_COURSE_M);
    const shown = offOnly ? off : rows;
    return (
        <div className="space-y-4" data-testid="admin-hiking-mountains">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label={view === "kfs100" && !q.trim() ? "100대 명산" : "산"} value={rows.length} unit="곳" onClick={() => setOffOnly(false)} />
                <KpiTile label="코스가 정상을 지남" value={rows.length - off.length} unit="곳" tone="brand" />
                <KpiTile label="정상 밖 · 코스 없음" value={off.length} unit="곳" tone={off.length ? "alert" : "default"} onClick={() => setOffOnly(true)} />
                <KpiTile label="고친 칸이 있는 산" value={rows.filter((m) => Object.keys(m.keep).length).length} unit="곳" onClick={() => setView("kept")} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
                <div className="shrink-0"><FilterChips value={view} onChange={(v) => { setView(v); setOpen(null); }} options={[{ id: "kfs100", label: "100대 명산" }, { id: "kept", label: "고친 산" }, { id: "all", label: "높은 산" }]} /></div>
                <div className="shrink-0"><FilterChips value={offOnly ? "off" : "all"} onChange={(v) => setOffOnly(v === "off")} options={[{ id: "all", label: "전부" }, { id: "off", label: "정상 밖만", alert: true }]} /></div>
                <SearchBox value={q} onChange={setQ} placeholder="산 · 정상 이름" className="w-full sm:ml-auto sm:w-56" />
            </div>
            <p className="text-[12px] leading-snug text-black/45">정상 인증은 정상 자리에서 {ON_COURSE_M}m 안이어야 돼요. 받아 둔 코스가 그 안을 지나지 않으면 정상 자리가 틀렸을 수 있어요 — 산을 열어 코스 위 가장 높은 곳을 보고 고칩니다.</p>
            {list.isLoading ? <EmptyState>코스 선과 견주는 중…</EmptyState> : shown.length === 0 ? <EmptyState>{offOnly ? "정상 밖인 산이 없어요." : "산이 없어요."}</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {shown.map((m) => (
                        <div key={m.id} className="px-4 py-3">
                            <button type="button" onClick={() => setOpen(open === m.id ? null : m.id)} className="flex w-full items-start gap-3 text-left" data-testid="admin-mountain-row">
                                <span className="w-8 shrink-0 pt-0.5 text-right text-[12px] font-black tabular-nums text-black/35">{m.kfs100 ?? ""}</span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex flex-wrap items-center gap-x-1.5 text-[13.5px]"><b className="font-black">{m.name}</b>{m.peakName && <span className="text-black/50">{m.peakName}</span>}<span className="text-[12px] text-black/40">{m.heightM ? `${m.heightM}m` : ""}</span></span>
                                    <span className="mt-0.5 block text-[12px] text-black/45">{m.place} · 코스 {m.courses} · 인증 {m.summits}</span>
                                    {Object.keys(m.keep).length > 0 && <span className="mt-1 flex flex-wrap gap-1">{(Object.keys(m.keep) as KeepField[]).map((k) => <span key={k} className="rounded bg-amber-500/15 px-1.5 text-[11.5px] font-bold text-amber-700">고친 {KEEP_LABEL[k]}</span>)}</span>}
                                </span>
                                <span className="shrink-0"><NearPill m={m} /></span>
                            </button>
                            {open === m.id && <MountainEdit id={m.id} onDone={() => void qc.invalidateQueries({ queryKey: [LIST] })} />}
                        </div>
                    ))}
                </Panel>
            )}
        </div>
    );
}
