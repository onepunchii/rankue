import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 카카오·구글 계정의 프로필 사진(2026-10-07 오너: "카카오 가입이나 구글 가입 시 프로필 사진 가지고 오지? … 내가 수동 프로필 사진 업로드
 * 전까지 프로필 사진 쓰면 좋고 어드민에 회원관리에 해당 프로필 사진이 같이 보이면 좋을 거 같아").
 * 여기서는 길이 끝까지 이어져 있는지를 소스로 본다(화면 시험은 shared/ 에 둔다 — vitest 가 client 는 sim·golf 만 돈다).
 * 규칙 자체는 server/lib/providerAvatar.test.ts(받는 주소 · 저장) · server/services/providerAvatarAdopt.test.ts(누구에게 넣는가)가 본다.
 */
const root = (p: string) => readFileSync(resolve(__dirname, "..", p), "utf8");
const code = (src: string) => src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join("\n");

describe("사진이 들어오는 곳 — 세 제공자 중 둘", () => {
    it("구글: ID 토큰의 picture · 카카오(웹): 사용자 조회의 profile_image_url(기본 그림 제외) · 카카오(앱): ID 토큰의 picture", () => {
        expect(code(root("server/lib/socialAuth.ts"))).toContain('picture: typeof payload.picture === "string" ? payload.picture : null,');
        const kakao = code(root("server/lib/kakaoAuth.ts"));
        expect(kakao).toContain("`${USER_URL}?secure_resource=true`");
        expect(kakao).toContain('const picture = kp && kp.is_default_image !== true && typeof kp.profile_image_url === "string" ? kp.profile_image_url : null;');
        expect(kakao).toContain('picture: typeof payload.picture === "string" ? payload.picture : null } };');
    });

    it("애플은 사진을 주지 않는다 — 애플 검증은 picture 를 만들지 않는다", () => {
        const social = code(root("server/lib/socialAuth.ts"));
        expect(social.match(/picture:/g)).toHaveLength(1);
    });
});

describe("사진이 쓰이는 곳 — 로그인 한 곳 + 연결 세 곳", () => {
    const svc = code(root("server/services/hiqService.ts"));
    const auth = code(root("server/routes/modules/auth.ts"));

    it("소셜 로그인(가입 포함)이 끝날 때 한 번 — 구글·애플·카카오 웹·카카오 앱이 전부 이 함수를 지난다", () => {
        const fn = svc.slice(svc.indexOf("    async socialLogin("), svc.indexOf("    async adoptProviderAvatar("));
        expect(fn.match(/adoptProviderAvatar\(/g)).toHaveLength(1);
        expect(fn).toContain("await this.adoptProviderAvatar(member.id, identity.picture);");
        // 회원을 정한 뒤에, 돌려주기 직전에
        expect(fn.indexOf("await this.adoptProviderAvatar(")).toBeGreaterThan(fn.indexOf("await storage.incrementVisitCount(member.id);"));
    });

    it("설정의 연결 세 곳(카카오 웹 · 구글 · 카카오 앱) — 연결이 성공한 뒤에만", () => {
        expect(auth.match(/hiqService\.adoptProviderAvatar\(/g)).toHaveLength(3);
        const kakaoWeb = auth.slice(auth.indexOf('router.post("/social/kakao/link"'), auth.indexOf('router.delete("/social/kakao/link"'));
        expect(kakaoWeb).toContain("await hiqService.adoptProviderAvatar(req.userId!, exchanged.identity.picture);");
        const google = auth.slice(auth.indexOf('router.post("/social/google/link"'), auth.indexOf('router.delete("/social/google/link"'));
        expect(google).toContain("await hiqService.adoptProviderAvatar(req.userId!, identity.picture);");
        const native = auth.slice(auth.indexOf('router.post("/social/kakao/native"'));
        expect(native).toContain("await hiqService.adoptProviderAvatar(userId as string, verified.identity.picture);");
        // 셋 다 실패 응답(return sendError)들 뒤, 성공 응답 바로 앞이다
        for (const block of [kakaoWeb, google, native]) {
            const at = block.indexOf("hiqService.adoptProviderAvatar(");
            expect(block.slice(at, at + 400)).toContain("return sendSuccess(res, { linked: true");
        }
    });

    it("지금 사진이 없을 때만 넣고, 실패는 삼킨다", () => {
        const fn = svc.slice(svc.indexOf("    async adoptProviderAvatar("), svc.indexOf("    async linkKakao("));
        expect(fn).toContain("if (!providerAvatarUrl(picture)) return;");
        expect(fn).toContain("if (!profile || profile.profileImageUrl) return;");
        expect(fn).toContain("if (saved) await storage.updateProfile(profile.id, { profileImageUrl: saved });");
        expect(fn).toContain("} catch (e) {");
        expect(fn).not.toContain("throw ");
    });

    it("받는 쪽은 서버뿐이다 — 화면이 사진 주소를 보내는 길은 없다", () => {
        // 화면이 보낸 picture 를 믿으면 아무 주소나 서버가 받아 오게 된다. 사진 주소는 검증한 토큰·카카오 응답에서만 나온다.
        expect(auth).not.toMatch(/req\.body\??\.picture/);
        const lib = code(root("server/lib/providerAvatar.ts"));
        expect(lib).toContain("const HOSTS: readonly RegExp[] = [/(^|\\.)googleusercontent\\.com$/, /(^|\\.)kakaocdn\\.net$/];");
        expect(lib).toContain('redirect: "error"');
        expect(lib).toContain("const clean = stripImageMetadata(buffer);");
        expect(lib).toContain("if (!clean.type) return null;");
    });
});

describe("어드민 회원 관리 — 사진이 같이 보인다", () => {
    it("회원 목록 응답에 프로필 사진이 실린다", () => {
        const repo = code(root("server/storage/admin.repo.ts"));
        const fn = repo.slice(repo.indexOf("getAllMembersForAdmin"));
        expect(fn.slice(0, 4000)).toContain("profileImageUrl: profiles.profileImageUrl,");
    });

    it("목록(폰 카드 · 넓은 화면 표)과 상세 머리가 같은 얼굴 부품을 쓴다 — 사진이 없거나 안 열리면 이름 첫 글자", () => {
        const utils = code(root("client/src/pages/admin/adminUtils.tsx"));
        const avatar = utils.slice(utils.indexOf("export function MemberAvatar("), utils.indexOf("export function PlatformIcon("));
        expect(avatar).toContain('{name?.slice(0, 1) || "?"}');
        expect(avatar).toContain("{src && (");
        expect(avatar).toContain('onError={(e) => { e.currentTarget.style.display = "none"; }}');
        expect(avatar).toContain('className="absolute inset-0 w-full h-full object-cover"');

        const list = code(root("client/src/pages/admin/MembersView.tsx"));
        expect(list.match(/<MemberAvatar name=\{m\.name\} src=\{m\.profileImageUrl\} /g)).toHaveLength(2);
        const detail = code(root("client/src/pages/admin/MemberDetailSheet.tsx"));
        expect(detail.match(/<MemberAvatar name=\{m\.name\} src=\{m\.profileImageUrl\} /g)).toHaveLength(1);
        expect(detail).toContain("profileImageUrl?: string | null;");
        // 옛 글자 동그라미가 남아 있지 않다
        for (const src of [list, detail]) expect(src).not.toContain('{m.name?.slice(0, 1) || "?"}');
    });
});

describe("개인정보처리방침 — 하는 일과 적힌 글이 같다", () => {
    const page = root("client/src/pages/privacy.tsx").replace(/\s+/g, " ");
    const prerender = root("server/prerender.ts").replace(/\s+/g, " ");

    it("'직접 올린 경우에만'이라는 옛 문장은 없다 — 화면과 크롤러용 사본 둘 다", () => {
        for (const [name, src] of [["page", page], ["prerender", prerender]] as const) {
            expect(src, name).not.toContain("사진(선택) — 사용자가 프로필 등에 직접 업로드하는 경우에만");
            expect(src, name).toContain("프로필 사진(선택) — 직접 올린 사진.");
            expect(src, name).toContain("카카오·Google 계정으로 로그인한 경우에는 그 계정의 프로필 사진(카카오는 제공에 동의한 경우에만)을 받아,");
            expect(src, name).toContain("직접 올린 사진이 없을 때에만 프로필 사진으로 씁니다.");
            expect(src, name).toContain("메뉴에서 언제든 다른 사진으로 바꿀 수 있고, 계정 삭제 시 함께 삭제합니다.");
        }
    });
});
