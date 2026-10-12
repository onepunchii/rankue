/**
 * 산악회가 함께 오른 산(2026-10-13) — 산악회 홈(공용 크루 화면)에 놓이는 등산의 조각.
 *
 * 같은 날 두 사람 이상이 정상에서 인증한 산이 산악회의 도장이다(혼자 오른 산은 그 사람의 도장이다 — server/storage/hikingStamps.crewSummits).
 * 누가 올랐는지는 보여 주지 않는다 — 산 · 처음 함께 오른 날 · 횟수만. 100대 명산은 그 산의 와펜으로, 그 밖의 산은 작은 봉우리 그림으로.
 * 공용 크루 화면 안에 놓이지만 색은 등산의 것(리터럴)이다 — 골프의 크루 도장(golf/stamps/CrewStampParts)을 가져다 쓰지 않는다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { hikingMountainPath, mountainLabel, duplicateNames } from "@shared/hikingMountains";
import { Peak } from "../components/MountainParts";
import { MountainPatch } from "../stamps/MountainPatch";

interface CrewSummit { mountainId: string; firstDay: string; times: number; people: number; name: string; slug: string; heightM: number | null; region: string | null; sigungu: string | null; kfs100: boolean }
export const crewSummitsKey = (crewId: string) => [`/api/hiq/hiking/crews/${crewId}/summits`] as const;
const dayText = (d: string) => d.replace(/-/g, ".");

export function CrewSummits({ crewId, isMember }: { crewId: string; isMember?: boolean }) {
    const { data, isLoading } = useQuery<{ together: number; mountains: CrewSummit[] }>({ queryKey: crewSummitsKey(crewId), staleTime: 60_000 });
    const list = data?.mountains ?? [];
    const dup = duplicateNames(list);
    if (isLoading) return <div className="mt-3.5 h-[108px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />;
    return (
        <section className="mt-3.5 rounded-2xl bg-[#0E2A33] px-3.5 py-3.5 text-[#F4EFE3]" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF14" }} data-testid="hk-crew-summits" data-count={list.length} aria-label="함께 오른 산">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-[16px] font-semibold tracking-tight">함께 오른 산</h2>
                <span className="shrink-0 text-[12.5px] tabular-nums text-[#F6D9A8]">{list.length > 0 ? `${list.length}곳` : `${data?.together ?? 2}명이 같은 날`}</span>
            </div>
            {list.length === 0 ? (
                <p className="mt-2 text-[13.5px] leading-relaxed text-[#F4EFE3B3] break-keep">
                    같은 날 {data?.together ?? 2}명 이상이 정상에서 인증하면 그 산이 산악회의 도장으로 남아요.{isMember ? " 다음 정기 산행에서 같이 인증해 보세요." : ""}
                </p>
            ) : (
                <ul className="-mx-3.5 mt-3 flex gap-3 overflow-x-auto px-3.5 pb-1" style={{ scrollbarWidth: "none" }}>
                    {[...list].reverse().map((m) => (
                        <li key={m.mountainId} className="w-[72px] shrink-0">
                            <Link href={hikingMountainPath(m.slug)} className="flex flex-col items-center text-center active:opacity-70" data-testid={`hk-crew-mt-${m.mountainId}`}>
                                {m.kfs100 ? <MountainPatch id={m.mountainId} region={m.region} size={60} earned /> : <span className="flex h-[67px] items-center"><Peak height={m.heightM} done size={52} /></span>}
                                <span className="mt-1.5 w-full truncate text-[13px] font-semibold leading-tight">{mountainLabel(m, dup)}</span>
                                <span className="text-[12px] tabular-nums leading-tight text-[#F4EFE380]">{m.times > 1 ? `${m.times}번` : dayText(m.firstDay)}</span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}
