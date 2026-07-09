import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation } from "wouter";
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { CrewMember, CrewData } from '@/types/crew';

export const useClubSettings = (crewId: string, initialMembers?: CrewMember[]) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();
    const [_, setLocation] = useLocation();

    // 1. Members Query
    const membersQuery = useQuery<CrewMember[]>({
        queryKey: [`/api/hiq/crews/${crewId}/members`],
        enabled: !!crewId,
        initialData: initialMembers,
    });

    // 2. Update Crew Info Mutation
    const updateCrew = useMutation({
        mutationFn: async (data: Partial<CrewData>) => {
            return await apiRequest(`/api/hiq/crews/${crewId}`, {
                method: 'PATCH',
                body: data
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            toast({ title: "크루 정보가 수정되었습니다" });
        },
        onError: (err: Error) => {
            toast({ title: "수정 실패", description: err.message, variant: "destructive" });
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
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            toast({ title: "권한이 변경되었습니다" });
        }
    });

    // 4. Approve Member Mutation
    const approveMember = useMutation({
        mutationFn: async (memberId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/members/${memberId}/approve`, { method: 'POST' });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            toast({ title: "가입이 승인되었습니다" });
        },
        onError: (err: Error) => {
            toast({ title: "승인 실패", description: err.message, variant: "destructive" });
        }
    });

    // 5. Kick Member Mutation
    const kickMember = useMutation({
        mutationFn: async (memberId: string) => {
            return await apiRequest(`/api/hiq/crews/${crewId}/members/${memberId}`, { method: 'DELETE' });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            toast({ title: "처리되었습니다" });
        }
    });

    // 6. Delete Crew Mutation
    const deleteCrew = useMutation({
        mutationFn: async () => {
            return await apiRequest(`/api/hiq/crews/${crewId}`, { method: 'DELETE' });
        },
        onSuccess: async () => {
            // Navigate away first, then drop this crew's cached queries. Using removeQueries
            // (not invalidate) avoids an active observer on the still-mounting settings screen
            // refetching the just-deleted crew and flashing a 404 before the route transitions.
            setLocation('/club');
            queryClient.removeQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            queryClient.removeQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews"] });
            await queryClient.invalidateQueries({ queryKey: ["/api/hiq/crews/mine"] });
        }
    });

    return {
        members: Array.isArray(membersQuery.data) ? membersQuery.data : [],
        isLoading: membersQuery.isLoading,
        updateCrew,
        updateRole,
        approveMember,
        kickMember,
        deleteCrew
    };
};
