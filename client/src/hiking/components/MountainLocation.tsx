/**
 * 산 화면의 '위치 · 들머리'(2026-10-13) — 골프장 상세의 위치 카드(LocationCard)를 등산에 옮긴 것.
 *
 *   왼쪽  우리나라 종이 지도 위의 '여기' — 이 산이 나라의 어디쯤인지. 보는 그림이다(주소가 옆에 있다).
 *   오른쪽 어디(시도 · 시군구 · 읍면동) · 정상 높이 · 내 위치에서의 거리 · 들머리 단추 둘.
 *
 * 들머리는 **위에서 고른 코스**의 것이다(코스 선의 첫 점 — shared/hikingAround courseTrailhead). 지도 · 길찾기는 카카오맵으로 연다
 * (공식 주소 꼴 · 열쇠 없음 — 골프의 kakaoMapUrl · kakaoRouteUrl 을 그대로 쓴다). 코스가 없는 산은 산 이름으로 찾는다고 말하고 단추 하나만 둔다.
 * 코스 자료가 2022년 것이라는 줄을 같이 둔다(shared/hikingPage COURSE_SOURCE_NOTE — 산 화면의 코스 구역과 같은 글).
 *
 * 지도는 MountainMap(등산의 종이 지도)을 작게 세운 것이다. 그 지도의 글자(산 이름 · 울릉도 칸)는 이 크기에서 읽히지 않아 가리고,
 * '여기' 표시는 지도가 그려 둔 그 산의 자리(data-mountain 의 translate)를 읽어 그 위에 얹는다 — 자리 셈을 두 군데에 두지 않는다.
 * 윤곽선 자료가 무거워(80KB) 지도는 구역이 화면에 가까워질 때 받는다 — 산 화면은 검색에서 바로 들어오는 화면이다.
 * 내 위치는 받는 쪽(산 화면)이 기기에서 센 글자만 넘겨 준다 — 여기서 좌표를 다루지 않는다.
 * ⚠️ 리터럴 색만(theme.HK). 글자는 12px 이상, 굵기는 semibold 까지.
 */
import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { LucideLocateFixed, LucideMap, LucideNavigation } from "@/lib/icons";
import { kakaoMapUrl, kakaoRouteUrl } from "@/golf/components/join/joinUi";
import { heightText, mountainPlace } from "@shared/hikingMountains";
import { COURSE_SOURCE_NOTE } from "@shared/hikingPage";
import { MOUNTAIN_AROUND_LABEL, courseTrailhead, trailheadName } from "@shared/hikingAround";
import type { MountainCourse, MountainDetail } from "../lib/api";

const MountainMap = lazy(() => import("./MountainMap"));
/** 단추 앞의 그림 — 아주 좁은 화면(350 아래)에서는 뺀다: 지도 옆 칸이 좁아 '들머리까지 길찾기' 글자가 잘린다 */
const ICON = "hidden h-[18px] w-[18px] shrink-0 min-[350px]:block";

/** '여기' — 지도가 그려 둔 이 산의 자리를 읽어 그 위에 얹는다(지도와 같은 묶음 안에서 그려져, 지도가 뜬 뒤에 잰다) */
function HereMark({ wrap, slug }: { wrap: RefObject<HTMLDivElement>; slug: string }) {
    const [at, setAt] = useState<{ x: number; y: number } | null>(null);
    useLayoutEffect(() => {
        const svg = wrap.current?.querySelector("svg");
        const g = svg ? Array.from(svg.querySelectorAll<SVGGElement>("g[data-mountain]")).find((el) => el.dataset.mountain === slug) : undefined;
        const t = /translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/.exec(g?.getAttribute("transform") ?? "");
        // 지도의 틀(viewBox: x y 너비 높이) — 그 안에서의 비율로 놓으면 지도가 어떤 크기로 그려져도 제자리다
        const [vx, vy, vw, vh] = (svg?.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
        setAt(t && vw > 0 && vh > 0 ? { x: ((Number(t[1]) - vx) / vw) * 100, y: ((Number(t[2]) - vy) / vh) * 100 } : null);
    }, [wrap, slug]);
    if (!at) return null;
    // 이름표가 칸 밖으로 나가지 않게 — 동쪽의 산은 왼쪽에 달고, 북쪽 끝 · 남쪽 끝(제주)의 산은 안쪽으로 당긴다
    const left = at.x > 50;
    const top = at.y < 8 ? -3 : at.y > 90 ? -17 : -10;
    return (
        <span className="absolute" style={{ left: `${at.x}%`, top: `${at.y}%` }} data-testid="mountain-here" data-x={at.x.toFixed(1)} data-y={at.y.toFixed(1)}>
            <span className="absolute -left-[11px] -top-[11px] h-[22px] w-[22px] rounded-full" style={{ background: "#F28C6A47" }} />
            <span className="absolute -left-[5px] -top-[5px] h-[10px] w-[10px] rounded-full" style={{ background: "#F28C6A", boxShadow: "0 0 0 2px #FFFFFF" }} />
            <span className="absolute whitespace-nowrap rounded-full bg-[#0E2A33] px-1.5 text-[12px] leading-[20px] text-[#F4EFE3]" style={left ? { right: 13, top } : { left: 13, top }}>{MOUNTAIN_AROUND_LABEL.here}</span>
        </span>
    );
}

/** 우리나라 지도 위의 '여기' — 구역이 화면에 가까워지면 지도를 받는다 */
function HereMap({ d }: { d: MountainDetail }) {
    const wrap = useRef<HTMLDivElement>(null);
    const [seen, setSeen] = useState(false);
    useEffect(() => {
        const el = wrap.current;
        if (!el || seen) return;
        if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
        const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px 0px" });
        io.observe(el);
        return () => io.disconnect();
    }, [seen]);
    // 이 산 하나만 놓는다 — 나라 전체를 보는 크기라 가까운 산까지 놓으면 한 점에 뭉친다(가까운 산은 아래 '가까운 산'의 판이 보여 준다)
    const pins = useMemo(() => [d], [d]);
    return (
        // 보는 그림이다 — 누를 것이 없고(pointer-events-none), 읽어 주는 말은 옆의 주소가 한다(aria-hidden). 지도 안의 작은 글자는 가린다
        <div ref={wrap} aria-hidden="true" className="pointer-events-none relative shrink-0 self-start overflow-hidden rounded-[18px] bg-[#F4EFE3] [&_text]:hidden"
            style={{ width: "clamp(104px, 31vw, 132px)", aspectRatio: "436 / 640" }} data-testid="mountain-here-map">
            {seen && (
                <Suspense fallback={null}>
                    <MountainMap mountains={pins} interactive={false} />
                    <HereMark wrap={wrap} slug={d.slug} />
                </Suspense>
            )}
        </div>
    );
}

export function MountainLocation({ d, course, fromMe, ask, asking }: {
    d: MountainDetail;
    /** 위에서 고른 코스 — 없으면(코스가 없는 산) 산 이름으로 찾는다 */
    course: MountainCourse | null;
    /** "내 위치에서 북동쪽 12km" — 산 화면이 기기에서 센 글자. 모르면 null */
    fromMe: string | null;
    /** 위치를 아직 안 물었을 때만 — 누르면 한 번 묻는다 */
    ask: (() => void) | null;
    asking: boolean;
}) {
    const head = courseTrailhead(course);
    const where = [mountainPlace(d), d.dong ?? ""].filter(Boolean).join(" ");
    const h = heightText(d.heightM);
    const name = trailheadName(d.name);
    const btn = "flex h-11 min-w-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-xl px-2 text-[14px]";
    const plain = "bg-[#FFFFFF14] font-medium text-[#F4EFE3] active:bg-[#FFFFFF24]";
    const hasMap = d.lat != null && d.lng != null;
    return (
        <div className="rounded-2xl bg-[#FFFFFF0A] p-3.5" data-testid="mountain-location" data-trailhead={head ? (head.fromEnd ? "end" : "start") : "none"}>
            <div className="flex items-stretch gap-3.5">
                {hasMap && <HereMap key={`here:${d.slug}`} d={d} />}
                <div className="flex min-w-0 flex-1 flex-col justify-between gap-3">
                    <div className="min-w-0">
                        {where && <p className="text-[15.5px] font-semibold leading-snug text-[#F4EFE3] break-keep">{where}</p>}
                        {h && <p className="mt-0.5 text-[13px] text-[#F4EFE399]">정상 높이 <span className="tabular-nums text-[#F6D9A8]">{h}</span></p>}
                        {fromMe ? (
                            <p className="mt-0.5 text-[13px] tabular-nums text-[#F4EFE399] break-keep" data-testid="mountain-location-from-me">{fromMe}</p>
                        ) : ask ? (
                            <button type="button" onClick={ask} data-track-as="hiking-mountain-distance" className="-ml-1 mt-0.5 inline-flex min-h-8 items-center gap-1 rounded-lg px-1 text-[13px] text-[#F6D9A8] active:bg-[#FFFFFF14]">
                                <LucideLocateFixed className="h-3.5 w-3.5 shrink-0" aria-hidden />{MOUNTAIN_AROUND_LABEL.askDistance}
                            </button>
                        ) : asking ? (
                            <p className="mt-0.5 text-[13px] text-[#F4EFE380]">위치를 받는 중이에요</p>
                        ) : null}
                    </div>
                    <div className="flex flex-col gap-2">
                        {head ? (
                            <>
                                <a href={kakaoMapUrl(name, head.lat, head.lng)} target="_blank" rel="noopener noreferrer" className={`${btn} ${plain}`} data-testid="mountain-trailhead-map">
                                    <LucideMap className={ICON} aria-hidden />{MOUNTAIN_AROUND_LABEL.trailMap}
                                </a>
                                <a href={kakaoRouteUrl(name, head.lat, head.lng)} target="_blank" rel="noopener noreferrer" className={`${btn} bg-[#F28C6A] font-semibold text-[#2A1208] active:bg-[#E67C59]`} data-testid="mountain-trailhead-route">
                                    <LucideNavigation className={ICON} aria-hidden />{MOUNTAIN_AROUND_LABEL.trailRoute}
                                </a>
                            </>
                        ) : (
                            <a href={kakaoMapUrl(d.name)} target="_blank" rel="noopener noreferrer" className={`${btn} ${plain}`} data-testid="mountain-find-by-name">
                                <LucideMap className={ICON} aria-hidden />{MOUNTAIN_AROUND_LABEL.findByName}
                            </a>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-3 space-y-1 border-t border-[#FFFFFF14] pt-3 text-[12.5px] leading-snug text-[#F4EFE380] break-keep">
                {head && course ? (
                    <>
                        <p className="text-[#F4EFE3B3]">
                            코스 {course.seq}의 들머리예요.{d.courseList.length > 1 ? " 위에서 다른 코스를 고르면 들머리도 바뀌어요." : ""}{head.fromEnd ? " 정상에서 시작하는 기록이라 길의 아래쪽 끝을 들머리로 잡았어요." : ""}
                        </p>
                        <p>{COURSE_SOURCE_NOTE}</p>
                    </>
                ) : (
                    <p className="text-[#F4EFE3B3]">{MOUNTAIN_AROUND_LABEL.noCourse}</p>
                )}
                {(fromMe || ask || asking) && <p>{MOUNTAIN_AROUND_LABEL.onDevice}</p>}
            </div>
        </div>
    );
}

export default MountainLocation;
