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
  /** 크루 종목 — 소개가 없는 산악회(HIKING)를 당구 크루라고 적지 않으려고 본다. 없으면 예전 문구 그대로. */
  sportCategory?: string | null;
  /** 당구 경기 종류("4c" · "3c" · "any") — 제목의 괄호(4구 · 3쿠션) */
  gameType?: string | null;
  meetingDay?: string | null;
  meetingTime?: string | null;
  /** 지금 회원 수(가입 대기 빼고) — 숫자만 싣는다(명단은 싣지 않는다) */
  memberCount?: number | null;
}

/**
 * 2026-11-04 오너: 소모임 검색 결과("광진구 당구/포켓볼 모임 - 당구가 좋다 BILLIKE")처럼 크루마다 제목 · 설명 · 로고를 그 크루에 맞게.
 * 제목은 '크루 이름 — 시군구 + 종목(+경기)', 설명은 소개 + 정모 + 지역 + 회원 수. 받은 칸만 쓴다(없는 칸은 적지 않는다).
 */
const SPORT_WORD: Record<string, string> = { BILLIARDS: "당구 크루", GOLF: "골프 크루", HIKING: "산악회", FISHING: "낚시 크루" };
const GAME_WORD: Record<string, string> = { "4c": "4구", "3c": "3쿠션", pocket: "포켓볼" };

/** 제목에 쓰는 자리 — "서울특별시 광진구 구의제1동" → "광진구", "인천광역시" → "인천", 나라 밖 이름은 그대로 */
export function crewPlace(region: string | null | undefined): string | null {
  const all = String(region ?? "").trim();
  if (!all) return null;
  // 나라 밖 이름("Santo Domingo")은 그대로 — 시군구로 자를 수 없다
  if (!/[가-힣]/.test(all)) return all;
  const parts = all.split(/\s+/);
  const sgg = parts.slice(1).find((x) => /(시|군|구)$/.test(x));
  if (sgg) return sgg;
  return parts[0].replace(/(특별자치시|특별자치도|특별시|광역시)$/, "") || parts[0];
}

/** "당구 크루(4구)" · "산악회" — 종목을 모르면 당구(예전 문구와 같다) */
export function crewKind(c: Pick<CrewMetaInput, "sportCategory" | "gameType">): string {
  const sport = SPORT_WORD[c.sportCategory ?? ""] ?? SPORT_WORD.BILLIARDS;
  const game = (c.sportCategory ?? "BILLIARDS") === "BILLIARDS" ? GAME_WORD[c.gameType ?? ""] : undefined;
  return game ? `${sport}(${game})` : sport;
}

/** 정모 — "매주 토요일 오후 2시". 시각이 '00:00'(비워 둔 기본값)이면 뺀다. 둘 다 없으면 null */
export function crewMeeting(c: Pick<CrewMetaInput, "meetingDay" | "meetingTime">): string | null {
  const day = (c.meetingDay ?? "").trim();
  const time = (c.meetingTime ?? "").trim();
  const t = time && time !== "00:00" ? time : "";
  return [day, t].filter(Boolean).join(" ") || null;
}

/** 크루 썸네일 — 로고(emblem)가 그림 주소면 로고, 아니면 커버. 둘 다 없으면 null(이모지 로고는 그림이 아니다) */
export function crewLogoUrl(c: { emblem?: string | null; coverImage?: string | null }): string | null {
  const url = (v: string | null | undefined) => (v && /^https:\/\/\S+$/.test(v.trim()) ? v.trim() : null);
  return url(c.emblem) ?? url(c.coverImage);
}

export function crewTitle(c: CrewMetaInput): string {
  const where = crewPlace(c.region);
  return `${c.name} — ${[where, crewKind(c)].filter(Boolean).join(" ")} | 랭큐`;
}

export function crewDescription(c: CrewMetaInput): string {
  const intro = c.shortIntro || c.description;
  let head: string;
  if (!intro && c.sportCategory === "FISHING") head = `${c.name} — 랭큐 낚시 크루. 함께 출조하고 정출의 조과와 소식을 나눠요.`;
  else if (!intro && c.sportCategory === "HIKING") head = `${c.name} — 랭큐 산악회. 함께 산에 오르고 산행 일정과 소식을 나눠요.`;
  else if (!intro && c.sportCategory === "GOLF") head = `${c.name} — 랭큐 골프 크루. 함께 라운드하고 기록과 소식을 나눠요.`;
  else if (!intro) head = `${c.name} — 랭큐 당구 크루. 함께 경기하고 전적·랭킹에 도전하세요.`;
  else head = `${c.name}${c.region ? ` (${c.region})` : ""} — ${intro}`;
  const meet = crewMeeting(c);
  const tail = [meet ? `정모 ${meet}` : "", c.memberCount && c.memberCount > 0 ? `회원 ${c.memberCount}명` : ""].filter(Boolean).join(" · ");
  const out = tail ? `${head.replace(/[.\s]+$/, "")} · ${tail}` : head;
  return out.slice(0, 155);
}
