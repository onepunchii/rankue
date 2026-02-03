import { cn } from "@/lib/utils";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";
import { COURSES } from "@/golf/data/golfCourses";
import { Stamp } from "@/golf/hooks/usePassportData";

const REGION_GROUP_MAPPING: Record<string, string> = {
    "Seoul": "경기", "Gyeonggi": "경기", "Incheon": "경기",
    "Gangwon": "강원",
    "North Chungcheong": "충청", "South Chungcheong": "충청", "Daejeon": "충청", "Sejong": "충청",
    "North Jeolla": "전라", "South Jeolla": "전라", "Gwangju": "전라",
    "North Gyeongsang": "경상", "South Gyeongsang": "경상", "Busan": "경상", "Daegu": "경상", "Ulsan": "경상",
    "Jeju": "제주"
};

const MASTER_RATIO = 0.2;

const REGION_TOTALS = COURSES.reduce((acc, course) => {
    acc[course.region] = (acc[course.region] || 0) + 1;
    return acc;
}, {} as Record<string, number>);

interface Props {
    stamps: Stamp[];
    onRegionClick: (regionId: string) => void;
}

export const RegionMap = ({ stamps, onRegionClick }: Props) => {
    const calculateHeatmapStyle = (filterRegion: string) => {
        if (!filterRegion || !REGION_TOTALS[filterRegion]) return { opacity: 0, isMastered: false, color: "#64DD17" };

        const total = REGION_TOTALS[filterRegion];
        const targetGoal = Math.ceil(total * MASTER_RATIO);
        const visitCount = stamps.filter(s => {
            // In Passport.tsx line 217, it mapped using REGION_GROUP_MAPPING
            // We need to match that logic
            const mappedRegion = REGION_GROUP_MAPPING[filterRegion];
            return s.region === mappedRegion;
        }).length;

        if (visitCount === 0) return { opacity: 0, isMastered: false, color: "#64DD17" };

        const ratio = visitCount / targetGoal;
        const opacity = Math.max(0.2, Math.min(ratio, 1.0));
        const isMastered = ratio >= 1.0;
        const color = isMastered ? "#FFD700" : "#64DD17"; // Gold if mastered

        return { opacity, isMastered, color };
    };

    return (
        <div className="relative mb-8 pb-12">
            <div className="absolute inset-0 bg-[#64DD17]/3 blur-[120px] rounded-full" />
            <svg viewBox="0 0 450 650" className="w-full h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]">
                {Object.entries(KOREA_MAP_PATHS).map(([id, path]) => {
                    const { opacity, isMastered, color } = calculateHeatmapStyle(id);
                    return (
                        <g key={id} className="group/region cursor-pointer" onClick={() => onRegionClick(id)}>
                            <path
                                d={path}
                                fill={color}
                                stroke={color}
                                strokeWidth="1.5"
                                className={cn(
                                    "transition-all duration-700",
                                    isMastered && "drop-shadow-[0_0_12px_rgba(255,215,0,0.4)]"
                                )}
                                fillOpacity={opacity === 0 ? 0.05 : opacity}
                                strokeOpacity={opacity === 0 ? 0.2 : 0.8}
                            />
                        </g>
                    );
                })}
            </svg>
        </div>
    );
};
