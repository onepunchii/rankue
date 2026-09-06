# shared/sim 출처 고지

이 폴더의 물리 엔진은 아래 공개 문헌과 Apache-2.0 소프트웨어의 알고리즘을 TypeScript 로 새로 구현한 것이다.

- pooltool — Evan Kiefl, Apache License 2.0. https://github.com/ekiefl/pooltool
  이벤트 기반 시뮬레이션 구조, 닫힌 식 운동 전개, 4차 다항식 이벤트 감지, 마찰 비탄성 볼-볼 충돌, Han 2005 쿠션 모델 구현, make_kiss / continually-touching 안정화 기법.
  Copyright (c) Evan Kiefl. Licensed under the Apache License, Version 2.0.
- Orellana & De Michele, "Algorithm 1010: Boosting Efficiency in Solving Quartic Equations with No Compromise in Accuracy", ACM TOMS 46(2), 2020.
- Leckie & Greenspan, "An Event-Based Pool Physics Simulator", ACG 2005.
- Han, "Dynamics in carom and three cushion billiards", J. Mech. Sci. Tech. 19, 2005.
- Mathavan, Jackson, Parkin — Am. J. Phys. 77 (2009); Proc. IMechE Part P 224 (2010); Sports Engineering 17 (2014).
- Alciatore, Technical Proofs TP A.4, A.5, A.14, A.16, A.19, A.30, A.31. https://drdavepoolinfo.com/technical_proofs/
- fdlibm (Sun Microsystems) 의 수학 함수 알고리즘 — dmath.ts. Sun 의 허용적 고지 조건을 따른다.

tailuge/billiards (GPL-3.0) 의 코드는 이 폴더에 포함되지 않았고, 참고하지도 않았다.
