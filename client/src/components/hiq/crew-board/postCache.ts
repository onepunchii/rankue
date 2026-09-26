/**
 * 크루 글 목록 캐시 도우미.
 *
 * 글은 두 군데 캐시에 산다: 첫 쪽은 club-detail 이 [`/api/hiq/crews/:id/posts`] 로 부르고, '더 보기' 로 이어 붙인
 * 옛 쪽은 게시판 탭이 [`/posts`, "older", ...] (무한 쿼리) 로 부른다. 둘 다 첫 원소가 같아서
 * invalidateQueries({ queryKey: [postsKey] }) 한 번이면 같이 새로 받는다. 좋아요처럼 즉시 바꾸는 것은 둘 다 고친다.
 */
import { useCallback, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { queryClient as defaultClient } from "@/lib/queryClient";

export const postsKey = (crewId: string) => `/api/hiq/crews/${crewId}/posts`;
export const photosKey = (crewId: string) => `/api/hiq/crews/${crewId}/photos`;

type AnyPost = { id: string; [k: string]: any };
type Infinite = { pages: unknown[]; pageParams: unknown[] };
const isInfinite = (v: unknown): v is Infinite => !!v && typeof v === "object" && Array.isArray((v as any).pages);

function mapPosts(data: unknown, fn: (list: AnyPost[]) => AnyPost[]): unknown {
    if (Array.isArray(data)) return fn(data as AnyPost[]);
    if (isInfinite(data)) return { ...data, pages: data.pages.map((pg) => (Array.isArray(pg) ? fn(pg as AnyPost[]) : pg)) };
    return data;
}

/** 모든 글 캐시(첫 쪽·옛 쪽)에서 그 글을 고친다. 되돌리기용 스냅숏을 돌려준다. */
export function patchPostInCaches(qc: QueryClient, crewId: string, postId: string, patch: (p: AnyPost) => AnyPost) {
    const snapshot = qc.getQueriesData({ queryKey: [postsKey(crewId)] });
    qc.setQueriesData({ queryKey: [postsKey(crewId)] }, (old: unknown) =>
        mapPosts(old, (list) => list.map((p) => (p?.id === postId ? patch(p) : p))));
    return () => { for (const [key, data] of snapshot) qc.setQueryData(key, data); };
}

export function findPostInCaches(qc: QueryClient, crewId: string, postId: string): AnyPost | undefined {
    for (const [, data] of qc.getQueriesData({ queryKey: [postsKey(crewId)] })) {
        const lists = Array.isArray(data) ? [data] : isInfinite(data) ? data.pages : [];
        for (const list of lists) {
            if (!Array.isArray(list)) continue;
            const hit = (list as AnyPost[]).find((p) => p?.id === postId);
            if (hit) return hit;
        }
    }
    return undefined;
}

/**
 * 캐시에 있는 최신 글을 읽는다(없으면 넘겨받은 글). 상세 창이 연 순간의 글을 복사해 두면 좋아요·댓글 수가
 * 굳은 채로 보였다(고정 공지에서 연 상세가 그랬다). 캐시가 바뀔 때마다 다시 읽는다.
 */
export function useLivePost<T extends AnyPost>(post: T | null | undefined, qc: QueryClient = defaultClient): T | null {
    const crewId = post?.crewId as string | undefined;
    const postId = post?.id;
    const subscribe = useCallback((cb: () => void) => qc.getQueryCache().subscribe(cb), [qc]);
    const getSnapshot = useCallback(
        () => (crewId && postId ? (findPostInCaches(qc, crewId, postId) as T | undefined) : undefined),
        [qc, crewId, postId],
    );
    const live = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
    return live ?? post ?? null;
}

/** 서버 수(예전엔 bigint 문자열)를 숫자로 — 옛 캐시(persist)에 문자열이 남아 있어도 "3"+1 이 "31" 이 되지 않게. */
export const num = (v: unknown): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};
