import { cn } from "@/lib/utils";
import { KOREA_MAP_PATHS } from "@/golf/data/koreaMapData";

/** 지도 path 의 영문 광역 id → 여권 묶음. 서울·인천은 경기와 한 묶음이라 같은 색으로 칠해진다. */
export const REGION_GROUP_MAPPING: Record<string, string> = {
    "Seoul": "경기", "Gyeonggi": "경기", "Incheon": "경기",
    "Gangwon": "강원",
    "North Chungcheong": "충청", "South Chungcheong": "충청", "Daejeon": "충청", "Sejong": "충청",
    "North Jeolla": "전라", "South Jeolla": "전라", "Gwangju": "전라",
    "North Gyeongsang": "경상", "South Gyeongsang": "경상", "Busan": "경상", "Daegu": "경상", "Ulsan": "경상",
    "Jeju": "제주"
};

/** 그 묶음 골프장의 20%를 가 보면 금색(마스터). */
const MASTER_RATIO = 0.2;

interface Props {
    regionTotals: Record<string, number>;
    regionConquered: Record<string, number>;
    onRegionClick: (regionId: string) => void;
}

/**
 * 예전엔 영문 id 로 한글 합계를 찾아서(REGION_TOTALS['Seoul'] = undefined) 17개 지역 중 하나도 칠해지지
 * 않았다. 이제 묶음 이름으로 바꾼 뒤 서버가 센 총수·정복 수(서로 다른 골프장 수)로 칠한다(2026-09-11).
 */
export const RegionMap = ({ regionTotals, regionConquered, onRegionClick }: Props) => {
    const style = (id: string) => {
        const group = REGION_GROUP_MAPPING[id];
        const total = group ? regionTotals[group] ?? 0 : 0;
        const visited = group ? regionConquered[group] ?? 0 : 0;
        if (!total || !visited) return { opacity: 0, isMastered: false, color: "#64DD17" };
        const ratio = visited / Math.max(1, Math.ceil(total * MASTER_RATIO));
        const isMastered = ratio >= 1;
        return { opacity: Math.max(0.25, Math.min(ratio, 1)), isMastered, color: isMastered ? "#FFD700" : "#64DD17" };
    };

    return (
        <div className="relative mb-8 pb-12">
            <div className="absolute inset-0 bg-[#64DD17]/3 blur-[120px] rounded-full" />
            <svg viewBox="0 0 450 650" className="w-full h-auto drop-shadow-[0_20px_50px_rgba(0,0,0,0.5)]" role="img" aria-label="지역별 정복 지도">
                {Object.entries(KOREA_MAP_PATHS).map(([id, path]) => {
                    const { opacity, isMastered, color } = style(id);
                    return (
                        <g key={id} className="group/region cursor-pointer" onClick={() => onRegionClick(id)}>
                            <path
                                d={path as string}
                                fill={color}
                                stroke={color}
                                strokeWidth="1.5"
                                className={cn("transition-all duration-700", isMastered && "drop-shadow-[0_0_12px_rgba(255,215,0,0.4)]")}
                                fillOpacity={opacity === 0 ? 0.05 : opacity}
                                strokeOpacity={opacity === 0 ? 0.25 : 0.8}
                            />
                        </g>
                    );
                })}
            </svg>
            <p className="mt-2 text-center text-[11px] font-bold text-white/40">지역을 누르면 그 지역 골프장과 정복 현황이 나와요</p>
        </div>
    );
};
