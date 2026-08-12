import { createRemoteJWKSet, jwtVerify, decodeJwt } from "jose";

// 소셜 로그인 id_token 서버 검증 — xong/mapix 검증 패턴 이식.
// 클라이언트가 받아온 토큰을 절대 신뢰하지 않고 발급사 JWKS로 서명·발급자·수신자를 검증한다.
// 구글: 웹(GIS)·iOS·Android 클라이언트 ID 어느 것으로 발급됐든 허용(콤마 구분 env).
// 애플: 네이티브(SIWA)는 aud가 앱 번들 ID, 웹은 Services ID — 둘 다 env로 허용.

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
const APPLE_JWKS = createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));

export type SocialIdentity = {
  sub: string;
  email: string | null;
  name: string | null;
};

function allowedAudiences(env: string | undefined): string[] {
  return (env ?? "").split(",").map((s) => s.trim()).filter(Boolean);
}

// 검증 실패 진단 로그 — 서명 검증 없이 클레임만 읽어 iss/aud/만료를 남긴다.
// PII(email·name)는 로그에 넣지 않는다. aud 불일치·만료·발급자 오류가 한눈에 보이게.
function logVerifyFailure(provider: string, idToken: string, err: unknown, allowed: string[]) {
  let claims: Record<string, unknown> = {};
  try {
    const p = decodeJwt(idToken);
    claims = { iss: p.iss, aud: p.aud, azp: (p as any).azp, expInSec: p.exp ? p.exp - Math.floor(Date.now() / 1000) : null };
  } catch { claims = { decode: "failed" }; }
  console.warn(`[social] ${provider} 토큰 검증 실패:`, (err as Error)?.message ?? err, "| claims:", JSON.stringify(claims), "| allowed aud:", allowed.length);
}

export async function verifyGoogleIdToken(idToken: string): Promise<SocialIdentity | null> {
  const audience = allowedAudiences(process.env.GOOGLE_CLIENT_IDS);
  if (audience.length === 0) {
    console.warn("[social] GOOGLE_CLIENT_IDS 미설정 — 구글 로그인 불가");
    return null; // 미설정 시 로그인 불가(안전 기본값)
  }
  try {
    const { payload } = await jwtVerify(idToken, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience,
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      name: typeof payload.name === "string" ? payload.name : null,
    };
  } catch (err) {
    logVerifyFailure("google", idToken, err, audience);
    return null;
  }
}

export async function verifyAppleIdToken(idToken: string): Promise<SocialIdentity | null> {
  const audience = allowedAudiences(process.env.APPLE_AUDIENCES ?? "com.rankue.app");
  try {
    const { payload } = await jwtVerify(idToken, APPLE_JWKS, {
      issuer: "https://appleid.apple.com",
      audience,
    });
    if (!payload.sub) return null;
    return {
      sub: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      name: null, // 애플은 id_token에 이름을 넣지 않음(최초 로그인 시 클라이언트가 별도 전달)
    };
  } catch (err) {
    logVerifyFailure("apple", idToken, err, audience);
    return null;
  }
}
