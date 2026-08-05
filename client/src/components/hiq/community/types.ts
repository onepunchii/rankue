export type CommunityBoard = "brag" | "ask" | "store" | "lesson";

export interface CommunitySkillBadge {
    handi3c: number | null;
    handi4c: number | null;
    avg3c: number | null;
    avg4c: number | null;
}

export interface CommunityAuthor {
    id: string;
    name: string;
    profileImageUrl: string | null;
    badge: CommunitySkillBadge | null; // hideSkillBadge면 null
}

export interface CommunityGameCard {
    gameType: string;
    score: number;
    innings: number;
    average: string;
    isWinner: boolean;
    highRun: number;
    opponentName: string | null;
    playedAt: string;
}

export interface CommunityPost {
    id: string;
    board: CommunityBoard;
    authorId: string;
    title: string | null;
    content: string;
    images: string[] | null;
    gameCard: CommunityGameCard | null;
    tags: string[] | null;
    regionName: string | null;
    storeName: string | null;
    isBlinded: boolean;
    createdAt: string;
    author: CommunityAuthor;
    likeCount: number;
    commentCount?: number;
    isLiked: boolean;
}

export interface CommunityComment {
    id: string;
    postId: string;
    authorId: string;
    content: string;
    isBlinded: boolean;
    createdAt: string;
    author: CommunityAuthor;
}

export const BOARD_KEYS: Record<CommunityBoard, string> = {
    brag: "community.board.brag",
    ask: "community.board.ask",
    store: "community.board.store",
    lesson: "community.board.lesson",
};

// 목록(["/api/hiq/community/posts", board])과 상세([`/api/hiq/community/posts/${id}`])의
// 쿼리 키 모양이 달라 prefix 매칭이 안 된다 — 문자열 시작 기준으로 한 번에 무효화한다.
// (차단·삭제·좋아요가 상세 화면에 반영 안 되던 원인)
export const invalidateCommunityPosts = (queryClient: { invalidateQueries: (f: any) => any }) =>
    queryClient.invalidateQueries({
        predicate: (q: any) => typeof q.queryKey?.[0] === "string" && q.queryKey[0].startsWith("/api/hiq/community/posts"),
    });
