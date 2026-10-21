/**
 * 축제 한 곳 — /golf/festivals/:id · /hiking/festivals/:id · /fishing/festivals/:id(종목마다) · /festivals/:id(검색용 정본).
 *
 * 위에서부터: 사진(원본 비율 그대로 · 출처) → 알약 · 이름 · 기간(요일) · 지역 → 길찾기 · 전화 · 홈페이지 → 축제 정보(장소 · 시간 · 요금 · 주최)
 * → 어디서(축제 지도를 그 자리로 당겨 — 가는 길에 들를 산 · 골프장 · 낚시터를 같이) → 소개(한국관광공사 글 그대로) → 가는 길에 들를 곳 → 근처 다른 축제.
 * 종목 화면은 그 종목의 색 · 틀이고, '가는 길에 들를 곳'은 그 종목의 것이 먼저(골프 화면이면 골프장 먼저 — theme.aroundOrder).
 * 끝난 축제(올해 날짜가 지났고 다음 해 날짜가 아직 안 나온 것)는 그렇다고 적는다 — 자료가 바뀌면 이 페이지의 날짜가 바뀐다.
 * 로그인 없이 열린다. 정본(canonical)은 /festivals/:id. 사진은 공공누리 제3유형이라 자르지 않는다.
 * ⚠️ 리터럴 색만. 글자는 12px 이상.
 */
import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useSeo } from "@/hooks/useSeo";
import { LucideChevronRight, LucideGlobe, LucideNavigation, LucidePhone, LucideShare2 } from "@/lib/icons";
import { useToast } from "@/hooks/use-toast";
import { festivalCardUrl } from "@shared/ogCards";
import { WX_LABEL, type WxKind } from "@shared/golfWeather";
import { WxIcon, WX_RAIN } from "@/golf/components/course/TeeWx";
import { canOpenInApp, openInAppBrowser } from "@/lib/openOutside";
import { FESTIVAL_CREDIT, FESTIVAL_SOURCE, addDays, weekdayKo, festivalPath, festivalCatName, type FestivalWxDay, festivalPeriod, festivalPhotoCredit, festivalSeo, festivalSportPath, festivalState, type FestivalSport } from "@shared/festivals";
import { hikingMountainPath } from "@shared/hikingMountains";
import { coursePath } from "@shared/golfCourse";
import { fishingSpotPath } from "@shared/fishingPlaces";
import { HkSkel } from "@/hiking/components/HikingShell";
import { LanternMap, type LanternMark } from "../components/LanternMap";
import { FestivalBadge, FestivalItem } from "../components/FestivalBits";
import { FestSection, festSportOfPath, festTheme, type FestLayerKind } from "../theme";
import { FestShell } from "../FestShell";
import { festivalKey, type FestivalAround, type FestivalData } from "../api";

const ORIGIN = "https://www.rankue.co.kr";
const kakaoRoute = (name: string, lat: number, lng: number) => `https://map.kakao.com/link/to/${encodeURIComponent(name)},${lat},${lng}`;
/** 바깥 링크 — 앱에서는 앱 안 브라우저 창으로(닫으면 이 화면) */
const outside = (url: string) => async (e: React.MouseEvent) => { if (canOpenInApp()) { e.preventDefault(); await openInAppBrowser(url); } };
const MARK = { mountain: "#F6D9A8", golf: "#8FD3A7", fishing: "#8EC5FF" } as const;
function savedFestSport(): FestivalSport | null {
    try { const v = localStorage.getItem("rankue_current_sport"); return v === "GOLF" || v === "HIKING" || v === "FISHING" ? v : null; } catch { return null; }
}

function Fact({ k, children, text }: { k: string; children: ReactNode; text: string }) {
    return (
        <div className="flex gap-3 py-2.5">
            <dt className="w-[52px] shrink-0 text-[13px]" style={{ color: `${text}80` }}>{k}</dt>
            <dd className="min-w-0 flex-1 whitespace-pre-line text-[14.5px] leading-relaxed break-keep" style={{ color: text }}>{children}</dd>
        </div>
    );
}

/** 가는 길에 들를 곳의 한 덩이 — 산(사진 카드) · 골프장(로고 줄) · 낚시터(줄) */
function AroundBlock({ kind, around, text, first }: { kind: FestLayerKind; around: FestivalAround; text: string; first: boolean }) {
    const mt = first ? "" : "mt-5";
    if (kind === "mountain" && around.mountains.length) {
        return (
            <div className={mt} data-testid="festival-around-mountains">
                <p className="mb-2 text-[13px] font-semibold" style={{ color: MARK.mountain }}>오를 산</p>
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
                            <span className="mt-1.5 block text-[14.5px] font-semibold" style={{ color: text }}>{m.name}</span>
                            <span className="block text-[12.5px] tabular-nums" style={{ color: `${text}99` }}>{[m.heightM ? `${m.heightM.toLocaleString()}m` : null, `${m.km}km`].filter(Boolean).join(" · ")}</span>
                        </Link>
                    ))}
                </div>
                {around.mountains.some((m) => m.photo) && <p className="mt-1.5 text-[12px]" style={{ color: `${text}66` }}>산 사진 한국관광공사 · 공공누리</p>}
            </div>
        );
    }
    if (kind === "golf" && around.golf.length) {
        return (
            <div className={mt} data-testid="festival-around-golf">
                <p className="mb-1 text-[13px] font-semibold" style={{ color: MARK.golf }}>골프장</p>
                <ul className="divide-y divide-[#FFFFFF12]">
                    {around.golf.map((g) => (
                        <li key={g.slug}>
                            <Link href={coursePath(g.slug)} className="flex items-center gap-3 py-2.5 active:opacity-80">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F4EFE3]">
                                    {g.logo ? <img src={g.logo} alt="" className="h-full w-full object-contain p-1" loading="lazy" /> : <span className="text-[13px] font-semibold text-[#14532D]">{g.name.slice(0, 1)}</span>}
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ color: text }}>{g.name}</span>
                                <span className="shrink-0 text-[13px] tabular-nums" style={{ color: `${text}99` }}>{g.km}km</span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: `${text}66` }} aria-hidden />
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    if (kind === "fishing" && around.fishing.length) {
        return (
            <div className={mt} data-testid="festival-around-fishing">
                <p className="mb-1 text-[13px] font-semibold" style={{ color: MARK.fishing }}>낚시터</p>
                <ul className="divide-y divide-[#FFFFFF12]">
                    {around.fishing.map((p) => (
                        <li key={p.id}>
                            <Link href={fishingSpotPath(p.id)} className="flex items-center gap-3 py-2.5 active:opacity-80">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#8EC5FF26]" aria-hidden>
                                    <svg viewBox="0 0 24 24" className="h-4 w-4"><path d="M3 12c3-4 7-5 11-3l4-3v12l-4-3c-4 2-8 1-11-3Z" fill="#8EC5FF" /></svg>
                                </span>
                                <span className="min-w-0 flex-1 truncate text-[14.5px]" style={{ color: text }}>{p.name}</span>
                                <span className="shrink-0 text-[13px] tabular-nums" style={{ color: `${text}99` }}>{[p.kind, `${p.km}km`].filter(Boolean).join(" · ")}</span>
                                <LucideChevronRight weight="bold" className="h-4 w-4 shrink-0" style={{ color: `${text}66` }} aria-hidden />
                            </Link>
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
    return null;
}

export default function FestivalPage() {
    const [location, setLocation] = useLocation();
    const sport = festSportOfPath(location);
    const t = festTheme(sport);
    const [, a] = useRoute("/festivals/:id");
    const [, b] = useRoute("/:sport/festivals/:id");
    const id = a?.id ?? b?.id ?? "";
    // 검색용 정본(/festivals/:id)을 앱 안에서 열면 고른 종목의 화면으로(주소만 바꾼다)
    useEffect(() => {
        if (sport || !id) return;
        const saved = savedFestSport();
        if (saved) setLocation(festivalSportPath(saved, id), { replace: true });
    }, [sport, id, setLocation]);

    const { data, isLoading, isError } = useQuery<FestivalData>({ queryKey: festivalKey(id), enabled: !!id, staleTime: 10 * 60_000, retry: 1 });
    const [open, setOpen] = useState(false);
    const f = data?.festival, around = data?.around, today = data?.today ?? "";
    // 축제 날 날씨 — 열려 있거나 열하루 안에 여는 축제만 부른다(서버도 같은 판단)
    const wxOn = !!f && !!today && f.end >= today && f.start <= addDays(today, 10);
    const wxQ = useQuery<{ days: FestivalWxDay[]; area: string | null }>({ queryKey: [`/api/hiq/festivals/${encodeURIComponent(id)}/weather`], enabled: wxOn, staleTime: 10 * 60_000, retry: 0 });
    const wxDays = wxOn && Array.isArray(wxQ.data?.days) ? wxQ.data!.days : [];
    const seo = f && around ? festivalSeo(f, { mountains: around.mountains.length, golf: around.golf.length, fishing: around.fishing.length }) : null;
    useSeo(seo && f ? { title: seo.title, description: seo.desc, path: seo.path, image: festivalCardUrl(ORIGIN, f.id) } : null);
    const { toast } = useToast();
    // 공유 — 정본 주소(/festivals/:id)로. 받은 사람은 그 사람의 종목 화면으로 열린다(앱에서 연 경우)
    const share = async () => {
        if (!f) return;
        const url = ORIGIN + festivalPath(f.id);
        try { if (navigator.share) { await navigator.share({ title: `${f.title} | 랭큐 전국 축제`, url }); return; } }
        catch (e: any) { if (e?.name === "AbortError") return; }
        try { await navigator.clipboard.writeText(url); toast({ title: "주소를 복사했어요" }); }
        catch { toast({ title: url }); }
    };
    const shareBtn = f ? (
        <button type="button" onClick={share} aria-label="공유" className="flex h-10 w-10 items-center justify-center rounded-full active:bg-[#FFFFFF14]" style={{ color: t.text }} data-testid="festival-share">
            <LucideShare2 className="h-[21px] w-[21px]" />
        </button>
    ) : null;

    if (isLoading || (!data && !isError)) {
        return <FestShell sport={sport} title="축제" back={t.base}><div className="space-y-4 px-5 pt-5" aria-busy="true"><HkSkel className="h-[240px]" /><HkSkel className="h-24" /><HkSkel className="h-40" /></div></FestShell>;
    }
    if (!f || !around) {
        return (
            <FestShell sport={sport} title="축제" back={t.base}>
                <div className="px-5 pt-16 text-center">
                    <p className="text-[17px] font-semibold" style={{ color: t.text }}>없는 축제예요</p>
                    <p className="mt-1.5 text-[14px]" style={{ color: `${t.text}99` }}>자료에서 빠졌거나 주소가 바뀌었어요.</p>
                    <Link href={t.base} className="mt-5 inline-flex h-11 items-center rounded-xl px-5 text-[15px] font-semibold" style={{ background: t.accent, color: t.onAccent }}>전국 축제 보기</Link>
                </div>
            </FestShell>
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
    const blocks = t.aroundOrder.filter((k) => (k === "mountain" ? around.mountains.length : k === "golf" ? around.golf.length : around.fishing.length) > 0);
    const btn2 = { background: "#FFFFFF1F", color: t.text };

    return (
        <FestShell sport={sport} title={f.title} back={t.base} right={shareBtn}>
            <article data-testid="festival-page" data-festival-sport={sport ?? "NONE"}>
                {f.image && (
                    <figure className="px-5 pt-4">
                        <img src={f.image} alt={`${f.title} 사진`} className="block h-auto w-full rounded-2xl" style={{ background: "#FFFFFF0A" }} loading="eager" decoding="async" referrerPolicy="no-referrer" />
                        <figcaption className="mt-1.5 text-right text-[12px]" style={{ color: `${t.text}66` }}>{festivalPhotoCredit(f.lic)}</figcaption>
                    </figure>
                )}

                <header className="px-5 pt-4">
                    <div className="flex flex-wrap items-center gap-1.5">
                        <FestivalBadge f={f} today={today} />
                        {festivalCatName(f.cat) && <span className="text-[12.5px]" style={{ color: `${t.text}99` }}>{festivalCatName(f.cat)}</span>}
                    </div>
                    <h1 className="mt-2 text-[25px] font-semibold leading-tight tracking-tight break-keep" style={{ color: t.text }}>{f.title}</h1>
                    <p className="mt-1.5 text-[15.5px] tabular-nums" style={{ color: t.soon }}>{festivalPeriod(f, true)}</p>
                    <p className="mt-0.5 text-[14px] break-keep" style={{ color: `${t.text}B3` }}>{[f.region, f.place].filter(Boolean).join(" · ")}</p>
                    {st.state === "ended" && (
                        <p className="mt-3 rounded-xl bg-[#FFFFFF0D] px-3.5 py-2.5 text-[13.5px] leading-relaxed break-keep" style={{ color: `${t.text}CC` }}>올해 축제는 끝났어요. 다음 날짜가 나오면 이 페이지의 날짜가 바뀌어요.</p>
                    )}
                    <div className="mt-4 flex gap-2">
                        <a href={kakaoRoute(f.place ?? f.title, f.lat, f.lng)} target="_blank" rel="noopener noreferrer" onClick={outside(kakaoRoute(f.place ?? f.title, f.lat, f.lng))}
                            className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-semibold active:opacity-90" style={{ background: t.accent, color: t.onAccent }} data-testid="festival-route">
                            <LucideNavigation weight="bold" className="h-4 w-4" aria-hidden />길찾기
                        </a>
                        {tel && (
                            <a href={`tel:${tel}`} className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-medium active:opacity-80" style={btn2} data-testid="festival-tel">
                                <LucidePhone weight="bold" className="h-4 w-4" aria-hidden />전화
                            </a>
                        )}
                        {f.homepage && (
                            <a href={f.homepage} target="_blank" rel="noopener noreferrer" onClick={outside(f.homepage)}
                                className="flex h-12 flex-1 items-center justify-center gap-1.5 rounded-xl text-[15px] font-medium active:opacity-80" style={btn2} data-testid="festival-homepage">
                                <LucideGlobe weight="bold" className="h-4 w-4" aria-hidden />홈페이지
                            </a>
                        )}
                    </div>
                </header>

                {wxDays.length > 0 && (
                    <FestSection title="축제 날 날씨" aside={wxQ.data?.area ? `기상청 · ${wxQ.data.area}` : "기상청 예보"} testId="festival-weather">
                        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {wxDays.map((d) => {
                                const ymd = d.date.replace(/-/g, ""), wd = weekdayKo(ymd), weekend = wd === "토" || wd === "일";
                                return (
                                    <div key={d.date} className="w-[74px] shrink-0 rounded-2xl px-1.5 py-3 text-center" style={{ background: weekend ? `${t.accent}1F` : "#FFFFFF0A", boxShadow: ymd === today ? `inset 0 0 0 1.5px ${t.accent}` : undefined }}>
                                        <div className="text-[12.5px] font-medium" style={{ color: weekend ? t.soon : `${t.text}B3` }}>{ymd === today ? "오늘" : `${wd} ${Number(ymd.slice(6, 8))}일`}</div>
                                        <WxIcon kind={d.kind as WxKind} className="mx-auto mt-2 h-7 w-7" />
                                        <div className="mt-1.5 text-[12.5px]" style={{ color: `${t.text}CC` }}>{WX_LABEL[d.kind as WxKind] ?? ""}</div>
                                        {d.tmx != null && <div className="mt-1 text-[14px] font-semibold tabular-nums" style={{ color: t.text }}>{Math.round(d.tmx)}°<span className="ml-1 text-[12.5px] font-normal" style={{ color: `${t.text}80` }}>{d.tmn != null ? `${Math.round(d.tmn)}°` : ""}</span></div>}
                                        {d.pop != null && d.pop >= 30 && <div className="mt-0.5 text-[12px] font-medium tabular-nums" style={{ color: WX_RAIN }}>비 {d.pop}%</div>}
                                    </div>
                                );
                            })}
                        </div>
                        <p className="mt-2 text-[12px]" style={{ color: `${t.text}66` }}>앞 사흘은 축제 자리의 예보, 그 뒤는 넓은 지역 예보예요{f.end > wxDays[wxDays.length - 1].date.replace(/-/g, "") ? " · 남은 날은 예보가 나오면 채워져요" : ""}</p>
                    </FestSection>
                )}

                <FestSection title="축제 정보">
                    <dl className="divide-y divide-[#FFFFFF12] rounded-2xl bg-[#FFFFFF08] px-4" style={{ boxShadow: "inset 0 0 0 1px #FFFFFF12" }} data-testid="festival-facts">
                        <Fact k="기간" text={t.text}>{festivalPeriod(f, true)}</Fact>
                        {f.place && <Fact k="장소" text={t.text}>{f.place}</Fact>}
                        {f.addr && <Fact k="주소" text={t.text}>{f.addr}</Fact>}
                        {f.playtime && <Fact k="시간" text={t.text}>{f.playtime}</Fact>}
                        {f.fee && <Fact k="요금" text={t.text}>{f.fee}</Fact>}
                        {f.host && <Fact k="주최" text={t.text}>{f.host}</Fact>}
                        {tel && <Fact k="문의" text={t.text}><a href={`tel:${tel}`} className="tabular-nums underline-offset-2 active:underline" style={{ color: t.soon }}>{tel}</a></Fact>}
                    </dl>
                </FestSection>

                <FestSection title="어디서" aside={f.region ?? undefined}>
                    <LanternMap items={[f, ...around.festivals]} today={today} focus={{ lat: f.lat, lng: f.lng }} marks={marks} label={`${f.title} 자리`} />
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[12.5px]" style={{ color: `${t.text}80` }}>
                        <span>밝은 등불 이 축제 · 옅은 등불 근처 축제</span>
                        {around.mountains.length > 0 && <span style={{ color: MARK.mountain }}>▲ 산</span>}
                        {around.golf.length > 0 && <span style={{ color: MARK.golf }}>■ 골프장</span>}
                        {around.fishing.length > 0 && <span style={{ color: MARK.fishing }}>◆ 낚시터</span>}
                    </p>
                </FestSection>

                {f.overview && (
                    <FestSection title="소개" aside={`글 ${FESTIVAL_SOURCE}`}>
                        <p className={`whitespace-pre-line text-[15px] leading-[1.75] break-keep ${open ? "" : "line-clamp-6"}`} style={{ color: `${t.text}E6` }} data-testid="festival-overview">{f.overview}</p>
                        {f.overview.length > 180 && (
                            <button type="button" onClick={() => setOpen((v) => !v)} className="mt-2 h-10 rounded-xl px-1 text-[14px] font-medium active:opacity-70" style={{ color: t.soon }}>{open ? "접기" : "더 읽기"}</button>
                        )}
                    </FestSection>
                )}

                {blocks.length > 0 && (
                    <FestSection title="가는 길에 들를 곳" aside="축제 자리에서 잰 거리">
                        {blocks.map((k, i) => <AroundBlock key={k} kind={k} around={around} text={t.text} first={i === 0} />)}
                    </FestSection>
                )}

                {around.festivals.length > 0 && (
                    <FestSection title="근처 다른 축제" aside="30km 안">
                        <ul className="divide-y divide-[#FFFFFF12]">
                            {around.festivals.map((x) => <FestivalItem key={x.id} f={x} today={today} extra={`${x.km}km`} testId="festival-near-row" />)}
                        </ul>
                    </FestSection>
                )}

                <div className="px-5 pb-6 pt-8">
                    <Link href={t.base} className="flex h-12 items-center justify-center gap-1 rounded-xl bg-[#FFFFFF0D] text-[14.5px] font-medium active:bg-[#FFFFFF17]" style={{ color: t.text }}>전국 축제 지도 · 달력 보기<LucideChevronRight weight="bold" className="h-4 w-4" aria-hidden /></Link>
                    <p className="mt-4 text-[12px] leading-relaxed" style={{ color: `${t.text}66` }}>{FESTIVAL_CREDIT}. 날짜 · 시간 · 요금은 바뀔 수 있어요 — 가기 전에 축제 홈페이지를 한 번 더 봐 주세요.</p>
                </div>
            </article>
        </FestShell>
    );
}
