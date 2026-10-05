/**
 * 골프 홈 → 전국 골프장(/golf/courses) 입구(2026-09-24). 홈 타일 말투(영문 대문자 제목 + 한 줄)에 맞춘 넓은 카드.
 * 오른쪽 점 지도는 목록 화면과 같은 그림이다 — 누르고 들어가면 같은 지도가 그대로 이어진다.
 * 숫자는 전부 실제 값(골프장 수·지금 글·내 관심). 0 이면 적지 않는다.
 *
 * 둘째 판(2026-09-24 오너: "홈에 배너를 조금 더 시각적으로 눈에 보이게"):
 *  - 지도를 카드 반쪽 크기로 키우고 점을 격자 점으로(CourseDotMap 셋째 판) — 한반도가 또렷하게 떠 보인다.
 *  - 셋째 판(같은 날 오너: "배경을 조인 주황으로 입혀 줘 · 테두리에 저렇게 있으니 이상해"): 라임 테두리·빛을 걷고
 *    **주황 면 카드**로 — 위의 RANKUE MATCH(라임 면)와 짝을 이룬다. 점은 흰색, 글이 있는 곳은 짙은 점(CourseDotMap onColor).
 *  - 흐린 ▷ 대신 흰 동그라미 화살표 — 눌러서 들어가는 카드라는 게 한눈에.
 *  - 홈은 굵기를 낮추지 않는다(2026-09-21 오너) — 제목 extrabold.
 *
 * 넷째 판(2026-10-05 오너: 세로 2배 시안 A·B·C 를 보고 "C 로 하고") — 높이 192 → 384, **주황이 어둠으로 번지는 한 면**:
 *  - 왜 지도를 어두운 쪽에 두나: 주황 면 위에서는 조인의 주황·내 관심의 호박색이 바탕에 묻혀 **색의 뜻이 사라진다**.
 *    셋째 판은 그래서 색을 버리고 '짙은 점' 하나로만 말했다(긴급·조인·부킹을 가를 수 없었고, 내 관심은 아예 못 그렸다).
 *    시안 A(전면 주황 — 모양·명암으로 가름) · B(주황 틀 + 어두운 지도 창) · C(한 면) 중 오너가 C 를 골랐다.
 *    제목은 주황 위에, 지도는 어두운 쪽에 — 허브 지도와 **같은 색**(긴급 빨강·조인 주황·부킹 라임·내 관심 호박)이 그대로 보인다.
 *  - 주황은 시안보다 제목 쪽으로 더 모았다 — 조인이 가장 많은 수도권(지도 왼쪽 위)이 어두운 쪽에 와야 주황 점이 산다.
 *  - 숫자는 칩 한 줄 대신 세로로 쌓은 알약. 각 줄이 **그 목록으로 가는 링크**다(긴급·조인·부킹 허브, 내 관심은 골프장 목록).
 *    a 안에 a 를 넣을 수 없어서 바깥은 div 다 — 카드 전체를 덮는 링크를 밑에 깔고, 숫자 줄만 그 위에 올린다.
 *  - 홈 바탕도 검정(#0A0A0A)이라 어두운 귀퉁이가 녹는다 — 옅은 안쪽 테두리 한 줄이 카드의 끝을 잡는다.
 *
 * ⚠️ 리터럴 색만(골프 테마가 bg-white·text-white/40 같은 유틸을 바꿔 끼운다). 글자는 12px 이상.
 */
import { useMemo } from "react";
import { Link } from "wouter";
import { LucideArrowRight } from "@/lib/icons";
import { useAuth } from "@/hooks/useAuth";
import { listPath } from "@shared/golfCourse";
import { hereTone } from "@shared/golfHereMap";
import { useCourseList, useMyWatches, type CourseListItem } from "../../../lib/courseApi";
import { CourseDotMap, DOT_COLOR, type MapDot } from "./CourseDotMap";
import { KoreaOutline } from "./KoreaOutline";

/**
 * 카드의 면 — 왼쪽 위(제목)의 주황이 오른쪽 아래로 가며 어둠이 된다. 타원의 가로 125% · 세로 95% 라
 * 주황(#F26A12 까지)은 제목 둘레에만 남고, 지도가 놓이는 오른쪽·아래쪽은 짙은 갈색(#241003 → #120803)이다.
 */
const FACE = "radial-gradient(125% 95% at 0% 0%, #FF8A3D 0%, #F26A12 16%, #B04208 29%, #5A2103 44%, #241003 62%, #120803 100%)";
/** 지도 밑 바탕색 — 색 점 둘레의 테두리(옆 점과 떼는 선)가 이 색이다. 지도 자리의 면 색과 맞춘다 */
const MAP_BG = "#1A0B03";

type StatKey = "urgent" | "join" | "booking" | "watch";
export interface HomeStat { key: StatKey; label: string; n: number; href: string; aria: string }

/**
 * 지도의 점과 글 수 — 골프장 목록(공개)에서만 센다. 지어내는 값이 없다.
 * 점의 색은 허브 지도와 같은 규칙(hereTone): 긴급 > 조인 > 부킹 > 내 관심, 아무것도 아니면 흰 점.
 */
export function homeEntryData(rows: readonly Pick<CourseListItem, "slug" | "lat" | "lng" | "counts">[], watching: ReadonlySet<string>) {
    const counts = { booking: 0, join: 0, urgent: 0 };
    const dots: MapDot[] = [];
    for (const x of rows) {
        counts.booking += x.counts.booking; counts.join += x.counts.join; counts.urgent += x.counts.urgent;
        if (x.lat == null || x.lng == null) continue;
        dots.push({ key: x.slug, lat: x.lat, lng: x.lng, tone: hereTone(x.counts, watching.has(x.slug)) ?? "on" });
    }
    return { dots, counts };
}

/** 숫자 줄 — 긴급 · 조인 · 부킹 · 내 관심 순, **0 인 줄은 없다**. 각 줄은 그 목록의 주소를 갖는다 */
export function homeEntryStats(counts: { booking: number; join: number; urgent: number }, watchN: number): HomeStat[] {
    const all: HomeStat[] = [
        { key: "urgent", label: "긴급", n: counts.urgent, href: listPath({ intent: "urgent" }), aria: `긴급 조인 ${counts.urgent}건 보기` },
        { key: "join", label: "조인", n: counts.join, href: listPath({ intent: "join" }), aria: `조인 ${counts.join}건 보기` },
        { key: "booking", label: "부킹", n: counts.booking, href: listPath({ intent: "booking" }), aria: `부킹 ${counts.booking}건 보기` },
        { key: "watch", label: "내 관심", n: watchN, href: listPath({}), aria: `내 관심 골프장 ${watchN}곳 보기` },
    ];
    return all.filter((s) => s.n > 0);
}

/** 숫자 줄 앞의 표시 — 지도의 점과 같은 색·같은 말투(글이 올라온 셋은 옅은 후광, 내 관심은 조용한 점) */
function StatMark({ kind }: { kind: StatKey }) {
    const color = DOT_COLOR[kind];
    return (
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
            {kind !== "watch" && <circle cx="8" cy="8" r="7.5" fill={color} fillOpacity={0.25} />}
            <circle cx="8" cy="8" r={kind === "watch" ? 4.4 : 4.6} fill={color} />
        </svg>
    );
}

export function CourseHomeEntry() {
    const { member } = useAuth();
    const all = useCourseList({});
    const watches = useMyWatches(!!member);
    const rows = all.data;
    // 내 관심은 로그인한 사람만 — 로그아웃한 뒤 캐시에 남은 답으로 호박색 점·숫자 줄을 그리지 않는다
    const mine = member ? watches.data : undefined;

    const watching = useMemo(() => new Set((mine ?? []).map((w) => w.slug)), [mine]);
    const { dots, counts } = useMemo(() => homeEntryData(rows ?? [], watching), [rows, watching]);
    const stats = homeEntryStats(counts, mine?.length ?? 0);
    const total = rows?.length ?? 0;

    return (
        <div
            className="group relative z-10 w-full mb-4 rounded-[2rem] overflow-hidden bg-[#120803] ring-1 ring-inset ring-[#FFFFFF1A] shadow-2xl shadow-[#FF6B00]/20 active:scale-[0.99] transition-transform"
            style={{ backgroundImage: FACE }}
        >
            {/* 카드 전체가 입구다 — 맨 밑에 깔린 링크. 위에 얹은 글·지도·화살표는 손가락을 비켜 주고(pointer-events-none) 숫자 줄만 따로 받는다.
                카드가 overflow-hidden 이라 기본 초점 테두리는 잘린다 — 안쪽으로 그린다 */}
            <Link
                href="/golf/courses"
                aria-label="전국 골프장 보기"
                className="absolute inset-0 rounded-[2rem] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-[#FFFFFF]"
            />

            {/* 지도 — 오른쪽에 크게. 카드 폭의 62%, 위아래로 거의 가득(384 − 34 − 20 = 330 높이 × 0.62 ≈ 205 폭).
                폭을 205 에서 멈춰야 넓은 화면에서도 오른쪽에 붙는다(SVG 는 남는 폭의 가운데로 간다). 허브 지도와 같은 그림·같은 색이다 */}
            <div aria-hidden="true" className="pointer-events-none absolute right-0.5 top-[34px] bottom-5 w-[62%] max-w-[205px]">
                <CourseDotMap
                    dots={dots} focus={null} aspect={0.62} cols={27} bg={MAP_BG} pulse
                    className="absolute inset-0 w-full h-full"
                    under={<KoreaOutline stroke="#FFFFFF33" />}
                />
            </div>

            <div className="pointer-events-none relative flex flex-col min-h-[384px] p-6">
                <span className="inline-flex items-center gap-1.5 text-[12px] font-bold tracking-[0.12em] text-[#FFFFFFD9]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#FFFFFF]" />
                    전국 골프장
                </span>
                <span className="mt-2 block text-[26px] font-extrabold text-[#FFFFFF] leading-[0.98]">GOLF<br />COURSES</span>
                {/* 폭을 112 로 묶는다 — 한 줄로 풀리면 지도의 수도권 점과 겹친다 */}
                <span className="mt-2.5 block max-w-[112px] text-[12px] font-semibold leading-[1.45] text-[#FFFFFFCC] break-keep">
                    {total ? `${total.toLocaleString()}곳 · ` : ""}그린피 · 회원권 시세
                </span>

                {stats.length > 0 && (
                    <ul className="mt-auto pt-4 -ml-1 -mb-0.5 flex flex-col items-start gap-[7px]">
                        {stats.map((s) => (
                            <li key={s.key} className="flex">
                                {/* before: 줄 사이 틈(7px)까지 이 줄이 받는다 — 틈을 누르면 전체 링크로 새서 엉뚱한 목록이 열린다 */}
                                <Link
                                    href={s.href}
                                    aria-label={s.aria}
                                    className="pointer-events-auto relative z-10 inline-flex items-center gap-[7px] h-8 pl-[9px] pr-[11px] rounded-full bg-[#FFFFFF14] active:bg-[#FFFFFF29] transition-colors before:absolute before:-inset-y-[3.5px] before:-inset-x-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[#FFFFFF]"
                                >
                                    <StatMark kind={s.key} />
                                    <span className="text-[13px] font-bold text-[#FFFFFF]">{s.label}</span>
                                    <span className="ml-px text-[15px] font-extrabold text-[#FFFFFF] tabular-nums">{s.n.toLocaleString()}</span>
                                </Link>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* 장식 — 전체 링크 위에 떠 있을 뿐, 누르면 밑의 링크가 받는다 */}
            <span aria-hidden="true" className="pointer-events-none absolute right-4 bottom-4 w-10 h-10 rounded-full bg-[#FFFFFF] flex items-center justify-center shadow-lg shadow-[#7A2A00]/30 transition-transform group-active:scale-95">
                <LucideArrowRight weight="bold" className="w-5 h-5 text-[#E85200]" />
            </span>
        </div>
    );
}
