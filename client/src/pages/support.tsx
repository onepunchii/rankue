// 고객지원 — App Store 심사 가이드라인 1.5(Support URL) 요건 페이지.
// 로그인 없이 접근 가능해야 하며, 사용자가 질문하고 지원을 요청할 수 있는 수단을 제공한다.
export default function Support() {
  return (
    <div className="min-h-screen w-full bg-white text-gray-900">
      <div className="mx-auto max-w-2xl px-5 py-10 leading-relaxed">
        <h1 className="text-2xl font-bold">랭큐 고객지원</h1>
        <p className="mt-2 text-sm text-gray-500">
          랭큐(RANKUE) · 개발자: 제이에이치스퀘어
        </p>

        <div className="mt-8 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-5">
          <h2 className="text-lg font-bold text-emerald-900">문의하기</h2>
          <p className="mt-2 text-sm text-emerald-900">
            이용 중 궁금한 점이나 문제가 있으면 아래로 연락해 주세요. 영업일 기준
            1~3일 이내에 답변드립니다.
          </p>
          <ul className="mt-3 text-sm text-emerald-900 space-y-2">
            <li>
              이메일:{" "}
              <a className="font-bold underline" href="mailto:petudy@kakao.com">
                petudy@kakao.com
              </a>
            </li>
            <li>앱 내 문의: 전체 메뉴 → 건의함 · 제휴 문의</li>
          </ul>
        </div>

        <h2 className="mt-8 text-lg font-bold">자주 묻는 질문</h2>
        <div className="mt-3 space-y-4 text-sm text-gray-700">
          <div>
            <p className="font-bold">Q. 로그인은 어떻게 하나요?</p>
            <p className="mt-1">
              휴대폰 번호로 가입·로그인합니다. 별도 비밀번호 없이 번호 인증으로
              입장할 수 있습니다.
            </p>
          </div>
          <div>
            <p className="font-bold">Q. 매칭 대결의 PIN 번호는 무엇인가요?</p>
            <p className="mt-1">
              경기를 만들면 4자리 PIN이 생성됩니다. 상대가 홈 화면의 "핀 참여"에서
              이 번호를 입력하면 같은 경기에 입장해 함께 점수를 기록할 수 있습니다.
            </p>
          </div>
          <div>
            <p className="font-bold">Q. RP(레이팅 점수)는 어떻게 오르내리나요?</p>
            <p className="mt-1">
              매칭 대결(공식 경기)의 승패 결과에 따라 3쿠션·4구 각각의 RP가
              갱신됩니다. 혼자 연습은 기록에 반영되지 않습니다.
            </p>
          </div>
          <div>
            <p className="font-bold">Q. 계정을 삭제하고 싶어요.</p>
            <p className="mt-1">
              앱의 <b>전체 메뉴 → 계정 삭제</b>에서 직접 삭제할 수 있습니다. 자세한
              내용은{" "}
              <a className="font-bold underline" href="/account-delete">
                계정 삭제 안내
              </a>
              를 확인해 주세요.
            </p>
          </div>
        </div>

        <h2 className="mt-8 text-lg font-bold">관련 문서</h2>
        <ul className="mt-2 list-disc pl-5 text-sm text-gray-700 space-y-1">
          <li>
            <a className="underline" href="/privacy">
              개인정보처리방침
            </a>
          </li>
          <li>
            <a className="underline" href="/account-delete">
              계정 삭제 안내
            </a>
          </li>
        </ul>

        <p className="mt-10 text-xs text-gray-400">
          문의: petudy@kakao.com · 랭큐(RANKUE)
        </p>
      </div>
    </div>
  );
}
