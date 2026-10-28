/**
 * RANKUE 유튜브 채널 접근 — 본 채널(@rrankue, 영어 화면)과 베트남 채널(@rankue_vn, 베트남어 화면).
 *
 * 인증은 사주 앱(mudang.k)과 같은 GCP OAuth 클라이언트를 쓰고, 토큰은 그때 미국 채널로 받은 것을 RANKUE 로 옮겼다
 * (2026-10-28 — 채널 이름 · 프로필을 RANKUE 로 바꾼 같은 채널). 업로드 · 댓글 스코프가 있다.
 *   YT_CLIENT_ID · YT_CLIENT_SECRET · YT_REFRESH_RANKUE(본) · YT_REFRESH_RANKUE_VN(베트남 — 옛 사주 베트남 채널, 2026-10-29)
 *
 * 올린 샷 기록은 저장소가 아니라 채널 자체에 둔다: 설명 끝줄 "Shot ID: <matchId>#<idx>".
 * 매일 기록을 커밋하면 main 푸시마다 Vercel 운영 배포가 돌기 때문이다.
 */
export const CHANNELS = {
    main: { id: "UC3qRIkjbA00NBQbm229UPbQ", tokenEnv: "YT_REFRESH_RANKUE", lang: "en" },
    vn: { id: "UCTBoc8uyKy1cxd3OU8HZk-Q", tokenEnv: "YT_REFRESH_RANKUE_VN", lang: "vi" },
} as const;
export type ChannelKey = keyof typeof CHANNELS;
export const SHOT_ID_RE = /Shot ID: ([0-9a-f-]{36})#(\d+)/;

const env = (k: string) => {
    const v = (process.env[k] ?? "").trim();
    if (!v) throw new Error(`${k} 가 없다 — .env(로컬) 또는 GitHub Secrets 에 넣어 주세요`);
    return v;
};

export async function accessToken(channel: ChannelKey = "main"): Promise<string> {
    const r = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            client_id: env("YT_CLIENT_ID"), client_secret: env("YT_CLIENT_SECRET"),
            refresh_token: env(CHANNELS[channel].tokenEnv), grant_type: "refresh_token",
        }),
    });
    const j = await r.json();
    if (!j.access_token) throw new Error(`유튜브 토큰 갱신 실패: ${j.error} ${j.error_description ?? ""}`);
    return j.access_token;
}

async function api(token: string, url: string, init: RequestInit = {}) {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers ?? {}) } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`YouTube ${r.status}: ${JSON.stringify(j).slice(0, 300)}`);
    return j;
}

/** 토큰이 정말 그 RANKUE 채널인지(다른 채널에 올리는 사고 방지). */
export async function assertRankueChannel(token: string, channel: ChannelKey = "main"): Promise<string> {
    const j = await api(token, "https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true");
    const ch = j.items?.[0];
    if (ch?.id !== CHANNELS[channel].id) throw new Error(`토큰 채널이 RANKUE ${channel} 가 아니다: ${ch?.id}`);
    return ch.contentDetails.relatedPlaylists.uploads;
}

/** 채널에 이미 올린 샷(matchId#idx) 전부 — 업로드 목록 설명의 Shot ID 줄을 모은다. 비공개(시험용)는 세지 않는다. */
export async function postedShots(token: string, uploadsPlaylist: string): Promise<Set<string>> {
    const out = new Set<string>();
    let page = "";
    for (let i = 0; i < 40; i++) {
        const j = await api(token, `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet,status&maxResults=50&playlistId=${uploadsPlaylist}${page ? `&pageToken=${page}` : ""}`);
        for (const it of j.items ?? []) {
            if (it.status?.privacyStatus === "private") continue;
            const m = SHOT_ID_RE.exec(String(it.snippet?.description ?? ""));
            if (m) out.add(`${m[1]}#${m[2]}`);
        }
        if (!j.nextPageToken) break;
        page = j.nextPageToken;
    }
    return out;
}

export interface VideoMeta {
    title: string;
    description: string;
    tags: string[];
    defaultLanguage: string;
    localizations: Record<string, { title: string; description: string }>;
}

/** 리줌 업로드. privacy 가 public 이면 바로 공개. 반환 = videoId */
export async function uploadVideo(token: string, file: string, meta: VideoMeta, privacy: "public" | "private" | "unlisted"): Promise<string> {
    const { readFileSync, statSync } = await import("node:fs");
    const bytes = statSync(file).size;
    const body = {
        snippet: { title: meta.title, description: meta.description, tags: meta.tags, categoryId: "17", defaultLanguage: meta.defaultLanguage, defaultAudioLanguage: meta.defaultLanguage },
        status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
        localizations: meta.localizations,
    };
    const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status,localizations", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/mp4", "X-Upload-Content-Length": String(bytes) },
        body: JSON.stringify(body),
    });
    if (!init.ok) throw new Error(`업로드 세션 실패 ${init.status}: ${(await init.text()).slice(0, 300)}`);
    const put = await fetch(init.headers.get("location")!, { method: "PUT", headers: { "Content-Type": "video/mp4", "Content-Length": String(bytes) }, body: readFileSync(file) });
    const out = await put.json();
    if (!put.ok || !out.id) throw new Error(`업로드 실패 ${put.status}: ${JSON.stringify(out).slice(0, 300)}`);
    return out.id;
}

/** 공개 영상에 채널 이름으로 댓글(다운로드 링크). 고정은 API 로 안 된다 — 필요하면 스튜디오에서 손으로. */
export async function postComment(token: string, videoId: string, text: string, channel: ChannelKey = "main"): Promise<void> {
    await api(token, "https://www.googleapis.com/youtube/v3/commentThreads?part=snippet", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snippet: { channelId: CHANNELS[channel].id, videoId, topLevelComment: { snippet: { textOriginal: text } } } }),
    });
}
