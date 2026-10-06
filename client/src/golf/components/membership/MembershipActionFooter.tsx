import { LucidePhone, LucideGlobe } from "lucide-react";

/**
 * 회원권 상세 하단 — **정보 화면이다. 거래는 하지 않는다**(2026-09-09 오너).
 * 예전엔 '매수/매도 신청' 버튼이 주문을 넣었는데, 회원권 중개는 에스크로·본인확인·분쟁 처리가
 * 따라오는 별개 사업이고 랭큐가 할 일이 아니다. 시세·코스 정보는 그대로 두고 거래만 뺐다.
 * (이 데이터의 골프장 이름·지역은 나중에 크루의 골프장 검색을 채우는 씨앗으로 쓸 수 있다.)
 *
 * 단추는 자료에 실제로 있는 연락 길 하나만 그린다(2026-10-06):
 *  - 전화번호가 있으면 전화 링크(예전 그대로),
 *  - 번호는 없고 홈페이지 주소가 있으면 '홈페이지 보기'(새 창),
 *  - 둘 다 없으면 아무것도 그리지 않는다.
 * 골프·콘도 종목은 자료에 번호가 없다. 예전엔 그 자리에 홈페이지 주소가 들어가 tel:http://… 로 걸렸고(눌러도 안 되는 단추),
 * 그걸 번호가 있을 때만 그리게 고치면서 이 종목들에서 단추가 통째로 사라졌었다 — 실제 주소가 있으니 홈페이지 링크로 되살린다.
 * 주소는 훅(membershipHomepage)이 http(s) 로 시작하는 것만 넘긴다. href 로 나가는 값이라 여기서도 한 번 더 본다.
 */
export function MembershipActionFooter({ phone, homepage }: { phone?: string; homepage?: string }) {
    const tel = (phone || "").trim();
    const site = (homepage || "").trim();
    const siteOk = /^https?:\/\/\S+$/i.test(site);
    if (!tel && !siteOk) return null;

    const button = "flex-1 h-14 rounded-2xl bg-[#1A1A1A] text-[#FFFFFF] font-bold text-[14px] border border-[#FFFFFF1A] flex items-center justify-center gap-2 hover:bg-[#FFFFFF1A] transition-colors active:scale-95";

    return (
        <div className="fixed bottom-0 left-0 right-0 p-5 bg-[#050505CC] backdrop-blur-xl border-t border-[#FFFFFF1A] flex gap-4 z-50 pb-8">
            {tel ? (
                <a href={`tel:${tel}`} className={button}>
                    <LucidePhone className="w-4 h-4" />
                    골프장에 문의하기
                </a>
            ) : (
                <a href={site} target="_blank" rel="noopener noreferrer" className={button}>
                    <LucideGlobe className="w-4 h-4" />
                    홈페이지 보기
                </a>
            )}
        </div>
    );
}
