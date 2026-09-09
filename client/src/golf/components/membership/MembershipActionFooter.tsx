import { LucidePhone } from "lucide-react";

/**
 * 회원권 상세 하단 — **정보 화면이다. 거래는 하지 않는다**(2026-09-09 오너).
 * 예전엔 '매수/매도 신청' 버튼이 주문을 넣었는데, 회원권 중개는 에스크로·본인확인·분쟁 처리가
 * 따라오는 별개 사업이고 랭큐가 할 일이 아니다. 시세·코스 정보는 그대로 두고 거래만 뺐다.
 * (이 데이터의 골프장 이름·지역은 나중에 크루의 골프장 검색을 채우는 씨앗으로 쓸 수 있다.)
 */
export function MembershipActionFooter({ phone }: { phone: string }) {
    return (
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-[#050505]/80 backdrop-blur-xl border-t border-white/10 flex gap-4 z-50 pb-8">
            <a
                href={`tel:${phone}`}
                className="flex-1 h-14 rounded-2xl bg-[#1A1A1A] text-white font-bold text-sm border border-white/10 flex items-center justify-center gap-2 hover:bg-white/10 transition-colors active:scale-95"
            >
                <LucidePhone className="w-4 h-4" />
                골프장에 문의하기
            </a>
        </div>
    );
}
