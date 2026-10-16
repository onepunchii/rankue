/**
 * 어드민 · 등산 › 현황(2026-10-17 어드민 전수 조사 — "등산 현황 · 산악회 보기 · 전날 브리핑 크론이 실패해도 모른다").
 * 합계 · 30일 막대(정상 인증 · 기록 · 산행) · 많이 오른 산 · 산악회(다음 산행 · 함께 정상) · 산행 전날 저녁 브리핑의 실행 기록과 오늘 저녁 미리보기.
 * 좌표는 싣지 않는다 — 숫자 · 산 이름 · 산악회 이름만(shared/hikingOverview).
 */
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { apiRequest } from "@/lib/queryClient";
import { barScale, type HikingOverview } from "@shared/hikingOverview";
import { EmptyState, KpiTile, Panel, Pill, kstDateTime } from "./adminUtils";

const KEY = "/api/hiq/admin/hiking/overview";
const SERIES = [
    { id: "summits", label: "정상 인증", color: "#3F7A5C" },
    { id: "records", label: "인증 없는 기록", color: "#B9C3BB" },
    { id: "trips", label: "산행", color: "#D9694C" },
] as const;

function DaysChart({ days }: { days: HikingOverview["days"] }) {
    const totals = days.map((d) => d.summits + d.records + d.trips);
    const max = barScale(totals);
    // 막대는 높이를 정해 두고 폭만 늘린다(늘려도 글자가 커지지 않게 날짜는 아래 HTML 줄로)
    const W = 600, H = 140, gap = 3, bw = (W - gap * (days.length - 1)) / days.length;
    const label = (day: string) => day.slice(5).replace("-", "/");
    return (
        <div>
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
                {SERIES.map((s) => <span key={s.id} className="flex items-center gap-1.5 text-[12px] text-black/60"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} />{s.label}</span>)}
            </div>
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="block h-[140px] w-full" role="img" aria-label="최근 30일 등산 기록">
                <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="#00000014" vectorEffect="non-scaling-stroke" />
                {days.map((d, i) => {
                    let y = H;
                    const x = i * (bw + gap);
                    return (
                        <g key={d.day}>
                            <title>{`${label(d.day)} · 정상 인증 ${d.summits} · 기록 ${d.records} · 산행 ${d.trips} · 사진 ${d.photos}`}</title>
                            <rect x={x} y={0} width={bw} height={H} fill="transparent" />
                            {SERIES.map((s) => {
                                const v = d[s.id];
                                if (!v) return null;
                                const h = Math.max(2, (v / max) * (H - 6));
                                y -= h;
                                return <rect key={s.id} x={x} y={y} width={bw} height={h - 0.6} fill={s.color} />;
                            })}
                        </g>
                    );
                })}
            </svg>
            <div className="mt-1 flex justify-between text-[11.5px] tabular-nums text-black/45">
                <span>{label(days[0]?.day ?? "")}</span>
                <span>{label(days[Math.floor(days.length / 2)]?.day ?? "")}</span>
                <span>{label(days[days.length - 1]?.day ?? "")} 오늘</span>
            </div>
        </div>
    );
}

export default function HikingOverviewView() {
    const q = useQuery<HikingOverview>({ queryKey: [KEY] });
    const [preview, setPreview] = useState<any>(null);
    const peek = useMutation({ mutationFn: () => apiRequest("/api/hiq/admin/hiking/eve-preview"), onSuccess: (d) => setPreview(d) });
    const d = q.data;
    if (q.isLoading || !d) return <EmptyState>불러오는 중…</EmptyState>;
    const t = d.totals;
    const empty = d.days.every((x) => !x.summits && !x.records && !x.trips);
    return (
        <div className="space-y-4" data-testid="admin-hiking-overview">
            <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-6">
                <KpiTile label="정상 인증" value={t.summits} unit="번" sub={`${t.summitMembers}명`} tone="brand" />
                <KpiTile label="인증 없는 기록" value={t.records} unit="번" />
                <KpiTile label="산행" value={t.trips} unit="번" sub={`정상까지 ${t.reachedTrips}`} />
                <KpiTile label="산행 사진" value={t.photos} unit="장" sub={`공개 ${t.publicPhotos} · 가림 ${t.hiddenPhotos}`} tone={t.hiddenPhotos ? "alert" : "default"} />
                <KpiTile label="받은 와펜 · 핀 · 등급" value={t.awards} unit="개" />
                <KpiTile label="산악회" value={t.crews} unit="곳" sub={`회원 ${t.crewMembers} · 주 종목 ${t.primaryMembers}명`} />
            </div>

            <Panel className="p-4">
                <h3 className="mb-2 text-[13px] font-black text-black/70">최근 30일</h3>
                {empty ? <p className="py-6 text-center text-[12.5px] text-black/45">최근 30일 동안 정상 인증 · 기록 · 산행이 없어요.</p> : <DaysChart days={d.days} />}
            </Panel>

            <div className="grid gap-4 xl:grid-cols-2">
                <section>
                    <h3 className="mb-2 text-[13px] font-black text-black/70">많이 오른 산 <span className="font-bold text-black/40">— 30일</span></h3>
                    {d.mountains.length === 0 ? <EmptyState>아직 없어요.</EmptyState> : (
                        <Panel className="divide-y divide-black/[0.06]">
                            {d.mountains.map((m, i) => (
                                <a key={m.id} href={`/hiking/mountains/${encodeURIComponent(m.slug)}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 px-4 py-2.5 hover:bg-black/[0.02]">
                                    <span className="w-5 text-right text-[12px] font-black tabular-nums text-black/35">{i + 1}</span>
                                    <span className="min-w-0 flex-1 truncate text-[13.5px] font-black">{m.name}</span>
                                    <span className="text-[12.5px] tabular-nums text-black/55">인증 <b className="text-black/80">{m.summits}</b> · 기록 {m.records}</span>
                                </a>
                            ))}
                        </Panel>
                    )}
                </section>
                <section>
                    <h3 className="mb-2 text-[13px] font-black text-black/70">산악회</h3>
                    {d.crews.length === 0 ? <EmptyState>아직 산악회가 없어요.</EmptyState> : (
                        <Panel className="divide-y divide-black/[0.06]">
                            {d.crews.map((c) => (
                                <div key={c.id} className="px-4 py-2.5" data-testid="admin-hiking-crew">
                                    <p className="flex items-center gap-2 text-[13.5px]"><b className="min-w-0 flex-1 truncate font-black">{c.name}</b><span className="shrink-0 text-[12.5px] text-black/55">회원 {c.members} · 함께 정상 {c.together}곳</span></p>
                                    <p className="mt-0.5 text-[12px] text-black/50">
                                        {c.next ? <>다음 산행 <b className="text-black/75">{kstDateTime(c.next.at)}</b> · {c.next.mountain ?? "산 미정"} · {c.next.title}</> : "잡힌 산행 없음"}
                                        {c.lastAt && <> · 지난 산행 {kstDateTime(c.lastAt)}</>}
                                    </p>
                                </div>
                            ))}
                        </Panel>
                    )}
                </section>
            </div>

            <section>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                    <h3 className="text-[13px] font-black text-black/70">산행 전날 저녁 브리핑 <span className="font-bold text-black/40">— 한국 시각 19 · 20시, 내일 산악회 산행에 가는 사람에게</span></h3>
                    <Button variant="outline" disabled={peek.isPending} onClick={() => peek.mutate()} className="h-8 text-[12.5px] font-bold sm:ml-auto">{peek.isPending ? "세는 중…" : "오늘 저녁 미리보기"}</Button>
                </div>
                {preview && (
                    <Panel className="mb-2 p-4" data-testid="admin-hiking-eve-preview">
                        <p className="text-[12.5px] text-black/60">내일({String(preview.ymd ?? "").replace(/(\d{4})(\d{2})(\d{2})/, "$2/$3")}) 산행 {preview.trips}건 · 받을 사람 {preview.people}명 · 이미 보냄 {preview.already}</p>
                        {Array.isArray(preview.preview) && preview.preview.length > 0 ? (
                            <ul className="mt-2 space-y-1.5">{preview.preview.map((x: any, i: number) => <li key={i} className="rounded-lg bg-black/[0.03] px-3 py-2 text-[12.5px]"><b className="text-black/80">{x.title}</b><span className="block text-black/60">{x.body}</span><span className="text-[11.5px] text-black/40">{x.to}명에게</span></li>)}</ul>
                        ) : <p className="mt-1 text-[12.5px] text-black/45">오늘 저녁에 보낼 브리핑이 없어요.</p>}
                    </Panel>
                )}
                {d.eveRuns.length === 0 ? <EmptyState>아직 실행 기록이 없어요 — 보낼 시간(19 · 20시)에 돈 것과 실패만 적힙니다.</EmptyState> : (
                    <Panel className="divide-y divide-black/[0.06]">
                        {d.eveRuns.map((r, i) => (
                            <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-[12.5px]">
                                <span className="w-28 shrink-0 tabular-nums text-black/55">{kstDateTime(r.at)}</span>
                                {r.ok ? <Pill tone="brand">보냄</Pill> : <Pill tone="alert">실패</Pill>}
                                <span className="text-black/65">산행 {r.trips} · 받을 사람 {r.people} · 보냄 {r.sent}{r.failed ? <b className="text-red-600"> · 실패 {r.failed}</b> : null}</span>
                                {r.error && <span className="w-full text-red-700">{r.error}</span>}
                            </div>
                        ))}
                    </Panel>
                )}
            </section>
        </div>
    );
}
