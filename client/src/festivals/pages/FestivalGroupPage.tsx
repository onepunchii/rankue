/**
 * 축제 묶음(2026-11-08 — shared/festivalHubs): /festivals/month/<1~12> · /festivals/region/<시도> · /festivals/theme/<말>.
 * 검색으로 들어온 사람의 화면이다('11월 축제' · '부산 축제' · '불꽃축제'). 검색용 화면(server/seo/festivals group)과 같은 셈 · 같은 제목.
 * 짜임: 머리(제목 · 한 줄) → 목록(지금 · 곧 → 최근 1년) → 다른 달 · 시도 · 종류 칩 → 출처. 틀은 전국 축제(/festivals)와 같은 등산 색.
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { FESTIVALS_PATH, FESTIVAL_CREDIT, FESTIVAL_REGIONS, kstToday, type FestivalRow } from "@shared/festivals";
import {
    FESTIVAL_THEMES, festivalMonthPath, festivalMonthSeo, festivalRegionByName, festivalRegionLong, festivalRegionPath, festivalRegionSeo,
    festivalsOfMonth, festivalsOfRegion, festivalsOfTheme, festivalThemeBySlug, festivalThemePath, festivalThemeSeo, type FestivalGroupKind,
} from "@shared/festivalHubs";
import { hubCard } from "@shared/ogCards";
import { HkSkel } from "@/hiking/components/HikingShell";
import { FestivalItem } from "../components/FestivalBits";
import { FestSection, festTheme } from "../theme";
import { FestShell } from "../FestShell";
import { FESTIVALS_KEY, type FestivalsData } from "../api";

const ORIGIN = "https://www.rankue.co.kr";

function build(kind: FestivalGroupKind, key: string, all: readonly FestivalRow[], today: string) {
    const year = today.slice(0, 4);
    if (kind === "month") {
        const m = Number(key);
        if (!Number.isInteger(m) || m < 1 || m > 12) return null;
        const r = festivalsOfMonth(all, m, today);
        return { seo: festivalMonthSeo(m, r), sections: [{ h: `${r.year}년 ${m}월에 ${r.past ? "열렸던" : "열리는"} 축제`, items: r.items }] };
    }
    if (kind === "region") {
        const r = festivalRegionByName(key);
        if (!r) return null;
        const g = festivalsOfRegion(all, r, today);
        return { seo: festivalRegionSeo(r, g, year), sections: [{ h: "지금 · 곧 열리는 축제", items: g.live }, { h: "최근 1년에 열린 축제", items: g.past }] };
    }
    const t = festivalThemeBySlug(key);
    if (!t) return null;
    const g = festivalsOfTheme(all, t, today);
    return { seo: festivalThemeSeo(t, g, year), sections: [{ h: `지금 · 곧 열리는 ${t.name}`, items: g.live }, { h: `최근 1년에 열린 ${t.name}`, items: g.past }] };
}

export default function FestivalGroupPage({ kind, k }: { kind: FestivalGroupKind; k: string }) {
    const t = festTheme(null);
    const { data, isLoading } = useQuery<FestivalsData>({ queryKey: FESTIVALS_KEY, staleTime: 10 * 60_000 });
    const today = data?.today ?? kstToday();
    const all = Array.isArray(data?.items) ? data!.items : [];
    const g = build(kind, k, all, today);
    const card = hubCard(ORIGIN, FESTIVALS_PATH);
    useSeo(g ? { title: g.seo.title, description: g.seo.desc, path: g.seo.path, locale: "ko", ...(card ? { image: card.url } : {}) } : null);
    const chip = (href: string, label: string, on: boolean) => (
        <Link key={href} href={href} className="flex h-9 shrink-0 items-center rounded-full px-3.5 text-[13px] active:opacity-80" aria-current={on ? "page" : undefined}
            style={on ? { background: t.text, color: t.bg, fontWeight: 600 } : { color: `${t.text}B3`, boxShadow: `inset 0 0 0 1px ${t.text}29` }}>{label}</Link>
    );
    return (
        <FestShell sport={null} title={g?.seo.h1 ?? "전국 축제"} back={FESTIVALS_PATH}>
            <div data-testid="festival-group" data-kind={kind}>
                <div className="px-5 pt-6">
                    <h1 className="text-[26px] font-semibold leading-tight tracking-tight" style={{ color: t.text }}>{g?.seo.h1 ?? "전국 축제"}</h1>
                    {g && <p className="mt-1.5 text-[14px] leading-relaxed break-keep" style={{ color: `${t.text}B3` }}>{g.seo.desc}</p>}
                </div>
                {isLoading && <div className="px-5 pt-6"><HkSkel className="h-[300px]" /></div>}
                {!isLoading && !g && <p className="px-5 py-16 text-center text-[15px]" style={{ color: `${t.text}99` }}>없는 축제 묶음이에요.</p>}
                {g && g.sections.every((x) => !x.items.length) && !isLoading && (
                    <p className="mx-5 mt-6 rounded-2xl px-5 py-8 text-center text-[14px] break-keep" style={{ background: "#FFFFFF0A", color: `${t.text}99` }}>지금은 이 묶음에 축제가 없어요. 관광공사 자료가 새로 오면 여기에 실려요.</p>
                )}
                {g?.sections.filter((x) => x.items.length).map((x) => (
                    <FestSection key={x.h} title={x.h} aside={`${x.items.length}곳`} testId="festival-group-list">
                        <ul className="divide-y" style={{ borderColor: `${t.text}14` }}>{x.items.map((f) => <FestivalItem key={f.id} f={f} today={today} />)}</ul>
                    </FestSection>
                ))}
                <FestSection title="달마다 축제">
                    <div className="flex flex-wrap gap-1.5">{Array.from({ length: 12 }, (_, i) => chip(festivalMonthPath(i + 1), `${i + 1}월`, kind === "month" && k === String(i + 1)))}</div>
                </FestSection>
                <FestSection title="지역 축제">
                    <div className="flex flex-wrap gap-1.5">{FESTIVAL_REGIONS.map((r) => chip(festivalRegionPath(r), festivalRegionLong(r), kind === "region" && k === r))}</div>
                </FestSection>
                <FestSection title="종류별 축제">
                    <div className="flex flex-wrap gap-1.5">{FESTIVAL_THEMES.map((x) => chip(festivalThemePath(x.slug), x.name, kind === "theme" && k === x.slug))}</div>
                </FestSection>
                <p className="px-5 pb-8 pt-6 text-[12px]" style={{ color: `${t.text}80` }}>{FESTIVAL_CREDIT}</p>
            </div>
        </FestShell>
    );
}
