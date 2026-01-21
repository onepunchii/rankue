# [마스터 플랜] HiQ 'Perfect Simulation' 하이브리드 시스템

본 문서는 검증된 족보(Reference DB)와 AI 물리 엔진(Solver)을 결합한 하이브리드 당구 시뮬레이션 시스템의 통합 로드맵입니다.

---

## 🏗️ 1. 시스템 아키텍처 (Hybrid Architecture)

1. **Reference DB (정석 족보)**: '당구백서' 등 외부 사이트에서 크롤링한 고품질 배치 데이터.
2. **Hybrid Engine (유사도 엔진)**: 유저의 현재 배치와 가장 유사한 족보를 KNN(K-Nearest Neighbor) 알고리즘으로 실시간 검색.
3. **AI Physics Solver (AI 솔버)**: 족보에 없는 임의의 배치일 경우, 물리 엔진을 돌려 최적의 경로를 직접 계산.
4. **ProShot Dashboard (통합 UI)**: 두께, 당점, 파워를 통합된 그래픽 위젯으로 시각화.

---

## 📅 단계별 구현 현황 (Implementation Status)

### Phase 1: 기반 및 물리 엔진 (Foundation) - **[완료]**

- [x] Matter.js 기반 웹/모바일 프로토타입 구축
- [x] 박스2D(Forge2D) 규격에 맞춘 물리 파라미터 튜닝 (Linear Damping, Restitution)
- [x] 3구/4구 모드 전환 및 기본 득점 판정/시뮬레이션 로직

### Phase 2: 데이터 수집 및 정규화 (High-Precision Scraper) - **[완료]**

- [x] Next.js Hydration 데이터 직접 추출 로직 (`hiq_database.json`)
- [x] 궤적 데이터(Trajectory) 좌표 정규화 (0.0 ~ 1.0)
- [x] 실제 샷 데이터 기반 물리 영점 조절 로직 (Velocity Calibration)

### Phase 2: Core Algorithm implementation

- [x] Nearest Neighbor Search for shot matching.
- [x] Solution dashboard (Spin, Thickness, Power).
- [x] DB Trajectory Replay integration.

### Phase 3: UX 혁신 - 간접 제어 및 상태 모드 (Indirect Control UX) - **[완료]**

- [x] **Indirect Ball Control**: 터치패드 방식의 간접 공 이동 시스템 (가려짐 방지 및 초정밀 배치)
- [x] **Visual Crosshairs**: 배치 모드 전용 가로/세로 십자 가이드선 구현
- [x] **State-based Flow**: Setup Mode(배치)와 Result Mode(결과) 간의 명확한 UI 분리 및 슬라이드 전환
- [x] **Auto-playback**: 솔루션 매칭 시 전문가의 궤적 즉시 자동 재생

### Phase 4: Flutter 하이브리드 고도화 (Mobile Polish) - **[진행 중]**

- [x] Flutter/Flame 프로젝트 구조 및 Forge2D 연동 세팅
- [x] CustomPainter 기반 정밀 당구대 및 8x4 그리드 시스템
- [x] 통합 솔루션 위젯 (Overlap Thickness, Spin Dot, 5-Block Power)
- [x] 하이브리드 솔버: DB 매칭(KNN) 및 AI 가중 평균 추천 알고리즘
- [x] **Ghost Path Renderer**: DB 궤적 데이터를 활용한 사전 경로 시각화
- [x] **Frame Replay**: 60FPS 기반 궤적 실시간 동기화 재생 로직 완료

---

## 🕹️ 개발 규칙 및 지침

- **UI First**: 유저는 1초 만에 타격 방법을 이해해야 함 (텍스트 최소화, 비주얼 최대화).
- **Data Integrity**: 크롤링한 데이터의 좌표는 반드시 `0.0 ~ 1.0` 사이의 정규화된 값으로 유지.
- **Hybrid Strategy**: "가장 정확한 것은 고수의 족보이고, AI는 그 빈틈을 메운다"는 원칙 준수.
