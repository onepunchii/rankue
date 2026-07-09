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
        subtitle: "공식 라운딩 기록",
        label: "라운딩",
        unit: "타수",
        themeColor: "text-brand",
        borderColor: "hover:border-brand/30",
        bgLight: "bg-brand/5",
        mainIcon: LucideHistory,
        listTitle: "최근 공식 라운딩 리스트",
        detailTitle: "라운딩 상세 리포트",
        detailSubtitle: "라운딩 상세 분석",
        statLabels: {
            total: "총 라운드",
            score: "평균 타수",
            best: "베스트 스코어",
            bestVal: "G.I.R %",
            extra1: "최근 5R",
            extra2: "파 세이브",
            extra3: "버디+"
        },
        tierLogic: 'handicap',
        spinnerColor: "border-t-brand"
    },
    BILLIARDS: {
        title: "공식 경기 성적표",
        subtitle: "공식 경기 기록",
        label: "경기",
        unit: "득점",
        themeColor: "text-brand",
        borderColor: "hover:border-brand/30",
        bgLight: "bg-brand/5",
        mainIcon: LucideSwords,
        listTitle: "최근 공식 매치 리스트",
        detailTitle: "경기 상세 매치 리포트",
        detailSubtitle: "경기 상세 분석",
        statLabels: {
            total: "경기수",
            score: "평균 득점",
            best: "승률",
            bestVal: "최고 에버",
            extra1: "최근 10",
            extra2: "공타율",
            extra3: "최고 HR"
        },
        tierLogic: 'average',
        spinnerColor: "border-t-brand"
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
