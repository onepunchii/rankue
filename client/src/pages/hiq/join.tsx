
import { useEffect, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { LucideCheckCircle2, LucideXCircle, LucideLoader2 } from "@/lib/icons";
import { HiqMember } from "@shared/schema";
import { useStore } from "@/contexts/StoreContext";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/lib/i18n";

export default function HiqJoin() {
    const { t } = useT();
    const [, params] = useRoute("/join/:code");
    const code = params?.code;
    const [, setLocation] = useLocation();
    const { store } = useStore();
    const { toast } = useToast();

    // Check login status
    const { data: me, isLoading: meLoading, error: meError } = useQuery<HiqMember>({
        queryKey: ["/api/hiq/me"],
        retry: false
    });

    // Check invite status
    const { data: invite, isLoading: inviteLoading } = useQuery<any>({
        queryKey: [`/api/hiq/invite/${code}`],
        enabled: !!code
    });

    const joinMutation = useMutation({
        mutationFn: async () => {
            await apiRequest(`/api/hiq/invite/${code}/join`, { method: "POST" });
        },
        onSuccess: () => {
            // Joined successfully
        },
        onError: () => {
            toast({
                variant: "destructive",
                title: t("join.failTitle"),
                description: t("join.failDesc"),
            });
        }
    });

    if (meLoading || inviteLoading) {
        return (
            <div className="min-h-screen bg-[#f2f0eb] flex items-center justify-center text-[rgba(0,0,0,0.87)]">
                <LucideLoader2 className="w-10 h-10 animate-spin text-brand" />
            </div>
        );
    }

    if (!me) {
        // Not logged in -> Redirect to login (or landing) with return url
        // For MVP, just show message
        return (
            <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] flex flex-col items-center justify-center px-5 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <LucideXCircle className="w-10 h-10 text-red-500" />
                </div>
                <h2 className="text-[22px] font-bold">{t("join.loginRequired")}</h2>
                <p className="text-[14px] text-black/55 leading-relaxed">
                    {t("join.loginRequiredDesc1")}<br />
                    {t("join.loginRequiredDesc2")}
                </p>
                <Button
                    className="w-full h-14 text-lg font-bold rk-btn-primary rounded-tile"
                    onClick={() => setLocation("/?redirect=" + encodeURIComponent(`/join/${code}`))}
                >
                    {t("join.goLogin")}
                </Button>
            </div>
        );
    }

    const isExpired = !!invite?.expiresAt && new Date(invite.expiresAt).getTime() < Date.now();

    if (invite?.status !== 'pending' || isExpired) {
        return (
            <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] flex flex-col items-center justify-center px-5 text-center space-y-6">
                <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <LucideXCircle className="w-10 h-10 text-red-500" />
                </div>
                <h2 className="text-[22px] font-bold">{t("join.invalidInvite")}</h2>
                <p className="text-[14px] text-black/55 leading-relaxed">{t("join.invalidInviteDesc")}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#f2f0eb] text-[rgba(0,0,0,0.87)] px-5 flex flex-col items-center justify-center text-center">
            <div className="mb-10">
                <div className="w-24 h-24 mx-auto bg-brand rounded-card flex items-center justify-center mb-6">
                    <span className="text-4xl">🎱</span>
                </div>
                <h1 className="text-[26px] font-bold tracking-tight mb-2">{t("join.title")}</h1>
                <p className="text-[15px] text-black/55 leading-relaxed">
                    <span className="text-brand font-bold">{me.name}</span>{t("join.greetingSuffix")}<br />
                    {t("join.question")}
                </p>
            </div>

            <div className="w-full max-w-sm space-y-4">
                {joinMutation.isSuccess ? (
                    <div className="p-6 bg-brand/10 border border-brand/20 rounded-tile animate-in zoom-in">
                        <LucideCheckCircle2 className="w-12 h-12 text-brand mx-auto mb-2" />
                        <h3 className="text-xl font-bold text-brand">{t("join.joinedTitle")}</h3>
                        <p className="text-sm text-black/55 mt-1">{t("join.joinedDesc")}</p>
                    </div>
                ) : (
                    <Button
                        size="lg"
                        className="w-full h-16 text-xl font-semibold rk-btn-primary rounded-2xl"
                        onClick={() => joinMutation.mutate()}
                        disabled={joinMutation.isPending}
                    >
                        {joinMutation.isPending ? t("join.joining") : t("join.joinConfirm")}
                    </Button>
                )}

                {!joinMutation.isSuccess && (
                    <Button
                        variant="ghost"
                        onClick={() => setLocation("/dashboard")}
                        className="text-black/55 text-[14px] font-medium h-12"
                    >
                        {t("join.cancel")}
                    </Button>
                )}
            </div>
        </div>
    );
}
