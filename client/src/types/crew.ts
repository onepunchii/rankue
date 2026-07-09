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
    sportCategory: 'GOLF' | 'BILLIARDS' | 'MIXED';
    maxMembers: number | null;
    meetingDay: string | null;
    meetingTime: string | null;
    memberCount?: number;
    introQuestions?: { id: string; text: string; required: boolean; }[];
}
