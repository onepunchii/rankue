import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AVATAR_FETCH_TIMEOUT_MS, AVATAR_MAX_BYTES, copyProviderAvatar, providerAvatarUrl } from "./providerAvatar.js";

/**
 * 카카오·구글 계정의 프로필 사진을 우리 저장소로 옮기는 길(2026-10-07 오너: "카카오 가입이나 구글 가입 시 프로필 사진 가지고 오지? …
 * 내가 수동 프로필 사진 업로드 전까지 프로필 사진 쓰면 좋고").
 * 여기서는 '어느 주소를 받는가'와 '무엇을 저장하는가'를 본다. 누구의 프로필에 넣는가는 server/services/providerAvatarAdopt.test.ts.
 * 실제 사진 서버·저장소에 붙지 않는다 — fetch 와 @vercel/blob 을 가짜로 바꾼다. 아래 주소는 지어낸 것이다.
 */
const blob = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock("@vercel/blob", () => ({ put: blob.put }));

const GOOGLE = "https://lh3.googleusercontent.com/a-/ALV-Uexample=s96-c";
const KAKAO = "https://k.kakaocdn.net/dn/example/img_640x640.jpg";

const u16be = (n: number) => { const b = Buffer.alloc(2); b.writeUInt16BE(n); return b; };
const seg = (marker: number, payload: Buffer) => Buffer.concat([Buffer.from([0xff, marker]), u16be(payload.length + 2), payload]);
const GPS = Buffer.from("GPSLatitude 37.5665 N");
/** 위치 정보(EXIF)가 든 작은 JPEG — server/utils/imageMeta.test.ts 와 같은 꼴 */
function jpegWithExif(): Buffer {
    const jfif = seg(0xe0, Buffer.from("JFIF\0"));
    const exif = seg(0xe1, Buffer.concat([Buffer.from("Exif\0\0"), GPS]));
    const dqt = seg(0xdb, Buffer.from([1, 2, 3]));
    const sos = seg(0xda, Buffer.from([4, 5, 6]));
    return Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, exif, dqt, sos, Buffer.from([0x11, 0x22, 0xff, 0xd9])]);
}
const respond = (body: Buffer | string, init: ResponseInit = {}) => new Response(body, { status: 200, ...init });

let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
    blob.put.mockReset().mockResolvedValue({ url: "https://store.public.blob.vercel-storage.com/hiq/profile/m1-abc.jpg" });
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "test-blob-token");
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

describe("providerAvatarUrl — 가져와도 되는 주소인가", () => {
    it("구글·카카오의 사진 서버만 — 구글의 작은 그림은 256 으로 키운다", () => {
        expect(providerAvatarUrl(GOOGLE)).toBe("https://lh3.googleusercontent.com/a-/ALV-Uexample=s256-c");
        expect(providerAvatarUrl("https://lh3.googleusercontent.com/a/ACg8example=s96")).toBe("https://lh3.googleusercontent.com/a/ACg8example=s256-c");
        // 크기 꼬리가 없으면 그대로
        expect(providerAvatarUrl("https://lh3.googleusercontent.com/a/ACg8example")).toBe("https://lh3.googleusercontent.com/a/ACg8example");
        expect(providerAvatarUrl(KAKAO)).toBe(KAKAO);
        expect(providerAvatarUrl(`  ${KAKAO}  `)).toBe(KAKAO);
        expect(providerAvatarUrl("https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=x")).toBe("https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=x");
    });

    it("카카오는 http 주소를 주기도 한다 — https 로 바꿔 받는다", () => {
        expect(providerAvatarUrl("http://k.kakaocdn.net/dn/example/img_640x640.jpg")).toBe(KAKAO);
    });

    it("카카오의 기본 그림(사진을 안 올린 계정)은 받지 않는다 — 앱 로그인의 ID 토큰에는 '기본 그림' 표시가 없다", () => {
        expect(providerAvatarUrl("https://t1.kakaocdn.net/account_images/default_profile.jpeg")).toBeNull();
        expect(providerAvatarUrl("http://k.kakaocdn.net/dn/x/account_images/default_profile.jpeg.twg.thumb.R640x640")).toBeNull();
        expect(providerAvatarUrl("https://img1.kakaocdn.net/thumb/R640x640.q70/?fname=https://t1.kakaocdn.net/account_images/default_profile.jpeg")).toBeNull();
    });

    it("구글의 기본 그림(회색 사람 모양)도 받지 않는다", () => {
        expect(providerAvatarUrl("https://lh3.googleusercontent.com/a/default-user=s96-c")).toBeNull();
        expect(providerAvatarUrl("https://lh3.googleusercontent.com/a/default-user")).toBeNull();
    });

    it("다른 호스트 · 닮은 호스트 · 계정 정보·포트가 붙은 주소 · 다른 스킴 · 글자가 아닌 값은 null — 서버가 아무 주소로나 요청하지 않는다", () => {
        const bad: unknown[] = [
            "https://example.com/a.jpg",
            "https://googleusercontent.com.evil.example/a.jpg",
            "https://evilgoogleusercontent.com/a.jpg",
            "https://kakaocdn.net.evil.example/a.jpg",
            "https://notkakaocdn.net/a.jpg",
            "https://user:pw@k.kakaocdn.net/a.jpg",
            "https://k.kakaocdn.net:8443/a.jpg",
            "http://169.254.169.254/latest/meta-data",
            "http://localhost:5002/api/hiq/me",
            "ftp://k.kakaocdn.net/a.jpg",
            "data:image/png;base64,AAAA",
            "javascript:alert(1)",
            "//k.kakaocdn.net/a.jpg",
            "k.kakaocdn.net/a.jpg",
            "", "   ", null, undefined, 12, {}, [KAKAO],
            `https://k.kakaocdn.net/${"a".repeat(2100)}`,
        ];
        for (const v of bad) expect(providerAvatarUrl(v), JSON.stringify(v)?.slice(0, 80)).toBeNull();
    });
});

describe("copyProviderAvatar — 받아서 우리 저장소에 넣는다", () => {
    it("사진을 받아 메타 정보(위치)를 걷고 hiq/profile/<회원>.jpg 로 저장한다 — 돌려주는 것은 우리 저장소의 주소", async () => {
        const fetchImpl = vi.fn(async () => respond(jpegWithExif()));
        const url = await copyProviderAvatar("m1", GOOGLE, fetchImpl as unknown as typeof fetch);
        expect(url).toBe("https://store.public.blob.vercel-storage.com/hiq/profile/m1-abc.jpg");

        // 요청: 256 으로 키운 주소 · 넘겨 보내는 응답(redirect)은 따라가지 않는다 · 끊을 수 있는 신호가 붙어 있다
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [reqUrl, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(reqUrl).toBe("https://lh3.googleusercontent.com/a-/ALV-Uexample=s256-c");
        expect(init.redirect).toBe("error");
        expect(init.signal).toBeInstanceOf(AbortSignal);
        // 사진 서버에 우리 쪽 값(쿠키·토큰)을 싣지 않는다
        expect(init.headers).toBeUndefined();

        expect(blob.put).toHaveBeenCalledTimes(1);
        const [path, body, opts] = blob.put.mock.calls[0];
        expect(path).toBe("hiq/profile/m1.jpg");
        expect(opts).toEqual({ access: "public", contentType: "image/jpeg", addRandomSuffix: true, token: "test-blob-token" });
        expect(Buffer.isBuffer(body)).toBe(true);
        expect((body as Buffer).includes(GPS)).toBe(false);
        expect((body as Buffer).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
        expect(warn).not.toHaveBeenCalled();
    });

    it("받아도 되는 주소가 아니면 요청도 저장도 하지 않는다", async () => {
        const fetchImpl = vi.fn(async () => respond(jpegWithExif()));
        for (const v of ["https://example.com/a.jpg", "http://169.254.169.254/x", null, undefined, "", "https://t1.kakaocdn.net/account_images/default_profile.jpeg"]) {
            expect(await copyProviderAvatar("m1", v, fetchImpl as unknown as typeof fetch), String(v)).toBeNull();
        }
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(blob.put).not.toHaveBeenCalled();
    });

    it("저장소 키가 없으면(로컬·시험 환경) 요청하지 않는다", async () => {
        vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");
        const fetchImpl = vi.fn(async () => respond(jpegWithExif()));
        expect(await copyProviderAvatar("m1", KAKAO, fetchImpl as unknown as typeof fetch)).toBeNull();
        expect(fetchImpl).not.toHaveBeenCalled();
    });

    it("그림이 아닌 응답 · 빈 응답 · 실패 응답은 저장하지 않는다", async () => {
        const cases: Array<() => Response> = [
            () => respond("<html>로그인하세요</html>", { headers: { "content-type": "text/html" } }),
            () => respond(Buffer.alloc(0)),
            () => respond("없음", { status: 404 }),
            () => respond("오류", { status: 500 }),
            // 머리만 JPEG 인 깨진 파일
            () => respond(Buffer.from([0xff, 0xd8, 0xff])),
        ];
        for (const [i, make] of cases.entries()) {
            expect(await copyProviderAvatar("m1", KAKAO, (async () => make()) as unknown as typeof fetch), `case ${i}`).toBeNull();
        }
        expect(blob.put).not.toHaveBeenCalled();
    });

    it("2MB 를 넘으면 받지 않는다 — 길이를 알려 줬으면 본문을 읽기 전에, 안 알려 줬으면 읽고 나서", async () => {
        expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
        let read = false;
        const declared = {
            ok: true,
            headers: new Headers({ "content-length": String(AVATAR_MAX_BYTES + 1) }),
            arrayBuffer: async () => { read = true; return new ArrayBuffer(0); },
        };
        expect(await copyProviderAvatar("m1", KAKAO, (async () => declared) as unknown as typeof fetch)).toBeNull();
        expect(read).toBe(false);

        const big = Buffer.concat([jpegWithExif(), Buffer.alloc(AVATAR_MAX_BYTES)]);
        const undeclared = { ok: true, headers: new Headers(), arrayBuffer: async () => big.buffer.slice(big.byteOffset, big.byteOffset + big.byteLength) };
        expect(await copyProviderAvatar("m1", KAKAO, (async () => undeclared) as unknown as typeof fetch)).toBeNull();
        expect(blob.put).not.toHaveBeenCalled();
    });

    it("2.5초 안에 안 오면 끊는다 — 로그인은 그만큼만 늦어진다", async () => {
        expect(AVATAR_FETCH_TIMEOUT_MS).toBe(2500);
        vi.useFakeTimers();
        const hang = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_res, rej) => {
            init.signal!.addEventListener("abort", () => rej(Object.assign(new Error("aborted"), { name: "AbortError" })));
        }));
        const p = copyProviderAvatar("m1", KAKAO, hang as unknown as typeof fetch);
        await vi.advanceTimersByTimeAsync(AVATAR_FETCH_TIMEOUT_MS - 1);
        expect(hang.mock.calls[0][1].signal!.aborted).toBe(false);
        await vi.advanceTimersByTimeAsync(2);
        expect(await p).toBeNull();
        expect(blob.put).not.toHaveBeenCalled();
        expect(warn.mock.calls.flat().join(" ")).toContain("시간 초과");
    });

    it("연결 실패 · 넘겨 보내기(redirect) · 저장 실패 — 던지지 않고 null. 로그에 사진 주소를 남기지 않는다", async () => {
        const boom = async () => { throw new TypeError("fetch failed"); };
        expect(await copyProviderAvatar("m1", KAKAO, boom as unknown as typeof fetch)).toBeNull();

        blob.put.mockRejectedValueOnce(new Error("blob store unavailable"));
        expect(await copyProviderAvatar("m1", KAKAO, (async () => respond(jpegWithExif())) as unknown as typeof fetch)).toBeNull();

        expect(warn).toHaveBeenCalledTimes(2);
        const logged = warn.mock.calls.flat().map(String).join(" ");
        expect(logged).not.toContain("kakaocdn");
        expect(logged).not.toContain("test-blob-token");
    });
});
