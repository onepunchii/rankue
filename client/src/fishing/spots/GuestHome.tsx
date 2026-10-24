/**
 * 낚시의 방문자 첫 화면(2026-10-24 오너: "추천대로" — 비로그인은 골프 · 등산처럼 그 종목의 화면으로).
 * 예전 /fishing 은 방문자에게 머리줄도 뒤로 가기도 없는 가입 안내만 띄웠다. 등산(/hiking = 전국 명산)처럼 누구나 보는 것부터 보여 준다:
 *   오늘 바다(공개 예보 · 특보) → 전국 낚시터 지도 → 어종 · 금어기 · 물때 · 축제 입구 → 가입하면 쓰는 것(어탁 · 수족관 — '예시')
 * 아래 가입 단추는 틀(FishingShell)이 그린다. 어종 설명 같은 글은 지어 쓰지 않는다 — 있는 자료(개수 · 이름 · 예보)만.
 * ⚠️ 리터럴 색만.
 */
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { LucideChevronRight } from "@/lib/icons";
import { FISHING_COLORS as C } from "@shared/fishing";
import { FISHING_PLACE_COUNT, FISHING_SPOTS_LABEL, FISHING_SPOTS_PATH } from "@shared/fishingPlaces";
import { FISHING_SEA_LABEL, FISHING_SEA_PATH, fishingSeaAreaPath } from "@shared/fishingSeaPages";
import { FISH_PAGES, FISHING_FISH_LABEL, FISHING_FISH_PATH } from "@shared/fishingFishPages";
import { FISHING_CLOSED_PATH } from "@shared/fishingClosed";
import { FISHING_PORTS } from "@shared/fishingStations";
import type { SeaNow } from "@shared/fishingSea";
import { SeaChart, SEA_LEGEND, seaWashColor, seaWashLine } from "../SeaChart";
import { PAPER } from "../ink";
import { FishingShell } from "../FishingShell";
import { PaperMap, useSpots } from "./SpotsPages";

const HERO = "/fishing/art/hero.webp";
/** '예시' 어탁 — 실제 어탁 그림 셋(회원 수족관에서 헤엄치는 그림과 같은 것) */
const SAMPLE_GYOTAKU = ["/fishing/art/gyotaku-gamseongdom.webp", "/fishing/art/gyotaku-bungeo.webp", "/fishing/art/gyotaku-ureok.webp"];

function Section({ title, more, children, testId }: { title: string; more?: { href: string; label: string }; children: React.ReactNode; testId?: string }) {
    return (
        <section className="px-5 pt-7" data-testid={testId}>
            <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>
                {more && (
                    <Link href={more.href} className="flex shrink-0 items-center gap-0.5 text-[13px] font-medium active:opacity-70" style={{ color: C.brand }}>
                        {more.label}<LucideChevronRight className="h-4 w-4" aria-hidden />
                    </Link>
                )}
            </div>
            {children}
        </section>
    );
}

export function FishingGuestHome() {
    const [, setLocation] = useLocation();
    const { data: sea } = useQuery<SeaNow | null>({ queryKey: ["/api/hiq/fishing/sea"], staleTime: 5 * 60_000 });
    const { data: spots } = useSpots();
    const tiles = [
        { href: FISHING_SEA_PATH, title: "물때 · 항구", sub: `항구 ${FISHING_PORTS.length}곳의 물때와 예보`, img: "/fishing/art/band-boats.webp" },
        { href: FISHING_FISH_PATH, title: FISHING_FISH_LABEL, sub: `${FISH_PAGES.length}종 · 오늘 좋은 어종 · 낚시터`, img: "/fishing/art/band-market.webp" },
        { href: FISHING_CLOSED_PATH, title: "금어기 · 금지체장", sub: "오늘 잡으면 안 되는 것", img: "/fishing/art/band-rules.webp" },
        { href: "/fishing/festivals", title: "낚시 축제", sub: "바다 · 강 · 저수지 축제", img: "/fishing/art/band-reservoir.webp" },
    ];
    return (
        <FishingShell title="랭큐 낚시" backTo="/">
            <div className="relative h-[210px] overflow-hidden" data-testid="fishing-guest-home">
                <img src={HERO} alt="" width={880} height={880} className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: "50% 60%" }} draggable={false} decoding="async" />
                <div className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D10 0%,#0B1E2D55 50%,#0B1E2D 100%)" }} aria-hidden />
                <div className="absolute inset-x-5 bottom-4">
                    <h1 className="text-[26px] font-semibold leading-tight tracking-tight">랭큐 낚시</h1>
                    <p className="mt-1 text-[14px] [word-break:keep-all]" style={{ color: C.soft }}>오늘 바다를 보고, 잡은 고기를 어탁으로 남겨요.</p>
                    <p className="mt-1 text-[12.5px] tabular-nums" style={{ color: C.dim }}>낚시터 {FISHING_PLACE_COUNT.toLocaleString("ko-KR")}곳 · 항구 {FISHING_PORTS.length}곳 · 어종 {FISH_PAGES.length}종</p>
                </div>
            </div>

            {/* 오늘 바다 — 공개 예보 · 특보(기상청). 바다를 누르면 그 바다의 예보와 항구 */}
            <Section title="오늘 바다" more={{ href: FISHING_SEA_PATH, label: FISHING_SEA_LABEL }} testId="fishing-guest-sea">
                {sea?.areas?.length ? (
                    <div className="overflow-hidden rounded-2xl" style={{ background: PAPER, boxShadow: "0 1px 0 #00000040, inset 0 0 0 1px #0F28381F" }}>
                        <SeaChart areas={sea.areas} picked={null} onPick={(id) => setLocation(fishingSeaAreaPath(id))} ports={FISHING_PORTS} port={null} />
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t px-3.5 py-2.5" style={{ borderColor: "#0F28381F" }}>
                            {SEA_LEGEND.map((l) => <span key={l.state} className="flex items-center gap-1.5 text-[12px]" style={{ color: "#0F2838B3" }}><i aria-hidden className="h-3 w-3 rounded-[4px]" style={{ background: seaWashColor(l.state), boxShadow: `inset 0 0 0 1px ${seaWashLine(l.state)}` }} />{l.text}</span>)}
                        </div>
                    </div>
                ) : (
                    <div className="h-[220px] animate-pulse rounded-2xl" style={{ background: "#FFFFFF0A" }} aria-busy="true" />
                )}
                {sea?.issued && <p className="mt-2 text-[12px]" style={{ color: C.dim }}>{sea.issued} 발표 · 바다를 누르면 예보와 항구가 열려요</p>}
            </Section>

            {/* 전국 낚시터 — 종이 지도의 점(종류 색) */}
            <Section title={FISHING_SPOTS_LABEL} more={{ href: FISHING_SPOTS_PATH, label: "지역 · 종류로 찾기" }} testId="fishing-guest-spots">
                <Link href={FISHING_SPOTS_PATH} className="block overflow-hidden rounded-2xl active:opacity-90" aria-label={FISHING_SPOTS_LABEL}>
                    {spots?.items?.length ? <PaperMap items={spots.items} height={300} /> : <div className="h-[300px] animate-pulse" style={{ background: PAPER }} aria-busy="true" />}
                </Link>
            </Section>

            {/* 둘러보기 — 공개 화면 넷 */}
            <section className="px-5 pt-7" data-testid="fishing-guest-tiles">
                <div className="grid grid-cols-2 gap-2.5">
                    {tiles.map((x) => (
                        <Link key={x.href} href={x.href} className="relative block h-[112px] overflow-hidden rounded-2xl active:opacity-85">
                            <img src={x.img} alt="" width={640} height={320} loading="lazy" className="absolute inset-0 h-full w-full object-cover opacity-75" draggable={false} />
                            <span className="absolute inset-0" style={{ background: "linear-gradient(180deg,#0B1E2D00 10%,#0B1E2DE6 100%)" }} aria-hidden />
                            <span className="absolute inset-x-3 bottom-2.5">
                                <span className="block text-[15.5px] font-semibold">{x.title}</span>
                                <span className="mt-0.5 block truncate text-[12px]" style={{ color: C.soft }}>{x.sub}</span>
                            </span>
                        </Link>
                    ))}
                </div>
            </section>

            {/* 가입하면 — 어탁 · 수족관(예시). 실제 기록은 회원의 것 */}
            <Section title="가입하면" testId="fishing-guest-sample">
                <div className="relative overflow-hidden rounded-2xl px-4 pb-4 pt-3.5" style={{ background: "#FFFFFF0A", boxShadow: "inset 0 0 0 1px #FFFFFF14" }}>
                    <span className="absolute right-3 top-3 rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: "#FFFFFF14", color: C.soft }}>예시</span>
                    <div className="flex items-end gap-2 pr-10">
                        {SAMPLE_GYOTAKU.map((src, i) => (
                            <span key={src} className="block overflow-hidden rounded-xl" style={{ background: PAPER, width: i === 0 ? 112 : 84, height: i === 0 ? 84 : 64 }}>
                                <img src={src} alt="" width={320} height={240} loading="lazy" className="h-full w-full object-contain p-1.5" draggable={false} />
                            </span>
                        ))}
                    </div>
                    <p className="mt-3 text-[15px] font-semibold [word-break:keep-all]">잡은 고기를 적으면 어탁이 되고, 내 수족관에서 헤엄쳐요</p>
                    <p className="mt-1 text-[13px] [word-break:keep-all]" style={{ color: C.soft }}>조과 일지 · 어종별 기록 · 낚시 크루와 출조까지.</p>
                </div>
            </Section>
        </FishingShell>
    );
}
