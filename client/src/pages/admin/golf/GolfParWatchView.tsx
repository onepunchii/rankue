/**
 * 어드민 · 골프 › 파 자동 반영(2026-10-17 어드민 전수 조사 골프 ② — "서로 다른 카드 두 장이면 공용 파가 바뀐다 · 잠금 칸이 없다").
 * 세 묶음: 바뀐 기록(카드가 더한 코스 · 바꾼 파 · 막은 것 · 운영자 수정 · 되돌림) / 카드가 본 코스(명부와 견줌 · 맞춘 사람 이름) / 잠근 코스.
 * 잠그면 카드가 그 코스의 파를 더는 바꾸지 못한다. 되돌리면 잠근다(같은 카드 두 장이 이미 쌓여 있어 다음 카드에 다시 바뀌기 때문).
 * 서버: server/routes/modules/adminGolf/pars.ts · server/storage/adminGolfPars.ts · 규칙 shared/golfParWatch
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { PAR_CHANGE_LABEL, SEEN_STATUS_LABEL, canRevert, parsDiff, type ParChangeKind, type ParChangeRow, type ParWatch, type SeenCourseRow, type SeenStatus } from "@shared/golfParWatch";
import { EmptyState, FilterChips, KpiTile, Panel, Pill, kstDateTime } from "../adminUtils";

const KEY = "/api/hiq/admin/golf/pars";
type View = "changes" | "seen" | "locked";
type Tone = "brand" | "alert" | "warn" | "neutral" | "info";
const KIND_TONE: Record<ParChangeKind, Tone> = { added: "info", fixed: "warn", blocked: "neutral", admin: "brand", reverted: "alert", lock: "neutral", unlock: "neutral" };
const STATUS_TONE: Record<SeenStatus, Tone> = { same: "brand", pending: "warn", "applied-differs": "alert", blocked: "neutral", missing: "info" };

/** 9칸 파 — 다른 칸(diff)은 진하게 */
function Nine({ pars, diff, label }: { pars: number[] | null; diff?: number[]; label: string }) {
    const d = new Set(diff ?? []);
    return (
        <div className="flex items-center gap-1.5">
            <span className="w-9 shrink-0 text-[11px] font-bold text-black/40">{label}</span>
            {pars ? (
                <span className="grid flex-1 grid-cols-9 gap-0.5">
                    {pars.map((p, i) => (
                        <span key={i} className={`rounded-md py-0.5 text-center text-[12px] tabular-nums ${d.has(i) ? "bg-amber-100 font-black text-amber-800" : "bg-black/[0.04] text-black/60"}`}>{p}</span>
                    ))}
                </span>
            ) : <span className="text-[12px] text-black/35">없음</span>}
        </div>
    );
}

function Reason({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return <Input value={value} maxLength={200} onChange={(e) => onChange(e.target.value)} placeholder="까닭(작업 기록에 남아요)" className="h-9 text-[13px]" />;
}

function useAct() {
    const { toast } = useToast();
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (v: { path: string; reason: string; done: string }) => apiRequest(`${KEY}${v.path}`, { method: "POST", body: { reason: v.reason } }).then(() => v.done),
        onSuccess: (done) => { toast({ title: done }); void qc.invalidateQueries({ queryKey: [KEY] }); },
        onError: (e: any) => toast({ title: e?.message || "하지 못했어요", variant: "destructive" }),
    });
}

function ChangeRow({ r }: { r: ParChangeRow }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const act = useAct();
    const revertable = canRevert(r);
    const diff = parsDiff(r.from, r.to);
    return (
        <div className="px-4 py-3" data-testid="par-change">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2 text-left">
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={KIND_TONE[r.kind] ?? "neutral"}>{PAR_CHANGE_LABEL[r.kind] ?? r.kind}</Pill>
                        {r.lock && <Pill tone="neutral">잠김</Pill>}
                        <span className="ml-auto text-[11.5px] tabular-nums text-black/40">{kstDateTime(r.at)}</span>
                    </span>
                    <span className="mt-1 block truncate text-[14px] font-black">{r.clubName ?? "골프장 미상"} <span className="font-semibold text-black/55">· {r.courseName}</span></span>
                    <span className="block text-[12px] text-black/45">
                        {r.members != null ? `맞춘 사람 ${r.members}명` : r.by ? r.by : ""}{diff.length ? ` · 다른 홀 ${diff.map((i) => i + 1).join(", ")}` : ""}{r.reason ? ` · ${r.reason}` : ""}
                    </span>
                </span>
            </button>
            {(r.from || r.to) && (
                <div className="mt-2 space-y-1">
                    {r.from && <Nine label="전" pars={r.from} diff={diff} />}
                    {r.to && <Nine label={r.kind === "blocked" ? "카드" : "후"} pars={r.to} diff={diff} />}
                    {r.current && (r.kind === "fixed" || r.kind === "added") && parsDiff(r.current, r.to).length > 0 && <Nine label="지금" pars={r.current} diff={parsDiff(r.current, r.to)} />}
                </div>
            )}
            {open && r.courseId && (revertable || !r.lock) && (
                <div data-admin-write className="mt-2.5 flex flex-col gap-2 rounded-xl bg-black/[0.03] p-2.5 sm:flex-row">
                    <Reason value={reason} onChange={setReason} />
                    {revertable ? (
                        <Button data-admin-write variant="outline" disabled={reason.trim().length < 2 || act.isPending} className="h-9 shrink-0 border-red-500/40 text-[13px] font-bold text-red-600 hover:bg-red-50"
                            onClick={async () => { if (await appConfirm({ message: `${r.clubName ?? ""} ${r.courseName}의 파를 바꾸기 전 값으로 되돌릴까요?\n\n${r.to!.join(" ")} → ${r.from!.join(" ")}\n되돌리면 이 코스를 잠급니다 — 같은 카드가 또 와도 바뀌지 않습니다. 이 골프장으로 치는 경기 화면에 바로 쓰입니다.`, tone: "danger", confirmText: "되돌리고 잠그기" })) act.mutate({ path: `/changes/${r.id}/revert`, reason, done: "되돌리고 잠갔어요" }); }}>
                            되돌리고 잠그기
                        </Button>
                    ) : (
                        <Button data-admin-write variant="outline" disabled={reason.trim().length < 2 || act.isPending} className="h-9 shrink-0 text-[13px] font-bold"
                            onClick={() => act.mutate({ path: `/courses/${r.courseId}/lock`, reason, done: "잠갔어요" })}>이 코스 잠그기</Button>
                    )}
                </div>
            )}
        </div>
    );
}

function SeenRow({ s, promote }: { s: SeenCourseRow; promote: number }) {
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState("");
    const act = useAct();
    const diff = parsDiff(s.pars, s.current);
    return (
        <div className="px-4 py-3" data-testid="par-seen">
            <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-2 text-left">
                <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-1.5">
                        <Pill tone={STATUS_TONE[s.status]}>{SEEN_STATUS_LABEL[s.status]}</Pill>
                        {s.lock && <Pill tone="neutral">잠김</Pill>}
                        {s.staffOnly && <Pill tone="info">운영자 계정만</Pill>}
                        <span className="ml-auto text-[11.5px] tabular-nums text-black/40">{kstDateTime(s.lastSeen)}</span>
                    </span>
                    <span className="mt-1 block truncate text-[14px] font-black">{s.clubName ?? "골프장 미상"} <span className="font-semibold text-black/55">· {s.courseName}</span></span>
                    <span className="block truncate text-[12px] text-black/45">카드 {s.seen}장 · 맞춘 사람 {s.members}/{promote}명 — {s.memberNames.join(", ")}</span>
                </span>
            </button>
            <div className="mt-2 space-y-1">
                <Nine label="카드" pars={s.pars} diff={diff} />
                <Nine label="명부" pars={s.current} diff={diff} />
            </div>
            {open && s.courseId && (
                <div data-admin-write className="mt-2.5 flex flex-col gap-2 rounded-xl bg-black/[0.03] p-2.5 sm:flex-row">
                    <Reason value={reason} onChange={setReason} />
                    <Button data-admin-write variant="outline" disabled={reason.trim().length < 2 || act.isPending} className="h-9 shrink-0 text-[13px] font-bold"
                        onClick={() => act.mutate(s.lock ? { path: `/courses/${s.courseId}/unlock`, reason, done: "잠금을 풀었어요" } : { path: `/courses/${s.courseId}/lock`, reason, done: "잠갔어요" })}>
                        {s.lock ? "잠금 풀기" : "이 코스 잠그기"}
                    </Button>
                </div>
            )}
        </div>
    );
}

export default function GolfParWatchView() {
    const q = useQuery<ParWatch>({ queryKey: [KEY], gcTime: 0 });
    const [view, setView] = useState<View>("changes");
    const [unlockReason, setUnlockReason] = useState<Record<string, string>>({});
    const act = useAct();
    if (q.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    const d = q.data;
    if (!d) return <EmptyState>불러오지 못했어요.</EmptyState>;
    const changes = Array.isArray(d.changes) ? d.changes : [];
    const seen = Array.isArray(d.seen) ? d.seen : [];
    const locked = Array.isArray(d.locked) ? d.locked : [];
    const auto = changes.filter((c) => c.kind === "fixed" || c.kind === "added");
    const watch = seen.filter((s) => s.status !== "same");
    return (
        <div className="space-y-4" data-testid="admin-golf-pars">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                <KpiTile label="카드가 바꾼 것" value={auto.length} unit="번" tone={auto.length ? "alert" : "default"} onClick={() => setView("changes")} />
                <KpiTile label="카드가 본 코스" value={seen.length} unit="개" onClick={() => setView("seen")} />
                <KpiTile label="명부와 다름 · 없음" value={watch.length} unit="개" tone={watch.length ? "alert" : "default"} onClick={() => setView("seen")} />
                <KpiTile label="잠근 코스" value={locked.length} unit="개" tone="brand" onClick={() => setView("locked")} />
            </div>
            <FilterChips value={view} onChange={setView} options={[{ id: "changes", label: "바뀐 기록", count: changes.length }, { id: "seen", label: "카드가 본 코스", count: seen.length, alert: watch.length > 0 }, { id: "locked", label: "잠근 코스", count: locked.length }]} />
            <p className="text-[12px] leading-snug break-keep text-black/45">
                서로 다른 회원 {d.promoteMembers}명의 카드가 같은 코스 · 같은 파를 말하면 명부가 바뀝니다(10/14 결정). 두 사람이 한 사람의 두 계정일 수 있어 맞춘 사람의 이름을 함께 봅니다. 잠근 코스는 카드가 바꾸지 못하고, 운영자는 '골프장 데이터'에서 고칠 수 있습니다. 바뀐 기록은 10/17부터 쌓입니다.
            </p>
            {view === "changes" && (changes.length === 0 ? <EmptyState>10/17 이후 파가 바뀐 기록이 아직 없어요.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">{changes.map((r) => <ChangeRow key={r.id} r={r} />)}</Panel>
            ))}
            {view === "seen" && (seen.length === 0 ? <EmptyState>카드로 확인된 코스가 아직 없어요.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">{[...watch, ...seen.filter((s) => s.status === "same")].map((s) => <SeenRow key={`${s.clubId}|${s.courseKey}|${s.pars.join("")}`} s={s} promote={d.promoteMembers} />)}</Panel>
            ))}
            {view === "locked" && (locked.length === 0 ? <EmptyState>잠근 코스가 없어요.</EmptyState> : (
                <Panel className="divide-y divide-black/[0.06]">
                    {locked.map((l) => (
                        <div key={l.courseId} className="px-4 py-3" data-testid="par-locked">
                            <p className="truncate text-[14px] font-black">{l.clubName ?? "골프장 미상"} <span className="font-semibold text-black/55">· {l.courseName}</span></p>
                            <p className="text-[12px] text-black/45">{kstDateTime(l.lock.at)} · {l.lock.by} · {l.lock.reason}</p>
                            <div className="mt-1.5"><Nine label="파" pars={l.pars} /></div>
                            <div data-admin-write className="mt-2 flex flex-col gap-2 sm:flex-row">
                                <Reason value={unlockReason[l.courseId] ?? ""} onChange={(v) => setUnlockReason((m) => ({ ...m, [l.courseId]: v }))} />
                                <Button data-admin-write variant="outline" disabled={(unlockReason[l.courseId] ?? "").trim().length < 2 || act.isPending} className="h-9 shrink-0 text-[13px] font-bold"
                                    onClick={() => act.mutate({ path: `/courses/${l.courseId}/unlock`, reason: unlockReason[l.courseId] ?? "", done: "잠금을 풀었어요" })}>잠금 풀기</Button>
                            </div>
                        </div>
                    ))}
                </Panel>
            ))}
        </div>
    );
}
