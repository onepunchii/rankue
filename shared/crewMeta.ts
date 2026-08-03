// 크루 상세(/club/:id)의 title·description 조립.
//
// 왜 shared 에 있는가: 같은 값을 두 곳에서 만든다.
//   1) client/src/pages/hiq/club-detail.tsx 의 useSeo() — JS 실행 후의 제목
//   2) server/prerender.ts — 크롤러가 JS 없이 받는 HTML 의 제목
// 문자열 조립식을 양쪽에 따로 적으면 반드시 갈라진다(실제로 /store/:slug 에서
// "·" 유무 하나로 어긋났던 적이 있다). 그래서 식 자체를 여기 한 곳에 둔다.
//
// 크루는 로그인 없이도 GET /api/hiq/crews/:id 가 200 으로 열리는 공개 데이터다.
// 단, **회원 명단(members)은 절대 메타/본문에 넣지 않는다** — 공개 API 가 화이트리스트로
// 최소 컬럼만 주는 것과 같은 이유(server/storage/crew.repo.ts 의 보안 주석 참고).

export interface CrewMetaInput {
  name: string;
  region?: string | null;
  shortIntro?: string | null;
  description?: string | null;
}

export function crewTitle(c: CrewMetaInput): string {
  return `${c.name} 크루 · 랭큐`;
}

export function crewDescription(c: CrewMetaInput): string {
  const intro = c.shortIntro || c.description;
  if (!intro) return `${c.name} — 랭큐 당구 크루. 함께 경기하고 전적·랭킹에 도전하세요.`;
  return `${c.name}${c.region ? ` (${c.region})` : ""} — ${intro}`.slice(0, 155);
}
