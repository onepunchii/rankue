import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { MyCrewCard } from "./MyCrewCard";
import { Button } from "@/components/ui/button";
import { LucideTent, LucidePlus } from "@/lib/icons";

interface MyCrewListProps {
    currentSport: string;
}

export const MyCrewList = memo(({ currentSport }: MyCrewListProps) => {
    const [_, setLocation] = useLocation();

    const { data: myCrews, isLoading } = useQuery<any[]>({
        queryKey: ["/api/hiq/crews/mine", currentSport],
        queryFn: async () => await apiRequest(`/api/hiq/crews/mine?sport=${currentSport}`),
        staleTime: 1000 * 60 * 5, // 5 minutes
    });

    if (isLoading) {
        return <div className="h-40 bg-black/[0.04] rounded-card animate-pulse" />;
    }

    if (!myCrews || myCrews.length === 0) {
        return (
            <div className="rk-card flex flex-col items-center justify-center py-12 px-6 text-center">
                <div className="w-14 h-14 rounded-full bg-black/[0.04] flex items-center justify-center mb-4">
                    <LucideTent className="w-7 h-7 text-black/40" />
                </div>
                <p className="text-ink-1 font-semibold text-[16px] mb-1">크루가 없으신가요?</p>
                <p className="text-ink-3 text-[13px] font-medium mb-5">새로운 크루를 만들어 시작해보세요</p>
                <Button
                    className="bg-brand text-brand-fg hover:bg-brand-strong font-semibold rounded-full px-7 h-11 text-[14px]"
                    onClick={() => setLocation("/club/create")}
                >
                    <LucidePlus className="w-4 h-4 mr-1.5" />
                    크루 개설하기
                </Button>
            </div>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-3">
            {myCrews.map(({ crew, role, memberCount }) => (
                <MyCrewCard
                    key={crew.id}
                    crew={{ ...crew, memberCount }}
                    role={role}
                    onClick={() => setLocation(`/club/${crew.id}`)}
                />
            ))}
        </div>
    );
});

MyCrewList.displayName = "MyCrewList";
