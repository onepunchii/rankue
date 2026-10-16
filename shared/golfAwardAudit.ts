/**
 * 골프 › 보상 맞춰 보기(2026-10-17 어드민 전수 조사 골프 ③ — "기록을 무효화해도 이미 받은 보상은 남는다").
 * 큐 케이스 · 수족관 장식과 같은 선: 운영자가 마음대로 거두지 않는다 — **지금 기록이 받쳐 주지 않는** 볼마커 · 트로피 · 핀 · 태그만 거둔다.
 * 판정은 받을 때와 같은 것(golf.repo golfAwardsDue — 인증 도장 · 업적 핀 · 볼마커 등급 · 시즌 태그 · 한정 볼마커).
 * 라운드를 '무효화'하거나 '미인증으로' 내리면 도장이 빠지고, 그 도장으로 받은 것이 여기서 '받쳐 주지 않음'이 된다. 증정한 것은 '굿즈 · 배지'에서 회수.
 * 거둔 번호(serial)는 비운 채로 둔다 — 다른 사람의 번호를 당기지 않는다.
 */
import { golfGoods } from "./goodsGolfHiking.js";
import type { StampAwardKind } from "./golfStampAwards.js";

export interface GolfAwardAuditRow {
    /** "pin:break-100" · "book:gangwon" */
    id: string; kind: StampAwardKind; key: string; serial: number; earnedAt: string;
    granted: boolean; supported: boolean; name: string; image: string | null;
}
export interface GolfAwardAuditMember { memberId: string; name: string; rows: GolfAwardAuditRow[]; unsupported: number; dueNotHeld: number }
export interface GolfAwardSweep {
    members: GolfAwardAuditMember[];
    failed: { memberId: string; name: string }[];
    /** 한 번에 다 못 본 사람(시간 한도) — 화면이 열 때 한 사람씩 맞춰 본다 */
    pending: { memberId: string; name: string; held: number }[];
}

/** 거둘 수 있는 줄 — 기록으로 받았는데(증정 아님) 지금 기록이 받쳐 주지 않는 것만 */
export const canTakeBackGolf = (r: Pick<GolfAwardAuditRow, "granted" | "supported">) => !r.granted && !r.supported;

const KIND_NAME: Record<string, string> = { book: "볼마커", all: "볼마커", trophy: "트로피", pin: "핀", black: "블랙 볼마커", pearl: "자개 볼마커", tag: "시즌 태그", special: "특별 볼마커" };

/** 이름 · 그림 — 증정 목록(올해 것)에 있으면 그 이름, 없으면(지난해 태그 등) 종류 이름 + 열쇠 */
export function golfAwardLabel(id: string, nowMs = Date.now()): { name: string; image: string | null } {
    const g = golfGoods(nowMs).find((x) => x.key === id);
    if (g) return { name: g.name, image: g.image };
    const [kind, ...rest] = id.split(":");
    return { name: `${KIND_NAME[kind] ?? kind} · ${rest.join(":")}`, image: null };
}
