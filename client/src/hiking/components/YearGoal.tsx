import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { everestNote, goalRows, type HikingGoal } from "@shared/hikingGoal";
import { hikingYearReport } from "@shared/hikingYear";
import { HkSection } from "./HikingShell";
import { MY_TRIPS_KEY, type MyTrip } from "../trail/useTrail";
import type { MySummit } from "../stamps/useHikingStamps";

const KEY = ["/api/hiq/hiking/me/goal"];
const field = "h-11 w-full rounded-xl bg-[#FFFFFF14] px-3 text-[15px] tabular-nums text-[#F4EFE3] placeholder:text-[#F4EFE359] outline-none";

export function YearGoal({ summits, heightOf, kfsDone }: {
    summits: readonly MySummit[];
    heightOf: (mountainId: string) => number | null | undefined;
    kfsDone: number;
}) {
    const year = new Date(Date.now() + 9 * 3_600_000).getUTCFullYear();
    const { data: goal, isLoading } = useQuery<HikingGoal | null>({ queryKey: KEY });
    const trips = useQuery<{ trips: MyTrip[] }>({ queryKey: MY_TRIPS_KEY }).data?.trips ?? [];
    const r = hikingYearReport(year,
        summits.map((s) => ({ mountainId: s.mountainId, at: new Date(s.at).getTime(), verified: s.verified })),
        trips.map((t) => ({ startedAt: new Date(t.startedAt).getTime(), endedAt: new Date(t.endedAt).getTime(), km: t.km, gainM: t.gainM })), heightOf);
    const rows = goalRows(goal ?? null, { climbs: r.climbs, heightSum: r.heightSum, kfs: kfsDone });
    const note = everestNote(r.heightSum);

    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ climbs: "", heightM: "", kfs: "" });
    const [error, setError] = useState<string | null>(null);
    const save = useMutation({
        mutationFn: () => apiRequest("/api/hiq/hiking/me/goal", { method: "PUT", body: { year, ...form } }),
        onSuccess: (g) => { queryClient.setQueryData(KEY, g); setEditing(false); setError(null); },
        onError: (e: Error) => setError(e.message || "목표를 저장하지 못했어요"),
    });
    const open = () => {
        setForm({ climbs: goal?.climbs ? String(goal.climbs) : "", heightM: goal?.heightM ? String(goal.heightM) : "", kfs: goal?.kfs ? String(goal.kfs) : "" });
        setEditing(true);
    };
    if (isLoading) return null;

    return (
        <HkSection title={`${year}년의 목표`} aside={!editing ? <button type="button" onClick={open} className="text-[#F6D9A8]" data-testid="hk-goal-edit">{goal ? "고치기" : "정하기"}</button> : undefined}>
            <div className="rounded-2xl bg-[#FFFFFF0A] p-4" data-testid="hk-goal">
                {editing ? (
                    <>
                        {([["climbs", "정상 인증", "번", "예: 12"], ["heightM", "높이의 합", "m", "예: 15000"], ["kfs", "100대 명산(누적)", "곳", "예: 20"]] as const).map(([k, label, unit, ph]) => (
                            <label key={k} className="mb-2.5 flex items-center gap-3">
                                <span className="w-[104px] shrink-0 text-[14px] text-[#F4EFE3CC]">{label}</span>
                                <input inputMode="numeric" value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value.replace(/[^0-9]/g, "") }))} placeholder={ph} className={field} data-testid={`hk-goal-${k}`} />
                                <span className="w-6 shrink-0 text-[13px] text-[#F4EFE399]">{unit}</span>
                            </label>
                        ))}
                        <p className="text-[12.5px] text-[#F4EFE380] break-keep">비워 둔 칸은 목표로 세지 않아요.</p>
                        {error && <p role="alert" className="mt-2 text-[13px] text-[#FFB4A6]">{error}</p>}
                        <div className="mt-3 flex gap-2">
                            <button type="button" onClick={() => setEditing(false)} className="h-11 flex-1 rounded-xl bg-[#FFFFFF14] text-[14.5px] text-[#F4EFE3]">그만두기</button>
                            <button type="button" onClick={() => save.mutate()} disabled={save.isPending} className="h-11 flex-1 rounded-xl bg-[#F28C6A] text-[14.5px] font-semibold text-[#2A1208] disabled:opacity-50" data-testid="hk-goal-save">저장</button>
                        </div>
                    </>
                ) : rows.length === 0 ? (
                    <p className="text-[14px] leading-relaxed text-[#F4EFE3CC] break-keep">올해 몇 번 오를지, 얼마나 높이 오를지 정해 두면 여기서 얼마나 왔는지 보여 줘요.</p>
                ) : (
                    <ul className="space-y-3.5">
                        {rows.map((row) => (
                            <li key={row.key}>
                                <div className="flex items-baseline justify-between text-[14px]">
                                    <span className="text-[#F4EFE3CC]">{row.label}</span>
                                    <span className="tabular-nums text-[#F4EFE3]"><b className="font-semibold">{row.have.toLocaleString("en-US")}</b> / {row.want.toLocaleString("en-US")}{row.unit} · {row.pct}%</span>
                                </div>
                                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[#FFFFFF14]" role="progressbar" aria-valuenow={row.pct} aria-valuemin={0} aria-valuemax={100} aria-label={row.label}>
                                    <div className="h-full rounded-full" style={{ width: `${row.pct}%`, background: row.pct >= 100 ? "#F6D9A8" : "#F28C6A" }} />
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
                {!editing && note && <p className="mt-3.5 text-[13px] leading-snug text-[#F6D9A8] break-keep" data-testid="hk-goal-everest">올해 {note}</p>}
            </div>
        </HkSection>
    );
}
