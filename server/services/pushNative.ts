// 네이티브 푸시 발송 — shell-kit 표준(농사/xong 이식). SDK 없이 손수 배선.
// 토큰 형식으로 플랫폼 자동 판별: 64자 hex = APNs(iOS), 그 외 = FCM(안드로이드·웹).
// env 없으면 조용히 비활성: FIREBASE_SERVICE_ACCOUNT(JSON), APNS_KEY/KEY_ID/TEAM_ID/TOPIC(com.rankue.app).
import { createSign } from 'node:crypto';
import http2 from 'node:http2';

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

/* ── FCM (안드로이드·웹) ── */
type SA = { project_id: string; client_email: string; private_key: string };
let sa: SA | null | undefined;
let fcmToken: { token: string; exp: number } | null = null;

function serviceAccount(): SA | null {
  if (sa !== undefined) return sa;
  try {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    sa = raw ? (JSON.parse(raw) as SA) : null;
  } catch { sa = null; }
  return sa;
}

async function fcmAccessToken(acc: SA): Promise<string | null> {
  if (fcmToken && Date.now() < fcmToken.exp) return fcmToken.token;
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
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!j.access_token) return null;
  fcmToken = { token: j.access_token, exp: Date.now() + ((j.expires_in ?? 3600) - 600) * 1000 };
  return j.access_token;
}

async function sendFcm(token: string, payload: PushPayload): Promise<'ok' | 'dead' | 'skip'> {
  const acc = serviceAccount();
  if (!acc) return 'skip';
  const at = await fcmAccessToken(acc);
  if (!at) return 'skip';
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${acc.project_id}/messages:send`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${at}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? '/' },
        android: { notification: { tag: payload.tag ?? undefined, icon: 'ic_stat_notify', color: '#10B981' } },
      },
    }),
  });
  if (res.ok) return 'ok';
  return (res.status === 404 || res.status === 400) ? 'dead' : 'skip';
}

/* ── APNs (iOS) ── */
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
    client.on('error', reject);
    const req = client.request({ ':method': 'POST', ':path': path, ...headers });
    let status = 0; let data = '';
    req.on('response', (h) => { status = Number(h[':status'] ?? 0); });
    req.setEncoding('utf8');
    req.on('data', (c) => { data += c; });
    req.on('end', () => { client.close(); resolve({ status, body: data }); });
    req.on('error', (e) => { client.close(); reject(e); });
    req.end(body);
  });
}

async function sendApns(token: string, payload: PushPayload): Promise<'ok' | 'dead' | 'skip'> {
  const c = apnsConf();
  if (!c) return 'skip';
  const jwt = apnsJwt(c);
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: 'default', ...(payload.tag ? { 'thread-id': payload.tag } : {}) },
    url: payload.url ?? '/',
  });
  const headers = {
    authorization: `bearer ${jwt}`,
    'apns-topic': c.topic,
    'apns-push-type': 'alert',
    'apns-priority': '10',
    'content-type': 'application/json',
  };
  let res = await h2Post('api.push.apple.com', `/3/device/${token}`, headers, body);
  if (res.status === 400 && res.body.includes('BadDeviceToken')) {
    res = await h2Post('api.sandbox.push.apple.com', `/3/device/${token}`, headers, body);
  }
  if (res.status === 200) return 'ok';
  return (res.status === 410 || (res.status === 400 && res.body.includes('BadDeviceToken'))) ? 'dead' : 'skip';
}

// 단일 토큰 발송 — 플랫폼 판별 후 FCM/APNs 선택. 반환 'dead'면 호출부에서 토큰 정리 권장.
// 랭큐 클라는 'fcm:'/'apns:' 프리픽스로 플랫폼을 태깅한다. 프리픽스 없으면 형식(64 hex=APNs)으로 판별.
export async function sendPushNative(rawToken: string, payload: PushPayload): Promise<'ok' | 'dead' | 'skip'> {
  try {
    let token = rawToken;
    let isApns: boolean;
    if (rawToken.startsWith('apns:')) { token = rawToken.slice(5); isApns = true; }
    else if (rawToken.startsWith('fcm:')) { token = rawToken.slice(4); isApns = false; }
    else { isApns = /^[0-9a-fA-F]{64}$/.test(rawToken); } // 프리픽스 없으면 형식 판별
    return isApns ? await sendApns(token, payload) : await sendFcm(token, payload);
  } catch (e) {
    console.error('[pushNative]', (e as Error)?.message);
    return 'skip';
  }
}
