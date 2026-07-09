# 골프 핸디캡 및 등급 연동 통합 계획

## 1. 개요

현재 대시보드에서 경기 기록 기반의 실시간 계산(평균 타수)과 DB 필드 기반 값(등급)이 일치하지 않는 문제를 해결하기 위해, DB의 `golf_avg_score`를 마스터 데이터로 통합하고 경기 종료 시 자동 갱신되도록 개선합니다.

## 2. 변경 사항

### Backend (server/storage/golf.repo.ts)

- `checkAndUpdateGolfGrade` 함수를 `updateGolfStats`로 확장/변경
  - 해당 사용자의 모든 `GOLF` 기록을 조회하여 평균 타수를 계산
  - 계산된 평균 타수를 `hiq_members.golf_avg_score`에 저장
  - 평균 타수 기준으로 `golf_grade`와 `golf_handicap`을 업데이트
- `finishGolfMatchSession` 및 기타 점수 입력 시점에 위 함수 호출 보장

### Frontend (client/src/golf)

- `Dashboard.tsx`: `useGolfStats`의 실시간 계산값 대신 `me.golfAvgScore`를 우선 사용하도록 조정
- `HandicapCard.tsx`: 등급 계산 로직과 숫자 표시 로직을 `avgScore` 중심으로 통일

## 3. 기대 효과

- 대시보드, 랭킹, 친구 목록 간의 데이터 일관성 확보
- 프론트엔드 중복 계산 제거로 인한 성능 향상
- 사용자 경험 개선 (성적 반영의 정확성)
