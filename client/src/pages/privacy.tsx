import { useSeo } from "@/hooks/useSeo";
import { DOC_META } from "@shared/docMeta";
// 개인정보처리방침 — 스토어(Play/App Store) 심사용 공개 문서 페이지.
// 로그인 게이트를 타지 않는 완전 공개 라우트여야 한다.
export default function Privacy() {
  // 제목·설명은 shared/docMeta.ts 가 정본 — server/prerender.ts 가 같은 값을 쓴다.
  useSeo({ ...DOC_META["/privacy"], path: "/privacy" });

  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
        <h1 className="text-2xl font-bold">개인정보처리방침</h1>
        <p className="mt-2 text-sm text-gray-500">
          랭큐(RANKUE) · 운영: 제이에이치스퀘어 · 문의:{" "}
          <a className="underline" href="mailto:petudy@kakao.com">
            petudy@kakao.com
          </a>
        </p>

        <h2 className="mt-8 text-lg font-bold">1. 수집하는 개인정보 항목</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>휴대폰 번호 — 계정 식별 및 로그인</li>
          <li>이름/닉네임 — 프로필 표시</li>
          <li>당구 경기 기록(점수, 이용 매장) — 경기 기록·RP 레이팅·랭킹 기능 제공</li>
          <li>사진(선택) — 사용자가 프로필 등에 직접 업로드하는 경우에만</li>
          <li>푸시 토큰(FCM) — 알림 수신에 동의한 경우에만</li>
        </ul>

        <h2 className="mt-8 text-lg font-bold">2. 이용 목적</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>계정 생성·관리 및 본인 식별</li>
          <li>경기 기록, RP 레이팅, 랭킹, 크루 매칭 등 핵심 기능 제공</li>
          <li>서비스 관련 푸시 알림 발송(동의 시)</li>
        </ul>

        <h2 className="mt-8 text-lg font-bold">3. 보관 및 파기</h2>
        <p className="mt-2 text-sm text-gray-700">
          회원 탈퇴(계정 삭제) 시 수집된 개인정보를 지체 없이 파기합니다. 다만 관계 법령에
          따라 보존 의무가 있는 정보는 해당 법령이 정한 기간 동안만 분리 보관 후
          파기합니다(예: 전자상거래 등에서의 소비자 보호에 관한 법률에 따른 기록).
        </p>
        <p className="mt-2 text-sm text-gray-700">
          계정 삭제 요청 방법은{" "}
          <a className="underline" href="/account-delete">
            계정 삭제 안내
          </a>{" "}
          페이지를 참고하세요.
        </p>

        <h2 className="mt-8 text-lg font-bold">4. 제3자 제공 및 처리 위탁</h2>
        <p className="mt-2 text-sm text-gray-700">
          개인정보를 제3자에게 제공하지 않습니다. 서비스 운영을 위해 클라우드 인프라
          (호스팅·데이터베이스) 처리를 위탁하며, 위탁받은 업체는 개인정보 보호 관련 법령을
          준수합니다.
        </p>

        <h2 className="mt-8 text-lg font-bold">5. 안전성 확보 조치</h2>
        <p className="mt-2 text-sm text-gray-700">
          모든 데이터는 암호화된 통신(HTTPS)으로 전송되며, 접근 권한을 최소화하여
          관리합니다.
        </p>

        <h2 className="mt-8 text-lg font-bold">6. 이용자의 권리</h2>
        <p className="mt-2 text-sm text-gray-700">
          이용자는 언제든지 자신의 개인정보에 대한 열람·정정·삭제를{" "}
          <a className="underline" href="mailto:petudy@kakao.com">
            petudy@kakao.com
          </a>
          으로 요청할 수 있으며, 지체 없이 처리합니다.
        </p>

        <p className="mt-10 text-xs text-gray-400">시행일: 2026년 7월 14일</p>
      </div>
    </div>
  );
}
