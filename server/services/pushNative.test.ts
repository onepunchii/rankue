import { describe, it, expect, vi, afterEach } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import {
    parsePushToken, pushTokenVariants, classifyFcmError, classifyApns, apnsReason,
    buildFcmMessage, buildApnsRequest, ANDROID_CHANNEL_ID,
} from "./pushNative";

const HEX = "a".repeat(64);

// FCM v1 오류 본문 모양 그대로(https://firebase.google.com/docs/cloud-messaging/error-codes)
function fcmBody(status: string, errorCode?: string, message = "", extra: object[] = []) {
    return JSON.stringify({
        error: {
            status, message,
            details: [
                ...(errorCode ? [{ "@type": "type.googleapis.com/google.firebase.fcm.v1.FcmError", errorCode }] : []),
                ...extra,
            ],
        },
    });
}

describe("푸시 토큰 판별", () => {
    it("접두사가 있으면 그대로, 없으면 64 hex 는 APNs, 그 외는 FCM", () => {
        expect(parsePushToken(`apns:${HEX}`)).toEqual({ platform: "apns", token: HEX });
        expect(parsePushToken("fcm:abc:APA91b")).toEqual({ platform: "fcm", token: "abc:APA91b" });
        expect(parsePushToken(HEX)).toEqual({ platform: "apns", token: HEX });
        expect(parsePushToken("cXyz:APA91b-_")).toEqual({ platform: "fcm", token: "cXyz:APA91b-_" });
    });

    it("같은 기기의 표기(접두사 유무)를 모두 돌려준다", () => {
        expect(pushTokenVariants("fcm:T1").sort()).toEqual(["T1", "fcm:T1"].sort());
        expect(pushTokenVariants(HEX).sort()).toEqual([HEX, `apns:${HEX}`].sort());
        expect(pushTokenVariants(`apns:${HEX}`).sort()).toEqual([HEX, `apns:${HEX}`].sort());
    });
});

describe("FCM 오류 분류", () => {
    it("UNREGISTERED 는 죽은 토큰", () => {
        expect(classifyFcmError(404, fcmBody("NOT_FOUND", "UNREGISTERED", "Requested entity was not found.")).result).toBe("dead");
    });

    it("FCM 오류 본문 없는 404(주소 자체가 틀림)는 토큰 탓이 아니다", () => {
        expect(classifyFcmError(404, "<html>Not Found</html>").result).toBe("failed");
    });

    it("UNREGISTERED 가 없는 JSON 404(프로젝트·주소 문제)는 토큰을 지키고 설정 오류", () => {
        expect(classifyFcmError(404, fcmBody("NOT_FOUND", undefined, "Requested entity was not found.")).result).toBe("config");
    });

    it("400 은 토큰이 틀렸다고 명시될 때만 죽은 토큰, 페이로드 오류면 토큰을 지키고 설정 오류", () => {
        expect(classifyFcmError(400, fcmBody("INVALID_ARGUMENT", "INVALID_ARGUMENT",
            "The registration token is not a valid FCM registration token")).result).toBe("dead");
        expect(classifyFcmError(400, fcmBody("INVALID_ARGUMENT", undefined, "Request contains an invalid argument.", [
            { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.token", description: "Invalid registration token" }] },
        ])).result).toBe("dead");
        expect(classifyFcmError(400, fcmBody("INVALID_ARGUMENT", undefined, "Invalid value at 'message.android.notification.color'", [
            { "@type": "type.googleapis.com/google.rpc.BadRequest", fieldViolations: [{ field: "message.android.notification.color" }] },
        ])).result).toBe("config");
    });

    it("SENDER_ID_MISMATCH 는 지우지 않는다(서버 계정이 엉뚱한 프로젝트면 전원이 이 오류)", () => {
        const c = classifyFcmError(403, fcmBody("PERMISSION_DENIED", "SENDER_ID_MISMATCH", "SenderId mismatch"));
        expect(c.result).toBe("config");
        expect(c.code).toBe("SENDER_ID_MISMATCH");
    });

    it("인증·권한 오류는 설정 오류", () => {
        expect(classifyFcmError(401, fcmBody("UNAUTHENTICATED", "THIRD_PARTY_AUTH_ERROR")).result).toBe("config");
        expect(classifyFcmError(403, fcmBody("PERMISSION_DENIED", undefined, "Permission denied")).result).toBe("config");
    });

    it("한도 초과·서버 장애는 일시 장애", () => {
        expect(classifyFcmError(429, fcmBody("RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED")).result).toBe("failed");
        expect(classifyFcmError(503, fcmBody("UNAVAILABLE", "UNAVAILABLE")).result).toBe("failed");
        expect(classifyFcmError(500, "").result).toBe("failed");
    });
});

describe("APNs 응답 분류", () => {
    it("410 과 (샌드박스까지 확인한) BadDeviceToken 만 죽은 토큰", () => {
        expect(classifyApns(200, "")).toBe("ok");
        expect(classifyApns(410, "Unregistered")).toBe("dead");
        expect(classifyApns(410, "ExpiredToken")).toBe("dead");
        expect(classifyApns(400, "BadDeviceToken")).toBe("dead");
    });

    it("키·토픽·페이로드 오류는 설정 오류, 한도·장애는 일시 장애", () => {
        expect(classifyApns(403, "InvalidProviderToken")).toBe("config");
        expect(classifyApns(400, "DeviceTokenNotForTopic")).toBe("config");
        expect(classifyApns(400, "TopicDisallowed")).toBe("config");
        expect(classifyApns(400, "BadCollapseId")).toBe("config");
        expect(classifyApns(403, "ExpiredProviderToken")).toBe("failed");
        expect(classifyApns(429, "TooManyRequests")).toBe("failed");
        expect(classifyApns(503, "ServiceUnavailable")).toBe("failed");
    });

    it("응답 본문에서 reason 을 읽는다", () => {
        expect(apnsReason('{"reason":"BadDeviceToken"}')).toBe("BadDeviceToken");
        expect(apnsReason("")).toBe("");
    });
});

describe("FCM 페이로드", () => {
    it("기본 채널·상태바 아이콘·색을 싣고, tag 와 ttl 은 기본으로 없다", () => {
        const m = buildFcmMessage("T", { title: "t", body: "b", url: "/x" });
        expect(ANDROID_CHANNEL_ID).toBe("rankue_default");
        expect(m.message.android.notification).toEqual({ channel_id: "rankue_default", icon: "ic_stat_notify", color: "#64DD17" });
        expect(m.message.android).not.toHaveProperty("ttl");
        expect(m.message.data).toEqual({ url: "/x" });
        expect(m.message.token).toBe("T");
    });

    it("tag·ttl 을 주면 싣는다", () => {
        const m = buildFcmMessage("T", { title: "t", body: "b", tag: "chat:c1", ttlSec: 1800 });
        expect(m.message.android.notification.tag).toBe("chat:c1");
        expect((m.message.android as { ttl?: string }).ttl).toBe("1800s");
        expect(m.message.data).toEqual({ url: "/" });
    });
});

describe("APNs 요청", () => {
    it("group 은 thread-id, tag 는 collapse-id, ttl 은 만료 시각", () => {
        const { body, headers } = buildApnsRequest({ title: "t", body: "b", url: "/crew/c1/chat", tag: "chat:c1", group: "crew:c1", ttlSec: 60 }, 1_000);
        const j = JSON.parse(body);
        expect(j.aps["thread-id"]).toBe("crew:c1");
        expect(j.url).toBe("/crew/c1/chat");
        expect(headers["apns-collapse-id"]).toBe("chat:c1");
        expect(headers["apns-expiration"]).toBe("1060");
        expect(headers["apns-push-type"]).toBe("alert");
    });

    it("옵션이 없으면 묶음·덮어쓰기·만료 헤더를 싣지 않고, 64바이트 넘는 collapse-id 도 싣지 않는다", () => {
        const plain = buildApnsRequest({ title: "t", body: "b" }, 1_000);
        expect(JSON.parse(plain.body).aps).not.toHaveProperty("thread-id");
        expect(plain.headers).not.toHaveProperty("apns-collapse-id");
        expect(plain.headers).not.toHaveProperty("apns-expiration");
        expect(buildApnsRequest({ title: "t", body: "b", tag: "x".repeat(65) }, 0).headers).not.toHaveProperty("apns-collapse-id");
    });
});

describe("발송 흐름(FCM)", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        delete process.env.FIREBASE_SERVICE_ACCOUNT;
        vi.resetModules();
    });

    it("서버에 설정이 없으면 noenv", async () => {
        delete process.env.FIREBASE_SERVICE_ACCOUNT;
        vi.resetModules();
        const { sendPushNative } = await import("./pushNative");
        const r = await sendPushNative("fcm:T", { title: "t", body: "b" });
        expect(r).toMatchObject({ result: "noenv", platform: "fcm" });
    });

    it("SENDER_ID_MISMATCH: 토큰은 지키고, 서버 계정의 project_id 를 크게 남기되 키는 찍지 않는다", async () => {
        const { privateKey } = generateKeyPairSync("rsa", {
            modulusLength: 2048,
            privateKeyEncoding: { type: "pkcs8", format: "pem" },
            publicKeyEncoding: { type: "spki", format: "pem" },
        });
        process.env.FIREBASE_SERVICE_ACCOUNT = JSON.stringify({
            project_id: "test-proj", client_email: "push@test-proj.iam.gserviceaccount.com", private_key: privateKey,
        });
        const fetchMock = vi.fn()
            .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: "AT", expires_in: 3600 }), { status: 200 }))
            .mockResolvedValueOnce(new Response(fcmBody("PERMISSION_DENIED", "SENDER_ID_MISMATCH", "SenderId mismatch"), { status: 403 }));
        vi.stubGlobal("fetch", fetchMock);
        const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        vi.resetModules();
        const { sendPushNative } = await import("./pushNative");

        const r = await sendPushNative("fcm:TOKEN1", { title: "t", body: "b", url: "/x" });
        expect(r).toMatchObject({ result: "config", platform: "fcm" });

        const logged = errSpy.mock.calls.flat().join(" ");
        expect(logged).toContain("SENDER_ID_MISMATCH");
        expect(logged).toContain("project_id=test-proj");
        expect(logged).not.toContain("PRIVATE KEY");
        expect(logged).not.toContain("TOKEN1");

        const [sendUrl, sendInit] = fetchMock.mock.calls[1] as [string, RequestInit];
        expect(sendUrl).toContain("/v1/projects/test-proj/messages:send");
        const sent = JSON.parse(String(sendInit.body));
        expect(sent.message.token).toBe("TOKEN1");
        expect(sent.message.android.notification.channel_id).toBe("rankue_default");
    });
});
