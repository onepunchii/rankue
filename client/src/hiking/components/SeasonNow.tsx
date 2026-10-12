/**
 * 지금 철의 산(2026-10-13) — 이 달이 철인 묶음(10월이면 단풍 · 억새)의 산을 와펜으로 늘어놓는다. 홈과 허브가 같이 쓴다.
 *
 * 묶음은 우리가 순위를 매긴 것이 아니라 **소개 글에 그 말이 나오는 100대 명산**이다(shared/hikingFeatures) — 구역 아래에 그렇게 적는다.
 * 철이 아닌 달(3 · 6 · 7 · 8월)에는 그리지 않는다. 아직 안 오른 산이 앞에 온다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상.
 */
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { hikingFeaturesInMonth } from "@shared/hikingFeatures";
import { duplicateNames, heightText, hikingListPath, hikingMountainPath, mountainLabel } from "@shared/hikingMountains";
import type { MountainSummary } from "../lib/api";
import { MountainPatch } from "../stamps/MountainPatch";
import { HkSection } from "./HikingShell";

/** 한국 시각의 달(1~12) */
export const kstMonth = (now = Date.now()) => new Date(now + 9 * 3_600_000).getUTCMonth() + 1;

export function SeasonNow({ mountains, done, mine, month = kstMonth() }: { mountains: readonly MountainSummary[]; done?: ReadonlySet<string>; mine?: boolean; month?: number }) {
    const features = hikingFeaturesInMonth(month).map((f) => ({ f, list: mountains.filter((m) => m.traits.includes(f.id)) })).filter((x) => x.list.length > 0);
    if (features.length === 0) return null;
    return (
        <HkSection title={`지금은 ${features.map((x) => x.f.name.replace(/ 산$/, "")).join(" · ")} 철`} aside={`${month}월`}>
            <div className="space-y-4" data-testid="hk-season-now">
                {features.map(({ f, list }) => {
                    const dup = duplicateNames(list);
                    const sorted = [...list].sort((a, b) => Number(done?.has(a.id) ?? false) - Number(done?.has(b.id) ?? false) || (b.heightM ?? 0) - (a.heightM ?? 0));
                    return (
                        <div key={f.id} data-testid={`hk-season-${f.id}`}>
                            <Link href={hikingListPath(f.id)} className="mb-2 flex items-center justify-between active:opacity-70">
                                <span className="text-[14.5px] font-semibold text-[#F4EFE3]">{f.name}</span>
                                <span className="flex items-center gap-0.5 text-[12.5px] tabular-nums text-[#F6D9A8]">{mine && done ? `${list.filter((m) => done.has(m.id)).length} / ${list.length}곳` : `${list.length}곳`}<LucideChevronRight weight="bold" className="h-3.5 w-3.5" aria-hidden /></span>
                            </Link>
                            <ul className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1" style={{ scrollbarWidth: "none" }}>
                                {sorted.map((m) => (
                                    <li key={m.id} className="w-[72px] shrink-0">
                                        <Link href={hikingMountainPath(m.slug)} className="flex flex-col items-center text-center active:opacity-70" data-testid={`hk-season-mt-${m.id}`}>
                                            <MountainPatch id={m.id} region={m.region} size={64} earned={!!done?.has(m.id)} preview />
                                            <span className="mt-1.5 w-full truncate text-[13px] font-semibold leading-tight text-[#F4EFE3]">{mountainLabel(m, dup)}</span>
                                            <span className="text-[12px] tabular-nums leading-tight text-[#F4EFE380]">{done?.has(m.id) ? "다녀옴" : heightText(m.heightM)}</span>
                                        </Link>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    );
                })}
            </div>
            <p className="mt-2.5 text-[12.5px] leading-snug text-[#F4EFE373] break-keep">산림청 100대 명산 가운데 소개 글에 그 말이 나오는 산이에요. 때는 해마다 달라요 — 가기 전에 현지 소식을 확인해 주세요.</p>
        </HkSection>
    );
}
