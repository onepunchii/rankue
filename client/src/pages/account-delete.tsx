import { useSeo } from "@/hooks/useSeo";
import { SiteFooter } from "@/components/hiq/SiteFooter";
import { DOC_META } from "@shared/docMeta";
// 계정 삭제 안내 — Google Play 데이터 보안(계정 삭제 URL) 요건 페이지.
// 요건: 앱/개발자명 명시, 삭제 요청 단계 명확 표시, 삭제·보관 데이터 유형과 기간 명시.
export default function AccountDelete() {
  // 제목·설명은 shared/docMeta.ts 가 정본 — server/prerender.ts 가 같은 값을 쓴다.
  useSeo({ ...DOC_META["/account-delete"], path: "/account-delete" });

  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
        <h1 className="text-2xl font-bold">계정 삭제 안내</h1>
        <p className="mt-2 text-sm text-gray-500">
          랭큐(RANKUE) · 개발자: 제이에이치스퀘어
        </p>

        <div className="mt-8 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-5">
          <h2 className="text-lg font-bold text-emerald-900">앱에서 바로 삭제하기</h2>
          <ol className="mt-3 list-decimal pl-5 text-sm text-emerald-900 space-y-2">
            <li>랭큐 앱에 로그인합니다.</li>
            <li>
              하단 탭 <b>전체</b> → <b>관리 · 안내</b> → <b>계정 삭제</b>를 선택합니다.
            </li>
            <li>안내를 확인하고 <b>"삭제"</b>를 입력하면 즉시 영구 삭제됩니다.</li>
          </ol>
        </div>

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-5">
          <h2 className="text-base font-bold text-gray-900">앱을 이용할 수 없는 경우 (이메일 요청)</h2>
          <ol className="mt-3 list-decimal pl-5 text-sm text-gray-700 space-y-2">
            <li>
              <a className="font-bold underline" href="mailto:petudy@kakao.com">
                petudy@kakao.com
              </a>
              으로 이메일을 보냅니다.
            </li>
            <li>
              제목에 <b>"계정 삭제 요청"</b>, 본문에 <b>가입한 휴대폰 번호</b>를
              적어주세요.
            </li>
            <li>본인 확인 후 영업일 기준 3일 이내에 삭제가 완료됩니다.</li>
          </ol>
        </div>

        <h2 className="mt-8 text-lg font-bold">삭제되는 데이터</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>계정 정보(휴대폰 번호, 이름/닉네임) — 즉시 삭제</li>
          <li>당구 경기 기록·RP 레이팅·랭킹 데이터 — 즉시 삭제</li>
          <li>업로드한 사진 — 즉시 삭제</li>
          <li>푸시 토큰 — 즉시 삭제</li>
        </ul>

        <h2 className="mt-8 text-lg font-bold">보관되는 데이터(예외)</h2>
        <p className="mt-2 text-sm text-gray-700">
          관계 법령에 따라 보존 의무가 있는 기록(예: 전자상거래 관련 거래 기록)은 해당
          법령이 정한 기간(최대 5년) 동안 다른 데이터와 분리하여 보관한 뒤 파기합니다. 그
          외 데이터는 보관하지 않습니다.
        </p>

        <p className="mt-10 text-xs text-gray-400">
          문의: petudy@kakao.com · 시행일: 2026년 7월 14일
        </p>

        <SiteFooter />
      </div>
    </div>
  );
}
