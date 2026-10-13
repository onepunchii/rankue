/**
 * 올해의 산행(2026-10-13) — 배낭 화면의 한 해 요약. 셈은 shared/hikingYear(정상 인증 기록 + 산행 요약만으로).
 * 얼마나 올랐는지와 처음 오른 산을 돌아보는 구역이다. 올해 기록이 없으면 그리지 않는다. 회원 본인의 것만.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useQuery } from "@tanstack/react-query";
import { hasYearReport, heightSumNote, hikingYearReport } from "@shared/hikingYear";
import { spanText } from "@shared/hikingSun";
import { HkSection } from "./HikingShell";
import { MY_TRIPS_KEY, type MyTrip } from "../trail/useTrail";
import type { MySummit } from "../stamps/useHikingStamps";

const MONTHS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export function YearReport({ summits, nameOf, heightOf }: {
    summits: readonly MySummit[];
    nameOf: (mountainId: string) => string | undefined;
    heightOf: (mountainId: string) => number | null | undefined;
}) {
    const trips = useQuery<{ trips: MyTrip[] }>({ queryKey: MY_TRIPS_KEY }).data?.trips ?? [];
    const year = new Date(Date.now() + 9 * 3_600_000).getUTCFullYear();
    const r = hikingYearReport(year,
        summits.map((s) => ({ mountainId: s.mountainId, at: new Date(s.at).getTime(), verified: s.verified })),
        trips.map((t) => ({ startedAt: new Date(t.startedAt).getTime(), endedAt: new Date(t.endedAt).getTime(), km: t.km, gainM: t.gainM })), heightOf);
    if (!hasYearReport(r)) return null;
    const peak = Math.max(1, ...r.byMonth);
    const tiles: [string, string][] = [
        [`${r.mountains}곳`, "오른 산"],
        [`${r.firsts}곳`, "처음 오른 산"],
        [`${r.heightSum.toLocaleString("en-US")}m`, "높이의 합"],
    ];
    const note = heightSumNote(r.heightSum);
    const top = r.highest ? nameOf(r.highest.mountainId) : undefined;
    return (
        <HkSection title={`${year}년의 산행`} aside={r.activeMonths > 0 ? `${r.activeMonths}달 동안 산에 갔어요` : undefined}>
            <div className="rounded-2xl p-4" style={{ background: "linear-gradient(160deg,#1F556059,#0E2A33)", boxShadow: "inset 0 0 0 1px #FFFFFF1F" }} data-testid="hk-year-report" data-year={year}>
                <div className="flex">
                    {tiles.map(([v, label]) => (
                        <div key={label} className="flex-1 text-center">
                            <div className="text-[20px] font-semibold tabular-nums leading-none text-[#F4EFE3]">{v}</div>
                            <div className="mt-1.5 text-[12.5px] text-[#F4EFE399]">{label}</div>
                        </div>
                    ))}
                </div>
                {(note || top) && (
                    <p className="mt-3 text-center text-[13px] leading-snug text-[#F6D9A8] break-keep">
                        {[note, top && r.highest ? `가장 높았던 산은 ${top}(${Math.round(r.highest.heightM).toLocaleString("en-US")}m)` : ""].filter(Boolean).join(" · ")}
                    </p>
                )}
                {/* 달마다 — 정상에서 인증한 횟수 */}
                {r.climbs > 0 && (
                    <div className="mt-4 flex items-end gap-1.5" role="img" aria-label={`달마다 인증한 횟수: ${r.byMonth.map((n, i) => (n ? `${i + 1}월 ${n}번` : "")).filter(Boolean).join(", ")}`}>
                        {r.byMonth.map((n, i) => (
                            <div key={MONTHS[i]} className="flex flex-1 flex-col items-center gap-1">
                                <div className="flex h-11 w-full items-end"><div className="w-full rounded-t-[4px]" style={{ height: n ? `${Math.max(14, Math.round((n / peak) * 100))}%` : 3, background: n ? "#F28C6A" : "#FFFFFF1F" }} /></div>
                                <span className="text-[12px] tabular-nums leading-none text-[#F4EFE380]">{MONTHS[i]}</span>
                            </div>
                        ))}
                    </div>
                )}
                {r.trips > 0 && (
                    <p className="mt-3.5 border-t border-[#FFFFFF1F] pt-3 text-[13px] tabular-nums leading-snug text-[#F4EFE3B3] break-keep" data-testid="hk-year-trips">
                        남긴 산행 {r.trips}번 · 길 위에서 {r.km.toLocaleString("en-US")}km · 오른 높이 {r.gainM.toLocaleString("en-US")}m · {spanText(r.minutes)}
                    </p>
                )}
            </div>
        </HkSection>
    );
}

export default YearReport;
