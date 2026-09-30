/**
 * 도장깨기 → 발자국 보기(2026-09-30 오너: "도장깨기 지도에 발자국 기능 — 내가 어디 구장 순서로 갔는지 귀엽게").
 *
 * 도장(골프장당 하나)을 **처음 간 순서**로 이어 점 지도 위를 걷는다. 숫자는 전부 서버 기록(18홀 완주한 랭큐매치)에서
 * 온다 — 여권 도장과 같은 규칙(server/storage/golfStamps.ts)이라 도장 수와 발자국 수가 늘 같다.
 *  - 연도 칩은 **발자국이 있는 해만**, 두 해 이상일 때만 보인다(한 해뿐이면 '전체'와 같은 그림이라 칩이 군더더기).
 *  - 아래 목록은 지도와 같은 번호 — 누르면 지도에서 그 배지가 말풍선을 연다(좌표 없는 곳은 목록에만).
 *  - 공유는 서명된 비공개 카드(FootprintShareSheet). 발자국이 없으면 공유 단추도 없다.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { kstDateLabel } from "@/lib/kst";
import { cn } from "@/lib/utils";
import { LucideFlag, LucideShare2 } from "@/lib/icons";
import { trailKm } from "@shared/golfFootprints";
import { useCourseList } from "../../lib/courseApi";
import { CourseDotMap, type MapDot } from "../course/list/CourseDotMap";
import { FootprintMap, FOOTPRINT_MAP_ASPECT } from "./FootprintMap";
import { FootprintShareSheet } from "./FootprintShareSheet";
import { useFootprints } from "./useFootprints";
import { StopBadge } from "./StopBadge";
import { GhostSteps } from "./GhostSteps";

const dot = (iso: string) => kstDateLabel(iso, { year: "numeric", month: "2-digit", day: "2-digit" }).replace(/\. /g, ".").replace(/\.$/, "");

export function FootprintsPanel() {
    const [, setLocation] = useLocation();
    const [year, setYear] = useState<number | null>(null);
    const [selected, setSelected] = useState<number | null>(null);
    const [shareOpen, setShareOpen] = useState(false);
    const mapRef = useRef<HTMLDivElement>(null);

    // 연도 칩은 '전체' 응답의 years 로 — 한 해를 고른 뒤에도 칩 목록이 흔들리지 않게
    const all = useFootprints(null);
    const cur = useFootprints(year);
    const data = (year == null ? all.data : cur.data) ?? null;
    const years = all.data?.years ?? [];

    // 바탕 점 — 전국 골프장 점 지도와 같은 목록(홈·골프장 화면이 이미 캐시에 받아 둔 것)
    const courses = useCourseList({});
    const dots = useMemo<MapDot[]>(() => (courses.data ?? [])
        .filter((c) => c.lat != null && c.lng != null)
        .map((c) => ({ key: c.slug, lat: c.lat as number, lng: c.lng as number, tone: "on" as const })), [courses.data]);

    const stops = data?.stops ?? [];
    const km = useMemo(() => trailKm(stops), [stops]);
    const loading = !data && (all.isPending || cur.isPending);
    const pick = (y: number | null) => { setYear(y); setSelected(null); };
    const choose = (n: number) => {
        setSelected((s) => (s === n ? null : n));
        mapRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    };

    return (
        <section className="mb-8" aria-label="나의 골프 발자국">
            <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-[20px] font-bold tracking-tight text-[#ffffff]">나의 골프 발자국</h2>
                    <p className="mt-0.5 text-[13px] text-[#FFFFFF8C]">처음 간 순서대로 이어 봤어요</p>
                </div>
                {stops.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setShareOpen(true)}
                        className="shrink-0 h-9 px-3.5 rounded-full bg-[#FFFFFF14] text-[13px] font-semibold text-[#ffffff] inline-flex items-center gap-1.5 active:bg-[#FFFFFF1F]"
                    >
                        <LucideShare2 weight="bold" className="w-4 h-4" />
                        공유
                    </button>
                )}
            </div>

            {years.length > 1 && (
                <div className="mt-3 -mx-1 px-1 flex gap-1.5 overflow-x-auto scrollbar-hide" role="tablist" aria-label="연도">
                    {[null, ...years].map((y) => {
                        const on = y === year;
                        return (
                            <button
                                key={y ?? "all"}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => pick(y)}
                                className={cn(
                                    "shrink-0 h-8 px-3.5 rounded-full text-[13px] font-semibold tabular-nums transition-colors",
                                    on ? "bg-[#ffffff] text-[#0A0A0A]" : "bg-[#FFFFFF0D] text-[#FFFFFFB3] active:bg-[#FFFFFF1A]",
                                )}
                            >
                                {y ?? "전체"}
                            </button>
                        );
                    })}
                </div>
            )}

            <div
                ref={mapRef}
                className="mt-3 relative w-full rounded-3xl overflow-hidden bg-[#0F0F0F] ring-1 ring-inset ring-[#FFFFFF0F]"
                style={{ aspectRatio: String(FOOTPRINT_MAP_ASPECT) }}
            >
                {/* 라임 빛 한 겹 — 골프장 카드(공유 카드)와 같은 바탕 */}
                <span aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(70%_55%_at_45%_50%,#64DD1714_0%,transparent_70%)]" />
                {loading ? (
                    <div className="absolute inset-0 animate-pulse bg-[#FFFFFF05]" />
                ) : stops.length > 0 ? (
                    <FootprintMap stops={stops} dots={dots} playKey={String(year ?? "all")} selected={selected} onSelect={setSelected} />
                ) : (
                    <>
                        <div className="absolute inset-0 opacity-50">
                            <CourseDotMap dots={dots} focus={null} aspect={FOOTPRINT_MAP_ASPECT} cols={36} bg="#0F0F0F" muted className="absolute inset-0 w-full h-full" />
                        </div>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-8 bg-[radial-gradient(60%_50%_at_50%_50%,#0F0F0FE6_0%,#0F0F0F99_60%,transparent_100%)]">
                            <GhostSteps />
                            <p className="mt-3 text-[17px] font-semibold text-[#ffffff]">아직 발자국이 없어요</p>
                            <p className="mt-1.5 text-[13px] leading-relaxed text-[#FFFFFFA6] break-keep">
                                랭큐매치로 18홀을 끝까지 적으면<br />그 골프장에 첫 발자국이 찍혀요.
                            </p>
                            <button
                                type="button"
                                onClick={() => setLocation("/golf/game/new?mode=match")}
                                className="mt-5 h-11 px-5 rounded-full bg-gradient-to-br from-[#FF8A3D] to-[#E85200] shadow-md shadow-[#FF6B00]/20 text-[14px] font-semibold text-[#ffffff] inline-flex items-center gap-1.5 active:opacity-90"
                            >
                                <LucideFlag weight="fill" className="w-4 h-4" />
                                첫 라운드 시작
                            </button>
                        </div>
                    </>
                )}
            </div>

            {stops.length > 0 && (
                <>
                    <p className="mt-3 px-1 text-[13px] text-[#FFFFFF8C] tabular-nums">
                        <span className="font-semibold text-[#8BE84A]">{stops.length}곳</span>
                        <span> · 라운드 {data?.rounds ?? 0}회</span>
                        {km >= 1 && <span> · 이으면 {km.toLocaleString()}km</span>}
                        {selected == null && <span className="text-[#FFFFFF59]"> · 번호를 누르면 자세히</span>}
                    </p>

                    <ol className="mt-3 rounded-2xl bg-[#FFFFFF08] ring-1 ring-inset ring-[#FFFFFF0F] divide-y divide-[#FFFFFF0F] overflow-hidden">
                        {stops.map((s, i) => {
                            const n = i + 1;
                            const latest = n === stops.length;
                            const on = selected === n;
                            return (
                                <li key={`${s.clubId ?? s.name}-${n}`}>
                                    <button
                                        type="button"
                                        onClick={() => choose(n)}
                                        aria-pressed={on}
                                        className={cn("w-full flex items-center gap-3 px-4 py-3 text-left transition-colors", on ? "bg-[#FFFFFF0D]" : "active:bg-[#FFFFFF0A]")}
                                    >
                                        <StopBadge n={n} latest={latest} />
                                        <span className="flex-1 min-w-0">
                                            <span className="flex items-center gap-1.5">
                                                <span className="text-[15px] font-semibold text-[#ffffff] truncate">{s.name}</span>
                                                {latest && <span className="shrink-0 h-5 px-1.5 rounded-md bg-[#FF8A3D26] text-[#FFB27A] text-[11.5px] font-semibold leading-5">최근</span>}
                                            </span>
                                            <span className="block mt-0.5 text-[12.5px] text-[#FFFFFF73] tabular-nums">
                                                {dot(s.firstVisitedAt)} 첫 방문{s.visits > 1 ? ` · ${s.visits}회` : ""}
                                                {s.lat == null ? " · 지도 위치 없음" : ""}
                                            </span>
                                        </span>
                                    </button>
                                </li>
                            );
                        })}
                    </ol>
                </>
            )}

            <FootprintShareSheet open={shareOpen} onClose={() => setShareOpen(false)} year={year} />
        </section>
    );
}
