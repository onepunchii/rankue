/**
 * 골프장 상세 '이 근처 조인·부킹' 카드(2026-10-08 오너: "각 개별 CC 페이지에 이 [점 지도] 카드 들어가면 어때? 조인·부킹 등 숫자만
 * 나오고 해당 카드 누르면 조인 페이지로 이동되게 — 조인 활성화" → 시안 둘(조용한 판 · 주황 면)을 보고 "시안 1 이 좋네").
 *
 * 전국 카드를 그대로 붙이지 않고 이 골프장에 맞춘다:
 *  · 지도는 **이 골프장이 속한 지역**을 당겨 보여 주고, 이 골프장을 흰 고리('여기')로 켠다. 점 색은 허브와 같은 뜻(긴급 빨강·조인 주황·부킹 라임).
 *  · 숫자는 같은 지역의 다른 골프장 것. 누르면 그 지역 조인(없으면 부킹) 목록으로 간다. 셈·상태·주소는 shared/golfAroundListings.
 *  · 올라온 글이 없으면 0 을 늘어놓지 않는다 — [조인 올리기] [알림 받기]로 이끈다. 위의 '지금 올라온 티타임이 없어요'를 되풀이하지 않는다.
 *  · 세 상태와 받기 전 뼈대의 높이가 같다(지도가 높이를 정한다) — 검색에서 바로 들어오는 화면이라 밑의 구역이 밀리지 않게.
 *  · 조용한 면(상세의 다른 카드와 같은 Card) — 정보 페이지의 흐름을 끊지 않는다.
 *  · 전국 목록(24KB)은 이 카드가 화면에 들어올 때 받는다(HereMap 과 같은 약속 — 같은 캐시를 쓴다). 못 받으면 카드를 그리지 않는다.
 * ⚠️ 리터럴 색만(CourseShell 머리말). 글자 12px 이상, 굵기는 semibold 까지.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { fitBox, mapX, mapY } from "@shared/golfDotMap";
import { aroundData, aroundView } from "@shared/golfAroundListings";
import { LucideChevronRight } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { useGolfAccess } from "@/hooks/useGolfAccess";
import { goLogin } from "@/components/hiq/LoginGate";
import { cn } from "@/lib/utils";
import { useCourseList } from "../../../lib/courseApi";
import { CourseDotMap, DOT_COLOR } from "../list/CourseDotMap";
import { KoreaOutline } from "../list/KoreaOutline";
import { AreaAlertButton } from "../AreaAlert";
import { GOLF_POST_PATH } from "../GolfGuide";
import { Card } from "./ui";

/** 지도 칸의 바탕 — 카드 면보다 한 단계 어둡게(작은 창처럼, HereMap 과 같다). 색 점·'여기'의 테두리도 이 색 */
const BG = "#0A0A0A";
/** 지도 너비 — 넓은 화면 기준값. 실제 너비는 MAP_CSS_W 가 좁은 화면(360)에서 줄인다. '여기' 고리의 크기는 이 값으로 잰다 */
const MAP_W = 124;
const MAP_CSS_W = "clamp(104px, 30vw, 124px)";
const ASPECT = 0.92;
/**
 * 카드 높이 — 세 상태와 받기 전 뼈대가 같다(안쪽 135 + 여백 28). 360 폭에서 숫자 줄이나 단추가 두 줄로 접혀도 이 안에 들어간다.
 * 검색에서 바로 들어오는 화면이라 목록이 도착할 때 밑의 구역이 밀리면 안 된다.
 */
const FACE = "p-3.5 flex items-center gap-3.5 min-h-[163px]";
/** 제목 글자 — 360 폭에서 15px, 390 부터 16px(한 줄에 화살표까지 들어가게) */
const TITLE_SIZE = { fontSize: "clamp(15px, 4.1vw, 16px)" } as const;
/** 좌표가 하나도 없을 때 당겨 볼 자리(나라 가운데) — 실제로는 지역의 골프장들이 틀을 정한다 */
const CENTER = [{ lat: 36.3, lng: 127.8 }] as const;

export function AroundListings({ slug, lat, lng, region, className }: {
    slug: string; lat: number | null; lng: number | null;
    /** 지역 묶음("충청") */
    region: string; className?: string;
}) {
    const [, setLocation] = useLocation();
    const { member } = useAuth();
    const golfOk = useGolfAccess();

    const ref = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [seen]);

    const list = useCourseList({}, seen);
    const rows = list.data;
    const { dots, focus, near, far, own } = useMemo(() => aroundData(rows ?? [], { slug, region }), [rows, slug, region]);
    const view = aroundView(region, near, far, own);

    const hasHere = lat != null && lng != null;
    const box = useMemo(
        () => fitBox(hasHere ? [...focus, { lat: lat!, lng: lng! }] : focus.length ? focus : CENTER, ASPECT),
        [focus, hasHere, lat, lng],
    );
    const u = box[2] / MAP_W;

    // 못 받았으면 조용히 빠진다 — 뼈대만 남아 있는 것보다 낫다
    if (list.isError && !rows) return null;

    const mapBox = "relative shrink-0 rounded-xl overflow-hidden";
    const mapStyle = { width: MAP_CSS_W, aspectRatio: String(ASPECT), background: BG };

    // 받기 전 — 자리만 잡아 둔다(숫자를 지어내지 않는다). 받은 뒤와 높이가 같아 밑의 구역이 밀리지 않는다
    if (!rows) {
        return (
            <div ref={ref} className={className}>
                <Card className={FACE}>
                    <div className={mapBox} style={mapStyle} />
                    <div className="min-w-0 flex-1 space-y-2.5">
                        <div className="h-3.5 w-20 rounded bg-[#FFFFFF0A]" />
                        <div className="h-4 w-36 rounded bg-[#FFFFFF0F]" />
                        <div className="h-3.5 w-28 rounded bg-[#FFFFFF0A]" />
                    </div>
                </Card>
            </div>
        );
    }

    const map = (
        <div aria-hidden="true" className={mapBox} style={mapStyle}>
            <CourseDotMap dots={dots} focus={null} box={box} aspect={ASPECT} cols={17} bg={BG} pulse className="absolute inset-0 w-full h-full"
                under={<KoreaOutline active={region} stroke="#FFFFFF1F" activeStroke="#FFFFFF73" activeFill="#FFFFFF0A" width={1.5} />}>
                {hasHere && (
                    <g pointerEvents="none">
                        <circle cx={mapX(lng!)} cy={mapY(lat!)} r={7.5 * u} fill="none" stroke="#FFFFFF" strokeOpacity={0.9} strokeWidth={1.4 * u} />
                        <circle cx={mapX(lng!)} cy={mapY(lat!)} r={3.2 * u} fill="#FFFFFF" stroke={BG} strokeWidth={1.2 * u} paintOrder="stroke" />
                    </g>
                )}
            </CourseDotMap>
        </div>
    );
    const label = <p className="text-[12.5px] text-[#FFFFFF80]">이 근처 · {region}</p>;

    // 어디에도 없을 때 — 올리기와 알림. 카드가 링크가 아니라 단추 둘을 품는다
    if (view.state === "empty") {
        // 조인 목록의 올리기 시트로 바로(로그인 전이면 로그인하고 그리로). 골프를 안 쓰는 회원에게는 올리는 곳이 닫혀 있다 — 단추를 내지 않는다
        const canPost = golfOk || !member;
        const post = () => { if (golfOk) setLocation(GOLF_POST_PATH); else goLogin(setLocation, GOLF_POST_PATH); };
        return (
            <div ref={ref} data-around="empty" className={className}>
                <Card className={FACE}>
                    {map}
                    <div className="min-w-0 flex-1">
                        {label}
                        <p style={TITLE_SIZE} className="mt-0.5 font-semibold text-white leading-snug break-keep">남는 자리, 여기 올려 보세요</p>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                            {canPost && (
                                <button type="button" onClick={post} className="h-9 px-3.5 rounded-full bg-[#FF6B00] text-[13px] font-semibold text-white inline-flex items-center active:bg-[#E86100] transition-colors">
                                    조인 올리기
                                </button>
                            )}
                            {/* 종 그림은 숨긴다 — 390 폭에서 단추 둘이 한 줄에 들어가게(글자가 이미 '알림'이라고 말한다) */}
                            <AreaAlertButton variant="chip" what={region} region={region} city={null} intent={null} regions={undefined} className="h-9 px-3.5 [&>svg]:hidden" />
                        </div>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div ref={ref} data-around={view.state} className={className}>
            <Link href={view.href!} aria-label={view.aria!} className="block rounded-2xl active:opacity-80 transition-opacity">
                <Card className={FACE}>
                    {map}
                    <div className="min-w-0 flex-1">
                        {label}
                        <p style={TITLE_SIZE} className="mt-0.5 flex items-center justify-between gap-2 font-semibold text-white leading-snug">
                            {view.state === "near"
                                ? <span>지금 올라온 자리 <span className="tabular-nums">{view.n}</span>건</span>
                                : <span>다른 지역엔 있어요</span>}
                            <LucideChevronRight weight="bold" className="w-4 h-4 shrink-0 text-[#FFFFFF66]" />
                        </p>
                        <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-[#FFFFFFE6]">
                            {view.stats.map((s) => (
                                <span key={s.key} className="inline-flex items-center gap-1.5">
                                    <i aria-hidden="true" className="w-2 h-2 rounded-full" style={{ background: DOT_COLOR[s.key] }} />
                                    {s.label}<b className="font-semibold tabular-nums">{s.n}</b>
                                </span>
                            ))}
                        </p>
                        {view.note && <p className={cn("mt-2 text-[12.5px] text-[#FFFFFF66]", view.state === "near" && "tabular-nums")}>{view.note}</p>}
                    </div>
                </Card>
            </Link>
        </div>
    );
}
