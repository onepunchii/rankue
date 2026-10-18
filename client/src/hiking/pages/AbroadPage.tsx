/**
 * /hiking/abroad · /hiking/abroad/<코스> — 해외 명산 투어판(2026-10-16). 읽는 콘텐츠만, 로그인 없이 열린다.
 * 글은 shared/hikingAbroad — 검색용 화면(server/seo/hiking)과 같다. check 가 붙은 줄은 "확인 필요"를 단다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Link, useRoute } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { useSeo } from "@/hooks/useSeo";
import {
    ABROAD_ALTITUDE_NAME, ABROAD_LEVEL_NAME, ABROAD_REGIONS, HIKING_ABROAD, HIKING_ABROAD_CHECKED_ON, HIKING_ABROAD_H1, HIKING_ABROAD_LEAD, HIKING_ABROAD_NOTE,
    HIKING_ABROAD_PATH, HIKING_ABROAD_SEO, abroadHeightText, hikingAbroad, hikingAbroadPath, hikingAbroadSeo, type AbroadCourse, type AbroadFact,
} from "@shared/hikingAbroad";
import { HikingShell, HkSection } from "../components/HikingShell";
import { HikingCta } from "../components/MountainParts";
import { useHikingAccess } from "@/hooks/useHikingAccess";

const COVER = "/hiking/art/cover-list-highest50.webp";

export default function AbroadPage() {
    const [, params] = useRoute<{ id: string }>("/hiking/abroad/:id");
    const c = params?.id ? hikingAbroad(params.id) : undefined;
    const hikingOk = useHikingAccess();
    const seo = c ? hikingAbroadSeo(c) : HIKING_ABROAD_SEO;
    useSeo({ title: seo.title, description: seo.desc, path: seo.path });

    if (params?.id && !c) {
        return (
            <HikingShell title={HIKING_ABROAD_H1} backTo={HIKING_ABROAD_PATH}>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[15px] text-[#F4EFE3B3]">목록에 없는 코스예요.</p>
                    <Link href={HIKING_ABROAD_PATH} className="mt-4 inline-flex h-11 items-center rounded-full bg-[#F28C6A] px-5 text-[14px] font-semibold text-[#2A1208]">{HIKING_ABROAD_H1} 보기</Link>
                </div>
            </HikingShell>
        );
    }

    if (c) return <CourseView c={c} hikingOk={hikingOk} />;

    return (
        <HikingShell title={HIKING_ABROAD_H1}>
            <div data-testid="hiking-abroad">
                <div className="relative h-[168px] overflow-hidden">
                    <img src={COVER} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 45%" }} draggable={false} decoding="async" />
                    <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1F2600 20%,#0B1F26F5 97%)" }} aria-hidden />
                    <div className="absolute inset-x-5 bottom-3.5">
                        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-[#F4EFE3]">{HIKING_ABROAD_H1}</h1>
                        <p className="mt-1 text-[13.5px] text-[#F4EFE3B3] break-keep">{HIKING_ABROAD_LEAD}</p>
                    </div>
                </div>
                {ABROAD_REGIONS.map((r) => {
                    const list = HIKING_ABROAD.filter((x) => x.region === r.id);
                    if (!list.length) return null;
                    return (
                        <HkSection key={r.id} title={r.name} aside={`${list.length}곳`}>
                            <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                                {list.map((x, i) => <li key={x.id} className={i ? "border-t border-[#FFFFFF14]" : ""}><CourseRow c={x} /></li>)}
                            </ul>
                        </HkSection>
                    );
                })}
                <div className="px-5 pt-6">
                    <p className="rounded-2xl bg-[#FFFFFF0A] p-4 text-[13px] leading-relaxed text-[#F4EFE399] break-keep">{HIKING_ABROAD_NOTE}</p>
                </div>
                {!hikingOk && <div className="px-5 pt-8"><HikingCta /></div>}
            </div>
        </HikingShell>
    );
}

function CourseRow({ c }: { c: AbroadCourse }) {
    return (
        <Link href={hikingAbroadPath(c.id)} className="flex min-h-[64px] items-center gap-3 py-3 active:opacity-70" data-testid={`abroad-row-${c.id}`}>
            <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                    <span className="text-[15.5px] font-semibold text-[#F4EFE3]">{c.name}</span>
                    <span className="shrink-0 text-[13px] tabular-nums text-[#F6D9A8]">{abroadHeightText(c.peakM)}</span>
                </span>
                <span className="mt-0.5 block text-[13px] text-[#F4EFE399]">{c.country} · {ABROAD_LEVEL_NAME[c.level]}</span>
                <span className="mt-1 block text-[13.5px] leading-snug text-[#F4EFE3B3] break-keep">{c.short}</span>
            </span>
            <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE399]" aria-hidden />
        </Link>
    );
}

function CheckChip() {
    return <span className="ml-1.5 inline-block whitespace-nowrap rounded-full bg-[#F6D9A81F] px-2 py-0.5 align-middle text-[12px] text-[#F6D9A8]">확인 필요</span>;
}

function FactList({ facts }: { facts: readonly AbroadFact[] }) {
    return (
        <ul className="space-y-2">
            {facts.map((f) => (
                <li key={f.text} className="flex gap-2.5 text-[15px] leading-[1.7] text-[#F4EFE3D9] break-keep">
                    <span className="mt-[11px] h-1 w-1 shrink-0 rounded-full bg-[#7FA39A]" aria-hidden />
                    <span>{f.text}{f.check && <CheckChip />}</span>
                </li>
            ))}
        </ul>
    );
}

const P = "text-[15px] leading-[1.7] text-[#F4EFE3D9] break-keep";

function CourseView({ c, hikingOk }: { c: AbroadCourse; hikingOk: boolean }) {
    const region = ABROAD_REGIONS.find((r) => r.id === c.region)!;
    const tiles: { label: string; value: string; sub?: string; check?: boolean }[] = [
        { label: "산 높이", value: abroadHeightText(c.peakM) },
        { label: "이 코스 최고점", value: abroadHeightText(c.top.m), sub: c.top.where, check: c.top.check },
        { label: "난이도", value: ABROAD_LEVEL_NAME[c.level] },
        { label: "고산병", value: ABROAD_ALTITUDE_NAME[c.altitude] },
    ];
    return (
        <HikingShell title={HIKING_ABROAD_H1} backTo={HIKING_ABROAD_PATH}>
            <article className="px-5 pt-6" data-testid="hiking-abroad-course" data-course={c.id}>
                <p className="text-[13px] text-[#F6D9A8]">{region.name} · {c.country}</p>
                <h1 className="mt-1 text-[32px] font-semibold leading-tight tracking-tight text-[#F4EFE3] break-keep">{c.name}</h1>
                <p className="mt-1 text-[14px] text-[#F4EFE399]">{c.local}</p>
                <dl className="mt-5 grid grid-cols-2 gap-2">
                    {tiles.map((t) => (
                        <div key={t.label} className="rounded-xl bg-[#FFFFFF0A] p-3">
                            <dt className="text-[12px] text-[#F4EFE399]">{t.label}</dt>
                            <dd className="mt-0.5 text-[17px] font-semibold tabular-nums text-[#F4EFE3]">{t.value}</dd>
                            {t.sub && <dd className="mt-0.5 text-[12px] text-[#F4EFE3B3] break-keep">{t.sub}{t.check && <CheckChip />}</dd>}
                        </div>
                    ))}
                </dl>
                <p className="mt-5 text-[19px] font-semibold leading-snug text-[#F4EFE3] break-keep">{c.short}</p>
            </article>
            <HkSection title="코스">
                <div className="space-y-2">
                    <p className={P}>{c.course}</p>
                    <p className={P}>{c.days}</p>
                    <p className="text-[14px] leading-[1.7] text-[#F4EFE3B3] break-keep">{c.levelNote}</p>
                </div>
            </HkSection>
            <HkSection title="가기 좋은 때"><FactList facts={c.season} /></HkSection>
            <HkSection title="허가 · 입산료"><FactList facts={c.permits} /></HkSection>
            <HkSection title="가이드"><FactList facts={[c.guide]} /></HkSection>
            <HkSection title="가는 길"><FactList facts={c.access} /></HkSection>
            <HkSection title="고산병"><p className={P}>{c.altitudeNote}</p></HkSection>
            <HkSection title="볼거리"><FactList facts={c.highlights.map((text) => ({ text }))} /></HkSection>
            <HkSection title="조심할 것"><FactList facts={c.cautions.map((text) => ({ text }))} /></HkSection>
            <HkSection title="출처" aside={`확인한 날 ${HIKING_ABROAD_CHECKED_ON}`}>
                <ul className="rounded-2xl bg-[#FFFFFF0A] px-3.5">
                    {c.sources.map((s, i) => (
                        <li key={s.url} className={i ? "border-t border-[#FFFFFF14]" : ""}>
                            <a href={s.url} target="_blank" rel="noopener noreferrer" className="flex min-h-[48px] items-center gap-3 py-2.5 active:opacity-70">
                                <span className="min-w-0 flex-1 text-[14.5px] text-[#F4EFE3]">{s.label}</span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE399]" aria-hidden />
                            </a>
                        </li>
                    ))}
                </ul>
                <p className="mt-3 text-[13px] leading-relaxed text-[#F4EFE399] break-keep">{HIKING_ABROAD_NOTE}</p>
            </HkSection>
            <div className="px-5 pt-6">
                <Link href={HIKING_ABROAD_PATH} className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF14] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]">
                    해외 명산 {HIKING_ABROAD.length}곳 다 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden />
                </Link>
            </div>
            {!hikingOk && <div className="px-5 pt-8"><HikingCta /></div>}
        </HikingShell>
    );
}
