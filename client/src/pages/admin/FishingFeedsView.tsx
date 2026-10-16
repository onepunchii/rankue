/**
 * 어드민 · 낚시 › 공공자료(2026-10-17 어드민 전수 조사 — "실패하면 catch(() => null) 로 구역이 조용히 사라진다 · 크론이 없다").
 * 받아 둔 자료마다: 언제 받았나 · 몇 곳 · 쓸 만한가(신선 / 낡음 / 없음), 출처마다: 마지막 성공 · 마지막 실패 · 이어진 실패 수 · 까닭.
 * '지금 받기'는 매시 50분 크론(/api/cron/fishing-warm)과 같은 일 — 낚시지수 지도 · 바다 특보를 받아 둔다(낡지 않았으면 읽기만).
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { FeedState, FishingFeeds } from "@shared/fishingFeeds";
import { EmptyState, Panel, Pill, agoLabel, kstDateTime } from "./adminUtils";

const KEY = "/api/hiq/admin/fishing/feeds";
const STATE: Record<FeedState, { label: string; tone: "brand" | "warn" | "neutral" }> = { fresh: { label: "신선", tone: "brand" }, stale: { label: "낡음", tone: "warn" }, empty: { label: "아직 없음", tone: "neutral" } };
const ttlText = (m: number | null) => (m == null ? "그날 것을 한 번" : m >= 60 ? `${Math.round(m / 60)}시간마다` : `${m}분마다`);

export default function FishingFeedsView() {
    const { toast } = useToast();
    const qc = useQueryClient();
    const q = useQuery<FishingFeeds>({ queryKey: [KEY] });
    const warm = useMutation({
        mutationFn: () => apiRequest(`${KEY}/warm`, { method: "POST", body: {} }),
        onSuccess: (d: any) => { toast({ title: d?.skipped ? `받지 않았어요 — ${d.skipped}` : `받았어요 — 낚시지수 ${d?.index ? "○" : "×"} · 바다 특보 ${d?.sea ? "○" : "×"} (${((d?.ms ?? 0) / 1000).toFixed(1)}초)` }); void qc.invalidateQueries({ queryKey: [KEY] }); },
        onError: (e: any) => toast({ title: e?.message || "받지 못했어요", variant: "destructive" }),
    });
    const d = q.data;
    if (q.isLoading || !d) return <EmptyState>불러오는 중…</EmptyState>;
    const bad = d.feeds.filter((f) => f.state !== "fresh" || f.sources.some((s) => s.fails > 0));
    return (
        <div className="space-y-4" data-testid="admin-fishing-feeds">
            <div className="flex flex-wrap items-center gap-2">
                {d.keyPresent ? <Pill tone="brand">공공데이터 키 있음</Pill> : <Pill tone="alert">공공데이터 키(DATA_GO_KR_KEY) 없음</Pill>}
                <span className="text-[12.5px] text-black/55">{bad.length ? `손볼 자료 ${bad.length}` : "모두 신선해요"}</span>
                <Button data-admin-write variant="outline" disabled={warm.isPending} onClick={() => warm.mutate()} className="h-8 text-[12.5px] font-bold sm:ml-auto">{warm.isPending ? "받는 중…" : "지금 받기"}</Button>
            </div>
            <p className="text-[12px] leading-snug text-black/45">보는 사람이 있을 때 받아 두고, 정해진 때가 지나면 다시 받아요. 매시 50분에 낚시지수 지도와 바다 특보를 미리 받아 둡니다(조과 저장이 기다리지 않게). 출처가 실패하면 그 구역이 화면에서 조용히 빠지므로 여기서 봅니다.</p>
            <div className="grid gap-3 lg:grid-cols-2">
                {d.feeds.map((f) => {
                    const st = STATE[f.state];
                    return (
                        <Panel key={f.id} className="p-4" >
                            <div className="flex items-start gap-2" data-testid="admin-fishing-feed">
                                <div className="min-w-0 flex-1">
                                    <p className="text-[14px] font-black">{f.label}</p>
                                    <p className="text-[12px] text-black/45">{f.use}</p>
                                </div>
                                <Pill tone={st.tone}>{st.label}</Pill>
                            </div>
                            <p className="mt-2 text-[12.5px] text-black/60">
                                {f.newestAt ? <>마지막으로 받은 때 <b className="text-black/80">{agoLabel(f.newestAt)}</b> · 받아 둔 곳 {f.keys}</> : "아직 받아 둔 것이 없어요"}
                                <span className="text-black/40"> · {ttlText(f.ttlMin)}</span>
                            </p>
                            <ul className="mt-2 space-y-1 border-t border-black/[0.06] pt-2">
                                {f.sources.map((s) => (
                                    <li key={s.source} className="flex flex-wrap items-baseline gap-x-2 text-[12px]">
                                        <span className="min-w-0 flex-1 font-bold text-black/65">{s.label}</span>
                                        {s.okAt ? <span className="text-black/45">성공 {agoLabel(s.okAt)}</span> : <span className="text-black/35">성공 기록 없음</span>}
                                        {s.fails > 0 && <span className="font-bold text-red-600">이어서 {s.fails}번 실패</span>}
                                        {s.failAt && <span className="w-full text-[11.5px] text-black/45">마지막 실패 {kstDateTime(s.failAt)} · {s.lastError}</span>}
                                    </li>
                                ))}
                            </ul>
                        </Panel>
                    );
                })}
            </div>
            {d.warmFails.length > 0 && (
                <section>
                    <h3 className="mb-2 text-[13px] font-black text-black/70">미리 받기(매시 50분)가 못 받은 때</h3>
                    <Panel className="divide-y divide-black/[0.06]">
                        {d.warmFails.map((w, i) => <p key={i} className="px-4 py-2 text-[12.5px]"><span className="tabular-nums text-black/55">{kstDateTime(w.at)}</span> · <span className="text-red-700">{w.error}</span></p>)}
                    </Panel>
                </section>
            )}
        </div>
    );
}
