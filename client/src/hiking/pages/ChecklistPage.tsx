/**
 * /hiking/checklist — 등산 준비물(2026-10-13). 당일 산행의 배낭에 넣을 것을 까닭과 함께, 철마다.
 * 챙긴 것을 누르면 지워진다 — 이 기기에만 적어 둔다(서버에 보내지 않는다). 지금 철의 묶음이 맨 위 가까이에 온다.
 * 로그인 없이 열린다. 글은 shared/hikingTerms — 검색용 화면(server/seo/hiking)과 같다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { useState } from "react";
import { Link } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import { HIKING_CHECKLIST, HIKING_CHECKLIST_H1, HIKING_CHECKLIST_LEAD, HIKING_CHECKLIST_NOTE, HIKING_CHECKLIST_SEO, HIKING_TERMS_H1, HIKING_TERMS_PATH, checklistSeasonOf } from "@shared/hikingTerms";
import { HikingShell, HkSection } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { kstMonth } from "../components/SeasonNow";

const COVER = "/hiking/art/cover-checklist.webp";
const KEY = "rankue_hk_pack_done";
const SEASONS = ["spring", "summer", "autumn", "winter"];
const load = (): Set<string> => { try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return new Set(Array.isArray(v) ? v.filter((x) => typeof x === "string") : []); } catch { return new Set(); } };

export default function ChecklistPage() {
    useSeo({ title: HIKING_CHECKLIST_SEO.title, description: HIKING_CHECKLIST_SEO.desc, path: HIKING_CHECKLIST_SEO.path });
    const hikingOk = useHikingAccess();
    const [done, setDone] = useState<Set<string>>(load);
    const save = (next: Set<string>) => { setDone(next); try { localStorage.setItem(KEY, JSON.stringify(Array.from(next))); } catch { /* 저장소를 못 쓰는 환경 — 이번 화면에서만 */ } };
    const toggle = (id: string) => { const next = new Set(done); if (next.has(id)) next.delete(id); else next.add(id); save(next); };
    // 지금 철의 묶음을 '언제나 챙기는 것' 바로 아래로 올린다
    const now = checklistSeasonOf(kstMonth());
    const groups = [...HIKING_CHECKLIST.filter((g) => !SEASONS.includes(g.id)).slice(0, 1), ...HIKING_CHECKLIST.filter((g) => g.id === now), ...HIKING_CHECKLIST.filter((g) => !SEASONS.includes(g.id)).slice(1), ...HIKING_CHECKLIST.filter((g) => SEASONS.includes(g.id) && g.id !== now)];
    const total = HIKING_CHECKLIST.reduce((a, g) => a + g.items.length, 0);

    return (
        <HikingShell title={HIKING_CHECKLIST_H1}>
            <div data-testid="hiking-checklist">
                <div className="relative h-[168px] overflow-hidden">
                    <img src={COVER} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 78%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 20%,#0B1F26F5 97%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-3.5">
                        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{HIKING_CHECKLIST_H1}</h1>
                        <p className="mt-1 text-[13.5px] text-[#F4EFE3B3] break-keep">{HIKING_CHECKLIST_LEAD}</p>
                    </div>
                </div>

                {groups.map((g) => (
                    <HkSection key={g.id} title={g.name} aside={g.id === now ? `${g.note} · 지금 철` : g.note}>
                        <ul className="rounded-2xl bg-[#FFFFFF0A] px-2" data-testid={`pack-group-${g.id}`}>
                            {g.items.map((it, i) => {
                                const on = done.has(it.id);
                                return (
                                    <li key={it.id} className={i ? "border-t border-[#FFFFFF14]" : ""}>
                                        <button type="button" onClick={() => toggle(it.id)} aria-pressed={on} data-testid={`pack-item-${it.id}`} className="flex min-h-[60px] w-full items-center gap-3 px-1.5 py-2.5 text-left active:opacity-70">
                                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full" style={{ background: on ? "#F28C6A" : "transparent", boxShadow: on ? undefined : "inset 0 0 0 1.5px #F4EFE399" }} aria-hidden>
                                                {on && <svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7.4 L6 10.2 L11 4.4" fill="none" stroke="#2A1208" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="block text-[15.5px] font-semibold" style={{ color: on ? "#F4EFE380" : "#F4EFE3", textDecoration: on ? "line-through" : undefined }}>{it.name}</span>
                                                <span className="mt-0.5 block text-[13.5px] leading-snug break-keep" style={{ color: on ? "#F4EFE399" : "#F4EFE399" }}>{it.why}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    </HkSection>
                ))}

                <div className="px-5 pt-5">
                    <p className="text-[13px] leading-relaxed text-[#F4EFE380] break-keep">{HIKING_CHECKLIST_NOTE}</p>
                    {done.size > 0 && (
                        <button type="button" onClick={() => save(new Set())} className="mt-3 h-11 w-full rounded-xl bg-[#FFFFFF14] text-[14px] text-[#F4EFE3] active:bg-[#FFFFFF24]" data-testid="pack-reset">
                            표시 지우기 · {done.size}/{total}
                        </button>
                    )}
                    <Link href={HIKING_TERMS_PATH} className="mt-3 flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]">
                        {HIKING_TERMS_H1} 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden />
                    </Link>
                </div>
                {!hikingOk && <div className="px-5 pt-8"><HikingCta /></div>}
            </div>
        </HikingShell>
    );
}
