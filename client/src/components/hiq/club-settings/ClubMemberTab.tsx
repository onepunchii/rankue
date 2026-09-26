import { useMemo, useState } from 'react';
import {
    LucideCheck, LucideChevronRight, LucideCrown, LucideLoader2, LucideShield, LucideShieldAlert, LucideUserX,
} from '@/lib/icons';
import { cn } from '@/lib/utils';
import { CrewMember, CrewData } from '@/types/crew';
import { useT } from "@/lib/i18n";
import {
    CREW_BTN, CREW_TEXT, ConfirmDialog, CrewAvatar, CrewEmpty, CrewRoleBadge, CrewSection,
} from '@/components/hiq/crew-ui';
import { CrewActionSheet, type CrewSheetAction } from '@/components/hiq/club/CrewActionSheet';
import { MemberSearchBar } from '@/components/hiq/club/MemberSearchBar';
import { memberStat } from '@/components/hiq/club/memberStat';
import { filterSortMembers, memberActions, type MemberSort } from '@shared/crewManage';

interface ClubMemberTabProps {
    crew: CrewData;
    members: CrewMember[];
    me: any;
    onUpdateRole: (memberId: string, role: string) => Promise<any> | void;
    onKick: (memberId: string) => Promise<any> | void;
    onApprove: (memberId: string) => Promise<any> | void;
    onTransfer: (memberId: string) => Promise<any> | void;
}

type ConfirmKind = 'kick' | 'reject' | 'transfer';

const nameOf = (m: CrewMember) => m.member.nickname || m.member.name || '';

/**
 * 멤버 관리(2026-09-26 재작성).
 *
 * 예전엔 멤버 줄마다 '운영진 임명'·강퇴 아이콘을 붙여 375px 에서 줄이 넘쳤고(이름에 truncate 도 없었다),
 * 대기자 거절은 확인 없이 이름표 없는 X 아이콘 한 번이었으며, 강퇴 확인 창은 누구를 내보내는지 말하지 않았다.
 * 이제 줄을 누르면 아래에서 동작 시트(운영진 임명/해제·크루장 넘기기·내보내기)가 올라오고, 되돌리기 어려운 동작은
 * 이름을 적은 확인 창을 한 번 더 거친다. 누가 무엇을 할 수 있는지는 서버 규칙을 옮긴 shared/crewManage.memberActions.
 */
export function ClubMemberTab({ crew, members, me, onUpdateRole, onKick, onApprove, onTransfer }: ClubMemberTabProps) {
    const { t, locale } = useT();
    const [busy, setBusy] = useState<{ id: string; action: string } | null>(null);
    const [sheetFor, setSheetFor] = useState<CrewMember | null>(null);
    const [confirm, setConfirm] = useState<{ kind: ConfirmKind; member: CrewMember } | null>(null);
    const [query, setQuery] = useState("");
    const [sort, setSort] = useState<MemberSort>("role");

    const pendingMembers = useMemo(() => filterSortMembers(members.filter((m) => m.role === 'pending'), "", "joined", locale).reverse(), [members, locale]);
    const allActive = useMemo(() => members.filter((m) => m.role !== 'pending'), [members]);
    const activeMembers = useMemo(() => filterSortMembers(allActive, query, sort, locale), [allActive, query, sort, locale]);

    const myRole = useMemo(() => members.find((m) => m.member.id === me?.id)?.role, [members, me]);
    const isLeader = myRole === 'leader';

    const run = async (id: string, action: string, fn: () => Promise<any> | void) => {
        setBusy({ id, action });
        try {
            await fn();
        } catch {
            /* surfaced via mutation onError toast */
        } finally {
            setBusy(null);
        }
    };

    const isBusy = (id: string, action?: string) => busy?.id === id && (!action || busy.action === action);

    const sheetActions = (m: CrewMember): CrewSheetAction[] => {
        const can = memberActions(myRole, m.role, m.member.id === me?.id);
        const list: CrewSheetAction[] = [];
        if (can.appointManager) list.push({ key: 'appoint', label: t("clubMemberTab.appointManager"), icon: <LucideShield />, onSelect: () => run(m.member.id, 'role', () => onUpdateRole(m.member.id, 'manage')) });
        if (can.demoteManager) list.push({ key: 'demote', label: t("crewMgmt.demoteManager"), icon: <LucideShieldAlert />, onSelect: () => run(m.member.id, 'role', () => onUpdateRole(m.member.id, 'member')) });
        if (can.transfer) list.push({ key: 'transfer', label: t("crewMgmt.transferLeader"), icon: <LucideCrown />, onSelect: () => setConfirm({ kind: 'transfer', member: m }) });
        if (can.kick) list.push({ key: 'kick', label: t("crewMgmt.kick"), icon: <LucideUserX />, tone: 'danger', onSelect: () => setConfirm({ kind: 'kick', member: m }) });
        return list;
    };

    const confirmCopy = (c: { kind: ConfirmKind; member: CrewMember }) => {
        const name = nameOf(c.member);
        if (c.kind === 'transfer') return {
            title: t("crewMgmt.transferTitle").replace("{name}", name),
            desc: t("crewMgmt.transferDesc").replace("{name}", name),
            label: t("crewMgmt.transferLeader"),
            danger: false,
        };
        if (c.kind === 'reject') return {
            title: t("crewMgmt.rejectTitle").replace("{name}", name),
            desc: t("crewMgmt.rejectDesc"),
            label: t("crewMgmt.reject"),
            danger: true,
        };
        return {
            title: t("crewMgmt.kickTitle").replace("{name}", name),
            desc: t("clubMemberTab.kickConfirm"),
            label: t("crewMgmt.kick"),
            danger: true,
        };
    };

    const runConfirm = async () => {
        if (!confirm) return;
        const { kind, member } = confirm;
        const id = member.member.id;
        await run(id, kind, () => (kind === 'transfer' ? onTransfer(id) : onKick(id)));
        setConfirm(null);
    };

    const copy = confirm ? confirmCopy(confirm) : null;
    const sheetList = sheetFor ? sheetActions(sheetFor) : [];

    return (
        <div className="flex flex-col gap-6 pt-4 pb-8">
            {pendingMembers.length > 0 && (
                <CrewSection title={t("clubMemberTab.pendingTitle")} count={pendingMembers.length}>
                    <ul className="flex flex-col gap-2">
                        {pendingMembers.map((m) => {
                            const id = m.member.id;
                            return (
                                <li key={id} className="rk-card p-3 flex items-center gap-3">
                                    <CrewAvatar src={m.member.profileImageUrl} name={nameOf(m)} size={40} />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-[15px] font-semibold text-ink-1 truncate">{nameOf(m)}</p>
                                        <p className={cn(CREW_TEXT.caption, "rk-num")}>
                                            {t("crewMgmt.requestedOn").replace("{date}", new Date(m.joinedAt).toLocaleDateString(locale, { month: 'short', day: 'numeric' }))}
                                        </p>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={isBusy(id)}
                                        onClick={() => setConfirm({ kind: 'reject', member: m })}
                                        className={cn(CREW_BTN.ghost, "px-3 text-ink-3")}
                                    >
                                        {isBusy(id, 'reject') ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : t("crewMgmt.reject")}
                                    </button>
                                    <button
                                        type="button"
                                        disabled={isBusy(id)}
                                        onClick={() => run(id, 'approve', () => onApprove(id))}
                                        className={cn(CREW_BTN.primary, "px-3.5 text-[13px]")}
                                    >
                                        {isBusy(id, 'approve') ? <LucideLoader2 className="w-4 h-4 animate-spin" /> : <><LucideCheck className="w-4 h-4" />{t("crewMgmt.approve")}</>}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                </CrewSection>
            )}

            <CrewSection title={t("clubMemberTab.activeTitle")} count={allActive.length}>
                {/* 크루장은 넘기기 전엔 나갈 수 없다(서버 leaderCannotLeave) — 어디서 넘기는지 여기서 알려 준다. */}
                {isLeader && <p className={CREW_TEXT.sub}>{t("crewMgmt.transferHint")}</p>}
                {allActive.length > 5 && <MemberSearchBar query={query} onQuery={setQuery} sort={sort} onSort={setSort} />}
                {activeMembers.length === 0 ? (
                    <CrewEmpty title={t("crewMgmt.noMemberMatch")} />
                ) : (
                    <ul className="flex flex-col gap-2">
                        {activeMembers.map((m) => {
                            const id = m.member.id;
                            const isMe = id === me?.id;
                            const actionable = sheetActions(m).length > 0;
                            const stat = memberStat(m.member as any, crew?.sportCategory, crew?.gameType);
                            const body = (
                                <>
                                    <CrewAvatar src={m.member.profileImageUrl} name={nameOf(m)} size={40} />
                                    <span className="min-w-0 flex-1 flex flex-col gap-0.5">
                                        <span className="flex items-center gap-1.5 min-w-0">
                                            <span className={cn("text-[15px] font-semibold truncate", isMe ? "text-brand" : "text-ink-1")}>{nameOf(m)}</span>
                                            <CrewRoleBadge role={m.role} />
                                            {isMe && <span className="shrink-0 text-[12px] font-semibold text-brand">{t("clubMemberTab.me")}</span>}
                                        </span>
                                        <span className={cn(CREW_TEXT.caption, "rk-num")}>
                                            {stat ? `${t(stat.labelKey)} ${stat.value}` : t("crewMgmt.noRecord")}
                                        </span>
                                    </span>
                                    {isBusy(id) ? (
                                        <LucideLoader2 className="w-5 h-5 shrink-0 animate-spin text-ink-3" />
                                    ) : actionable ? (
                                        <LucideChevronRight className="w-[18px] h-[18px] shrink-0 text-ink-4" />
                                    ) : null}
                                </>
                            );
                            return (
                                <li key={id}>
                                    {actionable ? (
                                        <button
                                            type="button"
                                            onClick={() => setSheetFor(m)}
                                            disabled={isBusy(id)}
                                            aria-label={`${nameOf(m)} — ${t("crewMgmt.manageMember")}`}
                                            className="rk-card w-full p-3 flex items-center gap-3 text-left active:bg-surface-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                                        >
                                            {body}
                                        </button>
                                    ) : (
                                        <div className="rk-card p-3 flex items-center gap-3">{body}</div>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                )}
            </CrewSection>

            <CrewActionSheet
                open={!!sheetFor && sheetList.length > 0}
                onOpenChange={(open) => { if (!open) setSheetFor(null); }}
                title={sheetFor ? nameOf(sheetFor) : ""}
                subtitle={sheetFor?.role === 'manage' ? t("crewUi.roleManager") : t("crewMgmt.roleMember")}
                header={sheetFor ? <CrewAvatar src={sheetFor.member.profileImageUrl} name={nameOf(sheetFor)} size={40} /> : undefined}
                actions={sheetList}
            />

            {copy && (
                <ConfirmDialog
                    open={!!confirm}
                    onOpenChange={(open) => { if (!open && !busy) setConfirm(null); }}
                    title={copy.title}
                    desc={copy.desc}
                    confirmLabel={copy.label}
                    danger={copy.danger}
                    busy={!!busy}
                    onConfirm={runConfirm}
                />
            )}
        </div>
    );
}
