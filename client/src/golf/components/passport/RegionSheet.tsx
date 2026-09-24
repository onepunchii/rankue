/**
 * 도장깨기 — 지역 정복 현황 시트(2026-09-24 둘째 판 — 오너: "번개 아이콘을 대체하고, 지금은 밋밋함 개선").
 *
 *  - 머리는 **큰 숫자 + 막대** 하나: "3 / 154곳" 과 주황 진행 막대, 그리고 '금색 지역'(20% 정복)까지 몇 곳 남았는지.
 *  - 목록은 **정복한 곳 → 아직** 두 묶음. 번개(⚡) 대신 **빈 도장 칸**(점선 원) — 도장을 찍을 자리라는 뜻이 바로 읽힌다.
 *    정복한 곳은 라임 도장. 골프 색은 그린 + 주황(홈 GOLF COURSES 카드) 두 가지로 간다.
 *  - 글씨는 기울인 굵은 대문자·9px 를 걷고 골프장 화면 말투로.
 * ⚠️ 리터럴 색만 — 골프 테마가 `.bg-white`·`.text-black/*` 를 바꿔 끼운다.
 */
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { LucideStamp, LucideChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { coursePath } from "@shared/golfCourse";
import { CourseLogo } from "../course/CourseLogo";

const REGION_GROUP_MAPPING: Record<string, string> = {
    "Seoul": "경기", "Gyeonggi": "경기", "Incheon": "경기",
    "Gangwon": "강원",
    "North Chungcheong": "충청", "South Chungcheong": "충청", "Daejeon": "충청", "Sejong": "충청",
    "North Jeolla": "전라", "South Jeolla": "전라", "Gwangju": "전라",
    "North Gyeongsang": "경상", "South Gyeongsang": "경상", "Busan": "경상", "Daegu": "경상", "Ulsan": "경상",
    "Jeju": "제주"
};
/** 지도(RegionMap)와 같은 기준 — 그 묶음 골프장의 20%를 가 보면 금색(마스터). */
const MASTER_RATIO = 0.2;

interface Props {
    isOpen: boolean;
    onClose: () => void;
    regionId: string | null;
    conqueredCourses: string[]; // List of names
    /** 도장의 골프장 번호(rankue_golf_clubs.id) — 목록을 이 번호로 맞춘다 */
    stampClubIds?: string[];
    /** 서버가 골프장 원장 기준으로 센 묶음별 총수·정복 수. 지도와 같은 숫자를 보여 주려고 받는다. */
    regionTotals?: Record<string, number>;
    regionConquered?: Record<string, number>;
    onGoToGuide: (regionName: string) => void;
}

function Row({ name, logo, done, onOpen }: { name: string; logo?: string | null; done: boolean; onOpen?: () => void }) {
    return (
        <li>
            <button type="button" onClick={onOpen} disabled={!onOpen} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-[#FFFFFF0A] disabled:active:bg-transparent">
                {done ? (
                    <span className="w-9 h-9 shrink-0 rounded-full bg-[#64DD17] flex items-center justify-center -rotate-12">
                        <LucideStamp className="w-[18px] h-[18px] text-[#051907]" />
                    </span>
                ) : (
                    // 빈 도장 칸 — 아직 찍지 않은 자리
                    <span className="w-9 h-9 shrink-0 rounded-full border-[1.5px] border-dashed border-[#FFFFFF33]" aria-hidden />
                )}
                <CourseLogo logo={logo} name={name} size="xs" />
                <span className={cn("flex-1 min-w-0 block text-[15px] truncate", done ? "font-semibold text-[#ffffff]" : "font-medium text-[#FFFFFFCC]")}>{name}</span>
                {onOpen && <LucideChevronRight className="w-4 h-4 shrink-0 text-[#FFFFFF33]" />}
            </button>
        </li>
    );
}

export const RegionSheet = ({ isOpen, onClose, regionId, stampClubIds = [], onGoToGuide, regionTotals, regionConquered }: Props) => {
    const [, setLocation] = useLocation();
    const regionName = regionId ? REGION_GROUP_MAPPING[regionId] : "";
    // 목록은 **라운드용 골프장 원장**(rankue_golf_clubs) — 도장·지도 숫자와 같은 원장이라 번호로 정확히 맞는다(2026-09-24).
    // 예전엔 옛 정적 목록(이름)과 도장(원장 이름 "H1")을 글자로 비교해 머리는 1곳인데 '정복한 곳'이 비었고, 총수도 달랐다(168 vs 164).
    const clubs = useQuery<any[]>({
        // v2: passportRegion·pageSlug 가 붙은 응답(2026-09-24). 저장된 옛 캐시(그 값이 없는 목록)를 쓰지 않게 열쇠를 바꾼다.
        queryKey: ["/api/hiq/golf/clubs", "all", "v2"],
        queryFn: () => apiRequest("/api/hiq/golf/clubs"),
        enabled: isOpen,
        staleTime: 10 * 60_000,
    });
    const stamped = new Set(stampClubIds.map(String));
    const coursesInRegion = regionName ? (clubs.data ?? []).filter((c: any) => c.passportRegion === regionName) : [];
    const done = coursesInRegion.filter((c: any) => stamped.has(String(c.id)));
    const todo = coursesInRegion.filter((c: any) => !stamped.has(String(c.id)));

    // 숫자는 지도와 같은 것(서버 원장 기준) — 없으면 정적 목록으로 센다
    const total = regionTotals?.[regionName] ?? coursesInRegion.length;
    const conquered = regionConquered?.[regionName] ?? done.length;
    const pct = total ? Math.min(100, (conquered / total) * 100) : 0;
    const masterAt = Math.max(1, Math.ceil(total * MASTER_RATIO));
    const toMaster = Math.max(0, masterAt - conquered);

    // 골프장 페이지가 있는 곳만 누를 수 있다(이름 열쇠로 이은 slug)
    const openOf = (c: any) => c.pageSlug ? () => { onClose(); setLocation(coursePath(c.pageSlug)); } : undefined;

    return (
        <Sheet open={isOpen} onOpenChange={(o) => !o && onClose()}>
            <SheetContent
                side="bottom"
                className="bg-[#0F0F0F] border-[#FFFFFF0F] rounded-t-3xl px-0 pb-0 max-h-[85vh] flex flex-col [&>button]:right-5 [&>button]:top-5 [&>button]:opacity-60"
            >
                <div className="px-5 pt-5 pb-4 shrink-0">
                    <p className="text-[13px] text-[#FFFFFF8C]">지역 정복 현황</p>
                    <SheetTitle className="mt-0.5 text-[26px] font-bold tracking-tight text-[#ffffff]">{regionName || "지역"}</SheetTitle>

                    <div className="mt-4 flex items-end justify-between gap-3">
                        <p className="tabular-nums leading-none">
                            <span className="text-[34px] font-bold text-[#ffffff]">{conquered}</span>
                            <span className="ml-1 text-[16px] font-medium text-[#FFFFFF73]">/ {total.toLocaleString()}곳</span>
                        </p>
                        <p className="text-right text-[12.5px] leading-snug">
                            {toMaster > 0
                                ? <><span className="text-[#FFB27A] font-semibold tabular-nums">{toMaster}곳</span><span className="text-[#FFFFFF8C]"> 더 가면 금색 지역</span></>
                                : <span className="text-[#FFD266] font-semibold">금색 지역 달성</span>}
                        </p>
                    </div>
                    <div className="mt-3 h-2 rounded-full bg-[#FFFFFF14] overflow-hidden relative" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={conquered} aria-label={`${regionName} 정복`}>
                        <div className="h-full rounded-full bg-gradient-to-r from-[#FF8A3D] to-[#E85200]" style={{ width: `${Math.max(pct, conquered ? 2 : 0)}%` }} />
                        {/* 금색 지역 문턱 눈금 */}
                        <span className="absolute top-0 bottom-0 w-px bg-[#FFFFFF59]" style={{ left: `${Math.min(100, (masterAt / Math.max(1, total)) * 100)}%` }} aria-hidden />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5 scrollbar-hide">
                    {clubs.isPending ? <p className="py-6 text-center text-[13px] text-[#FFFFFF59]">골프장을 불러오는 중…</p> : <>
                    {done.length > 0 && (
                        <section>
                            <h3 className="mb-2 text-[13px] font-semibold text-[#FFFFFF99]">정복한 곳 <span className="text-[#8BE84A] tabular-nums">{done.length}</span></h3>
                            <ul className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
                                {done.map((c: any) => <Row key={c.id} name={c.name} logo={c.logo} done onOpen={openOf(c)} />)}
                            </ul>
                        </section>
                    )}
                    <section>
                        <h3 className="mb-2 text-[13px] font-semibold text-[#FFFFFF99]">아직 <span className="text-[#FFFFFF59] tabular-nums">{todo.length}</span></h3>
                        {done.length === 0 && (
                            <p className="mb-2 text-[12.5px] text-[#FFFFFF73] break-keep">랭큐매치로 18홀을 끝까지 적으면 그 골프장에 도장이 찍혀요.</p>
                        )}
                        <ul className="rounded-2xl bg-[#FFFFFF08] divide-y divide-[#FFFFFF0F] overflow-hidden">
                            {todo.map((c: any) => <Row key={c.id} name={c.name} logo={c.logo} done={false} onOpen={openOf(c)} />)}
                        </ul>
                    </section>
                    </>}
                </div>

                <div className="shrink-0 px-5 pt-3 border-t border-[#FFFFFF0F]" style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}>
                    <button
                        type="button"
                        onClick={() => { if (regionName) { onGoToGuide(regionName); onClose(); } }}
                        className="w-full h-13 min-h-[52px] rounded-2xl bg-gradient-to-br from-[#FF8A3D] to-[#E85200] text-[15px] font-semibold text-[#ffffff] active:opacity-90"
                    >
                        {regionName ? `${regionName} 골프장 전체 보기` : "골프장 전체 보기"}
                    </button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
