/**
 * 산악회가 함께 오른 산(2026-10-13) — 산악회 홈(공용 크루 화면)에 놓이는 등산의 조각.
 *
 * 같은 날 두 사람 이상이 정상에서 인증한 산이 산악회의 도장이다(혼자 오른 산은 그 사람의 도장이다 — server/storage/hikingStamps.crewSummits).
 * 누가 올랐는지는 보여 주지 않는다 — 산 · 처음 함께 오른 날 · 횟수 · 가장 많이 함께한 사람 수만(이름은 없다).
 * 모양은 산악회의 깃발 진열장이다(2026-10-13 오너: "함께 오른 산도 디자인 꾸며서 더 소유욕이 생기게") — 펠트 판에 산마다 한 칸, 핀과 깃발. 100대 명산은 그 산의 와펜으로, 그 밖의 산은 작은 봉우리 그림으로.
 * 공용 크루 화면 안에 놓이지만 색은 등산의 것(리터럴)이다 — 골프의 크루 도장(golf/stamps/CrewStampParts)을 가져다 쓰지 않는다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { hikingListPath, hikingMountainPath, mountainLabel, duplicateNames } from "@shared/hikingMountains";
import { Peak } from "../components/MountainParts";
import { MountainPatch } from "../stamps/MountainPatch";

interface CrewSummit { mountainId: string; firstDay: string; times: number; people: number; name: string; slug: string; heightM: number | null; region: string | null; sigungu: string | null; kfs100: boolean }
export const crewSummitsKey = (crewId: string) => [`/api/hiq/hiking/crews/${crewId}/summits`] as const;
const dayText = (d: string) => d.replace(/-/g, ".");
/** 산악회의 목표 — 산림청 100대 명산은 백 곳이다 */
const KFS100_TOTAL = 100;
const GOAL_LABEL = "함께 오른 100대 명산";

/** 산악회의 깃발 — 카드마다 꽂는 작은 삼각 깃발 */
const Pennant = ({ className }: { className?: string }) => (
    <svg width="20" height="24" viewBox="0 0 20 24" className={className} aria-hidden>
        <path d="M3 2 V23" stroke="#3A2A1A" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4 3 L18 7.5 L4 12 Z" fill="#F28C6A" stroke="#3A2A1A" strokeWidth="1" strokeLinejoin="round" />
    </svg>
);

export function CrewSummits({ crewId, isMember }: { crewId: string; isMember?: boolean }) {
    const { data, isLoading } = useQuery<{ together: number; mountains: CrewSummit[] }>({ queryKey: crewSummitsKey(crewId), staleTime: 60_000 });
    const list = data?.mountains ?? [];
    const dup = duplicateNames(list);
    if (isLoading) return <div className="mt-3.5 h-[108px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />;
    // 한눈 숫자 — 산의 수 · 높이의 합 · 함께 오른 횟수
    const heightSum = list.reduce((a, m) => a + (m.heightM ?? 0), 0);
    const times = list.reduce((a, m) => a + m.times, 0);
    const kfs = list.filter((m) => m.kfs100).length;
    const goalPct = Math.min(100, (kfs / KFS100_TOTAL) * 100);
    return (
        <section className="mt-3.5 overflow-hidden rounded-[22px] text-[#F4EFE3]" style={{ background: "#0E2A33", boxShadow: "inset 0 0 0 1px #FFFFFF14, 0 6px 16px rgba(0,0,0,0.25)" }} data-testid="hk-crew-summits" data-count={list.length} aria-label="함께 오른 산">
            <div className="flex items-center gap-3 px-4 pb-3 pt-3.5" style={{ background: "linear-gradient(135deg,#1F556099,#0E2A33)" }}>
                <Pennant className="shrink-0" />
                <div className="min-w-0 flex-1">
                    <h2 className="text-[16.5px] font-semibold tracking-tight">함께 오른 산</h2>
                    <p className="mt-0.5 truncate text-[12.5px] text-[#F4EFE399]">같은 날 {data?.together ?? 2}명 이상이 정상에서 인증한 산</p>
                </div>
                {list.length > 0 && <span className="shrink-0 text-[22px] font-semibold tabular-nums leading-none text-[#F6D9A8]">{list.length}<span className="ml-0.5 text-[13px] font-normal text-[#F4EFE399]">곳</span></span>}
            </div>
            {list.length === 0 ? (
                <div className="px-4 pb-4 pt-1">
                    {/* 아직 빈 진열장 — 깃발 꽂을 자리 셋 */}
                    <div className="flex justify-center gap-3 rounded-2xl py-4" style={{ background: "linear-gradient(160deg,#7A7448,#5C5733 55%,#6B6540)", boxShadow: "inset 0 1px 0 #FFFFFF33" }} aria-hidden>
                        {[0, 1, 2].map((k) => (
                            <span key={k} className="flex h-[78px] w-[62px] items-center justify-center rounded-xl" style={{ background: "#F4EFE31F", boxShadow: "inset 0 0 0 1.5px #F4EFE34D", borderStyle: "dashed" }}><Peak height={600 + k * 500} size={40} /></span>
                        ))}
                    </div>
                    <p className="mt-3 text-[13.5px] leading-relaxed text-[#F4EFE3B3] break-keep">
                        같은 날 {data?.together ?? 2}명 이상이 정상에서 인증하면 그 산에 산악회의 깃발이 꽂혀요.{isMember ? " 다음 정기 산행에서 같이 인증해 보세요." : ""}
                    </p>
                </div>
            ) : (
                <>
                    <div className="mx-4 flex divide-x divide-[#FFFFFF1F] rounded-2xl bg-[#FFFFFF0A] py-2.5 text-center" data-testid="hk-crew-summits-stats">
                        {([[`${heightSum.toLocaleString("en-US")}m`, "높이의 합"], [`${times}번`, "함께 오른 날"], [`${kfs}곳`, "100대 명산"]] as const).map(([v, k]) => (
                            <div key={k} className="flex-1 px-1"><div className="text-[15.5px] font-semibold tabular-nums leading-tight">{v}</div><div className="mt-0.5 text-[12px] text-[#F4EFE399]">{k}</div></div>
                        ))}
                    </div>
                    {/* 산악회의 목표 — 함께 오른 100대 명산. 아직 한 곳도 없어도(다른 산만 올랐어도) 보여 준다 */}
                    <div className="mx-4 mt-2.5 rounded-2xl bg-[#FFFFFF0A] px-3.5 pt-3" data-testid="hk-crew-goal" data-got={kfs}>
                        <div className="flex items-baseline justify-between gap-3">
                            <span className="min-w-0 truncate text-[13.5px] font-medium text-[#F4EFE3CC]">{GOAL_LABEL}</span>
                            <span className="shrink-0 text-[16px] font-semibold tabular-nums leading-none text-[#F6D9A8]">{kfs}<span className="ml-1 text-[12.5px] font-normal text-[#F4EFE399]">/ {KFS100_TOTAL}</span></span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#FFFFFF1F]" role="progressbar" aria-label={GOAL_LABEL} aria-valuemin={0} aria-valuemax={KFS100_TOTAL} aria-valuenow={kfs}>
                            <div className="h-full rounded-full bg-[#F28C6A]" style={{ width: `${goalPct}%`, minWidth: kfs > 0 ? 8 : 0 }} />
                        </div>
                        <Link href={hikingListPath("kfs100")} className="flex h-10 items-center gap-1 text-[13px] font-medium text-[#F6D9A8] active:opacity-70" data-testid="hk-crew-goal-link">
                            100대 명산 수첩 보기
                            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        </Link>
                    </div>
                    {/* 진열장 — 펠트 판에 산마다 한 칸. 새로 오른 산이 앞에 */}
                    <div className="mx-4 mb-4 mt-3 rounded-[20px] p-[9px]" style={{ background: "linear-gradient(160deg,#7A7448,#5C5733 55%,#6B6540)", boxShadow: "inset 0 1px 0 #FFFFFF33, 0 6px 14px rgba(0,0,0,0.35)" }}>
                        <ul className="flex gap-2.5 overflow-x-auto rounded-[14px] px-2.5 py-3" style={{ scrollbarWidth: "none", background: "repeating-linear-gradient(45deg,#4C5B45,#4C5B45 3px,#485741 3px,#485741 6px)", boxShadow: "inset 0 2px 8px rgba(0,0,0,0.45)" }}>
                            {[...list].reverse().map((m) => (
                                <li key={m.mountainId} className="w-[92px] shrink-0">
                                    <Link href={hikingMountainPath(m.slug)} className="relative flex flex-col items-center rounded-xl px-1.5 pb-2 pt-2.5 text-center text-[#0E2A33] active:opacity-80" style={{ background: "#F4EFE3", boxShadow: "0 3px 6px rgba(0,0,0,0.4)" }} data-testid={`hk-crew-mt-${m.mountainId}`}>
                                        {/* 꽂은 핀 · 산악회의 깃발 */}
                                        <span className="absolute left-1/2 top-[-4px] h-[9px] w-[9px] -translate-x-1/2 rounded-full" style={{ background: "radial-gradient(circle at 35% 30%,#FFE9B0,#C99A3E)", boxShadow: "0 1px 2px rgba(0,0,0,0.5)" }} aria-hidden />
                                        <Pennant className="absolute right-[3px] top-[5px] scale-75" />
                                        {m.kfs100 ? <MountainPatch id={m.mountainId} region={m.region} size={56} earned /> : <span className="flex h-[63px] items-center"><Peak height={m.heightM} done size={48} /></span>}
                                        <span className="mt-1.5 w-full truncate text-[13.5px] font-semibold leading-tight">{mountainLabel(m, dup)}</span>
                                        <span className="mt-0.5 text-[12px] tabular-nums leading-tight text-[#0E2A33B3]">{dayText(m.firstDay)}</span>
                                        <span className="mt-1 rounded-full px-2 py-[3px] text-[12px] font-medium tabular-nums leading-none" style={{ background: "#1F556021", color: "#1F5560" }}>{m.times > 1 ? `${m.times}번 · ` : ""}{m.people}명</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </>
            )}
        </section>
    );
}
