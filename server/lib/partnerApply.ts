/**
 * 파트너(사장님) 신청은 **랭큐에 로그인한 내 계정**으로 받는다.
 * 2026-10-07 오너: "지금 사장님이 없잖아 — 앞으로 사장님들이 신청·승인했을 때를 생각해서 진행하자".
 *
 * 예전에는 로그인 없이 이름·연락처만 받았고, 승인하면 그 **연락처와 같은 번호의 프로필**을 찾아(없으면 새로 만들어 4자리 PIN 을 발급해)
 * 사장님 권한을 줬다. 그래서 카카오·구글로 쓰는 사람이 신청하면 번호 + PIN 계정이 따로 생기고, 평소 쓰는 계정에는 '내 매장 관리'도
 * 승인 알림도 뜨지 않았다. PIN 은 운영자가 전화로 불러 줘야 했다.
 *
 * 이제는: 신청에 계정(회원 id · 프로필 id)을 같이 적고, 승인하면 **그 계정**이 사장님이 된다 — PIN 발급도 전화 전달도 없다.
 * 연락처는 여전히 받는다(운영자가 사장님이 맞는지 전화로 확인하는 용도) — 계정을 찾는 열쇠로는 쓰지 않는다.
 * 계정이 붙지 않은 옛 신청(대기 중이던 것)은 예전 방식 그대로 승인된다(admin.ts issueOwnership).
 *
 * 여기에는 DB 를 보지 않는 판단만 둔다(라우트가 쓰고, 시험이 바로 부른다).
 */

/** 신청하는 사람 — 회원 행과 프로필이 둘 다 있어야 한다(매장의 주인은 프로필이다: hiq_stores.owner_id). */
export type Applicant =
    | { ok: true; memberId: string; profileId: string }
    | { ok: false; status: 401 | 409; code: "APPLY_LOGIN_REQUIRED" | "APPLY_NO_PROFILE"; message: string };

export function applicantOf(member: { id: string; profileId?: string | null } | null | undefined): Applicant {
    if (!member) {
        return { ok: false, status: 401, code: "APPLY_LOGIN_REQUIRED", message: "랭큐에 로그인한 뒤 신청해 주세요. 승인되면 그 계정에 '내 매장 관리'가 열려요." };
    }
    // 매장에서 번호만으로 등록된 옛 회원(프로필 없음) — 매장의 주인이 될 계정이 없다
    if (!member.profileId) {
        return { ok: false, status: 409, code: "APPLY_NO_PROFILE", message: "이 계정으로는 신청할 수 없어요. 카카오·구글로 로그인하거나 로그인 PIN 을 만든 뒤 다시 신청해 주세요." };
    }
    return { ok: true, memberId: member.id, profileId: member.profileId };
}

/** 연락처(운영자의 확인 전화용) — 예전 신청 폼과 같은 꼴: 0 으로 시작하는 한국 번호, 하이픈·공백은 있어도 된다. */
export function isContactPhone(raw: unknown): boolean {
    return typeof raw === "string" && /^0\d{1,2}-?\d{3,4}-?\d{4}$/.test(raw.replace(/\s/g, ""));
}

/** 거절 사유 — 신청자에게 그대로 보인다. 앞뒤 공백을 떼고 200자까지. 비어 있으면 null. */
export function cleanRejectReason(raw: unknown): string | null {
    if (typeof raw !== "string") return null;
    const s = raw.trim().replace(/\s+/g, " ").slice(0, 200);
    return s || null;
}

/** 신청자에게 보여 주는 내 신청 한 줄. 운영자 메모·연락처·PIN 같은 것은 싣지 않는다. */
export type MyApplication = {
    kind: "claim" | "register";
    id: string;
    /** 매장 이름(없으면 코드) */
    name: string;
    /** 공개 매장 페이지 코드 — 등록 신청은 승인된 뒤에 생긴다 */
    listingCode: string | null;
    status: "pending" | "approved" | "rejected";
    rejectReason: string | null;
    createdAt: string;
};

type ClaimRow = { id: string; listingCode: string; listingName: string | null; status: string; rejectReason: string | null; createdAt: Date | string };
type RegRow = { id: string; name: string; listingCode: string | null; status: string; rejectReason: string | null; createdAt: Date | string };

const iso = (d: Date | string) => (d instanceof Date ? d.toISOString() : new Date(d).toISOString());
const statusOf = (s: string): MyApplication["status"] => (s === "approved" || s === "rejected" ? s : "pending");

/** 클레임(있는 매장의 관리 신청)과 등록 신청(새 매장)을 한 목록으로 — 최근 것이 위. 거절 사유는 거절된 것에만 싣는다. */
export function toMyApplications(claims: ClaimRow[], regs: RegRow[]): MyApplication[] {
    const rows: MyApplication[] = [
        ...claims.map((c): MyApplication => ({
            kind: "claim", id: c.id, name: c.listingName ?? c.listingCode, listingCode: c.listingCode,
            status: statusOf(c.status), rejectReason: c.status === "rejected" ? c.rejectReason : null, createdAt: iso(c.createdAt),
        })),
        ...regs.map((r): MyApplication => ({
            kind: "register", id: r.id, name: r.name, listingCode: r.listingCode,
            status: statusOf(r.status), rejectReason: r.status === "rejected" ? r.rejectReason : null, createdAt: iso(r.createdAt),
        })),
    ];
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
}
