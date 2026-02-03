import { LucideIcon, LucideLayers, LucideTarget, LucideBarChart3, LucideSwords, LucideHistory } from "lucide-react";
import { HiqGameHistory } from "@shared/schema";

export type FilterType = "all" | "3c" | "4c";

export interface SportConfig {
    title: string;
    subtitle: string;
    label: string;
    unit: string;
    themeColor: string;
    borderColor: string;
    bgLight: string;
    mainIcon: LucideIcon;
    listTitle: string;
    detailTitle: string;
    detailSubtitle: string;
    statLabels: {
        total: string;
        score: string;
        best: string;
        bestVal: string;
        extra1: string;
        extra2: string;
        extra3: string;
    };
    tierLogic: 'handicap' | 'average';
    spinnerColor: string;
}

export const SPORT_CONFIG: Record<string, SportConfig> = {
    GOLF: {
        title: "라운딩 리포트",
        subtitle: "OFFICIAL ROUNDING RECORDS",
        label: "라운딩",
        unit: "타수",
        themeColor: "text-[#84cc16]",
        borderColor: "hover:border-[#84cc16]/30",
        bgLight: "bg-[#84cc16]/5",
        mainIcon: LucideHistory,
        listTitle: "최근 공식 라운딩 리스트",
        detailTitle: "라운딩 상세 리포트",
        detailSubtitle: "OFFICIAL ROUND BREAKDOWN",
        statLabels: {
            total: "Total Rounds",
            score: "Avg. Score",
            best: "Best Score",
            bestVal: "G.I.R %",
            extra1: "Recent 5",
            extra2: "Par Save",
            extra3: "Avg. Putts"
        },
        tierLogic: 'handicap',
        spinnerColor: "border-t-[#84cc16]"
    },
    BILLIARDS: {
        title: "공식 경기 성적표",
        subtitle: "OFFICIAL MATCH RECORDS",
        label: "경기",
        unit: "득점",
        themeColor: "text-[#10b981]",
        borderColor: "hover:border-[#10b981]/30",
        bgLight: "bg-[#10b981]/5",
        mainIcon: LucideSwords,
        listTitle: "최근 공식 매치 리스트",
        detailTitle: "경기 상세 매치 리포트",
        detailSubtitle: "OFFICIAL MATCH BREAKDOWN",
        statLabels: {
            total: "Games",
            score: "Points",
            best: "Win %",
            bestVal: "Best AVG",
            extra1: "Recent 10",
            extra2: "공타율",
            extra3: "Best HR"
        },
        tierLogic: 'average',
        spinnerColor: "border-t-[#10b981]"
    }
};

// Extended interface to handle potentially missing properties safely
export interface ExtendedGameHistory extends Omit<HiqGameHistory, 'isRanked' | 'isWinner' | 'highRun' | 'inningData'> {
    isRanked?: boolean;
    isWinner?: boolean;
    highRun?: number;
    inningData?: any;
    average: string;
}
