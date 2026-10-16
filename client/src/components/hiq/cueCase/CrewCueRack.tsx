/**
 * 크루 큐 랙(2026-10-16, 큐 케이스 기획 6.2) — 당구 크루 홈 벽에 크루원 각자의 대표 큐가 한 줄씩 걸린다.
 * 새 그림 없이 큐 케이스의 것을 쓴다. 위에는 크루가 모은 서로 다른 큐의 수(77자루 중). 줄을 누르면 그 사람의 큐 케이스.
 * 가죽 · 벨벳은 홈 입구 띠와 같은 판(index.css .cue-case · .cc-entry). 당구 크루가 아니면(서버 404) 아무것도 안 그린다.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { useT } from "@/lib/i18n";
import { CUES, caseImage, caseItem, type CaseLocale } from "@shared/cueCase";
import { cueCasePath } from "./cueCaseApi";

interface RackMember { id: string; name: string; cue: string | null; cues: number }
interface Rack { members: RackMember[]; owned: number }
const SHOW = 6;

export function CrewCueRack({ crewId }: { crewId: string }) {
    const { t, locale } = useT();
    const l = (["ko", "en", "es", "vi", "tr"].includes(locale) ? locale : "en") as CaseLocale;
    const [, setLocation] = useLocation();
    const [all, setAll] = useState(false);
    const q = useQuery({
        queryKey: ["cue-case-crew", crewId],
        queryFn: async (): Promise<Rack> => {
            const r = (await apiRequest(`/api/hiq/cue-case/crew/${crewId}`)) as Partial<Rack>;
            return { members: Array.isArray(r.members) ? r.members : [], owned: typeof r.owned === "number" ? r.owned : 0 };
        },
        staleTime: 60_000, retry: false,
    });
    const d = q.data;
    if (!d || d.members.length === 0) return null;
    const hung = d.members.filter((m) => m.cue);
    const list = all ? d.members : d.members.slice(0, SHOW);
    return (
        <section className="cue-case cc-entry mx-4 mt-6 rounded-[24px] px-4 pb-4 pt-4" aria-label={t("case.rackTitle")} data-testid="crew-cue-rack">
            <div className="relative px-1.5">
                <div className="flex items-baseline justify-between gap-2">
                    <h2 className="text-[16px] font-semibold tracking-tight text-[#f4ead6]">{t("case.rackTitle")}</h2>
                    <span className="rk-num shrink-0 text-[12.5px] text-[#e8c46a]">{t("case.rackOwned").replace("{n}", String(d.owned)).replace("{m}", String(CUES.length))}</span>
                </div>
                <span className="cc-bar mt-2 block"><i style={{ width: `${Math.round((d.owned / CUES.length) * 100)}%` }} /></span>
                <p className="mt-2 text-[12px] leading-relaxed text-[#f4ead6]/60 break-keep">{hung.length > 0 ? t("case.rackHint") : t("case.rackEmpty")}</p>
            </div>
            <ol className="relative mt-3 space-y-2.5 rounded-[18px] bg-[#0b1322] p-2.5" style={{ boxShadow: "inset 0 2px 8px rgba(0,0,0,0.7)" }}>
                {list.map((m) => {
                    const x = m.cue ? caseItem(m.cue) : null;
                    return (
                        <li key={m.id}>
                            <button type="button" onClick={() => setLocation(cueCasePath({ m: m.id }))} className="block w-full text-left active:opacity-85" data-testid="crew-cue-rack-row">
                                <span className="cc-slot block !h-[30px]">
                                    {x ? <img src={caseImage(x)} alt="" loading="lazy" decoding="async" draggable={false} className="cc-own" /> : null}
                                </span>
                                <span className="mt-1 flex items-baseline gap-2 px-1.5">
                                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-[#f4ead6]">{m.name}</span>
                                    <span className="rk-num shrink-0 text-[12px] text-[#f4ead6]/55">{x ? `${x.name[l]} · ` : ""}{t("case.rackCount").replace("{n}", String(m.cues))}</span>
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            {d.members.length > SHOW && (
                <button type="button" onClick={() => setAll((v) => !v)} className="relative mt-3 h-10 w-full rounded-full border border-[#e8c46a]/30 text-[13px] font-semibold text-[#f4ead6]/85 active:bg-white/5" data-testid="crew-cue-rack-more">
                    {all ? t("case.rackLess") : t("case.rackMore").replace("{n}", String(d.members.length))}
                </button>
            )}
        </section>
    );
}

export default CrewCueRack;
