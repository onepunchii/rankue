import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { LucideShieldCheck, LucideCreditCard, LucideCheckCircle2, LucideLock, LucideArrowLeft } from "@/lib/icons";
import * as PortOne from "@portone/browser-sdk/v2";
import { isNativeApp } from "@/lib/nativeBridge";

// PortOne 결제 키 — 예전엔 데모 값(문서 예시 storeId + 가짜 channelKey)이 하드코딩돼 있어 결제창이 떠도 실패했다
// (심사 2.1 '미완성 기능' 지적 소지, 감사 S9). 배포 환경변수로만 받고, 없으면 결제 버튼을 잠근다.
// 서버도 PORTONE_V2_SECRET 이 없으면 구독을 받지 않는다(server/routes/modules/partner.ts).
const PORTONE_STORE_ID = import.meta.env.VITE_PORTONE_STORE_ID as string | undefined;
const PORTONE_CHANNEL_KEY = import.meta.env.VITE_PORTONE_CHANNEL_KEY as string | undefined;
const PAYMENT_READY = !!(PORTONE_STORE_ID && PORTONE_CHANNEL_KEY);

export default function PartnerSubscription() {
    const [, setLocation] = useLocation();
    const { toast } = useToast();
    const [isSubmitting, setIsSubmitting] = useState(false);

    // 앱(iOS·안드로이드) 안에서는 이 화면을 열지 않는다 — 앱 기능을 여는 디지털 구독을 스토어 결제 밖에서 팔면
    // Apple 3.1.1 · Google Play 결제 정책 위반이다(감사 S9). 웹 결제로 안내하는 문구도 두지 않는다(anti-steering).
    // 매장 관리 화면(대시보드)은 그대로 쓴다.
    const native = isNativeApp();
    useEffect(() => {
        if (native) setLocation("/partner/dashboard", { replace: true });
    }, [native, setLocation]);

    // Payment Handler
    const handlePayment = async () => {
        if (!PAYMENT_READY) return;
        setIsSubmitting(true);
        try {
            // 1. Issue Billing Key (Card Registration)
            const issueResponse = await PortOne.requestIssueBillingKey({
                storeId: PORTONE_STORE_ID!,
                channelKey: PORTONE_CHANNEL_KEY!,
                billingKeyMethod: "CARD",
            });

            if (issueResponse?.code != null) {
                // If code exists, it's an error
                throw new Error(issueResponse.message);
            }

            // 2. Send Billing Key to Backend
            if (!issueResponse || !issueResponse.billingKey) {
                throw new Error("Billing key issuance failed");
            }

            await apiRequest("/api/hiq/partner/subscription", {
                method: "POST",
                body: {
                    billingKey: issueResponse.billingKey,
                    paymentMethod: "CARD"
                }
            });

            toast({
                title: "구독 신청 완료! 💳",
                description: "이제 프리미엄 기능을 마음껏 이용하세요.",
                variant: "success"
            });
            setLocation("/partner/dashboard");

        } catch (error: any) {
            console.error("Payment Error:", error);
            toast({
                title: "결제 실패",
                description: "카드 등록을 취소했거나 오류가 발생했습니다.",
                variant: "destructive"
            });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (native) return null;

    return (
        <div className="min-h-screen bg-surface-0 text-[rgba(0,0,0,0.87)] flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Effects */}

            <div className="w-full max-w-md relative z-10">
                <button
                    onClick={() => setLocation("/partner/dashboard")}
                    className="flex items-center text-black/55 hover:text-[rgba(0,0,0,0.87)] mb-8 transition-colors"
                >
                    <LucideArrowLeft className="w-5 h-5 mr-1" />
                    돌아가기
                </button>

                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand/10 rounded-full border border-brand/20 mb-4">
                        <LucideShieldCheck className="w-4 h-4 text-brand" />
                        <span className="text-brand text-xs font-bold">안전 결제</span>
                    </div>
                    <h1 className="text-4xl font-bold mb-3 text-[rgba(0,0,0,0.87)] tracking-tight">
                        RANKUE <span className="text-brand">PREMIUM</span>
                    </h1>
                    <p className="text-black/55 text-sm">
                        월 33,000원으로 매장 매출을 극대화하세요.
                    </p>
                </div>

                {/* Plan Card */}
                <div className="bg-white rounded-[2rem] p-8 shadow-[0_1px_2px_rgba(0,0,0,0.06)] relative overflow-hidden group hover:border-brand/30 transition-all">
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                        <LucideCreditCard size={120} />
                    </div>

                    <div className="mb-8">
                        <div className="flex items-baseline gap-1 mb-1">
                            <span className="text-5xl font-bold text-[rgba(0,0,0,0.87)]">33,000</span>
                            <span className="text-xl font-bold text-black/40">원 / 월</span>
                        </div>
                        <p className="text-xs text-brand font-bold mt-2 bg-brand/10 inline-block px-2 py-1 rounded">
                            ✨ 첫 달 무료 체험 포함
                        </p>
                    </div>

                    <div className="space-y-4 mb-8">
                        {[
                            "회원/매출 엑셀 데이터 다운로드",
                            "전체 회원 앱 푸시 발송 (마케팅)",
                            "우리 매장 상세 분석 리포트",
                            "프리미엄 전용 뱃지 제공"
                        ].map((feature, i) => (
                            <div key={i} className="flex items-center gap-3 text-sm text-black/70">
                                <LucideCheckCircle2 className="w-5 h-5 text-brand flex-shrink-0" />
                                {feature}
                            </div>
                        ))}
                    </div>

                    <Button
                        onClick={handlePayment}
                        disabled={isSubmitting || !PAYMENT_READY}
                        className="w-full h-16 bg-brand hover:bg-brand-strong text-white text-lg font-bold rounded-full transition-all shadow-[0_1px_2px_rgba(0,0,0,0.06)] active:scale-[0.98] relative overflow-hidden"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                결제 처리 중...
                            </span>
                        ) : !PAYMENT_READY ? (
                            <span className="flex items-center gap-2">결제 준비 중이에요</span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <LucideLock className="w-5 h-5" />
                                카드 등록하고 시작하기
                            </span>
                        )}
                    </Button>
                    <p className="text-[12px] text-center text-black/40 mt-4">
                        안심하세요! 포트원의 안전 결제 시스템을 이용합니다.<br />
                        언제든지 해지가 가능합니다.
                    </p>
                </div>
            </div>
        </div>
    );
}
