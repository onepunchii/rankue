/**
 * 어드민 · 골프 › 외부 수집(2026-10-17 어드민 전수 조사 골프 ⑤ — "골프 현황은 랭킹과 시세만 본다").
 * 남은 티(공식 사이트 22곳 · 다음 이레) · 날씨(지금 쓰는 격자 · 중기 구역) · 전날 저녁 알림(실행 기록 · 미리보기). 랭킹 · 시세는 '골프 현황'에.
 * '지금 받기'는 20분 크론과 같은 일. 미리보기는 보내지 않는다.
 * 서버: server/routes/modules/adminGolf/feeds.ts · 규칙 shared/golfFeeds
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { TEE_STATE_LABEL, teeClubState, type GolfFeeds, type TeeClubState } from "@shared/golfFeeds";
import { EmptyState, Panel, Pill, agoLabel, kstDateTime } from "../adminUtils";

const KEY = "/api/hiq/admin/golf/feeds";
const TONE: Record<TeeClubState, "brand" | "warn" | "alert" | "neutral"> = { ok: "brand", partial: "warn", fail: "alert", none: "neutral" };
/** "202610171400" → "10/17 14시 발표" */
/** 받는 쪽이 남긴 까닭을 우리말로 — 모르는 것은 그대로 */
const errText = (e: string) => e.replace(/The operation was aborted due to timeout|aborted due to timeout|timed? ?out/gi, "시간 초과").replace(/fetch failed/gi, "연결 실패");
const baseLabel = (b: string) => (/^\d{12}$/.test(b) ? `${Number(b.slice(4, 6))}/${Number(b.slice(6, 8))} ${Number(b.slice(8, 10))}시 발표` : b);

interface EvePreview { due: boolean; ymd: string; rounds: number; players: number; already: number; preview?: { title: string; body: string; url: string; to: number }[] }

function Bar({ parts }: { parts: { n: number; cls: string; label: string }[] }) {
    const total = parts.reduce((s, p) => s + p.n, 0) || 1;
    return (
        <div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-black/[0.06]" role="img" aria-label={parts.map((p) => `${p.label} ${p.n}`).join(", ")}>
                {parts.map((p) => <span key={p.label} className={`h-full ${p.cls}`} style={{ width: `${(p.n / total) * 100}%` }} />)}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[12px] tabular-nums text-black/60">
                {parts.map((p) => <span key={p.label} className="inline-flex items-center gap-1"><span aria-hidden className={`h-2 w-2 rounded-full ${p.cls}`} />{p.label} {p.n}</span>)}
            </div>
        </div>
    );
}

export default function GolfFeedsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const q = useQuery<GolfFeeds>({ queryKey: [KEY], gcTime: 0 });
    const [preview, setPreview] = useState<EvePreview | null>(null);
    const run = useMutation({
        mutationFn: (v: { path: string; body?: object }) => apiRequest(`${KEY}${v.path}`, { method: "POST", body: v.body ?? {} }),
        onSuccess: (d: any) => {
            toast({ title: d?.skipped ? `받지 않았어요 — ${d.skipped}` : d?.grids != null ? `날씨 — 새로 ${d.gridOk ?? 0} · 실패 ${d.gridFail ?? 0} · 남음 ${d.gridLeft ?? 0}` : `남은 티 — 받음 ${d?.ok ?? 0} · 못 받음 ${d?.miss ?? 0}${d?.left ? ` · 남음 ${d.left}` : ""}` });
            void qc.invalidateQueries({ queryKey: [KEY] });
        },
        onError: (e: any) => toast({ title: e?.message || "받지 못했어요", variant: "destructive" }),
    });
    const eve = useMutation({
        mutationFn: () => apiRequest(`${KEY}/eve-preview`) as Promise<EvePreview>,
        onSuccess: (d) => setPreview(d),
        onError: (e: any) => toast({ title: e?.message || "미리보기를 못 만들었어요", variant: "destructive" }),
    });
    if (q.isLoading) return <EmptyState>불러오는 중…</EmptyState>;
    const d = q.data;
    if (!d) return <EmptyState>불러오지 못했어요.</EmptyState>;
    const clubs = Array.isArray(d.tees?.clubs) ? d.tees.clubs : [];
    const order: TeeClubState[] = ["fail", "partial", "none", "ok"];
    const sorted = [...clubs].sort((a, b) => order.indexOf(teeClubState(a)) - order.indexOf(teeClubState(b)));
    const count = (s: TeeClubState) => clubs.filter((c) => teeClubState(c) === s).length;
    const w = d.weather;
    const runs = Array.isArray(d.eve) ? d.eve : [];
    return (
        <div className="space-y-5" data-testid="admin-golf-feeds">
            <p className="text-[12px] leading-snug break-keep text-black/45">랭킹 · 회원권 시세는 '골프 현황'에 있어요. 여기는 남은 티 · 날씨 · 전날 저녁 알림 — 실패하면 화면에서 조용히 빠지는 것들이라 여기서 봅니다. '지금 받기'는 20분 크론과 같은 일이에요.</p>

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-black">남은 티 <span className="font-semibold text-black/45">· 공식 사이트 {clubs.length}곳 · 다음 이레</span></h3>
                    {!d.tees.enabled && <Pill tone="alert">꺼짐(GOLF_OPEN_TEES)</Pill>}
                    {d.tees.quiet && <Pill tone="neutral">밤 — 쉬는 중</Pill>}
                    <Button data-admin-write variant="outline" disabled={run.isPending} onClick={() => run.mutate({ path: "/open-tees/run" })} className="ml-auto h-8 text-[12.5px] font-bold">지금 받기</Button>
                </div>
                <Panel className="p-4">
                    <Bar parts={[{ n: count("ok"), cls: "bg-brand", label: TEE_STATE_LABEL.ok }, { n: count("partial"), cls: "bg-amber-400", label: TEE_STATE_LABEL.partial }, { n: count("fail"), cls: "bg-red-500", label: TEE_STATE_LABEL.fail }, { n: count("none"), cls: "bg-black/20", label: TEE_STATE_LABEL.none }]} />
                    <ul className="mt-3 divide-y divide-black/[0.06] border-t border-black/[0.06]" data-testid="admin-golf-tee-clubs">
                        {sorted.map((c) => {
                            const st = teeClubState(c);
                            return (
                                <li key={c.slug} className="flex items-start gap-2 py-2.5">
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="truncate text-[13.5px] font-bold">{c.slug}</span>
                                            <Pill tone={TONE[st]}>{TEE_STATE_LABEL[st]}</Pill>
                                        </span>
                                        <span className="block text-[12px] tabular-nums text-black/50">이레 중 {c.ok}/{c.days}일 · 티 {c.tees.toLocaleString()}개{c.lastAt ? ` · ${agoLabel(c.lastAt)}` : ""}</span>
                                        {c.lastError && c.miss > 0 && <span className="block truncate text-[11.5px] text-red-600/80">{errText(c.lastError)}</span>}
                                    </span>
                                    <button data-admin-write type="button" disabled={run.isPending} onClick={() => run.mutate({ path: "/open-tees/run", body: { only: c.slug } })}
                                        className="shrink-0 rounded-lg border border-black/10 px-2.5 py-1.5 text-[12px] font-bold text-black/60 hover:bg-black/[0.03] disabled:opacity-40">이곳 받기</button>
                                </li>
                            );
                        })}
                    </ul>
                </Panel>
            </section>

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-black">날씨 <span className="font-semibold text-black/45">· 기상청 단기 · 중기</span></h3>
                    {!w.enabled && <Pill tone="alert">키 없음(DATA_GO_KR_KEY)</Pill>}
                    <Button data-admin-write variant="outline" disabled={run.isPending} onClick={() => run.mutate({ path: "/weather/run" })} className="ml-auto h-8 text-[12.5px] font-bold">지금 받기</Button>
                </div>
                <Panel className="space-y-4 p-4" >
                    <div data-testid="admin-golf-weather">
                        <p className="mb-1.5 text-[12.5px] font-bold text-black/60">단기 격자 {w.grids} <span className="font-normal text-black/40">· 가장 새 것 {baseLabel(w.latestBase)}</span></p>
                        <Bar parts={[{ n: w.gridsFresh, cls: "bg-brand", label: "새 발표" }, { n: w.gridsStale, cls: "bg-amber-400", label: "지난 발표" }, { n: w.gridsMissing, cls: "bg-red-500", label: "없음" }]} />
                        {w.oldestAt && <p className="mt-1 text-[11.5px] text-black/40">가장 오래 못 받은 격자 {kstDateTime(w.oldestAt)} — 20분마다 낡은 것부터 받아요(사람이 연 골프장은 그 자리에서 새로).</p>}
                    </div>
                    <div>
                        <p className="mb-1.5 text-[12.5px] font-bold text-black/60">중기 구역 {w.mids} <span className="font-normal text-black/40">· {baseLabel(w.latestMidBase)}</span></p>
                        <Bar parts={[{ n: w.midsFresh, cls: "bg-brand", label: "새 발표" }, { n: Math.max(0, w.mids - w.midsFresh), cls: "bg-amber-400", label: "지난 발표 · 없음" }]} />
                    </div>
                </Panel>
            </section>

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[14px] font-black">전날 저녁 알림 <span className="font-semibold text-black/45">· 매일 19~20시</span></h3>
                    <Button variant="outline" disabled={eve.isPending} onClick={() => eve.mutate()} className="ml-auto h-8 text-[12.5px] font-bold">{eve.isPending ? "만드는 중…" : "내일 갈 알림 미리보기"}</Button>
                </div>
                <Panel className="p-4">
                    {runs.length === 0 ? <p className="text-[12.5px] text-black/45">아직 실행 기록이 없어요 — 실행 기록은 10/16 저녁부터 쌓여요. 오늘 저녁 7~8시에 첫 줄이 남습니다.</p> : (
                        <ul className="divide-y divide-black/[0.06]">
                            {runs.map((r, i) => (
                                <li key={`${r.at}-${i}`} className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-[12.5px] tabular-nums">
                                    <span className="text-black/50">{kstDateTime(r.at)}</span>
                                    {r.ok ? <Pill tone="brand">보냄</Pill> : <Pill tone="alert">실패</Pill>}
                                    <span className="text-black/65">{r.error ?? `라운드 ${r.rounds ?? 0} · 받는 사람 ${r.players ?? 0} · 보냄 ${r.sent ?? 0}${r.failed ? ` · 실패 ${r.failed}` : ""}`}</span>
                                </li>
                            ))}
                        </ul>
                    )}
                    {preview && (
                        <div className="mt-3 rounded-xl bg-black/[0.03] p-3" data-testid="admin-golf-eve-preview">
                            <p className="text-[12.5px] font-bold text-black/60">{preview.ymd} 라운드 · {preview.rounds}건 · 받을 사람 {preview.players}명{preview.already ? ` · 이미 보냄 ${preview.already}` : ""}</p>
                            {(preview.preview ?? []).length === 0 ? <p className="mt-1 text-[12.5px] text-black/45">내일 라운드가 없어 보낼 알림이 없어요.</p> : (
                                <ul className="mt-2 space-y-2">
                                    {(preview.preview ?? []).map((p, i) => (
                                        <li key={i} className="rounded-lg bg-white px-3 py-2 ring-1 ring-black/[0.06]">
                                            <p className="text-[13px] font-bold">{p.title}</p>
                                            <p className="text-[12.5px] leading-snug text-black/60">{p.body}</p>
                                            <p className="mt-0.5 text-[11.5px] text-black/40">{p.to}명에게</p>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    )}
                </Panel>
            </section>
        </div>
    );
}
