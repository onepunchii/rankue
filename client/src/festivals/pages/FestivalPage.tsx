/**
 * /festivals/:id — 축제 한 곳(2026-10-21).
 *
 * 위에서부터: 사진(원본 비율 그대로 · 출처) → 알약 · 이름 · 기간(요일) · 지역 → 길찾기 · 전화 · 홈페이지 → 축제 정보(장소 · 시간 · 요금 · 주최)
 * → 어디서(축제 지도를 그 자리로 당겨 — 가는 길에 들를 산 · 골프장 · 낚시터를 같이) → 소개(한국관광공사 글 그대로) → 가는 길에 들를 곳 → 근처 다른 축제.
 * 끝난 축제(올해 날짜가 지났고 다음 해 날짜가 아직 안 나온 것)는 그렇다고 적는다 — 자료가 바뀌면 이 페이지의 날짜가 바뀐다.
 * 로그인 없이 열린다. 글은 shared/festivals — 검색용 화면과 같다. 사진은 공공누리 제3유형이라 자르지 않는다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useState, type ReactNode } from "react";
import { Link, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight, LucideGlobe, LucideNavigation, LucidePhone } from "@/lib/icons";
import { canOpenInApp, openInAppBrowser } from "@/lib/openOutside";
import { FESTIVALS_PATH, FESTIVAL_CREDIT, FESTIVAL_SOURCE, festivalCatName, festivalPeriod, festivalPhotoCredit, festivalSeo, festivalState } from "@shared/festivals";
import { hikingMountainPath } from "@shared/hikingMountains";
import { coursePath } from "@shared/golfCourse";
import { fishingSpotPath } from "@shared/fishingPlaces";
import { HikingShell, HkSection, HkSkel } from "@/hiking/components/HikingShell";
import { LanternMap, type LanternMark } from "../components/LanternMap";
import { FestivalBadge, FestivalItem } from "../components/FestivalBits";
import { festivalKey, type FestivalData } from "../api";

const kakaoRoute = (name: string, lat: number, lng: number) => `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
/** 바깥 링크 — 앱에서는 앱 안 브라우저 창으로(닫으면 이 화면) */
const outside = (url: string) => async (e: React.MouseEvent) => { if (canOpenInApp()) { e.preventDefault(); await openInAppBrowser(url); } };

function Fact({ k, children }: { k: string; children: ReactNode }) {
    return (
        <div className="flex gap-3 py-2.5">
            <dt className="w-[52px] shrink-0 text-[13px] text-[#F4EFE380]">{k}</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line text-[14.5px] leading-relaxed text-[#F4EFE3] break-keep">{children}</dd>
        </div>
    );
}

export default function FestivalPage() {
    const [, params] = useRoute("/festivals/:id");
    const id = params?.id ?? "";
    const { data, isLoading, isError } = useQuery<FestivalData>({ queryKey: festivalKey(id), enabled: !!id, staleTime: 10 * 60_000, retry: 1 });
    const [open, setOpen] = useState(false);
    const f = data?.festival, around = data?.around, today = data?.today ?? "";
    const seo = f && around ? festivalSeo(f, { mountains: around.mountains.length, golf: around.golf.length, fishing: around.fishing.length }) : null;
    useSeo(seo ? { title: seo.title, description: seo.desc, path: seo.path } : null);

    if (isLoading || (!data && !isError)) {
        return <HikingShell title="축제" backTo={FESTIVALS_PATH}><div className="space-y-4 px-5 pt-5" aria-busy="true"><HkSkel className="h-[240px]" /><HkSkel className="h-24" /><HkSkel className="h-40" /></div></HikingShell>;
    }
    if (!f || !around) {
        return (
            <HikingShell title="축제" backTo={FESTIVALS_PATH}>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[17px] font-semibold text-[#F4EFE3]">없는 축제예요</p>
                    <p className="mt-1.5 text-[14px] text-[#F4EFE399]">자료에서 빠졌거나 주소가 바뀌었어요.</p>
                    <Link href={FESTIVALS_PATH} className="mt-5 inline-flex h-11 items-center rounded-xl bg-[#F28C6A] px-5 text-[15px] font-semibold text-[#2A1208]">전국 축제 보기</Link>
                </div>
            </HikingShell>
        );
    }

    const st = festivalState(f, today);
    const tel = f.tel ?? f.hostTel;
    // 가는 길에 들를 곳을 지도에 같이 — 산 ▲ · 골프장 ■ · 낚시터 ◆ (색은 아래 목록의 제목과 같다)
    const marks: LanternMark[] = [
        ...around.mountains.map((m) => ({ lat: m.lat, lng: m.lng, label: m.name, kind: "mountain" as const })),
        ...around.golf.map((g) => ({ lat: g.lat, lng: g.lng, label: g.name, kind: "golf" as const })),
        ...around.fishing.map((p) => ({ lat: p.lat, lng: p.lng, label: p.name, kind: "fishing" as const })),
    ];
    const hasAround = around.mountains.length + around.golf.length + around.fishing.length > 0;

    return (
        <HikingShell title={f.title} backTo={FESTIVALS_PATH}>
            <article data-testid="festival-page">
                {f.image && (
                    <figure className="px-5 pt-4">
                        <img src={f.image} alt={`${f.title} 사진`} className="block h-auto w-full rounded-2xl" style={{ background: "#FFFFFF0A" }} loading="eager" decoding="async" referrerPolicy="no-referrer" />
                        <figcaption className="mt-1.5 text-right text-[12px] text-[#F4EFE366]">{festivalPhotoCredit(f.lic)}</figcaption>
                    </figure>
                )}

                <header className="px-5 pt-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <FestivalBadge f={f} today={today} />
                        {festivalCatName(f.cat) && <span className="text-[12.5px] text-[#F4EFE399]">{festivalCatName(f.cat)}</span>}
                    </div>
                    <h1 className="mt-2 text-[25px] font-semibold leading-tight tracking-tight text-[#F4EFE3] break-keep">{f.title}</h1>
                    <p className="mt-1.5 text-[15.5px] tabular-nums text-[#F6D9A8]">{festivalPeriod(f, true)}</p>
                    <p className="mt-0.5 text-[14px] text-[#F4EFE3B3] break-keep">{[f.region, f.place].filter(Boolean).join(" · ")}</p>
                    {st.state === "ended" && (
                        <p className="mt-3 rounded-xl bg-[#FFFFFF0D] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#F4EFE3CC] break-keep">올해 축제는 끝났어요. 다음 날짜가 나오면 이 페이지의 날짜가 바뀌어요.</p>
                    )}
                    <div className="mt-4 flex gap-2">
                        <a href={kakaoRoute(f.place ?? f.title, f.lat, f.lng)} target="_blank" rel="noopener noreferrer" onClick={outside(kakaoRoute(f.place ?? f.title, f.lat, f.lng))}
                            className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#F28C6A] text-[15px] font-semibold text-[#2A1208] active:bg-[#E67C59]" data-testid="festival-route">
                            <LucideNavigation weight="bold" className="h-4 w-4" aria-hidden />길찾기
                        </a>
                        {tel && (
                            <a href={`tel:${tel}`} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FFFFFF1F] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF2E]" data-testid="festival-tel">
                                <LucidePhone weight="bold" className="h-4 w-4" aria-hidden />전화
                            </a>
                        )}
                        {f.homepage && (
                            <a href={f.homepage} target="_blank" rel="noopener noreferrer" onClick={outside(f.homepage)}
                                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-[#FFFFFF1F] text-[15px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF2E]" data-testid="festival-homepage">
                                <LucideGlobe weight="bold" className="h-4 w-4" aria-hidden />홈페이지
                            </a>
                        )}
                    </div>
                </header>

                <HkSection title="축제 정보">
                    <dl className="divide-y divide-[#FFFFFF12] rounded-2xl bg-[#FFFFFF08] px-4" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF12" }} data-testid="festival-facts">
                        <Fact k="기간">{festivalPeriod(f, true)}</Fact>
                        {f.place && <Fact k="장소">{f.place}</Fact>}
                        {f.addr && <Fact k="주소">{f.addr}</Fact>}
                        {f.playtime && <Fact k="시간">{f.playtime}</Fact>}
                        {f.fee && <Fact k="요금">{f.fee}</Fact>}
                        {f.host && <Fact k="주최">{f.host}</Fact>}
                        {tel && <Fact k="문의"><a href={`tel:${tel}`} className="tabular-nums text-[#F6D9A8] underline-offset-2 active:underline">{tel}</a></Fact>}
                    </dl>
                </HkSection>

                <HkSection title="어디서" aside={f.region ?? undefined}>
                    <LanternMap items={[f, ...around.festivals]} today={today} focus={{ lat: f.lat, lng: f.lng }} marks={marks} label={`${f.title} 자리`} />
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px] text-[#F4EFE380]">
                        <span>밝은 등불 이 축제 · 옅은 등불 근처 축제</span>
                        {around.mountains.length > 0 && <span className="text-[#F6D9A8]">▲ 산</span>}
                        {around.golf.length > 0 && <span className="text-[#8FD3A7]">■ 골프장</span>}
                        {around.fishing.length > 0 && <span className="text-[#8EC5FF]">◆ 낚시터</span>}
                    </p>
                </HkSection>

                {f.overview && (
                    <HkSection title="소개" aside={`글 ${FESTIVAL_SOURCE}`}>
                        <p className={`whitespace-pre-line text-[15px] leading-[1.75] text-[#F4EFE3E6] break-keep ${open ? "" : "line-clamp-6"}`} data-testid="festival-overview">{f.overview}</p>
                        {f.overview.length > 180 && (
                            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 h-10 rounded-xl px-1 text-[14px] font-medium text-[#F6D9A8] active:opacity-70">{open ? "접기" : "더 읽기"}</button>
                        )}
                    </HkSection>
                )}

                {hasAround && (
                    <HkSection title="가는 길에 들를 곳" aside="축제 자리에서 잰 거리">
                        {around.mountains.length > 0 && (
                            <div data-testid="festival-around-mountains">
                                <p className="mb-2 text-[13px] font-semibold text-[#F6D9A8]">오를 산</p>
                                <div className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                                    {around.mountains.map((m) => (
                                        <Link key={m.slug} href={hikingMountainPath(m.slug)} className="block shrink-0 active:opacity-80">
                                            {m.photo ? (
                                                <span className="block overflow-hidden rounded-xl" style={{ background: "#FFFFFF0A" }}>
                                                    <img src={m.photo.url} alt={`${m.name} 사진`} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="block h-[96px] w-auto max-w-none" />
                                                </span>
                                            ) : (
                                                <span className="flex h-[96px] w-[128px] items-end rounded-xl p-2.5" style={{ background: "linear-gradient(160deg,#1D4C55,#13363F)" }} aria-hidden>
                                                    <svg viewBox="0 0 60 30" className="h-8 w-16"><path d="M0 30 L18 8 L28 18 L40 2 L60 30 Z" fill="#F6D9A855" /></svg>
                                                </span>
                                            )}
                                            <span className="mt-1.5 block text-[14.5px] font-semibold text-[#F4EFE3]">{m.name}</span>
                                            <span className="block text-[12.5px] tabular-nums text-[#F4EFE399]">{[m.heightM ? `${m.heightM.toLocaleString()}m` : null, `${m.km}km`].filter(Boolean).join(" · ")}</span>
                                        </Link>
                                    ))}
                                </div>
                                {around.mountains.some((m) => m.photo) && <p className="mt-1.5 text-[12px] text-[#F4EFE366]">산 사진 한국관광공사 · 공공누리</p>}
                            </div>
                        )}
                        {around.golf.length > 0 && (
                            <div className="mt-5" data-testid="festival-around-golf">
                                <p className="mb-1 text-[13px] font-semibold text-[#8FD3A7]">골프장</p>
                                <ul className="divide-y divide-[#FFFFFF12]">
                                    {around.golf.map((g) => (
                                        <li key={g.slug}>
                                            <Link href={coursePath(g.slug)} className="flex items-center gap-3 py-2.5 active:opacity-80">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F4EFE3]">
                                                    {g.logo ? <img src={g.logo} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <span className="text-[13px] font-semibold text-[#14532D]">{g.name.slice(0, 1)}</span>}
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#F4EFE3]">{g.name}</span>
                                                <span className="shrink-0 text-[13px] tabular-nums text-[#F4EFE399]">{g.km}km</span>
                                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        {around.fishing.length > 0 && (
                            <div className="mt-5" data-testid="festival-around-fishing">
                                <p className="mb-1 text-[13px] font-semibold text-[#8EC5FF]">낚시터</p>
                                <ul className="divide-y divide-[#FFFFFF12]">
                                    {around.fishing.map((p) => (
                                        <li key={p.id}>
                                            <Link href={fishingSpotPath(p.id)} className="flex items-center gap-3 py-2.5 active:opacity-80">
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8EC5FF26]" aria-hidden>
                                                    <svg viewBox="0 0 24 24" className="h-4 w-4"><path d="M3 12c3-4 7-5 11-3l4-3v12l-4-3c-4 2-8 1-11-3Z" fill="#8EC5FF" /></svg>
                                                </span>
                                                <span className="min-w-0 flex-1 truncate text-[14.5px] text-[#F4EFE3]">{p.name}</span>
                                                <span className="shrink-0 text-[13px] tabular-nums text-[#F4EFE399]">{[p.kind, `${p.km}km`].filter(Boolean).join(" · ")}</span>
                                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0 text-[#F4EFE366]" aria-hidden />
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </HkSection>
                )}

                {around.festivals.length > 0 && (
                    <HkSection title="근처 다른 축제" aside="30km 안">
                        <ul className="divide-y divide-[#FFFFFF12]">
                            {around.festivals.map((x) => <FestivalItem key={x.id} f={x} today={today} extra={`${x.km}km`} testId="festival-near-row" />)}
                        </ul>
                    </HkSection>
                )}

                <div className="px-5 pb-6 pt-8">
                    <Link href={FESTIVALS_PATH} className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF0D] text-[14.5px] font-medium text-[#F4EFE3] active:bg-[#FFFFFF17]">전국 축제 지도 · 달력 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden /></Link>
                    <p className="mt-4 text-[12px] leading-relaxed text-[#F4EFE366]">{FESTIVAL_CREDIT}. 날짜 · 시간 · 요금은 바뀔 수 있어요 — 가기 전에 축제 홈페이지를 한 번 더 봐 주세요.</p>
                </div>
            </article>
        </HikingShell>
    );
}
