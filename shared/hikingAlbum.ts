/**
 * 등산 — 내 사진첩(2026-10-13 오너: "도장첩에 사진첩 버튼이 있어서 … 사진첩이 있으면 내가 사진으로 해당 산을 볼 수 있어야 되지 않을까").
 *
 * 산마다 들어가야만 보이던 내 산행 사진을 한 곳에 모은다 — 산마다 한 권씩(새로 올린 산부터), 그리고 전체를 달마다.
 *  - **내 사진만** 모인다(비공개 · 가려진 것까지 — 올린 사람에게만 나가는 길이다). 남이 무엇을 올렸는지는 여기 없다.
 *  - 올리기 · 공개/비공개 · 지우기 · 이의제기는 **산 화면에 그대로** 둔다(client/src/hiking/photos/MyPhotos). 사진첩은 보는 곳이다.
 *  - 좌표는 어디에도 없다 — 어느 산의 사진인지와 올린 때만(shared/hikingPhotos 와 같은 약속). 묶을 때 사진의 칸을 하나씩 골라 담는다.
 *  - 한 번에 싣는 수에 끝이 있다(HIKING_ALBUM_MAX). 넘으면 새 것부터 싣고 capped 로 알린다.
 * 순수 값 · 함수만. ⚠️ 서버가 임포트하는 shared 파일 — 상대 임포트는 반드시 './x.js'.
 */
import { hikingPhotoMonth, type HikingPhoto } from "./hikingPhotos.js";

export const HIKING_ALBUM_PATH = "/hiking/album";
/** 사진첩 한 번에 싣는 사진의 끝(새 것부터) */
export const HIKING_ALBUM_MAX = 600;
/** 그 산의 사진만 펼친 주소 — 뒤로 가기 · 링크가 되게 주소에 둔다 */
export const hikingAlbumMountainPath = (slug: string): string => `${HIKING_ALBUM_PATH}?m=${encodeURIComponent(slug)}`;

/** 묶을 때 쓰는 산의 값 — 이름 · 높이 · 권역뿐이다(자리는 받지 않는다) */
export interface AlbumMountainInfo { id: string; slug: string; name: string; heightM: number | null; region: string | null }
/** 사진첩의 한 권 — 산 한 곳 */
export interface HikingAlbumMountain {
    mountainId: string; slug: string; name: string; heightM: number | null; region: string | null;
    count: number;
    /** 이 산에 마지막으로 올린 때(ISO) */
    latestAt: string;
    /** 새 것부터 */
    photos: HikingPhoto[];
}
export interface HikingAlbum {
    /** 실린 사진의 수 */
    total: number;
    /** 새로 올린 산부터 */
    mountains: HikingAlbumMountain[];
    /** 끝(HIKING_ALBUM_MAX)을 넘어 오래된 사진이 빠졌다 */
    capped: boolean;
}

const when = (iso: string): number => { const t = Date.parse(iso); return Number.isNaN(t) ? 0 : t; };
/** 내보내는 칸만 골라 담는다 — 부르는 쪽이 더 많은 칸을 가진 줄을 넘겨도 딸려 나가지 않게 */
const pick = (p: HikingPhoto): HikingPhoto => ({
    id: p.id, mountainId: p.mountainId, url: p.url, thumbUrl: p.thumbUrl, width: p.width, height: p.height, takenAt: p.takenAt,
    isPublic: p.isPublic === true, hidden: p.hidden === true, appealed: p.appealed === true,
});

/**
 * 내 사진을 산마다 묶는다 — 사진은 새 것부터, 산은 마지막으로 올린 때가 새로운 것부터.
 * 산의 표에 없는 산의 사진은 뺀다(주소를 만들 수 없다). 같은 사진이 두 번 오면 한 번만 싣는다.
 */
export function groupHikingAlbum(
    photos: readonly HikingPhoto[],
    mountainOf: (mountainId: string) => AlbumMountainInfo | null | undefined,
    limit: number = HIKING_ALBUM_MAX,
): HikingAlbum {
    const max = Math.min(Math.max(Math.floor(limit) || 0, 0), HIKING_ALBUM_MAX);
    const seen = new Set<string>();
    const sorted = photos
        .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
        .map((p, i) => ({ p, i, t: when(p.takenAt) }))
        .sort((a, b) => b.t - a.t || a.i - b.i);
    const by = new Map<string, HikingAlbumMountain>();
    for (const { p } of sorted.slice(0, max)) {
        let g = by.get(p.mountainId);
        if (!g) {
            const m = mountainOf(p.mountainId);
            if (!m) continue;
            g = { mountainId: m.id, slug: m.slug, name: m.name, heightM: m.heightM ?? null, region: m.region ?? null, count: 0, latestAt: p.takenAt, photos: [] };
            by.set(p.mountainId, g);
        }
        g.photos.push(pick(p));
        g.count = g.photos.length;
    }
    const mountains = Array.from(by.values());
    return { total: mountains.reduce((a, m) => a + m.count, 0), mountains, capped: sorted.length > max };
}

/** 표지로 쓸 한 장 — 가장 새 사진. 가려진 사진은 뒤로 미룬다(가려진 것뿐이면 그것이라도) */
export const albumCover = (photos: readonly HikingPhoto[]): HikingPhoto | null => photos.find((p) => !p.hidden) ?? photos[0] ?? null;

/** 전체 보기 — 모든 산의 사진을 새 것부터 */
export function albumAllPhotos(album: Pick<HikingAlbum, "mountains">): HikingPhoto[] {
    return album.mountains
        .flatMap((m) => m.photos)
        .map((p, i) => ({ p, i, t: when(p.takenAt) }))
        .sort((a, b) => b.t - a.t || a.i - b.i)
        .map((x) => x.p);
}

export interface AlbumMonth { month: string; photos: HikingPhoto[] }
/** 달마다 나눈다("2026년 10월", 한국 시각) — 넘겨받은 순서를 지킨다. 때를 읽을 수 없는 사진은 맨 끝의 한 묶음으로 */
export function albumMonths(photos: readonly HikingPhoto[]): AlbumMonth[] {
    const by = new Map<string, HikingPhoto[]>();
    for (const p of photos) {
        const month = hikingPhotoMonth(p.takenAt);
        const list = by.get(month);
        if (list) list.push(p); else by.set(month, [p]);
    }
    const out = Array.from(by, ([month, list]) => ({ month, photos: list }));
    return [...out.filter((x) => x.month), ...out.filter((x) => !x.month).map((x) => ({ ...x, month: HIKING_ALBUM_LABEL.noDate }))];
}

/** 입구(도장첩 책장)에 놓는 작은 사진 몇 장 — 새 것부터, 가려진 사진은 빼고 */
export function albumThumbs(album: Pick<HikingAlbum, "mountains">, n = 3): HikingPhoto[] {
    return albumAllPhotos(album).filter((p) => !p.hidden).slice(0, Math.max(0, n));
}

/** 도장첩의 칸이 찾는 값 — 산의 id 로 그 산의 사진 수와 표지 */
export interface AlbumSlot { slug: string; count: number; cover: HikingPhoto }
export function albumSlots(album: Pick<HikingAlbum, "mountains"> | null | undefined): Map<string, AlbumSlot> {
    const out = new Map<string, AlbumSlot>();
    for (const m of album?.mountains ?? []) {
        const cover = albumCover(m.photos);
        if (cover) out.set(m.mountainId, { slug: m.slug, count: m.count, cover });
    }
    return out;
}

/** "산 3곳 · 사진 12장" */
export const albumCountLine = (mountains: number, photos: number): string => `산 ${mountains.toLocaleString("en-US")}곳 · 사진 ${photos.toLocaleString("en-US")}장`;
/** "사진 12장" */
export const albumPhotoCount = (n: number): string => `사진 ${n.toLocaleString("en-US")}장`;

export const HIKING_ALBUM_LABEL = {
    title: "내 사진첩",
    /** 도장첩 책장 · 배낭의 입구 — 사진이 아직 없을 때의 한 줄 */
    entryEmpty: "산에서 올린 사진이 산마다 모여요",
    viewMountains: "산마다",
    viewAll: "전체",
    /** 올리기 · 공개/비공개 · 지우기는 산 화면에 있다 */
    manage: "이 산에서 사진 올리기 · 관리",
    seeMountain: "이 산의 사진 모두 보기",
    empty: "산 화면이나 산행 중에 올린 사진이 여기에 산마다 모여요.",
    emptyButton: "산 찾기",
    /** ?m= 의 산에 내 사진이 없을 때 */
    noneHere: "이 산에는 아직 올린 사진이 없어요.",
    backToAlbum: "사진첩 전체 보기",
    capped: `최근 ${HIKING_ALBUM_MAX}장까지 모아 보여요. 더 오래된 사진은 그 산의 화면에 있어요.`,
    failed: "사진첩을 불러오지 못했어요. 잠시 뒤에 다시 열어 주세요.",
    retry: "다시 불러오기",
    onlyMine: "내가 올린 사진만 모여요. 비공개 사진도 여기서는 보여요.",
    noDate: "날짜를 모르는 사진",
    /** 도장첩 한 권의 보기 전환 */
    bookStamp: "도장",
    bookPhoto: "사진",
    /** 구역 제목 옆의 한 줄 — 좁은 화면(360)에서 제목과 한 줄에 들어가게 짧게 */
    bookPhotoAside: "사진을 누르면 사진첩으로",
} as const;
