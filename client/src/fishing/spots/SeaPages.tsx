/**
 * 바다 · 항구 물때 공개 화면(2026-10-18 — 누구나, 로그인 없이). 글은 shared/fishingSeaPages(검색용 화면과 같은 말).
 *
 *   SeaHub     /fishing/sea — 판화 해도(해역 일곱 곳의 특보 물감 · 항구 점, 누르면 그 해역) · 해역 카드 · 항구 51곳
 *   SeaArea    /fishing/sea/<해역> — 표지 · 지금 특보 · 반나절 해상예보 · 그 해역의 항구 · 바다 낚시터
 *   PortPage   /fishing/port/<항구> — 날짜 칩 · 물때 곡선(만조 · 간조 · 해 뜨고 짐) · 지금 들물/날물 · 수온 · 부이 · 바다낚시지수 · 가까운 바다 낚시터
 *
 * 값은 받은 그대로(기상청 · 국립해양조사원 · 천문연구원). '나가도 된다'고 말하지 않는다. ⚠️ 리터럴 색만. 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { useSeo } from "@/hooks/useSeo";
import { apiRequest } from "@/lib/queryClient";
import { FISHING_COLORS as C, fishingDayLabel } from "@shared/fishing";
import { SEA_AREAS, SEA_CAUTION, SEA_SOURCE, seaHeadline, seaNotes, type SeaArea, type SeaNow, type SeaState } from "@shared/fishingSea";
import { FISHING_PORTS } from "@shared/fishingStations";
import { SEA_FCST_SOURCE, waveText, windText, type SeaFcst } from "@shared/fishingSeaFcst";
import { durationKo, hhmm, indexOutlook, rangeText, tideFlowAt, tideRange, windDirKo, type PortBrief } from "@shared/fishingPort";
import { tideAddDays, tideOf, TIDE_PHASE_TEXT, TIDE_SEAS, type TideSea } from "@shared/fishingTide";
import { nearestPort, type PublicPlace } from "@shared/fishingPlaces";
import { FISHING_SEA_LABEL, FISHING_SEA_PATH, fishingPortPath, fishingSeaAreaPath, portByName, portSeo, portsOf, seaArt, seaAreaById, seaAreaSeo, seaHubSeo } from "@shared/fishingSeaPages";
import { SeaChart, SEA_LEGEND, seaWashColor, seaWashLine } from "../SeaChart";
import { fishingSeaCardUrl } from "@shared/ogCards";
import { josa } from "@shared/briefingMeta";
import { TideCurve } from "../TideCurve";
import { PAPER } from "../ink";
import { Row, Shell, useSpots } from "./SpotsPages";

const TONE: Readonly<Record<SeaState, { dot: string; text: string }>> = {
    clear: { dot: "#8FB3C2", text: "#F3ECDDB3" }, pre: { dot: "#F8DDB0", text: "#F8DDB0" }, far: { dot: "#F8DDB0", text: "#F8DDB0" }, warn: { dot: "#EE7B5B", text: "#F7B9A6" }, alert: { dot: "#E0533B", text: "#F7B9A6" },
};
/** 해역 카드의 짧은 한 줄 — 카드 폭(약 150px)에 들어가게 */
const seaShort = (a: SeaArea): string => (a.near ? `앞바다 ${a.near.kind}${a.near.level}` : a.far ? `먼바다만 ${a.far.kind}${a.far.level}` : a.pre ? `${a.pre.kind} 예비특보` : "지금 특보 없음");
const ORIGIN = "https://www.rankue.co.kr";
const useSea = () => useQuery<SeaNow | null>({ queryKey: ["/api/hiq/fishing/sea"], staleTime: 5 * 60_000 });
const kstMinuteNow = () => Math.floor(((Date.now() + 9 * 3600_000) % 86_400_000) / 60_000);
const kstToday = () => new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);

function Cover({ src, kicker, title, sub }: { src: string; kicker?: string; title: string; sub?: string }) {
    return (
        <div className="relative h-[190px] overflow-hidden" data-testid="sea-cover">
            <img src={src} alt="" width={640} height={640} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 55%" }} draggable={false} decoding="async" />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D10 0%,#0B1E2D55 50%,#0B1E2D 100%)" }} aria-hidden />
            <div className="absolute inset-x-5 bottom-4">
                {kicker && <p className="text-[13px]" style={{ color: "#F3ECDDCC" }}>{kicker}</p>}
                <h1 className="mt-0.5 text-[26px] font-semibold leading-tight tracking-tight">{title}</h1>
                {sub && <p className="mt-0.5 text-[13px]" style={{ color: "#F3ECDDCC" }}>{sub}</p>}
            </div>
        </div>
    );
}

/**
 * 물때 달력(2026-10-18) — 이번 주 일요일부터 다섯 주. 칸마다 날짜 · 물때 이름 · 물의 세기 띠, 사리는 파랗게 · 조금은 옅게 · 오늘은 테두리.
 * 물때는 음력 날짜로 센다(shared/fishingTide — 기기 달력에 한국 달력이 없으면 그리지 않는다). 바깥 자료가 필요 없다.
 */
export function TideCalendar({ sea: fixed }: { sea?: TideSea }) {
    const [pick, setPick] = useState<TideSea>(fixed ?? "west");
    const sea = fixed ?? pick;
    const today = kstToday();
    const start = tideAddDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay());
    const days = useMemo(() => Array.from({ length: 35 }, (_, i) => tideAddDays(start, i)).map((d) => ({ d, t: tideOf(d, sea) })), [start, sea]);
    if (!days.some((x) => x.t)) return null;
    return (
        <div data-testid="tide-calendar">
            {!fixed && (
                <div className="mb-2.5 flex gap-1.5" role="group" aria-label="바다">
                    {TIDE_SEAS.map((x) => <button key={x.id} type="button" aria-pressed={pick === x.id} onClick={() => setPick(x.id)} className="h-9 rounded-full px-3.5 text-[13px]" style={pick === x.id ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>{x.name} <span className="opacity-70">{x.note}</span></button>)}
                </div>
            )}
            <div className="overflow-hidden rounded-2xl p-2" style={{ background: PAPER, color: "#0F2838", boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                <div className="grid grid-cols-7 pb-1 text-center text-[12px]" style={{ color: "#0F283899" }}>{["일", "월", "화", "수", "목", "금", "토"].map((w) => <span key={w}>{w}</span>)}</div>
                <div className="grid grid-cols-7 gap-1">
                    {days.map(({ d, t }) => {
                        const past = d < today, isToday = d === today, first = d.endsWith("-01") || d === start;
                        const spring = t?.mark === "사리", neap = t?.mark === "조금";
                        return (
                            <div key={d} className="flex h-[58px] flex-col items-center justify-center rounded-lg" style={{ background: spring ? "#3F86A833" : neap ? "#0F28380D" : "#FFFFFF66", opacity: past ? 0.42 : 1, boxShadow: isToday ? "inset 0 0 0 2px #C8372D" : undefined }} aria-current={isToday ? "date" : undefined} data-tide={t?.name}>
                                <span className="text-[12px] tabular-nums" style={{ color: "#0F283899" }}>{first ? `${Number(d.slice(5, 7))}/${Number(d.slice(8))}` : Number(d.slice(8))}</span>
                                <span className="text-[13px] font-semibold leading-tight">{t?.name ?? ""}</span>
                                {t && <i aria-hidden className="mt-1 h-[3px] rounded-full" style={{ width: `${Math.round(6 + t.flow * 22)}px`, background: spring ? "#1F5A78" : "#0F283855" }} />}
                            </div>
                        );
                    })}
                </div>
            </div>
            <p className="mt-2 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>물때는 음력 날짜로 센 것이에요. 띠가 길수록 물이 세게 가요 — 파란 칸이 사리, 옅은 칸이 조금이에요. {sea === "west" ? "서해는 7물때로 불러요." : "남해 · 동해 · 제주는 8물때로 불러요."}</p>
        </div>
    );
}

export function SeaHub() {
    const [, setLocation] = useLocation();
    const { data } = useSea();
    const seo = seaHubSeo();
    useSeo({ title: seo.title, description: seo.description, path: FISHING_SEA_PATH, locale: "ko", image: fishingSeaCardUrl(ORIGIN, "all") });
    const by = new Map((data?.areas ?? []).map((a) => [a.id, a]));
    return (
        <Shell title={FISHING_SEA_LABEL}>
            <Cover src="/fishing/art/hero.webp" title={seo.h1} sub={`해역 일곱 곳 · 항구 ${FISHING_PORTS.length}곳 · ${SEA_SOURCE}`} />
            {data?.areas?.length ? (
                <section className="px-5 pt-5" data-testid="sea-hub-map">
                    <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                        <SeaChart areas={data.areas} picked={null} onPick={(id) => setLocation(fishingSeaAreaPath(id))} ports={FISHING_PORTS} port={null} />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3.5 py-2.5" style={{ borderColor: "#0F28381F" }}>
                            {SEA_LEGEND.map((l) => <span key={l.state} className="flex items-center gap-1.5 text-[12px]" style={{ color: "#0F2838B3" }}><i aria-hidden className="h-3 w-3 rounded-[4px]" style={{ background: seaWashColor(l.state), boxShadow: `inset 0 0 0 1px ${seaWashLine(l.state)}` }} />{l.text}</span>)}
                        </div>
                    </div>
                    <p className="mt-2 text-[12px]" style={{ color: C.dim }}>바다를 누르면 그 바다의 예보와 항구가 열려요. 점은 항구(조위 관측소)예요.{data.issued ? ` · ${data.issued} 발표` : ""}</p>
                </section>
            ) : null}
            <section className="px-5 pt-6">
                <h2 className="mb-2.5 text-[17px] font-semibold">해역</h2>
                <div className="grid grid-cols-2 gap-2.5">
                    {SEA_AREAS.map((a) => {
                        const s = by.get(a.id);
                        return (
                            <Link key={a.id} href={fishingSeaAreaPath(a.id)} className="relative block h-[118px] overflow-hidden rounded-2xl active:opacity-85" data-testid="sea-area-card">
                                <img src={seaArt(a.id)} alt="" width={640} height={640} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-70" draggable={false} />
                                <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D00 10%,#0B1E2DE6 100%)" }} aria-hidden />
                                <span className="absolute inset-x-3 bottom-2.5">
                                    <span className="flex items-center gap-1.5 text-[15.5px] font-semibold"><i aria-hidden className="h-2 w-2 rounded-full" style={{ background: s ? TONE[s.state].dot : "#8FB3C2" }} />{a.name}</span>
                                    <span className="mt-0.5 block truncate text-[12px]" style={{ color: s ? TONE[s.state].text : C.dim }}>{s ? seaShort(s) : a.hint}</span>
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </section>
            <section className="px-5 pt-6" data-testid="sea-tide-calendar">
                <h2 className="mb-2.5 text-[17px] font-semibold">물때 달력</h2>
                <TideCalendar />
            </section>
            <section className="px-5 pt-6" data-testid="sea-ports">
                <h2 className="mb-2.5 text-[17px] font-semibold">항구 물때표</h2>
                {SEA_AREAS.map((a) => (
                    <div key={a.id} className="mb-3">
                        <p className="mb-1.5 text-[13px]" style={{ color: C.dim }}>{a.name}</p>
                        <div className="flex flex-wrap gap-1.5">{portsOf(a.id).map((p) => <Link key={p.code} href={fishingPortPath(p.name)} className="flex h-9 items-center rounded-full px-3 text-[13px]" style={{ background: p.main ? "#FFFFFF1A" : "#FFFFFF0D", color: C.foam }}>{p.name}</Link>)}</div>
                    </div>
                ))}
                <p className="mt-3 text-[12px] [word-break:keep-all]" style={{ color: C.dim }}>{SEA_CAUTION}</p>
            </section>
        </Shell>
    );
}

export function SeaAreaPage({ id }: { id: string }) {
    const [, setLocation] = useLocation();
    const a = seaAreaById(id);
    const { data } = useSea();
    const { data: fc } = useQuery<SeaFcst | null>({ queryKey: ["/api/hiq/fishing/sea/forecast", id], enabled: !!a, staleTime: 10 * 60_000 });
    const { data: spots } = useSpots();
    const seo = a ? seaAreaSeo(a) : null;
    useSeo(seo ? { title: seo.title, description: seo.description, path: fishingSeaAreaPath(id), locale: "ko", image: fishingSeaCardUrl(ORIGIN, id) } : null);
    const seaSpots = useMemo(() => (spots?.items ?? []).filter((p) => p.kind === "바다" && nearestPort(FISHING_PORTS, p as PublicPlace)?.area === id), [spots, id]);
    if (!a || !seo) return <Shell title="바다"><p className="px-5 py-16 text-center text-[15px]" style={{ color: C.soft }}>없는 바다예요.</p></Shell>;
    const s = data?.areas.find((x) => x.id === id) ?? null;
    const slots = Array.isArray(fc?.slots) ? fc!.slots.slice(0, 6) : [];
    return (
        <Shell title={a.name}>
            <Cover src={seaArt(id)} kicker={a.hint} title={seo.h1} />
            {s && (
                <section className="px-5 pt-5" data-testid="sea-area-now">
                    <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                        <p className="text-[12px]" style={{ color: C.dim }}>지금 특보 · {SEA_SOURCE}{data?.issued ? ` ${data.issued} 발표` : ""}</p>
                        <p className="mt-0.5 text-[17px] font-semibold" style={{ color: TONE[s.state].text }}>{seaHeadline(s)}</p>
                        {seaNotes(s).map((n) => <p key={n} className="mt-0.5 text-[13px] [word-break:keep-all]" style={{ color: C.soft }}>{n}</p>)}
                    </div>
                </section>
            )}
            {data?.areas?.length ? (
                <section className="px-5 pt-4" data-testid="sea-area-map">
                    <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                        <SeaChart areas={data.areas} picked={id} onPick={(x) => { if (x !== id) setLocation(fishingSeaAreaPath(x)); }} ports={portsOf(id)} port={null} />
                    </div>
                    <p className="mt-2 text-[12px]" style={{ color: C.dim }}>점은 {a.name}의 항구예요. 다른 바다를 누르면 그 바다로 가요.</p>
                </section>
            ) : null}
            {slots.length > 0 && (
                <section className="px-5 pt-6" data-testid="sea-area-forecast">
                    <h2 className="mb-2.5 text-[17px] font-semibold">반나절 해상예보 <span className="text-[13px] font-normal" style={{ color: C.dim }}>{SEA_FCST_SOURCE}{fc?.issued ? ` ${fc.issued} 발표` : ""}</span></h2>
                    <ul className="divide-y divide-[#FFFFFF14] rounded-2xl px-3.5" style={{ background: "#FFFFFF0A" }}>
                        {slots.map((x) => (
                            <li key={x.key} className="flex items-center gap-3 py-2.5">
                                <span className="w-[72px] shrink-0 text-[13.5px] font-semibold">{x.label}</span>
                                <span className="min-w-0 flex-1 text-[13px]" style={{ color: C.soft }}><span className="block">물결 <span className="font-semibold tabular-nums" style={{ color: C.foam }}>{waveText(x)}</span></span><span className="block">{windText(x)}</span></span>
                                <span className="shrink-0 text-right text-[12.5px]" style={{ color: x.rain ? "#8EC5FF" : C.dim }}>{x.wf}</span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            <section className="px-5 pt-6">
                <h2 className="mb-2.5 text-[17px] font-semibold">{TIDE_SEAS.find((x) => x.id === a.tide)?.name} 물때 달력</h2>
                <TideCalendar sea={a.tide} />
            </section>
            <section className="px-5 pt-6">
                <h2 className="mb-2.5 text-[17px] font-semibold">{a.name} 항구 물때표</h2>
                <div className="flex flex-wrap gap-1.5">{portsOf(id).map((p) => <Link key={p.code} href={fishingPortPath(p.name)} className="flex h-10 items-center rounded-full px-3.5 text-[14px]" style={{ background: "#FFFFFF14", color: C.foam }} data-testid="sea-area-port">{p.name}</Link>)}</div>
            </section>
            {seaSpots.length > 0 && (
                <section className="px-5 pt-6" data-testid="sea-area-spots">
                    <h2 className="mb-1 text-[17px] font-semibold">{a.name}의 바다 낚시터 <span className="text-[13px] font-normal tabular-nums" style={{ color: C.dim }}>{seaSpots.length}곳</span></h2>
                    <ul className="divide-y divide-[#FFFFFF14]">{seaSpots.slice(0, 12).map((p) => <li key={p.id}><Row p={p} /></li>)}</ul>
                </section>
            )}
            <p className="px-5 pt-4 text-[12px] [word-break:keep-all]" style={{ color: C.dim }}>{SEA_CAUTION}</p>
            <div className="px-5 pt-3"><Link href={FISHING_SEA_PATH} className="flex h-11 items-center justify-center rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>전국 바다 보기</Link></div>
        </Shell>
    );
}

/** 날짜 칩 — 날짜 밑에 그날의 물때 이름과 물의 세기(띠 길이). 물때 이름은 음력으로 센다(shared/fishingTide) */
function DayChip({ day, label, sea, on, onPick }: { day: string; label: string; sea: TideSea; on: boolean; onPick: () => void }) {
    const t = tideOf(day, sea);
    return (
        <button type="button" aria-pressed={on} onClick={onPick} className="flex h-[58px] w-[62px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-2xl" style={on ? { background: C.brand, color: C.onBrand } : { background: "#FFFFFF0F", color: C.soft }}>
            <span className="text-[13px] font-semibold tabular-nums">{label}</span>
            {t && <span className="text-[12px]" style={{ color: on ? C.onBrand : C.dim }}>{t.name}</span>}
            {t && <i aria-hidden className="h-[3px] rounded-full" style={{ width: `${Math.round(8 + t.flow * 26)}px`, background: on ? C.onBrand : t.mark === "사리" ? "#8EC5FF" : "#FFFFFF40" }} />}
        </button>
    );
}

export function PortPage({ name }: { name: string }) {
    const port = portByName(name);
    const today = kstToday();
    const [day, setDay] = useState(today);
    const { data, isLoading } = useQuery<PortBrief | null>({ queryKey: ["/api/hiq/fishing/ports", port?.code ?? "none", day], queryFn: () => apiRequest(`/api/hiq/fishing/ports/${port!.code}?day=${day}`), enabled: !!port, staleTime: 5 * 60_000 });
    const { data: spots } = useSpots();
    const { data: sea } = useSea();
    const [, setLocation] = useLocation();
    const seo = port ? portSeo(port) : null;
    useSeo(seo && port ? { title: seo.title, description: seo.description, path: fishingPortPath(port.name), locale: "ko", image: fishingSeaCardUrl(ORIGIN, port.name) } : null);
    const near = useMemo(() => (port ? (spots?.items ?? []).filter((p) => p.kind === "바다" && nearestPort(FISHING_PORTS, p as PublicPlace)?.code === port.code) : []), [spots, port]);
    if (!port || !seo) return <Shell title="물때"><p className="px-5 py-16 text-center text-[15px]" style={{ color: C.soft }}>없는 항구예요.</p></Shell>;
    const area = seaAreaById(port.area);
    const turns = data?.turns ?? [];
    const isToday = day === today;
    const nowMin = isToday ? kstMinuteNow() : null;
    const flow = nowMin != null ? tideFlowAt(turns, nowMin) : null;
    const tide = tideOf(day, area?.tide ?? "south");
    const range = tideRange(turns);
    const out = data?.index ? indexOutlook(data.index.rows) : null;
    const others = portsOf(port.area).filter((p) => p.code !== port.code);
    return (
        <Shell title={`${port.name} 물때`}>
            <Cover src={seaArt(port.area)} kicker={area ? `${area.name} · ${area.hint}` : undefined} title={seo.h1} sub={tide ? `${isToday ? "오늘" : fishingDayLabel(day, today)} ${tide.name} · ${TIDE_PHASE_TEXT[tide.phase]}` : undefined} />
            {/* 날짜 */}
            {(data?.days?.length ?? 0) > 1 && (
                <div className="-mx-0 flex gap-1.5 overflow-x-auto px-5 pt-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label="날짜">
                    {data!.days.slice(0, 10).map((d, i) => <DayChip key={d} day={d} label={i === 0 ? "오늘" : i === 1 ? "내일" : `${Number(d.slice(5, 7))}/${Number(d.slice(8))}`} sea={area?.tide ?? "south"} on={d === day} onPick={() => setDay(d)} />)}
                </div>
            )}
            <section className="px-5 pt-4" data-testid="port-tide">
                {isLoading && !data ? <div className="h-[260px] animate-pulse rounded-2xl bg-[#FFFFFF0F]" aria-busy="true" />
                    : !data ? <p className="rounded-2xl bg-[#FFFFFF0A] px-5 py-7 text-center text-[13.5px]" style={{ color: C.soft }}>지금은 받아 오지 못했어요. 잠시 뒤에 다시 열어 주세요.</p>
                        : (
                            <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                                <TideCurve points={data.points.map(([min, cm]) => ({ min, cm }))} turns={turns} nowMin={nowMin} sun={data.sun?.rise != null && data.sun.set != null ? { rise: data.sun.rise, set: data.sun.set } : null} />
                                <div className="border-t px-3.5 py-2.5" style={{ borderColor: "#0F28381F", color: "#0F2838" }}>
                                    <p className="flex flex-wrap gap-1.5">{turns.map((t) => <span key={`${t.kind}${t.min}`} className="rounded-full px-2.5 py-1 text-[13px] font-semibold tabular-nums" style={{ background: t.kind === "high" ? "#3F86A833" : "#0F283812" }}>{t.kind === "high" ? "만조" : "간조"} {hhmm(t.min)} · {t.cm}cm</span>)}</p>
                                    {flow && <p className="mt-1.5 text-[13.5px]">지금은 <span className="font-semibold">{flow.flow}</span> — {flow.next.kind === "high" ? "만조" : "간조"}({hhmm(flow.next.min)})까지 <span className="font-semibold tabular-nums">{durationKo(flow.inMin)}</span></p>}
                                    {range != null && <p className="mt-0.5 text-[12.5px]" style={{ color: "#0F283899" }}>물높이 차 {range}cm{data.sun?.rise != null && data.sun.set != null ? ` · 해 뜸 ${hhmm(data.sun.rise)} · 해 짐 ${hhmm(data.sun.set)}` : ""}</p>}
                                </div>
                            </div>
                        )}
            </section>
            {/* 지금 바다 · 낚시지수 */}
            {data && (isToday && data.now || out) && (
                <section className="grid grid-cols-2 gap-2 px-5 pt-3" data-testid="port-now">
                    {isToday && data.now?.wtemp != null && <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D" }}><p className="text-[12px]" style={{ color: C.dim }}>지금 수온</p><p className="text-[16px] font-semibold tabular-nums">{data.now.wtemp.toFixed(1)}°</p></div>}
                    {isToday && data.now?.buoy?.wave != null && <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D" }}><p className="text-[12px]" style={{ color: C.dim }}>지금 파고 · {data.now.buoy.name}</p><p className="text-[16px] font-semibold tabular-nums">{data.now.buoy.wave.toFixed(1)}m{data.now.buoy.wind != null ? ` · ${[windDirKo(data.now.buoy.windDir), `${data.now.buoy.wind.toFixed(1)}m/s`].filter(Boolean).join(" ")}` : ""}</p></div>}
                    {out?.wave && <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D" }}><p className="text-[12px]" style={{ color: C.dim }}>파고 예보 · {data.index!.point}</p><p className="text-[16px] font-semibold tabular-nums">{rangeText(out.wave)}m</p></div>}
                    {out?.wind && <div className="rounded-2xl px-3.5 py-3" style={{ background: "#FFFFFF0D" }}><p className="text-[12px]" style={{ color: C.dim }}>바람 예보</p><p className="text-[16px] font-semibold tabular-nums">{rangeText(out.wind)}m/s</p></div>}
                </section>
            )}
            {data?.index && data.index.rows.length > 0 && (
                <section className="px-5 pt-6" data-testid="port-index">
                    <h2 className="mb-2.5 text-[17px] font-semibold">바다낚시지수 <span className="text-[13px] font-normal" style={{ color: C.dim }}>{data.index.point}({data.index.km}km) · 국립해양조사원</span></h2>
                    <div className="flex flex-wrap gap-1.5">{[...new Set(data.index.rows.map((r) => r.fish))].slice(0, 8).map((f) => { const am = data.index!.rows.find((r) => r.fish === f && r.part === "오전")?.index, pm = data.index!.rows.find((r) => r.fish === f && r.part === "오후")?.index; return <span key={f} className="rounded-full px-3 py-1.5 text-[13px]" style={{ background: "#FFFFFF0F" }}>{f === "기타어종" ? "그 밖의 어종" : f} <span className="tabular-nums" style={{ color: C.soft }}>{[am, pm].filter(Boolean).join(" → ")}</span></span>; })}</div>
                </section>
            )}
            <section className="px-5 pt-6">
                <h2 className="mb-2.5 text-[17px] font-semibold">{TIDE_SEAS.find((x) => x.id === (area?.tide ?? "south"))?.name} 물때 달력</h2>
                <TideCalendar sea={area?.tide ?? "south"} />
            </section>
            {/* 이 항구는 여기 — 그 바다의 특보 물감 위에 같은 바다의 항구 점, 이 항구는 이름과 함께. 다른 바다를 누르면 그 바다로 */}
            {sea?.areas?.length ? (
                <section className="px-5 pt-6" data-testid="port-map">
                    <h2 className="mb-2.5 text-[17px] font-semibold">{josa(port.name, "은/는")} 여기</h2>
                    <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                        <SeaChart areas={sea.areas} picked={port.area} onPick={(x) => setLocation(fishingSeaAreaPath(x))} ports={portsOf(port.area)} port={port.code} />
                    </div>
                    <p className="mt-2 text-[12px]" style={{ color: C.dim }}>점은 {area?.name ?? "같은 바다"}의 항구예요. 바다를 누르면 그 바다의 예보로 가요.</p>
                </section>
            ) : null}
            {near.length > 0 && (
                <section className="px-5 pt-6" data-testid="port-spots">
                    <h2 className="mb-1 text-[17px] font-semibold">이 물때를 쓰는 바다 낚시터 <span className="text-[13px] font-normal tabular-nums" style={{ color: C.dim }}>{near.length}곳</span></h2>
                    <ul className="divide-y divide-[#FFFFFF14]">{near.slice(0, 8).map((p) => <li key={p.id}><Row p={p} /></li>)}</ul>
                </section>
            )}
            {others.length > 0 && (
                <section className="px-5 pt-6">
                    <h2 className="mb-2.5 text-[17px] font-semibold">{area?.name ?? "같은 바다"}의 다른 항구</h2>
                    <div className="flex flex-wrap gap-1.5">{others.map((p) => <Link key={p.code} href={fishingPortPath(p.name)} className="flex h-9 items-center rounded-full px-3 text-[13px]" style={{ background: "#FFFFFF14", color: C.foam }}>{p.name}</Link>)}</div>
                    <Link href={fishingSeaAreaPath(port.area)} className="mt-3 flex h-11 items-center justify-center rounded-xl text-[14px]" style={{ background: "#FFFFFF0F", color: C.soft }}>{area?.name ?? "바다"} 예보 보기</Link>
                </section>
            )}
            <p className="px-5 pt-4 text-[12px] leading-relaxed [word-break:keep-all]" style={{ color: C.dim }}>조석 예보 · 관측: 국립해양조사원{data?.sun?.at ? ` · 해 뜨고 지는 시각: 한국천문연구원(${data.sun.at})` : ""}. 물때 이름은 음력 날짜로 센 것이에요. {SEA_CAUTION}</p>
        </Shell>
    );
}
