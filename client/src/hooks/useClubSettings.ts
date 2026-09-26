import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from "wouter";
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CrewMember } from '@/types/crew';
import { useT } from '@/lib/i18n';

export const useClubSettings = (crewId: string, initialMembers?: CrewMember[]) => {
    const { toast } = useToast();
    const { t } = useT();
    const queryClient = useQueryClient();
    const [_, setLocation] = useLocation();

    // 1. Members Query
    const membersQuery = useQuery<CrewMember[]>({
        queryKey: [`/api/hiq/crews/${crewId}/members`],
        enabled: !!crewId,
        initialData: initialMembers,
    });

    // 멤버·역할·정보가 바뀌면 이 크루 화면만이 아니라 목록도 낡는다 — '내 크루'의 역할 배지·인원, 둘러보기의 인원·정원 마감.
    // 목록 키는 ["/api/hiq/crews/mine", 종목]·["/api/hiq/crews", 검색어, …] 라 앞부분 일치로 한 번에 지운다.
    // 예전엔 가입·탈퇴만 목록을 갱신하고 승인·강퇴·역할 변경·수정은 크루 화면만 갱신했다.
    const invalidateCrew = (withMembers = true) => {
        queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
        if (withMembers) queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews/mine"] });
        queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews"] });
    };

    // 2. Update Crew Info Mutation — body 는 바뀐 칸만(ClubGeneralTab 의 crewSettingsPatch)
    const updateCrew = useMutation({
        mutationFn: async (data: Record<string, unknown>) => {
            return await apiRequest(`/api/hiq/crews/${crewId}`, {
                method: 'PATCH',
                body: data
            });
        },
        onSuccess: (res: any) => {
            // 승인제→자동 전환으로 대기자가 자동 승격됐으면 멤버 목록도 갱신
            const promoted = res?.promotedCount ?? res?.data?.promotedCount ?? 0;
            invalidateCrew(promoted > 0);
            if (promoted > 0) {
                toast({ title: t("clubSettings.updated"), description: t("clubSettings.updatedPromoted").replace("{n}", String(promoted)) });
            } else {
                toast({ title: t("clubSettings.updated") });
            }
        },
        onError: (err: Error) => {
            toast({ title: t("clubSettings.updateFailed"), description: err.message, variant: "destructive" });
        }
    });

    // 3. Update Member Role Mutation
    const updateRole = useMutation({
        mutationFn: async ({ memberId, role }: { memberId: string, role: string }) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/members/${memberId}/role`, {
                method: 'PATCH',
                body: { role }
            });
        },
        onSuccess: () => {
            invalidateCrew();
            toast({ title: t("clubSettings.roleChanged") });
        },
        onError: (err: Error) => {
            toast({ title: t("clubSettings.actionFailed"), description: err.message, variant: "destructive" });
        }
    });

    // 4. Approve Member Mutation
    const approveMember = useMutation({
        mutationFn: async (memberId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/members/${memberId}/approve`, { method: 'POST' });
        },
        onSuccess: () => {
            invalidateCrew();
            toast({ title: t("clubSettings.approved") });
        },
        onError: (err: Error) => {
            toast({ title: t("clubSettings.approveFailed"), description: err.message, variant: "destructive" });
        }
    });

    // 5. Kick Member Mutation (대기자 거절도 이 라우트)
    const kickMember = useMutation({
        mutationFn: async (memberId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/members/${memberId}`, { method: 'DELETE' });
        },
        onSuccess: () => {
            invalidateCrew();
            toast({ title: t("clubSettings.done") });
        },
        onError: (err: Error) => {
            toast({ title: t("clubSettings.actionFailed"), description: err.message, variant: "destructive" });
        }
    });

    // 6. 크루장 넘기기 — 서버가 대상→크루장, 나→운영진, hiq_crews.leader_id 를 한 트랜잭션으로 바꾼다.
    const transferLeader = useMutation({
        mutationFn: async (memberId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/transfer`, { method: 'POST', body: { memberId } });
        },
        onSuccess: () => {
            invalidateCrew();
            toast({ title: t("crewMgmt.transferDone") });
        },
        onError: (err: Error) => {
            toast({ title: t("clubSettings.actionFailed"), description: err.message, variant: "destructive" });
        }
    });

    // 7. Delete Crew Mutation
    const deleteCrew = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${crewId}`, { method: 'DELETE' });
        },
        onSuccess: async () => {
            // Navigate away first, then drop this crew's cached queries. Using removeQueries
            // (not invalidate) avoids an active observer on the still-mounting settings screen
            // refetching the just-deleted crew and flashing a 404 before the route transitions.
            toast({ title: t("crewMgmt.deleted") });
            setLocation('/club');
            queryClient.removeQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            queryClient.removeQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews/mine"] });
        },
        // 예전엔 실패해도 아무 말이 없어 '삭제 중…'이 풀리기만 했다.
        onError: (err: Error) => {
            toast({ title: t("crewMgmt.deleteFailed"), description: err.message, variant: "destructive" });
        }
    });

    return {
        members: Array.isArray(membersQuery.data) ? membersQuery.data : [],
        isLoading: membersQuery.isLoading,
        updateCrew,
        updateRole,
        approveMember,
        kickMember,
        transferLeader,
        deleteCrew
    };
};
