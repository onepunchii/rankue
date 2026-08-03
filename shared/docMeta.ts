// 정적 문서 3종(/support · /privacy · /account-delete)의 title·description.
//
// 왜 shared 에 있는가: 이 값은 두 곳에서 쓰인다.
//   1) 각 페이지의 useSeo() — 브라우저가 JS 를 실행한 뒤의 제목
//   2) server/prerender.ts — 크롤러가 JS 없이 받는 HTML 의 제목
// 두 값이 다르면 "봇이 본 제목"과 "렌더된 제목"이 어긋난다. 실제로 그런 상태였다:
// 이 세 페이지는 useSeo 를 호출하지 않아 렌더 후 제목이 홈 제목으로 남아 있었다.
// (2026-08-03 headless 크롬으로 측정해 확인) 그래서 값을 여기 한 곳에 모았다.
//
// shared/aboutContent.ts 와 같은 이유·같은 패턴이다.

export interface DocMeta {
  title: string;
  description: string;
}

export const DOC_META: Record<string, DocMeta> = {
  "/support": {
    title: "랭큐 고객지원 · 문의 & 자주 묻는 질문",
    description:
      "랭큐(RANKUE) 고객지원 — 로그인, 매칭 PIN, 점수 기록, 계정 삭제에 대한 자주 묻는 질문과 문의 방법.",
  },
  "/privacy": {
    title: "개인정보처리방침 · 랭큐(RANKUE)",
    description:
      "랭큐(RANKUE) 개인정보처리방침 — 수집 항목, 이용 목적, 보관·파기, 제3자 제공, 안전성 확보 조치, 이용자의 권리.",
  },
  "/account-delete": {
    title: "계정 삭제 안내 · 랭큐(RANKUE)",
    description:
      "랭큐(RANKUE) 계정 삭제 방법 — 앱에서 즉시 영구 삭제하거나 이메일로 요청하는 절차, 삭제되는 데이터와 법령상 보관 예외.",
  },
};
