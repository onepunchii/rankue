export interface MemberProfile {
    id: string;
    nickname: string | null;
    name: string | null;
    profileImageUrl: string | null;
    avg4c: number | null;
    golfHandicap: number | null;
    golfAvgScore: number | null;
    phone: string | null;
}

export interface CrewMember {
    member: MemberProfile;
    role: 'leader' | 'manage' | 'member' | 'pending';
    joinedAt: string;
}

export interface CrewData {
    id: string;
    name: string;
    description: string | null;
    shortIntro: string | null;
    emblem: string | null;
    coverImage: string | null;
    /** HIKING = 산악회(2026-10-13) — 당구 · 골프의 칸(주 종목 · 베이스캠프 · 종목 기록)이 없다 */
    sportCategory: 'GOLF' | 'BILLIARDS' | 'MIXED' | 'HIKING' | 'FISHING';
    maxMembers: number | null;
    joinType?: 'auto' | 'approval' | null;
    gameType?: string | null;
    tags?: string[] | null;
    meetingDay: string | null;
    meetingTime: string | null;
    memberCount?: number;
    introQuestions?: { id: string; text: string; required: boolean; }[];
}
