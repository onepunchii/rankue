/**
 * 내 사진첩의 자료(2026-10-13) — GET /api/hiq/hiking/me/album(산마다 묶은 내 사진, shared/hikingAlbum).
 * 등산을 쓸 수 있는 회원만 묻는다 — 그 밖의 사람에게는 사진첩이 없다(album 은 null, 아무것도 그리지 않는다).
 * 사진을 올리거나 지우거나 공개 여부를 바꾸면 같이 다시 받는다(photos/photoApi refreshHikingPhotos).
 */
import { useQuery } from "@tanstack/react-query";
import { useHikingAccess } from "@/hooks/useHikingAccess";
import type { HikingAlbum } from "@shared/hikingAlbum";
import { HIKING_ALBUM_KEY } from "../photos/photoApi";

export interface MyHikingAlbum {
    /** 등산을 쓸 수 있는 회원인가 — 아니면 사진첩이 없다 */
    mine: boolean;
    album: HikingAlbum | null;
    isLoading: boolean;
    isError: boolean;
    refetch: () => void;
}

export function useHikingAlbum(): MyHikingAlbum {
    const mine = useHikingAccess();
    const q = useQuery<HikingAlbum>({ queryKey: HIKING_ALBUM_KEY, enabled: mine, staleTime: 60_000 });
    // 기기에 남은 옛 답이 다른 모양이어도 화면이 깨지지 않게 — 묶음이 배열일 때만 쓴다
    const album = mine && q.data && Array.isArray(q.data.mountains) ? q.data : null;
    return { mine, album, isLoading: mine && q.isLoading, isError: mine && q.isError && !album, refetch: () => { void q.refetch(); } };
}
