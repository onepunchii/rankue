// GET /api/hiq/crews/:id/polls 응답 한 줄. isClosed·voterCount 는 2026-09-26 에 생긴 필드라
// 영속 캐시(localStorage)에 남은 옛 응답에는 없을 수 있다 — 화면은 둘 다 없을 때도 스스로 계산한다.
export interface PollOption {
    id: string;
    text: string;
    voteCount: number;
}

export interface CrewPoll {
    id: string;
    crewId: string;
    authorId: string;
    title: string;
    description: string | null;
    isAnonymous: boolean;
    allowMultiple: boolean;
    status: "active" | "closed" | string;
    endTime: string | null;
    createdAt: string;
    author?: { id: string; name: string | null; profileImageUrl: string | null } | null;
    options: PollOption[];
    myVoteIds: string[];
    totalVotes: number;
    voterCount?: number;
    isClosed?: boolean;
}

/** 옛 캐시 호환 — voterCount 가 없으면 단일 선택은 표 수가 곧 사람 수다(복수 선택은 근사치). */
export function voterCountOf(p: CrewPoll): number {
    return typeof p.voterCount === "number" ? p.voterCount : p.totalVotes ?? 0;
}
