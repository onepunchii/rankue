import { db } from "../db.js";
import { profiles } from "../../shared/schema.js";
import { eq } from "drizzle-orm";

// @핸들 — 글로벌 유니크 아이디. 동명이인 구분·검색·초대의 기본 식별자.
// 규칙: 소문자 영숫자와 _, 3~20자, 숫자로 시작 금지. 예약어 금지.

const RESERVED = new Set([
  "admin", "rankue", "support", "help", "api", "www", "root", "system",
  "official", "staff", "mod", "global", "rankue_official",
]);

export function normalizeHandle(raw: string): string | null {
  const h = raw.trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  if (h.length < 3 || h.length > 20) return null;
  if (/^[0-9]/.test(h)) return null;
  if (RESERVED.has(h)) return null;
  return h;
}

export async function isHandleTaken(handle: string): Promise<boolean> {
  const [row] = await db.select({ id: profiles.id }).from(profiles).where(eq(profiles.handle, handle));
  return !!row;
}

/**
 * 가입 시 자동 핸들 생성 — 이메일 앞부분(또는 폴백 'player') 정규화 후 충돌 시 숫자 붙여 재시도.
 * 유저 입력 없이 항상 성공해야 하므로 마지막 폴백은 랜덤 suffix.
 */
export async function generateHandle(seed?: string | null): Promise<string> {
  let base = normalizeHandle((seed ?? "").split("@")[0] ?? "") ?? "player";
  if (base === "player" || base.length < 3) base = "player";
  for (let i = 0; i < 30; i++) {
    const candidate = i === 0 && base !== "player"
      ? base
      : `${base}_${Math.floor(1000 + Math.random() * 9000)}`;
    const n = normalizeHandle(candidate);
    if (!n) continue;
    if (!(await isHandleTaken(n))) return n;
  }
  // 최후 폴백 — 사실상 도달 불가
  return `player_${Date.now().toString(36)}`;
}
