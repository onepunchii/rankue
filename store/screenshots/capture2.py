#!/usr/bin/env python3
"""랭큐 스토어 스크린샷 재캡처 — 밝은테마, 애플 우선, 대표컷=점수판(가로).
순서: 01 점수판(가로) · 02 국가/글로벌 랭킹 · 03 라이벌 · 04 크루 · 05 성적표
언어: ko·en·vi·tr·es → raw2/<lang>/0N.png
사용: /Users/choejeonghwan/Desktop/Antigravity/광고제작/naver-blog-agent/.venv/bin/python store/screenshots/capture2.py [langs...]
데모 계정(01012349876, hiq 스토어=김성준).
"""
import sys
from pathlib import Path
from playwright.sync_api import sync_playwright

DIR = Path(__file__).resolve().parent
BASE = "https://www.rankue.co.kr"
DEMO_PHONE = "01012349876"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
LOCMAP = {"ko": "ko-KR", "en": "en-US", "vi": "vi-VN", "tr": "tr-TR", "es": "es-ES"}
# 3쿠션 필터 버튼 라벨 (성적표에서 3쿠션 탭 클릭용)
C3 = {"ko": "3쿠션", "en": "3-cushion", "vi": "3 băng", "tr": "3 bant", "es": "3 bandas"}

LANGS = sys.argv[1:] or ["ko"]

with sync_playwright() as p:
    b = p.chromium.launch()
    for lang in LANGS:
        outdir = DIR / "raw2" / lang
        outdir.mkdir(parents=True, exist_ok=True)
        ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=3,
                            locale=LOCMAP.get(lang, "en-US"), user_agent=UA)
        ctx.add_init_script(f"try{{localStorage.setItem('rankue-locale','{lang}')}}catch(e){{}}")
        r = ctx.request.post(f"{BASE}/api/hiq/login", data={"phone": DEMO_PHONE, "storeSlug": "hiq"})
        assert r.status == 200, f"login failed {r.status}"
        # 3쿠션 2인(게스트 상대) 게임 생성 → 점수판
        gr = ctx.request.post(f"{BASE}/api/hiq/game/start",
                              data={"gameMode": "match", "gameType": "3구",
                                    "player1Target": 30, "player2Target": 25, "player2Name": "박지훈"})
        gj = gr.json()
        game = gj.get("data", gj) if isinstance(gj, dict) else {}
        gid = game.get("id") or (game.get("game") or {}).get("id")
        print(f"[{lang}] game start {gr.status} id={gid}")
        pg = ctx.new_page()

        def snap(fn, url, portrait=True, wait=3500, after=None):
            pg.set_viewport_size({"width": 390, "height": 844} if portrait else {"width": 852, "height": 393})
            try:
                pg.goto(url, wait_until="networkidle", timeout=45000)
            except Exception as e:
                print(f"  goto warn {url}: {e}")
            pg.wait_for_timeout(wait)
            if after:
                try: after()
                except Exception as e: print(f"  after warn: {e}")
                pg.wait_for_timeout(4000)  # 탭 전환 후 데이터 로딩(랭킹 스피너) 완료 대기
            pg.screenshot(path=str(outdir / fn))
            print(f"  ✅ {lang}/{fn} ← {url}")

        def to3c():
            pg.locator("button", has_text=C3.get(lang, "3-cushion")).first.click()

        # 점수판은 세로 뷰포트로 찍는다 — 앱이 내용을 90° 돌려 그리므로 결과는 "세로 폰 안에 누운 점수판"이
        # 되고, 이게 실제 사용 모습(폰을 세워 든 채 옆으로 돌려 보는 테이블 스코어보드)이다. 세로 프레임을
        # 꽉 채워서 대표컷으로도 시원하다.
        #
        # ⚠️ 가로 프레임으로 바꾸고 싶다면 두 곳을 **함께** 고쳐야 한다(하나만 고치면 어긋난다):
        #    1) 여기 portrait=False   2) captions2.json 01번에 "landscape": true
        #    단, 가로로 가면 2.16:1 이 1284x2778 캔버스에서 높이의 21%밖에 못 채워 위아래 여백이 크게 남는다.
        #    폭을 1350px 이상 키우면 오른쪽 '종료하기' 버튼이 잘린다. 2026-07-30 에 실제로 만들어 보고 되돌렸다.
        if gid:
            snap("01.png", f"{BASE}/game/{gid}", portrait=True, wait=4500)
        # 랭킹 — 4구 탭이 비어 보여서 데이터 있는 3쿠션 탭 클릭(매장 랭킹 유지, 상단 국가/글로벌 탭 노출)
        snap("02.png", f"{BASE}/ranking", after=to3c)
        snap("03.png", f"{BASE}/friends")
        snap("04.png", f"{BASE}/club")
        snap("05.png", f"{BASE}/history", after=to3c)
        ctx.close()
    b.close()
print("캡처 완료")
