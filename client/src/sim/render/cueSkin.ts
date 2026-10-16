/**
 * 큐대 손잡이 그림 — 큐 케이스의 대표 큐(2026-10-16 오너: "이거 다 좋네" — 대표 큐를 게임 큐대에).
 * 그림은 큐 케이스와 같은 것(public/billiards/case/cue/<id>.webp, 1000×80 · 하대만 가로 · 왼쪽 범퍼 → 오른쪽 이음쇠).
 * 겉모습만 바뀐다 — 길이 · 굵기 · 힘 · 조준은 그대로다(레이팅 대전을 지킨다).
 *
 * 그림은 한 장씩 한 번만 부른다. 다 불러오면 skinVersion 이 오른다 — 렌더러는 그 값이 바뀌면 다시 그린다(needsFrame).
 * 불러오기 전 · 실패 · 없음이면 null → 예전의 나무 색 큐대.
 */
const cache = new Map<string, { img: HTMLImageElement; ready: boolean }>();
let version = 0;

export function cueSkin(url: string | null | undefined): HTMLImageElement | null {
    if (!url || typeof Image === "undefined") return null;
    let e = cache.get(url);
    if (!e) {
        const img = new Image();
        img.decoding = "async";
        const entry = { img, ready: false };
        img.onload = () => { entry.ready = true; version += 1; };
        img.onerror = () => { /* 기본 큐대로 남는다 */ };
        img.src = url;
        cache.set(url, entry);
        e = entry;
    }
    return e.ready ? e.img : null;
}

/** 다 불러온 그림이 늘 때마다 오른다 */
export const cueSkinVersion = (): number => version;
