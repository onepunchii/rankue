/**
 * 관리자 신고 큐의 순수 규칙(2026-09-11, 스토어 심사 SX1 — Apple 1.2 "신고에 제때 대응", Play UGC "지속적인 관리").
 *
 * DB 없이 판단할 수 있는 것만 모았다: 신고 묶기, 큐 상태(미처리/조치/기각), 대상별로 가능한 조치,
 * 운영자 알림 도배 방지, 알림 문구. 조회(storage/admin.repo)·실행(services/moderation)·화면이 **같은 판정**을 쓰게
 * 한곳에 둔다 — 화면에 뜬 버튼을 서버가 거절하거나, 서버가 받는 조치가 화면에 없는 일이 없게.
 */

// crew_photo_comment(2026-09-11, 크루 신고 UI 와 함께 추가): 사진 댓글 전용. 그전 crew_comment 신고는 게시글 댓글과
// 사진 댓글을 함께 가리켰으므로, 옛 crew_comment 는 두 테이블을 다 본다(admin.repo·services/moderation).
export const REPORT_TARGET_TYPES = [
    "community_post", "community_comment", "crew_post", "crew_comment", "crew_photo", "crew_photo_comment", "crew_chat", "member", "golf_booking",
    "player_cheer",   // 선수 응원글(2026-09-13)
] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

export const MODERATION_ACTIONS = [
    "blind", "unblind", "delete", "ban", "unban", "dismiss", "appeal_approve", "appeal_reject",
] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export type ReportStatus = "pending" | "actioned" | "dismissed";
export type QueueState = "open" | "actioned" | "dismissed";

/** 가릴 수 있는 대상 — is_blinded 칸이 있고 읽는 쪽 쿼리가 그 칸을 지킨다. 크루 콘텐츠엔 그 칸이 없어 지우기만 된다. */
export const BLINDABLE_TARGETS: readonly ReportTargetType[] = ["community_post", "community_comment", "golf_booking", "player_cheer"];
/**
 * 지울 수 있는 대상. 골프 매물은 빠진다 — 지우면 누가 무엇을 올렸는지 추적이 사라져서 가리기만 한다
 * (community.repo 자동 블라인드와 같은 원칙). 회원은 콘텐츠가 아니라 제재 대상이다.
 */
export const DELETABLE_TARGETS: readonly ReportTargetType[] = [
    "community_post", "community_comment", "crew_post", "crew_comment", "crew_photo", "crew_photo_comment", "crew_chat", "player_cheer",
];
/** 작성자가 이의제기할 수 있는 대상(POST /community/appeals 가 받는 것과 같다). */
export const APPEALABLE_TARGETS: readonly ReportTargetType[] = ["community_post", "community_comment"];

/** 신고 접수 후 이 시간 안에 처리한다(운영 약속). 넘기면 큐에서 빨갛게 표시한다. */
export const REPORT_SLA_HOURS = 24;
/** 같은 대상에 대한 운영자 알림은 이 간격에 한 번만. */
export const REPORT_ALERT_WINDOW_MIN = 60;
/** 한 시간에 알림을 보내는 대상 수 상한 — 여러 글을 한꺼번에 신고하는 도배에 운영자 폰이 울려 대지 않게. 넘친 건 큐에 그대로 있다. */
export const REPORT_ALERT_HOURLY_CAP = 10;
/**
 * 한 신고자가 창 안에서 일으킬 수 있는 운영자 알림(서로 다른 대상 수). 계정 하나가 여러 대상을 연달아 신고해
 * 시간당 상한을 먼저 채우면 그 뒤 한 시간 동안 진짜 신고의 알림이 전혀 가지 않는다(검토 code:R6). 넘친 건 큐에 그대로 있다.
 */
export const REPORT_ALERT_PER_REPORTER_CAP = 3;
/** 운영자 알림의 type(hiq_notifications.type) — 도배 방지 집계가 이 값으로 지난 알림을 센다. */
export const REPORT_ALERT_TYPE = "REPORT_ALERT";
/** 알림을 누르면 열리는 곳 — 대시보드가 ?tab=moderation 을 읽어 신고 큐를 바로 연다. */
export const REPORT_QUEUE_URL = "/admin/dashboard?tab=moderation";

export const TARGET_LABEL: Record<ReportTargetType, string> = {
    community_post: "커뮤니티 글",
    community_comment: "커뮤니티 댓글",
    crew_post: "크루 게시글",
    crew_comment: "크루 댓글",
    crew_photo: "크루 사진",
    crew_photo_comment: "크루 사진 댓글",
    crew_chat: "크루 채팅",
    member: "회원",
    golf_booking: "골프 매물",
    player_cheer: "선수 응원글",
};

// 신고 화면(ReportDialog)의 사유와 같은 목록·같은 말(ko.ts community.reportReason.*).
export const REASON_LABEL: Record<string, string> = {
    abuse: "욕설·비방",
    gambling: "금전 내기",
    trade: "거래·홍보",
    privacy: "개인정보 노출",
    spam: "도배·스팸",
    other: "기타",
};
export const reasonLabel = (reason: string) => REASON_LABEL[reason] ?? reason;

export const ACTION_LABEL: Record<ModerationAction, string> = {
    blind: "블라인드",
    unblind: "블라인드 해제",
    delete: "삭제",
    ban: "작성자 정지",
    unban: "정지 해제",
    dismiss: "신고 기각",
    appeal_approve: "이의제기 승인",
    appeal_reject: "이의제기 반려",
};

export const isReportTargetType = (v: unknown): v is ReportTargetType =>
    typeof v === "string" && (REPORT_TARGET_TYPES as readonly string[]).includes(v);
export const isModerationAction = (v: unknown): v is ModerationAction =>
    typeof v === "string" && (MODERATION_ACTIONS as readonly string[]).includes(v);

export const reportKey = (targetType: string, targetId: string) => `${targetType}:${targetId}`;

const toTime = (d: Date | string | null | undefined): number | null => {
    if (d == null) return null;
    const t = d instanceof Date ? d.getTime() : Date.parse(d);
    return Number.isFinite(t) ? t : null;
};

export interface ReportRowLike {
    reporterId: string;
    reason: string;
    status: string;
    createdAt: Date | string;
}

export interface ReportSummary {
    reportCount: number;
    reporterCount: number;
    pendingCount: number;
    actionedCount: number;
    /** 사유별 건수 — 많은 순(같으면 사유 이름순이라 화면 순서가 흔들리지 않는다). */
    reasons: { reason: string; label: string; count: number }[];
    firstReportedAt: Date | null;
    latestReportedAt: Date | null;
    /** 아직 안 닫힌 신고 중 가장 오래된 것 — 24시간 기한은 여기서 잰다. */
    oldestPendingAt: Date | null;
}

/** 한 대상에 쌓인 신고 행들을 요약한다. 행 순서와 무관하다. */
export function summarizeReports(rows: readonly ReportRowLike[]): ReportSummary {
    const reporters = new Set<string>();
    const reasonCounts = new Map<string, number>();
    let pending = 0;
    let actioned = 0;
    let first: number | null = null;
    let latest: number | null = null;
    let oldestPending: number | null = null;
    for (const r of rows) {
        reporters.add(r.reporterId);
        reasonCounts.set(r.reason, (reasonCounts.get(r.reason) ?? 0) + 1);
        const t = toTime(r.createdAt);
        if (r.status === "pending") {
            pending++;
            if (t != null && (oldestPending == null || t < oldestPending)) oldestPending = t;
        } else if (r.status === "actioned") {
            actioned++;
        }
        if (t != null) {
            if (first == null || t < first) first = t;
            if (latest == null || t > latest) latest = t;
        }
    }
    const reasons = [...reasonCounts.entries()]
        .map(([reason, count]) => ({ reason, label: reasonLabel(reason), count }))
        .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
    const asDate = (t: number | null) => (t == null ? null : new Date(t));
    return {
        reportCount: rows.length,
        reporterCount: reporters.size,
        pendingCount: pending,
        actionedCount: actioned,
        reasons,
        firstReportedAt: asDate(first),
        latestReportedAt: asDate(latest),
        oldestPendingAt: asDate(oldestPending),
    };
}

/**
 * 이의제기가 운영자 판단을 기다리나.
 * 가려진 상태에서, 마지막 처리 기록보다 **나중에** 낸 이의제기만 열려 있다 — 반려한 뒤 다시 내면 다시 열린다.
 * storage/admin.repo 큐 SQL 의 is_open 이 이 식과 같아야 한다(정렬·건수가 화면 상태와 어긋나지 않게).
 */
export function isAppealOpen(p: {
    appealAt: Date | string | null | undefined;
    isBlinded: boolean | null | undefined;
    lastActionAt: Date | string | null | undefined;
}): boolean {
    const appeal = toTime(p.appealAt);
    if (appeal == null || !p.isBlinded) return false;
    const last = toTime(p.lastActionAt);
    return last == null || appeal > last;
}

/** 조치가 신고를 어떤 상태로 닫나. null = 신고 판단과 무관한 조치(정지 해제)라 신고 상태를 건드리지 않는다. */
export function reportStatusForAction(action: ModerationAction): Exclude<ReportStatus, "pending"> | null {
    switch (action) {
        case "blind":
        case "delete":
        case "ban":
        case "appeal_reject":
            return "actioned";
        case "dismiss":
        case "unblind":
        case "appeal_approve":
            return "dismissed";
        case "unban":
            return null;
    }
}

/**
 * 큐에서 이 대상이 어느 칸에 서나. 안 닫힌 신고나 열린 이의제기가 있으면 미처리.
 * 아니면 마지막 처리 기록이 말하는 쪽, 기록이 없거나 신고와 무관한 조치(정지 해제)면 신고 행 상태로 판단한다.
 */
export function queueState(p: {
    pendingCount: number;
    actionedCount: number;
    appealOpen: boolean;
    lastAction: string | null;
}): QueueState {
    if (p.pendingCount > 0 || p.appealOpen) return "open";
    const byLast = p.lastAction && isModerationAction(p.lastAction) ? reportStatusForAction(p.lastAction) : null;
    if (byLast) return byLast;
    return p.actionedCount > 0 ? "actioned" : "dismissed";
}

/** 기다린 지 REPORT_SLA_HOURS 를 넘겼나. */
export function isOverdue(since: Date | string | null | undefined, now: Date = new Date(), hours = REPORT_SLA_HOURS): boolean {
    const t = toTime(since);
    return t != null && now.getTime() - t > hours * 3600_000;
}

export interface ActionContext {
    targetType: ReportTargetType;
    /** 원문이 아직 있나 — 이미 지웠거나 작성자가 지웠으면 false. */
    exists: boolean;
    isBlinded: boolean | null;
    appealOpen: boolean;
    pendingCount: number;
    /** canBan = 로그인 계정(프로필)이 있고 운영자 계정이 아니다. 매장에서 번호만으로 만든 회원은 정지할 계정이 없다. */
    author: { canBan: boolean; banned: boolean } | null;
}

/**
 * 지금 이 대상에 할 수 있는 조치. 화면은 이 목록만 버튼으로 그리고, 서버는 조치 직전에 최신 상태로 다시 계산해 대조한다.
 * 순서 = 화면 버튼 순서(판단이 걸린 이의제기 → 콘텐츠 조치 → 사람 조치 → 기각).
 */
export function availableActions(c: ActionContext): ModerationAction[] {
    const out: ModerationAction[] = [];
    const blindable = c.exists && BLINDABLE_TARGETS.includes(c.targetType);
    if (c.appealOpen && c.exists && APPEALABLE_TARGETS.includes(c.targetType)) out.push("appeal_approve", "appeal_reject");
    if (blindable && !c.isBlinded) out.push("blind");
    // 이의제기가 열려 있으면 해제는 '승인'으로만 — 같은 결과를 두 버튼이 내면 작성자가 받는 안내가 엇갈린다.
    if (blindable && c.isBlinded && !c.appealOpen) out.push("unblind");
    if (c.exists && DELETABLE_TARGETS.includes(c.targetType)) out.push("delete");
    if (c.author?.canBan) out.push(c.author.banned ? "unban" : "ban");
    if (c.pendingCount > 0) out.push("dismiss");
    return out;
}

export interface AlertState {
    /** 방금 들어온 새 신고인가 — 같은 사람이 같은 대상을 또 누르면 DB 가 무시하므로(onConflictDoNothing) 새 행이 없다. */
    freshReport: boolean;
    /** 이 대상으로 최근 REPORT_ALERT_WINDOW_MIN 안에 운영자 알림을 이미 보냈나. */
    alertedThisTarget: boolean;
    /** 최근 REPORT_ALERT_WINDOW_MIN 안에 알림을 보낸 서로 다른 대상 수. */
    targetsAlerted: number;
    /** 최근 REPORT_ALERT_WINDOW_MIN 안에 이 신고자의 신고로 알림을 보낸 서로 다른 대상 수(없으면 0 으로 본다). */
    reporterAlerts?: number;
}

/** 운영자에게 새 신고 알림을 보낼까. 같은 대상은 창 안에 한 번, 신고자 한 명은 창 안에 몇 대상까지, 전체는 시간당 상한까지. */
export function shouldAlertAdmins(s: AlertState, cap = REPORT_ALERT_HOURLY_CAP, perReporterCap = REPORT_ALERT_PER_REPORTER_CAP): boolean {
    if (!s.freshReport) return false;
    if (s.alertedThisTarget) return false;
    if ((s.reporterAlerts ?? 0) >= perReporterCap) return false;
    return s.targetsAlerted < cap;
}

/** 운영자 알림 문구. 신고된 원문은 싣지 않는다 — 잠금 화면에 욕설·개인정보가 그대로 뜨지 않게. */
export function buildReportAlert(p: { targetType: ReportTargetType; reason: string; reporterCount: number }): { title: string; body: string } {
    const who = p.reporterCount > 1 ? ` · 신고 ${p.reporterCount}명` : "";
    return {
        title: "새 신고가 들어왔어요",
        body: `${TARGET_LABEL[p.targetType]} · ${reasonLabel(p.reason)}${who}. ${REPORT_SLA_HOURS}시간 안에 확인해 주세요.`,
    };
}

/**
 * 조치 뒤 작성자에게 보낼 안내. null = 알리지 않는다.
 * 기각은 작성자가 몰랐던 신고라 알릴 것이 없다. 정지는 여기서 알리지 않는다 — 앱 접근 자체를 막는 쪽(로그인 차단)에서 안내할 일이다.
 */
export function authorNoticeFor(action: ModerationAction, targetType: ReportTargetType): { title: string; body: string } | null {
    const canAppeal = APPEALABLE_TARGETS.includes(targetType);
    switch (action) {
        case "blind":
            return {
                title: "⚠️ 게시물 블라인드 안내",
                body: canAppeal
                    ? "운영 정책 위반 신고가 확인되어 게시물이 가려졌습니다. 부당하다면 앱에서 바로 이의제기할 수 있습니다."
                    : "운영 정책 위반 신고가 확인되어 게시물이 가려졌습니다.",
            };
        case "delete":
            return { title: "게시물 삭제 안내", body: "운영 정책 위반 신고가 확인되어 회원님이 올린 콘텐츠를 삭제했습니다." };
        case "unblind":
            return { title: "블라인드 해제 안내", body: "검토 결과 문제가 없어 게시물이 다시 보입니다." };
        case "appeal_approve":
            return { title: "이의제기 결과 안내", body: "이의제기가 받아들여져 게시물이 다시 보입니다." };
        case "appeal_reject":
            return { title: "이의제기 결과 안내", body: "검토했지만 운영 정책에 따라 블라인드를 유지합니다." };
        default:
            return null;
    }
}

/** 큐 미리보기용 본문 — 빈 줄 도배만 줄이고 줄바꿈은 살린다. */
export function previewText(s: string | null | undefined, max = 400): string | null {
    if (!s) return null;
    const t = s.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    if (!t) return null;
    return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/** 삭제 전에 처리 기록에 남길 원문 일부(제목 + 본문). */
export function snapshotNote(title: string | null | undefined, text: string | null | undefined, max = 500): string | null {
    const joined = [title?.trim(), text?.trim()].filter(Boolean).join("\n");
    if (!joined) return null;
    return joined.length > max ? `${joined.slice(0, max - 1)}…` : joined;
}
