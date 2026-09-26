import { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { LucideX } from '@/lib/icons';
import { CrewMember } from '@/types/crew';
import { useClubSettings } from '@/hooks/useClubSettings';
import { ClubGeneralTab } from './club-settings/ClubGeneralTab';
import { ClubMemberTab } from './club-settings/ClubMemberTab';
import { ClubIntroTemplateTab } from './club-settings/ClubIntroTemplateTab';
import { IconButton } from '@/components/hiq/crew-ui';
import { useT } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type ClubSettingsTab = 'general' | 'template' | 'members';

interface ClubSettingsDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    crew: any;
    /** GET /crews/:id 응답에서 crew 와 나란히 오는 베이스캠프(파트너 매장·디렉토리) — 이름만 쓴다. */
    baseStore?: { name?: string | null } | null;
    baseListing?: { name?: string | null } | null;
    members?: CrewMember[];
    me: any;
    /** 열 때 보일 탭. 없으면 가입 대기자가 있을 땐 '멤버', 아니면 '정보'. */
    initialTab?: ClubSettingsTab;
}

/**
 * 크루 관리 — 모바일 전체 높이 바텀 시트(2026-09-26).
 *
 * 예전엔 가운데 뜨는 90vh 대화상자였다: 탭 셋이 40px 줄에 끼어 있고 가입 대기 배지가 overflow-hidden 에 잘렸으며,
 * 대기자가 있어도 늘 '정보' 탭으로 열렸다. 이제 화면을 다 쓰는 시트에 44px 탭, 배지는 탭 글자 옆(잘리지 않는다),
 * 대기자가 있으면 '멤버' 탭으로 연다. 가입 신청 알림(?manage=members)도 곧장 이 탭으로 온다.
 */
export function ClubSettingsDialog({ open, onOpenChange, crew, baseStore, baseListing, members: initialMembers, me, initialTab }: ClubSettingsDialogProps) {
    const { t } = useT();
    const {
        members,
        updateCrew,
        updateRole,
        approveMember,
        kickMember,
        transferLeader,
        deleteCrew
    } = useClubSettings(crew?.id, initialMembers);

    const myMemberInfo = members.find((m) => m.member.id === me?.id);
    const isLeader = myMemberInfo?.role === 'leader';
    // 정보 수정은 리더+매니저 (서버 PATCH 정책과 일치, 오너 확정 2026-08-05). 크루 폐쇄만 리더 전용.
    const canEdit = isLeader || myMemberInfo?.role === 'manage';
    const pendingCount = members.filter((m) => m.role === 'pending').length;
    const activeCount = members.length - pendingCount;

    const [tab, setTab] = useState<ClubSettingsTab>('general');
    // 열릴 때마다 시작 탭을 고른다(닫혀 있는 동안 대기자가 생겼을 수 있다).
    useEffect(() => {
        if (open) setTab(initialTab ?? (pendingCount > 0 ? 'members' : 'general'));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, initialTab]);

    const tabs: Array<{ id: ClubSettingsTab; label: string; badge?: number }> = [
        { id: 'general', label: t("clubSettings.tabGeneral") },
        { id: 'template', label: t("clubSettings.tabTemplate") },
        { id: 'members', label: t("clubSettings.tabMembers"), badge: pendingCount },
    ];

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="bottom"
                hideClose
                // 열자마자 닫기 버튼에 포커스 링이 걸려 까만 동그라미가 떴다 — 터치 화면에선 첫 포커스를 두지 않는다
                onOpenAutoFocus={(e) => e.preventDefault()}
                className="max-w-md mx-auto h-[100dvh] sm:h-[92dvh] sm:rounded-t-card bg-surface-0 border-surface-line p-0 gap-0 flex flex-col"
            >
                {/* 머리 — 제목 + 닫기. 노치 아래에서 시작한다. */}
                <div className="shrink-0 pt-[env(safe-area-inset-top)] bg-surface-0">
                    <div className="h-14 pl-4 pr-1 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                            <SheetTitle className="text-[17px] font-semibold text-ink-1 truncate">{t("clubSettings.title")}</SheetTitle>
                            <SheetDescription className="text-[12px] font-medium text-ink-3 truncate">{crew?.name || t("clubSettings.description")}</SheetDescription>
                        </div>
                        <IconButton label={t("crewMgmt.close")} onClick={() => onOpenChange(false)}>
                            <LucideX />
                        </IconButton>
                    </div>
                    <div role="tablist" aria-label={t("clubSettings.title")} className="flex px-4 border-b border-surface-line">
                        {tabs.map((tb) => {
                            const active = tab === tb.id;
                            return (
                                <button
                                    key={tb.id}
                                    type="button"
                                    role="tab"
                                    id={`crew-settings-tab-${tb.id}`}
                                    aria-selected={active}
                                    aria-controls={`crew-settings-panel-${tb.id}`}
                                    onClick={() => setTab(tb.id)}
                                    className={cn(
                                        "flex-1 h-11 inline-flex items-center justify-center gap-1.5 text-[15px] font-semibold border-b-2 -mb-px transition-colors",
                                        active ? "text-ink-1 border-brand" : "text-ink-3 border-transparent",
                                    )}
                                >
                                    {tb.label}
                                    {!!tb.badge && (
                                        <span className="min-w-5 h-5 px-1.5 rounded-pill bg-brand text-brand-fg text-[12px] font-semibold rk-num inline-flex items-center justify-center" aria-label={t("crewMgmt.pendingBadge").replace("{n}", String(tb.badge))}>
                                            {tb.badge}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div
                    role="tabpanel"
                    id={`crew-settings-panel-${tab}`}
                    aria-labelledby={`crew-settings-tab-${tab}`}
                    className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 pb-[env(safe-area-inset-bottom)] custom-scrollbar"
                >
                    {tab === 'general' && (
                        <ClubGeneralTab
                            crew={crew}
                            baseName={baseListing?.name ?? baseStore?.name ?? null}
                            activeCount={activeCount}
                            isLeader={isLeader}
                            canEdit={canEdit}
                            onUpdate={(patch) => updateCrew.mutate(patch)}
                            onDelete={() => deleteCrew.mutate()}
                            isUpdating={updateCrew.isPending}
                            isDeleting={deleteCrew.isPending}
                        />
                    )}
                    {tab === 'template' && (
                        // 가입 질문 편집도 리더+매니저 (prop 이름만 isLeader로 남음)
                        <ClubIntroTemplateTab
                            crew={crew}
                            isLeader={canEdit}
                            onUpdate={(data) => updateCrew.mutate(data)}
                            isUpdating={updateCrew.isPending}
                        />
                    )}
                    {tab === 'members' && (
                        <ClubMemberTab
                            crew={crew}
                            members={members}
                            me={me}
                            onUpdateRole={(memberId, role) => updateRole.mutateAsync({ memberId, role })}
                            onKick={(id) => kickMember.mutateAsync(id)}
                            onApprove={(id) => approveMember.mutateAsync(id)}
                            onTransfer={(id) => transferLeader.mutateAsync(id)}
                        />
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}
