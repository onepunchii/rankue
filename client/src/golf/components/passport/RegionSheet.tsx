import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LucideBadgeCheck, LucideStamp, LucideZap, LucideChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { COURSES } from "@/golf/data/golfCourses";

const REGION_GROUP_MAPPING: Record<string, string> = {
    "Seoul": "경기", "Gyeonggi": "경기", "Incheon": "경기",
    "Gangwon": "강원",
    "North Chungcheong": "충청", "South Chungcheong": "충청", "Daejeon": "충청", "Sejong": "충청",
    "North Jeolla": "전라", "South Jeolla": "전라", "Gwangju": "전라",
    "North Gyeongsang": "경상", "South Gyeongsang": "경상", "Busan": "경상", "Daegu": "경상", "Ulsan": "경상",
    "Jeju": "제주"
};

interface Props {
    isOpen: boolean;
    onClose: () => void;
    regionId: string | null;
    conqueredCourses: string[]; // List of names
    onGoToGuide: (regionName: string) => void;
}

export const RegionSheet = ({ isOpen, onClose, regionId, conqueredCourses, onGoToGuide }: Props) => {
    const regionName = regionId ? REGION_GROUP_MAPPING[regionId] : "";
    const coursesInRegion = regionName ? COURSES.filter(c => c.region === regionName) : [];
    const conqueredCount = coursesInRegion.filter(c => conqueredCourses.includes(c.name)).length;

    return (
        <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <SheetContent
                side="bottom"
                className="bg-[#0A0A0A] border-white/5 rounded-t-[3rem] px-6 pb-12 max-h-[85vh] overflow-y-auto no-scrollbar [&>button]:right-8 [&>button]:top-8 [&>button_svg]:h-6 [&>button_svg]:w-6 [&>button]:opacity-40 hover:[&>button]:opacity-100"
            >
                <div className="max-w-2xl mx-auto">
                    <SheetHeader className="mb-8">
                        <div className="flex items-center justify-between pr-10">
                            <SheetTitle className="text-2xl font-black text-white italic uppercase tracking-tighter">
                                {regionName} 지역 정복 현황
                            </SheetTitle>
                            <div className="px-3 py-1 rounded-full bg-[#64DD17]/10 border border-[#64DD17]/20 flex items-center gap-2">
                                <LucideBadgeCheck className="w-3 h-3 text-[#64DD17]" />
                                <span className="text-[10px] font-black text-[#64DD17] uppercase tracking-widest">
                                    {conqueredCount} / {coursesInRegion.length} 정복
                                </span>
                            </div>
                        </div>
                    </SheetHeader>

                    <div className="grid grid-cols-1 gap-3">
                        {coursesInRegion.map(course => {
                            const isC = conqueredCourses.includes(course.name);
                            return (
                                <div
                                    key={course.id}
                                    className={cn(
                                        "p-5 rounded-2xl border transition-all flex items-center justify-between group cursor-pointer active:scale-[0.98]",
                                        isC ? "bg-[#64DD17]/5 border-[#64DD17]/20" : "bg-white/5 border-white/5"
                                    )}
                                    onClick={() => {
                                        onClose();
                                        window.location.href = `/golf/course/${course.id}`;
                                    }}
                                >
                                    <div className="flex items-center gap-4">
                                        <div className={cn(
                                            "w-10 h-10 rounded-xl flex items-center justify-center transition-all",
                                            isC ? "bg-[#64DD17] shadow-[0_0_15px_rgba(100,221,23,0.4)]" : "bg-white/10"
                                        )}>
                                            {isC ? (
                                                <LucideStamp className="w-5 h-5 text-black" />
                                            ) : (
                                                <LucideZap className="w-5 h-5 text-white/20" />
                                            )}
                                        </div>
                                        <div>
                                            <h4 className={cn(
                                                "text-sm font-black tracking-tight",
                                                isC ? "text-white" : "text-white/40"
                                            )}>{course.name}</h4>
                                            <p className="text-[9px] font-bold text-white/20 uppercase tracking-[0.2em] mt-1">{course.subType}</p>
                                        </div>
                                    </div>
                                    <LucideChevronRight className={cn(
                                        "w-4 h-4 transition-transform group-hover:translate-x-1",
                                        isC ? "text-[#64DD17]" : "text-white/10"
                                    )} />
                                </div>
                            );
                        })}
                    </div>

                    <Button
                        onClick={() => {
                            if (regionName) {
                                onGoToGuide(regionName);
                                onClose();
                            }
                        }}
                        className="w-full mt-8 h-14 rounded-2xl bg-white text-black font-black uppercase tracking-widest hover:bg-white/90"
                    >
                        전체 구장 가이드 보기
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
};
