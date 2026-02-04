import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { CrewMember, CrewData } from '@/types/crew';

export const useClubSettings = (crewId: string, initialMembers?: CrewMember[]) => {
    const { toast } = useToast();
    const queryClient = useQueryClient();

    // 1. Members Query
    const membersQuery = useQuery<CrewMember[]>({
        queryKey: [`/api/hiq/crews/${crewId}/members`],
        enabled: !!crewId,
        initialData: initialMembers,
    });

    // 2. Update Crew Info Mutation
    const updateCrew = useMutation({
        mutationFn: async (data: Partial<CrewData>) => {
            const res = await fetch(`/api/hiq/crews/${crewId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
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
            const res = await fetch(`/api/hiq/crews/${crewId}/members/${memberId}/role`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ role })
            });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            toast({ title: "권한이 변경되었습니다" });
        }
    });

    // 4. Approve Member Mutation
    const approveMember = useMutation({
        mutationFn: async (memberId: string) => {
            const res = await fetch(`/api/hiq/crews/${crewId}/members/${memberId}/approve`, { method: 'POST' });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}/members`] });
            queryClient.invalidateQueries({ queryKey: [`/api/hiq/crews/${crewId}`] });
            toast({ title: "가입이 승인되었습니다" });
        }
    });

    // 5. Kick Member Mutation
    const kickMember = useMutation({
        mutationFn: async (memberId: string) => {
            const res = await fetch(`/api/hiq/crews/${crewId}/members/${memberId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
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
            const res = await fetch(`/api/hiq/crews/${crewId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error(await res.text());
            return res.json();
        },
        onSuccess: () => {
            window.location.href = '/hiq/menu';
        }
    });

    return {
        members: membersQuery.data || [],
        isLoading: membersQuery.isLoading,
        updateCrew,
        updateRole,
        approveMember,
        kickMember,
        deleteCrew
    };
};
