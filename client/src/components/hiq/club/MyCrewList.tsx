import { memo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { apiRequest } from "@/lib/queryClient";
import { MyCrewCard } from "./MyCrewCard";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LucideTent, LucidePlus } from "lucide-react";
import { cn } from "@/lib/utils";

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
        return <div className="h-48 bg-white/5 rounded-card animate-pulse" />;
    }

    if (!myCrews || myCrews.length === 0) {
        return (
            <Card className="rounded-card bg-[#141414] border-white/5 overflow-hidden">
                <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-4 relative">
                    <div className={cn(
                        "absolute inset-0 bg-gradient-to-t to-transparent pointer-events-none",
                        currentSport === "GOLF" ? "from-brand/5" : "from-brand/5"
                    )} />
                    <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-2 animate-bounce-slow">
                        <LucideTent className={cn("w-8 h-8 text-white/45", currentSport === "GOLF" && "text-brand/40")} />
                    </div>
                    <div className="relative z-10">
                        <p className="text-white font-bold text-lg mb-1">크루가 없으신가요?</p>
                        <p className="text-white/40 text-sm">새로운 크루를 만들어 시작해보세요</p>
                    </div>
                    <Button
                        className={cn(
                            "mt-4 text-black font-bold rounded-full px-8 py-6 h-auto text-base transition-all",
                            currentSport === "GOLF"
                                ? "bg-brand hover:bg-[#a3e635] hover:"
                                : "bg-brand hover:bg-[#059669] hover:"
                        )}
                        onClick={() => setLocation("/club/create")}
                    >
                        <LucidePlus className="w-5 h-5 mr-2" />
                        크루 개설하기
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="grid grid-cols-1 gap-4">
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
