// 네이티브 푸시 발송 — shell-kit 표준(농사/xong 이식). SDK 없이 손수 배선.
// 토큰 형식으로 플랫폼 자동 판별: 'fcm:'/'apns:' 접두사, 없으면 64자 hex = APNs(iOS), 그 외 = FCM(안드로이드).
// env 없으면 조용히 비활성: FIREBASE_SERVICE_ACCOUNT(JSON), APNS_KEY/KEY_ID/TEAM_ID/TOPIC(com.rankue.app).
// 웹 푸시는 2026-09-11 오너 결정으로 없앴다 — FCM 은 이제 안드로이드 앱 전용이다.
import { createSign } from 'node:crypto';
import http2 from 'node:http2';

/**
 * tag    — "같은 대화면 이전 알림을 새 알림으로 바꿔 끼운다"는 키. 안드로이드 notification.tag, iOS apns-collapse-id.
 *          기본은 없음(알림마다 새로 뜬다). 예전엔 종목('BILLIARDS')이 들어가서 안드로이드 트레이에 늘 1개만 남았다(감사 P5).
 * group  — iOS 알림 센터 묶음(thread-id). 지우지 않고 묶기만 한다.
 * ttlSec — 이 시간 안에 못 전하면 버린다(기기가 꺼져 있었던 경우). 없으면 FCM 기본 4주 보관.
 */
export type PushPayload = { title: string; body: string; url?: string; tag?: string; group?: string; ttlSec?: number };

/**
 * 발송 결과.
 * ok     — 전달됨
 * dead   — 토큰이 죽었다(앱 삭제·재설치·만료). 호출부가 지운다.
 * noenv  — 서버에 푸시 설정(env)이 아예 없다.
 * config — 우리 쪽 설정·페이로드가 틀렸다(인증 실패, 다른 Firebase 프로젝트, 토픽 오설정 등).
 *          토큰은 멀쩡하니 지우면 안 된다 — 지우면 설정 한 번 틀릴 때 전 회원 토큰이 날아간다.
 * failed — 일시 장애(429·5xx·네트워크·시간 초과) 또는 알 수 없는 응답. 토큰 유지.
 */
export type PushResult = 'ok' | 'dead' | 'noenv' | 'config' | 'failed';
export type PushOutcome = { result: PushResult; platform: 'fcm' | 'apns'; reason?: string };

/** 안드로이드 기본 알림 채널. 새 바이너리는 이 채널을 만든다(한국어 이름·헤드업).
 *  이 채널이 없는 구 바이너리(1.0.2)에서도 안전하다 — FCM SDK 는 없는 채널이면 경고만 남기고
 *  매니페스트 기본값/폴백 채널로 띄운다. */
export const ANDROID_CHANNEL_ID = 'rankue_default';

// 상대 푸시 서버가 멈추면 서버리스 함수가 상한까지 매달린다(감사 P13). 요청마다 상한을 둔다.
const SEND_TIMEOUT_MS = 8000;

/* ── 토큰 판별 ── */
const APNS_HEX = /^[0-9a-fA-F]{64}$/;

export function parsePushToken(raw: string): { platform: 'fcm' | 'apns'; token: string } {
  if (raw.startsWith('apns:')) return { platform: 'apns', token: raw.slice(5) };
  if (raw.startsWith('fcm:')) return { platform: 'fcm', token: raw.slice(4) };
  return { platform: APNS_HEX.test(raw) ? 'apns' : 'fcm', token: raw }; // 프리픽스 없으면 형식 판별
}

/** 같은 기기 토큰을 DB 에서 찾을 때 쓸 표기들 — 접두사 붙은 것과 맨 토큰(옛 래퍼 시절 저장분). */
export function pushTokenVariants(raw: string): string[] {
  const { platform, token } = parsePushToken(raw);
  return Array.from(new Set([raw, token, `${platform}:${token}`]));
}

// 설정 오류는 수신자마다 똑같이 터진다(방송 300명이면 300줄). 같은 원인은 인스턴스당 1분에 한 번만 크게 찍는다.
const loudLoggedAt = new Map<string, number>();
function loud(key: string, msg: string) {
  const now = Date.now();
  if ((loudLoggedAt.get(key) ?? 0) > now - 60_000) return;
  loudLoggedAt.set(key, now);
  console.error(msg);
}

/* ── FCM (안드로이드) ── */
type SA = { project_id: string; client_email: string; private_key: string };
let sa: SA | null | undefined;
let fcmToken: { token: string; exp: number } | null = null;

function serviceAccount(): SA | null {
  if (sa !== undefined) return sa;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) { sa = null; return sa; }

  try {
    sa = JSON.parse(raw) as SA;
    return sa;
  } catch { /* 아래에서 한 번 보정해 본다 */ }

  // 서비스 계정 JSON을 환경변수에 넣을 때, private_key 안의 "\n"이 실제 줄바꿈으로
  // 저장되는 일이 흔하다(붙여넣기/CLI 경유). 그러면 JSON 문자열 리터럴 안에 제어문자가
  // 들어가 JSON.parse가 통째로 실패하고 → serviceAccount()가 null → FCM이 조용히 'skip'된다.
  // 실제로 이 상태로 안드로이드 푸시가 전혀 나가지 않고 있었어서, 값을 고치지 않아도
  // 동작하도록 파서 쪽에서 방어한다.
  try {
    const repaired = raw.replace(
      /"private_key"\s*:\s*"([\s\S]*?)"(\s*[,}])/,
      (_m, key: string, tail: string) =>
        `"private_key": "${key.replace(/\r/g, "").replace(/\n/g, "\\n")}"${tail}`,
    );
    sa = JSON.parse(repaired) as SA;
    console.warn("[Push] FIREBASE_SERVICE_ACCOUNT의 private_key 개행을 보정해 파싱했습니다. 환경변수 값을 정상 JSON으로 교체하는 것을 권장합니다.");
  } catch (e) {
    console.error("[Push] FIREBASE_SERVICE_ACCOUNT 파싱 실패 — 안드로이드 푸시가 비활성화됩니다:", (e as Error)?.message);
    sa = null;
  }
  return sa;
}

async function fcmAccessToken(acc: SA): Promise<{ token: string } | { error: string; transient: boolean }> {
  if (fcmToken && Date.now() < fcmToken.exp) return { token: fcmToken.token };
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'RS256', typ: 'JWT' })}.${enc({
    iss: acc.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })}`;
  const sig = createSign('RSA-SHA256').update(unsigned).sign(acc.private_key, 'base64url');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${sig}`,
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (!res.ok) {
    // 구글 OAuth 오류 본문은 {"error":"invalid_grant",...} 수준이라 키가 섞이지 않는다.
    const text = await res.text().catch(() => '');
    return { error: `OAuth ${res.status} ${text.slice(0, 160)}`, transient: res.status === 429 || res.status >= 500 };
  }
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return { error: 'OAuth 응답에 access_token 없음', transient: false };
  fcmToken = { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 3600) - 600) * 1000 };
  return { token: j.access_token };
}

/** FCM v1 발송 본문. 순수 함수 — 테스트가 여기를 본다. */
export function buildFcmMessage(token: string, p: PushPayload) {
  const notification: Record<string, string> = { channel_id: ANDROID_CHANNEL_ID, icon: 'ic_stat_notify', color: '#64DD17' };
  if (p.tag) notification.tag = p.tag;
  const ttl = p.ttlSec && p.ttlSec > 0 ? Math.round(p.ttlSec) : 0;
  return {
    message: {
      token,
      notification: { title: p.title, body: p.body },
      data: { url: p.url ?? '/' },
      android: { ...(ttl ? { ttl: `${ttl}s` } : {}), notification },
    },
  };
}

type FcmError = {
  code?: number; status?: string; message?: string;
  details?: Array<{ '@type'?: string; errorCode?: string; fieldViolations?: Array<{ field?: string; description?: string }> }>;
};

/**
 * FCM 오류 응답 분류(https://firebase.google.com/docs/cloud-messaging/error-codes).
 * 400 INVALID_ARGUMENT 는 페이로드가 틀려도 온다 — 그때 토큰을 지우면 페이로드 버그 한 번에 멀쩡한 회원 토큰이
 * 발송마다 지워진다(감사 P6). 그래서 토큰이 틀렸다고 명시될 때만 dead 로 본다.
 */
export function classifyFcmError(status: number, bodyText: string): { result: PushResult; code: string; reason: string } {
  let err: FcmError | undefined;
  try { err = (JSON.parse(bodyText) as { error?: FcmError })?.error; } catch { err = undefined; }
  const details = Array.isArray(err?.details) ? err!.details! : [];
  const code = details.find((d) => typeof d?.errorCode === 'string')?.errorCode ?? err?.status ?? '';
  const message = typeof err?.message === 'string' ? err.message : '';
  const reason = `FCM ${status} ${code || '(오류 본문 없음)'}${message ? ` — ${message.slice(0, 160)}` : ''}`;

  // 죽은 토큰(앱 삭제)은 FCM 이 늘 UNREGISTERED 로 명시한다. 그것 말고는 404 라도 지우지 않는다 —
  // 서비스 계정 project_id 가 틀렸거나 그 프로젝트에 FCM 이 꺼져 있어도 구글은 NOT_FOUND 404 로 답한다.
  // 그걸 죽은 토큰으로 보면 발송할 때마다 멀쩡한 회원 토큰이 하나씩 지워진다.
  if (code === 'UNREGISTERED') return { result: 'dead', code, reason };
  if (status === 404 && err) return { result: 'config', code, reason };
  // 다른 Firebase 프로젝트에서 발급된 토큰. 서버 서비스 계정이 엉뚱한 프로젝트면 전 회원이 이 오류라서 지우면 안 된다.
  if (code === 'SENDER_ID_MISMATCH') return { result: 'config', code, reason };
  if (status === 400 || code === 'INVALID_ARGUMENT') {
    const tokenField = details.some((d) => d?.fieldViolations?.some((v) => v?.field === 'message.token'));
    if (tokenField || /registration token/i.test(message)) return { result: 'dead', code, reason };
    return { result: 'config', code, reason }; // 페이로드가 틀렸다
  }
  if (status === 401 || status === 403) return { result: 'config', code, reason }; // 인증·권한
  return { result: 'failed', code, reason }; // 429 QUOTA_EXCEEDED, 5xx UNAVAILABLE/INTERNAL, 그 밖
}

async function sendFcm(token: string, payload: PushPayload): Promise<PushOutcome> {
  const acc = serviceAccount();
  if (!acc) return { result: 'noenv', platform: 'fcm', reason: 'FIREBASE_SERVICE_ACCOUNT 없음' };
  const auth = await fcmAccessToken(acc);
  if ('error' in auth) {
    if (auth.transient) return { result: 'failed', platform: 'fcm', reason: auth.error };
    loud('fcm-oauth', `[Push] FCM 접근 토큰 발급 실패 — ${auth.error}. 서비스 계정(project_id=${acc.project_id})의 키가 폐기됐거나 잘못됐다. 이 상태면 안드로이드 푸시가 한 건도 나가지 않는다.`);
    return { result: 'config', platform: 'fcm', reason: auth.error };
  }
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(buildFcmMessage(token, payload)),
    signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
  });
  if (res.ok) return { result: 'ok', platform: 'fcm' };
  const c = classifyFcmError(res.status, await res.text().catch(() => ''));
  if (res.status === 401) fcmToken = null; // 캐시한 접근 토큰이 폐기됐을 수 있다 — 다음 발송 때 새로 받는다
  if (c.result === 'config') {
    loud(`fcm-${res.status}-${c.code}`, c.code === 'SENDER_ID_MISMATCH'
      ? `[Push] FCM SENDER_ID_MISMATCH — 이 토큰은 서버 서비스 계정의 Firebase 프로젝트(project_id=${acc.project_id})가 아닌 다른 프로젝트에서 발급됐다. 안드로이드 앱(google-services.json)은 rankue-a0493 이다. 안드로이드 회원 모두에게서 이 오류가 나면 Vercel 의 FIREBASE_SERVICE_ACCOUNT 를 rankue-a0493 의 서비스 계정 키로 바꿔야 한다. 토큰은 지우지 않는다.`
      : `[Push] FCM 설정 오류(${c.reason}) — 서비스 계정 project_id=${acc.project_id}. 토큰 문제가 아니라서 지우지 않는다.`);
  }
  return { result: c.result, platform: 'fcm', reason: c.reason };
}

/* ── APNs (iOS) ── */
const APNS_PROD = 'api.push.apple.com';
const APNS_SANDBOX = 'api.sandbox.push.apple.com';
let apnsJwtCache: { token: string; exp: number } | null = null;

function apnsConf() {
  const key = process.env.APNS_KEY;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const topic = process.env.APNS_TOPIC;
  if (!key || !keyId || !teamId || !topic) return null;
  return { key: key.replace(/\\n/g, '\n'), keyId, teamId, topic };
}

function apnsJwt(c: NonNullable<ReturnType<typeof apnsConf>>): string {
  if (apnsJwtCache && Date.now() < apnsJwtCache.exp) return apnsJwtCache.token;
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${enc({ alg: 'ES256', kid: c.keyId })}.${enc({ iss: c.teamId, iat: now })}`;
  const sig = createSign('SHA256').update(unsigned).sign({ key: c.key, dsaEncoding: 'ieee-p1363' }, 'base64url');
  const token = `${unsigned}.${sig}`;
  apnsJwtCache = { token, exp: Date.now() + 45 * 60 * 1000 };
  return token;
}

function h2Post(host: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const client = http2.connect(`https://${host}`);
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!client.destroyed) client.close();
      fn();
    };
    // 연결·응답이 멈추면 크루 채팅(전원 await)이 서버리스 상한까지 매달린다 — 전체에 상한을 둔다.
    const timer = setTimeout(() => {
      finish(() => reject(new Error(`APNs ${host} 응답 없음(${SEND_TIMEOUT_MS}ms)`)));
      client.destroy();
    }, SEND_TIMEOUT_MS);
    client.on('error', (e) => finish(() => reject(e)));
    const req = client.request({ ':method': 'POST', ':path': path, ...headers });
    let status = 0; let data = '';
    req.on('response', (h) => { status = Number(h[':status'] ?? 0); });
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; });
    req.on('end', () => finish(() => resolve({ status, body: data })));
    req.on('error', (e) => finish(() => reject(e)));
    req.end(body);
  });
}

/** APNs 요청 본문과 (인증 제외) 헤더. 순수 함수 — 테스트가 여기를 본다. */
export function buildApnsRequest(p: PushPayload, nowSec: number): { body: string; headers: Record<string, string> } {
  const body = JSON.stringify({
    aps: { alert: { title: p.title, body: p.body }, sound: 'default', ...(p.group ? { 'thread-id': p.group } : {}) },
    url: p.url ?? '/',
  });
  const headers: Record<string, string> = {
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  };
  // apns-collapse-id 는 64바이트 상한 — 넘으면 APNs 가 400 BadCollapseId 로 통째로 거절한다.
  if (p.tag && Buffer.byteLength(p.tag) <= 64) headers['apns-collapse-id'] = p.tag;
  const ttl = p.ttlSec && p.ttlSec > 0 ? Math.round(p.ttlSec) : 0;
  if (ttl) headers['apns-expiration'] = String(nowSec + ttl);
  return { body, headers };
}

export function apnsReason(body: string): string {
  try { return String((JSON.parse(body) as { reason?: string })?.reason ?? ''); } catch { return ''; }
}

/**
 * APNs 응답 분류(https://developer.apple.com/documentation/usernotifications/handling-notification-responses-from-apns).
 * 400 BadDeviceToken 은 호출부가 샌드박스 호스트까지 확인한 뒤의 결과만 넘긴다.
 */
export function classifyApns(status: number, reason: string): PushResult {
  if (status === 200) return 'ok';
  if (status === 410) return 'dead'; // Unregistered, ExpiredToken
  if (status === 400 && reason === 'BadDeviceToken') return 'dead';
  if (reason === 'ExpiredProviderToken') return 'failed'; // 우리 JWT 가 만료 — 캐시를 비우면 다음 발송은 된다
  if (status === 429 || status >= 500) return 'failed';
  // InvalidProviderToken·MissingProviderToken(키 조합), TopicDisallowed·DeviceTokenNotForTopic(APNS_TOPIC),
  // BadCollapseId·BadExpirationDate·PayloadTooLarge(우리 페이로드) — 토큰 탓이 아니다.
  if (status === 400 || status === 403 || status === 405 || status === 413) return 'config';
  return 'failed';
}

function apnsHint(reason: string): string {
  if (/ProviderToken/.test(reason)) return 'APNS_KEY·APNS_KEY_ID·APNS_TEAM_ID 조합을 확인하라(키가 폐기됐거나 팀이 다르다).';
  if (/Topic/.test(reason)) return 'APNS_TOPIC 은 앱 번들 ID(com.rankue.app)여야 한다.';
  return '요청 본문·헤더가 틀렸다 — 최근 pushNative.ts 변경을 확인하라.';
}

async function sendApns(token: string, payload: PushPayload): Promise<PushOutcome> {
  const c = apnsConf();
  if (!c) return { result: 'noenv', platform: 'apns', reason: 'APNS_* 환경변수 없음' };
  const { body, headers: extra } = buildApnsRequest(payload, Math.floor(Date.now() / 1000));
  const headers = { authorization: `bearer ${apnsJwt(c)}`, 'apns-topic': c.topic, ...extra };
  const path = `/3/device/${token}`;
  let res = await h2Post(APNS_PROD, path, headers, body);
  let reason = apnsReason(res.body);
  if (res.status === 400 && reason === 'BadDeviceToken') {
    // Xcode 로 직접 깐 개발 빌드의 토큰은 샌드박스 호스트에서만 통한다. 두 곳 다 BadDeviceToken 이어야 죽은 토큰이다.
    res = await h2Post(APNS_SANDBOX, path, headers, body);
    reason = apnsReason(res.body);
  }
  if (reason === 'ExpiredProviderToken') apnsJwtCache = null;
  const result = classifyApns(res.status, reason);
  const why = `APNs ${res.status}${reason ? ` ${reason}` : ''}`;
  if (result === 'config') loud(`apns-${res.status}-${reason}`, `[Push] APNs 설정 오류(${why}) — APNS_TOPIC=${c.topic}. ${apnsHint(reason)} 토큰은 지우지 않는다.`);
  return { result, platform: 'apns', reason: why };
}

// 단일 토큰 발송 — 플랫폼 판별 후 FCM/APNs 선택. result 'dead'면 호출부에서 토큰을 지운다(NULL).
// 랭큐 클라는 'fcm:'/'apns:' 프리픽스로 플랫폼을 태깅한다. 프리픽스 없으면 형식(64 hex=APNs)으로 판별.
export async function sendPushNative(rawToken: string, payload: PushPayload): Promise<PushOutcome> {
  const { platform, token } = parsePushToken(rawToken);
  try {
    return platform === 'apns' ? await sendApns(token, payload) : await sendFcm(token, payload);
  } catch (e) {
    const err = e as Error;
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    return { result: 'failed', platform, reason: timedOut ? `시간 초과(${SEND_TIMEOUT_MS}ms)` : (err?.message ?? String(e)) };
  }
}
