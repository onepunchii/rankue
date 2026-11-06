/**
 * 사장님 대시보드 '대회' 탭(2026-11-06 — shared/storeCup). 매장 대회를 열고 · 참가자(참가비 받음 체크)를 보고 · 대진을 만들고 · 취소한다.
 * 대회 화면(/store-cup/<id>)은 손님 것 — 신청 · 대진표 · 내 경기 시작. 대진과 경기 연결은 크루 대회의 엔진 그대로.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { LucidePlus } from "@/lib/icons";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { appConfirm } from "@/components/AppDialog";
import { TournamentBracket, type BracketMatch } from "@/components/hiq/tournament/TournamentBracket";
import { STORE_CUP_BEST_OF, STORE_CUP_SIZES, STORE_CUP_STATUS, feeText, storeCupLine, storeCupPath } from "@shared/storeCup";

interface CupRow { id: string; title: string; status: string; gameType: "3c" | "4c"; maxPlayers: number; bestOf: number; entryFee: number | null; startAt: string | null; recruitEnd: string | null; prize: string | null; participantCount: number; championName: string | null }
interface Detail { tournament: CupRow & { description: string | null }; participants: { memberId: string; nickname: string; feePaid: boolean; seed: number | null }[]; matches: BracketMatch[] }

const LIST_KEY = ["/api/hiq/partner/cups"] as const;
const KST = new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "numeric", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" });
const when = (iso: string | null) => (iso ? KST.format(new Date(iso)) : "-");
const chip = (s: string) => (s === "recruiting" ? "bg-brand/10 text-brand" : s === "ongoing" || s === "drawn" ? "bg-blue-500/10 text-blue-700" : "bg-black/[0.05] text-black/45");

export function StoreCupsTab() {
    const { data: cups = [], isLoading } = useQuery<CupRow[]>({ queryKey: LIST_KEY });
    const [creating, setCreating] = useState(false);
    const [openId, setOpenId] = useState<string | null>(null);
    return (
        <>
            <button onClick={() => setCreating(true)} data-testid="partner-cup-new"
                className="w-full h-14 rounded-2xl bg-brand text-white font-bold text-[16px] flex items-center justify-center gap-2 active:scale-[0.99] transition-transform">
                <LucidePlus className="w-5 h-5" /> 새 대회 만들기
            </button>
            <p className="px-1 text-[12.5px] leading-relaxed text-black/50 break-keep">만들면 매장 페이지에 '이 매장 대회'로 뜨고, 손님이 랭큐에서 참가 신청해요. 접수가 끝나면 대진을 만들고, 경기는 랭큐 점수판으로 치면 결과가 대진표에 자동으로 올라가요.</p>
            <section className="bg-white rounded-2xl border border-black/[0.06] overflow-hidden">
                {isLoading ? <p className="p-8 text-center text-black/40 text-sm">불러오는 중…</p>
                    : cups.length === 0 ? <p className="p-8 text-center text-black/40 text-sm">아직 연 대회가 없어요. 위 단추로 첫 대회를 만들어 보세요.</p>
                        : (
                            <ul className="divide-y divide-black/[0.06]" data-testid="partner-cup-list">
                                {cups.map((c) => (
                                    <li key={c.id}>
                                        <button type="button" onClick={() => setOpenId(c.id)} className="w-full px-4 py-3.5 flex items-center gap-3 text-left active:bg-black/[0.02]">
                                            <span className="min-w-0 flex-1">
                                                <span className="block font-bold text-[15px] truncate">{c.title}</span>
                                                <span className="block text-[12.5px] text-black/50 tabular-nums">{when(c.startAt)} · {storeCupLine(c)} · 참가 {c.participantCount}/{c.maxPlayers}{c.championName ? ` · 🏆 ${c.championName}` : ""}</span>
                                            </span>
                                            <span className={`shrink-0 px-2 py-1 rounded-lg text-[12px] font-bold ${chip(c.status)}`}>{STORE_CUP_STATUS[c.status] ?? c.status}</span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
            </section>
            <CreateCupSheet open={creating} onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} />
            <CupDetailSheet id={openId} onClose={() => setOpenId(null)} />
        </>
    );
}

const field = "mt-1 h-11 w-full rounded-xl border border-black/10 bg-black/[0.03] px-3 text-[14.5px] outline-none focus:bg-white";

function CreateCupSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const [f, setF] = useState({ title: "", gameType: "3c" as "3c" | "4c", maxPlayers: 16, bestOf: 1, startAt: "", recruitEnd: "", entryFee: "", prize: "", description: "" });
    const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((o) => ({ ...o, [k]: v }));
    const create = useMutation({
        mutationFn: () => apiRequest("/api/hiq/partner/cups", { method: "POST", body: {
            ...f, startAt: f.startAt ? new Date(f.startAt).toISOString() : null, recruitEnd: f.recruitEnd ? new Date(f.recruitEnd).toISOString() : null,
            entryFee: f.entryFee ? Number(f.entryFee) : null,
        } }) as Promise<{ id: string }>,
        onSuccess: (r) => { toast({ title: "대회를 만들었어요", description: "매장 페이지에 '이 매장 대회'로 떠요." }); void qc.invalidateQueries({ queryKey: LIST_KEY }); onCreated(r.id); },
        onError: (e: any) => toast({ title: e?.message || "만들지 못했어요", variant: "destructive" }),
    });
    const seg = (on: boolean) => `h-11 flex-1 rounded-xl text-[14px] font-bold ${on ? "bg-brand text-white" : "bg-black/[0.04] text-black/60"}`;
    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl px-5 pb-8 pt-5" data-testid="partner-cup-create">
                <SheetTitle className="text-[20px] font-bold">새 대회 만들기</SheetTitle>
                <SheetDescription className="mt-1 text-[13px] text-black/55">손님에게 보이는 대회예요. 나중에 대진을 만들 때까지 신청을 받아요.</SheetDescription>
                <div className="mt-4 space-y-4">
                    <label className="block text-[13px] font-bold">대회 이름<input value={f.title} maxLength={60} onChange={(e) => set("title", e.target.value)} placeholder="예: 11월 3쿠션 매장 대회" className={field} /></label>
                    <div><p className="text-[13px] font-bold">종목</p><div className="mt-1 flex gap-2">{(["3c", "4c"] as const).map((g) => <button key={g} type="button" onClick={() => set("gameType", g)} className={seg(f.gameType === g)}>{g === "3c" ? "3쿠션" : "4구"}</button>)}</div></div>
                    <div><p className="text-[13px] font-bold">정원</p><div className="mt-1 flex gap-2">{STORE_CUP_SIZES.map((n) => <button key={n} type="button" onClick={() => set("maxPlayers", n)} className={seg(f.maxPlayers === n)}>{n}강</button>)}</div></div>
                    <div><p className="text-[13px] font-bold">판 수</p><div className="mt-1 flex gap-2">{STORE_CUP_BEST_OF.map((n) => <button key={n} type="button" onClick={() => set("bestOf", n)} className={seg(f.bestOf === n)}>{n === 1 ? "단판" : `${n}판 ${Math.ceil(n / 2)}선승`}</button>)}</div></div>
                    <label className="block text-[13px] font-bold">대회 날짜 · 시간<input type="datetime-local" value={f.startAt} onChange={(e) => set("startAt", e.target.value)} className={field} /></label>
                    <label className="block text-[13px] font-bold">접수 마감 <span className="font-medium text-black/45">(비우면 대진을 만들 때까지)</span><input type="datetime-local" value={f.recruitEnd} onChange={(e) => set("recruitEnd", e.target.value)} className={field} /></label>
                    <label className="block text-[13px] font-bold">참가비(원) <span className="font-medium text-black/45">— 랭큐는 돈을 받지 않아요. 현장에서 받고 '받음'만 체크</span><input type="number" inputMode="numeric" min={0} value={f.entryFee} onChange={(e) => set("entryFee", e.target.value)} placeholder="예: 10000" className={field} /></label>
                    <label className="block text-[13px] font-bold">상품<input value={f.prize} maxLength={100} onChange={(e) => set("prize", e.target.value)} placeholder="예: 우승 큐 케이스 · 준우승 초크" className={field} /></label>
                    <label className="block text-[13px] font-bold">안내<textarea value={f.description} maxLength={500} onChange={(e) => set("description", e.target.value)} rows={3} placeholder="핸디 · 진행 방식 · 문의처" className="mt-1 w-full rounded-xl border border-black/10 bg-black/[0.03] px-3 py-2.5 text-[14.5px] outline-none focus:bg-white" /></label>
                    <button type="button" onClick={() => create.mutate()} disabled={!f.title.trim() || create.isPending} data-testid="partner-cup-submit"
                        className="h-13 w-full rounded-xl bg-brand py-3.5 text-[15px] font-bold text-white disabled:opacity-40">{create.isPending ? "만드는 중…" : "대회 만들기"}</button>
                </div>
            </SheetContent>
        </Sheet>
    );
}

function CupDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
    const qc = useQueryClient();
    const { toast } = useToast();
    const key = [`/api/hiq/partner/cups/${id}`];
    const { data } = useQuery<Detail>({ queryKey: key, enabled: !!id });
    const refresh = () => { void qc.invalidateQueries({ queryKey: key }); void qc.invalidateQueries({ queryKey: LIST_KEY }); };
    const act = useMutation({
        mutationFn: (a: { kind: "draw" | "cancel" } | { kind: "fee"; memberId: string; paid: boolean }) =>
            a.kind === "fee" ? apiRequest(`/api/hiq/partner/cups/${id}/fee`, { method: "PATCH", body: { memberId: a.memberId, paid: a.paid } })
                : apiRequest(`/api/hiq/partner/cups/${id}/${a.kind}`, { method: "POST" }),
        onSuccess: (_r, a) => { if (a.kind === "draw") toast({ title: "대진을 만들었어요", description: "참가자에게 알렸어요." }); if (a.kind === "cancel") { toast({ title: "대회를 취소했어요" }); onClose(); } refresh(); },
        onError: (e: any) => toast({ title: e?.message || "지금은 할 수 없어요", variant: "destructive" }),
    });
    const t = data?.tournament;
    const started = !!data?.matches.some((m) => m.status === "playing" || m.status === "done");
    const players = Object.fromEntries((data?.participants ?? []).map((p) => [p.memberId, { memberId: p.memberId, nickname: p.nickname }]));
    const copy = async () => { try { await navigator.clipboard.writeText(`${window.location.origin}${storeCupPath(id!)}`); toast({ title: "대회 링크를 복사했어요", description: "단톡방에 붙여 넣으면 손님이 바로 신청해요." }); } catch { toast({ title: "복사하지 못했어요", variant: "destructive" }); } };
    return (
        <Sheet open={!!id} onOpenChange={(o) => { if (!o) onClose(); }}>
            <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl px-5 pb-8 pt-5" data-testid="partner-cup-detail">
                <SheetTitle className="text-[20px] font-bold pr-8 break-keep">{t?.title ?? "대회"}</SheetTitle>
                <SheetDescription className="mt-1 text-[13px] text-black/55">{t ? `${STORE_CUP_STATUS[t.status] ?? t.status} · ${storeCupLine(t)} · ${when(t.startAt)}` : "불러오는 중…"}</SheetDescription>
                {t && data && (
                    <div className="mt-4 space-y-4">
                        <div className="grid grid-cols-2 gap-2">
                            <a href={storeCupPath(t.id)} className="flex h-11 items-center justify-center rounded-xl border border-brand text-[13.5px] font-bold text-brand">손님 화면 보기</a>
                            <button type="button" onClick={() => void copy()} className="h-11 rounded-xl border border-brand text-[13.5px] font-bold text-brand">링크 복사</button>
                        </div>
                        <section>
                            <p className="text-[13px] font-bold text-black/55">참가자 {data.participants.length}/{t.maxPlayers}{t.entryFee ? ` · 참가비 ${feeText(t.entryFee)} (받음 ${data.participants.filter((p) => p.feePaid).length})` : ""}</p>
                            {data.participants.length === 0 ? <p className="mt-2 text-[13.5px] text-black/45">아직 신청한 손님이 없어요. 링크를 단톡방에 올려 보세요.</p> : (
                                <ul className="mt-2 divide-y divide-black/[0.06] rounded-xl border border-black/[0.06]">
                                    {data.participants.map((p) => (
                                        <li key={p.memberId} className="flex items-center justify-between px-3.5 py-2.5 text-[14px]">
                                            <span className="font-bold">{p.seed ? <span className="mr-1.5 text-[12px] text-black/40 tabular-nums">{p.seed}</span> : null}{p.nickname}</span>
                                            {t.entryFee ? (
                                                <button type="button" onClick={() => act.mutate({ kind: "fee", memberId: p.memberId, paid: !p.feePaid })} data-testid="partner-cup-fee"
                                                    className={`h-8 rounded-lg px-3 text-[12.5px] font-bold ${p.feePaid ? "bg-brand text-white" : "bg-black/[0.05] text-black/55"}`}>{p.feePaid ? "받음 ✓" : "참가비 받기"}</button>
                                            ) : null}
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>
                        {(t.status === "recruiting" || t.status === "drawn") && !started && (
                            <button type="button" disabled={data.participants.length < 2 || act.isPending} data-testid="partner-cup-draw"
                                onClick={async () => { if (await appConfirm({ title: data.matches.length ? "대진을 다시 만들까요?" : "대진을 만들까요?", message: "신청을 마감하고 실력(RP) 순으로 시드를 정해 대진을 만들어요. 참가자에게 알림이 가요.", confirmText: "대진 만들기" })) act.mutate({ kind: "draw" }); }}
                                className="h-12 w-full rounded-xl bg-brand text-[15px] font-bold text-white disabled:opacity-40">{data.matches.length ? "대진 다시 만들기" : "대진 만들기"}{data.participants.length < 2 ? " (2명부터)" : ""}</button>
                        )}
                        {data.matches.length > 0 && (
                            <div className="rounded-2xl border border-black/[0.06] p-2"><TournamentBracket matches={data.matches} players={players} playerCount={data.participants.length} bestOf={t.bestOf} /></div>
                        )}
                        {t.status !== "ended" && (
                            <button type="button" disabled={act.isPending} data-testid="partner-cup-cancel"
                                onClick={async () => { if (await appConfirm({ title: "대회를 취소할까요?", message: "매장 페이지와 손님 화면에서 사라져요. 되돌릴 수 없어요.", confirmText: "대회 취소", tone: "danger" })) act.mutate({ kind: "cancel" }); }}
                                className="h-11 w-full rounded-xl text-[13.5px] font-bold text-red-600">대회 취소</button>
                        )}
                    </div>
                )}
            </SheetContent>
        </Sheet>
    );
}
