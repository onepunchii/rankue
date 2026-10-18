/**
 * /hiking/terms · /hiking/terms/<말> — 등산 용어 사전(2026-10-13). 산에서 듣는 말을 쉬운 말로 푼다.
 * 검색으로 들어온 사람이 읽는 글이라 로그인 없이 열린다. 글은 shared/hikingTerms — 검색용 화면(server/seo/hiking)과 같다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link, useRoute } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import {
    HIKING_CHECKLIST_H1, HIKING_CHECKLIST_PATH, HIKING_TERMS, HIKING_TERMS_H1, HIKING_TERMS_LEAD, HIKING_TERMS_PATH, HIKING_TERMS_SEO, HIKING_TERM_GROUPS,
    hikingTerm, hikingTermPath, hikingTermSeo,
} from "@shared/hikingTerms";
import { HikingShell, HkSection } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { useHikingAccess } from "@/hooks/useHikingAccess";

const COVER = "/hiking/art/cover-terms.webp";

export default function TermsPage() {
    const [, params] = useRoute<{ id: string }>("/hiking/terms/:id");
    const t = params?.id ? hikingTerm(params.id) : undefined;
    const hikingOk = useHikingAccess();
    const seo = t ? hikingTermSeo(t) : HIKING_TERMS_SEO;
    useSeo({ title: seo.title, description: seo.desc, path: seo.path });

    if (params?.id && !t) {
        return (
            <HikingShell title={HIKING_TERMS_H1} backTo={HIKING_TERMS_PATH}>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#F4EFE3B3]">사전에 없는 말이에요.</p>
                    <Link href={HIKING_TERMS_PATH} className="mt-4 inline-flex h-11 items-center rounded-full bg-[#F28C6A] px-5 text-[14px] font-semibold text-[#2A1208]">용어 사전 보기</Link>
                </div>
            </HikingShell>
        );
    }

    if (t) {
        const group = HIKING_TERM_GROUPS.find((g) => g.id === t.group)!;
        const see = (t.see ?? []).map((id) => hikingTerm(id)).filter((x): x is NonNullable<typeof x> => !!x);
        return (
            <HikingShell title={HIKING_TERMS_H1} backTo={HIKING_TERMS_PATH}>
                <article className="px-5 pt-6" data-testid="hiking-term" data-term={t.id}>
                    <p className="text-[13px] text-[#F6D9A8]">{group.name}</p>
                    <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{t.term}</h1>
                    {t.also && t.also.length > 0 && (
                        <p className="mt-2 flex flex-wrap gap-1.5">
                            {t.also.map((a) => <span key={`also:${a}`} className="rounded-full bg-[#FFFFFF14] px-2.5 py-1 text-[13px] text-[#F4EFE3CC]">{a}</span>)}
                        </p>
                    )}
                    <p className="mt-5 text-[19px] font-semibold leading-snug text-[#F4EFE3] break-keep">{t.short}</p>
                    <p className="mt-3 text-[16px] leading-[1.75] text-[#F4EFE3D9] break-keep">{t.body}</p>
                </article>
                {see.length > 0 && (
                    <HkSection title="함께 보면 좋은 말">
                        <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                            {see.map((x, i) => <li key={`see:${x.id}`} className={i ? "border-t border-[#FFFFFF14]" : ""}><TermRow id={x.id} term={x.term} short={x.short} /></li>)}
                        </ul>
                    </HkSection>
                )}
                <div className="px-5 pt-6">
                    <Link href={HIKING_TERMS_PATH} className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]">
                        용어 {HIKING_TERMS.length}가지 다 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden />
                    </Link>
                </div>
                {!hikingOk && <div className="px-5 pt-8"><HikingCta /></div>}
            </HikingShell>
        );
    }

    return (
        <HikingShell title={HIKING_TERMS_H1}>
            <div data-testid="hiking-terms">
                <div className="relative h-[168px] overflow-hidden">
                    <img src={COVER} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 62%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 20%,#0B1F26F5 97%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-3.5">
                        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{HIKING_TERMS_H1}</h1>
                        <p className="mt-1 text-[13.5px] text-[#F4EFE3B3] break-keep">{HIKING_TERMS_LEAD}</p>
                    </div>
                </div>
                {HIKING_TERM_GROUPS.map((g) => {
                    const list = HIKING_TERMS.filter((x) => x.group === g.id);
                    return (
                        <HkSection key={g.id} title={g.name} aside={`${list.length}가지`}>
                            <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                                {list.map((x, i) => <li key={x.id} className={i ? "border-t border-[#FFFFFF14]" : ""}><TermRow id={x.id} term={x.term} short={x.short} /></li>)}
                            </ul>
                        </HkSection>
                    );
                })}
                <div className="px-5 pt-6">
                    <Link href={HIKING_CHECKLIST_PATH} className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]">
                        {HIKING_CHECKLIST_H1} 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden />
                    </Link>
                </div>
                {!hikingOk && <div className="px-5 pt-8"><HikingCta /></div>}
            </div>
        </HikingShell>
    );
}

function TermRow({ id, term, short }: { id: string; term: string; short: string }) {
    return (
        <Link href={hikingTermPath(id)} className="flex min-h-[56px] items-center gap-3 py-2.5 active:opacity-70" data-testid={`term-row-${id}`}>
            <span className="min-w-0 flex-1">
                <span className="block text-[15.5px] font-semibold text-[#F4EFE3]">{term}</span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-[#F4EFE399] break-keep">{short}</span>
            </span>
            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE399]" aria-hidden />
        </Link>
    );
}
