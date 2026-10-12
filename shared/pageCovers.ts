/**
 * 공개 페이지의 표지 그림(2026-10-12 오너: "골프 플레이어 페이지나 당구 플레이어 페이지에 이미지 넣을 만한 거 넣어서 시각적으로 좋게 …
 * 지금 골프 플레이어나 당구 플레이어 그리고 매장 등 조금 아쉬운 부분을 이미지 제작해서 더 시각적으로 풍부하고 디자인 업그레이드").
 *
 * 선수 · 매장 페이지 맨 위에 놓는 가로 띠 그림 — 도장첩 표지와 같은 화풍(스크린 인쇄 포스터)으로 우리가 그렸다.
 * **장식이다**: 그 선수 · 그 매장의 사진이 아니다(실제 사람 · 실제 매장 · 로고를 그리지 않았다). 그래서 종류마다 한 장을 돌려 쓴다.
 *   당구 세계랭킹 선수   부문마다 한 장(남자 · 여자 · 주니어)
 *   PBA 선수          대회장 한 장
 *   골프 선수          투어마다 한 장(남자 세계 · 여자 세계 · KPGA · KLPGA)
 *   매장             네 장을 매장 코드로 나눠 쓴다(이웃한 매장이 같은 그림이 되지 않게) + 매장 찾기 한 장
 *
 * 그림 파일은 client/public/covers/<이름>.webp (880×440). 어느 페이지에 어느 그림인지는 여기 한 곳에서 정한다 — 화면 시험이 읽는다.
 * ⚠️ 서버도 임포트할 수 있는 shared 파일 — 상대 임포트를 쓰게 되면 './x.js'.
 */
export const coverSrc = (name: string) => `/covers/${name}.webp`;

const UMB: Record<string, string> = { players: "umb-players", ladies: "umb-ladies", juniors: "umb-juniors" };
/** 당구 세계랭킹 선수 — 부문(players · ladies · juniors). 모르는 부문은 남자 부문 그림 */
export const umbCover = (category: string | null | undefined) => coverSrc(UMB[category ?? ""] ?? UMB.players);

export const PBA_COVER = coverSrc("pba");

const GOLF: Record<string, string> = { owgr: "golf-owgr", rolex: "golf-rolex", kpga: "golf-kpga", klpga: "golf-klpga" };
/** 골프 선수 — 투어(owgr · rolex · kpga · klpga). 모르는 투어는 남자 세계 그림 */
export const golferCover = (tour: string | null | undefined) => coverSrc(GOLF[tour ?? ""] ?? GOLF.owgr);

/** 매장 페이지의 네 장 — 공 · 큐 걸이 · 주판알 점수판 · 당구장 */
export const STORE_COVERS: readonly string[] = ["store-balls", "store-cues", "store-score", "store-hall"];
/** 매장 찾기(목록)의 그림 */
export const STORES_COVER = coverSrc("store-hall");
/**
 * 매장 코드 → 네 장 가운데 하나. 같은 매장은 늘 같은 그림이다(새로 고칠 때마다 바뀌지 않는다).
 * 코드의 끝 숫자로 나누면 잇닿은 번호(C00007 · C00008)가 서로 다른 그림을 받는다.
 */
export function storeCover(code: string | null | undefined): string {
    const s = String(code ?? "");
    let n = 0;
    for (let i = 0; i < s.length; i++) n = (n * 31 + s.charCodeAt(i)) >>> 0;
    const digits = s.replace(/\D/g, "");
    const idx = digits ? Number(digits.slice(-6)) % STORE_COVERS.length : n % STORE_COVERS.length;
    return coverSrc(STORE_COVERS[idx]);
}

/**
 * 매장 '명예의 전당'의 빈 자리 — 초록 방석 위의 빈 왕관(금테 에나멜 화풍, 바탕을 따낸 그림 300×300).
 * 아직 초대 대장이 없는 매장에서 의자 이모지 대신 놓는다.
 */
export const STORE_THRONE = coverSrc("store-throne");

/** 쓰는 그림 전부 — 파일이 다 있는지 시험이 본다 */
export const ALL_COVERS: readonly string[] = [...Object.values(UMB), "pba", ...Object.values(GOLF), ...STORE_COVERS];
