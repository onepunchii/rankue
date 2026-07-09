
import { HiqMember } from "@shared/schema";

export interface HiqMemberWithH2H extends HiqMember {
    h2h?: {
        wins: number;
        losses: number;
        draws: number;
    };
    profileImageUrl?: string;
    nickname?: string;
}

export interface RecentOpponent extends HiqMember {
    lastGameScore: string;
    lastGameResult: 'win' | 'loss' | 'draw';
    playedAt: Date;
    profileImageUrl?: string;
    nickname?: string;
}

export interface SearchResult extends HiqMember {
    isFriend: boolean;
    hasPlayedTogether: boolean;
    profileImageUrl?: string;
    nickname?: string;
}

export interface SportConfig {
    label: string;
    title: string;
    subTitle: string;
    themeColor: string;
    bgColor: string;
    bgLight: string;
    borderColor: string;
    searchPlaceholder: string;
    actionText: string;
    emptyTitle: string;
    emptyDesc: string;
    glowColor: string;
}

export const SPORT_CONFIGS: Record<string, SportConfig> = {
    BILLIARDS: {
        label: "라이벌",
        title: "라이벌 리스트",
        subTitle: "Competitors Arena",
        themeColor: "text-brand",
        bgColor: "bg-brand",
        bgLight: "bg-brand/5",
        borderColor: "border-brand/20",
        searchPlaceholder: "닉네임 또는 전화번호 입력...",
        actionText: "라이벌 추가하기",
        emptyTitle: "아직 라이벌이 없네요",
        emptyDesc: "rivals",
        glowColor: "rgba(16, 185, 129, 0.1)"
    },
    GOLF: {
        label: "골프 친구",
        title: "골프 친구",
        subTitle: "Golf Companions",
        themeColor: "text-brand",
        bgColor: "bg-brand",
        bgLight: "bg-brand/5",
        borderColor: "border-brand/20",
        searchPlaceholder: "친구 닉네임 또는 번호...",
        actionText: "친구 추가하기",
        emptyTitle: "아직 등록된 친구가 없네요",
        emptyDesc: "companions",
        glowColor: "rgba(132, 204, 22, 0.1)"
    }
};
