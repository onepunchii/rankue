#!/usr/bin/env python3
"""랭큐 스토어 스크린샷 원본 캡처 — 당구(hiq) 화면 5장 → raw/01~05.png
사용: /Users/choejeonghwan/Desktop/Antigravity/광고제작/naver-blog-agent/.venv/bin/python store/screenshots/capture.py
(venv=광고제작 폴더의 것 — onp capture.py와 동일. 없으면: python3 -m venv .venv && .venv/bin/pip install playwright && .venv/bin/playwright install chromium)

데모 계정(01012349876, hiq 스토어)으로 로그인해 캡처한다.
데모 스토어 시드(김성준 3승1패, 가짜회원 박지훈/이동혁/정민수)는 2026-07 세팅됨 —
데이터가 비어 보이면 buzz 세션 스크래치의 seed*.py 참고.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright

DIR = Path(__file__).resolve().parent
(DIR / "raw").mkdir(parents=True, exist_ok=True)

BASE = "https://www.rankue.co.kr"
DEMO_PHONE = "01012349876"

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(
        viewport={"width": 390, "height": 844},
        device_scale_factor=3,  # 1170x2532
        locale="ko-KR",
        user_agent="Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    )
    # 세션 쿠키 — UI 대신 API 로그인 (전화번호만, 비번 없음)
    r = ctx.request.post(f"{BASE}/api/hiq/login", data={"phone": DEMO_PHONE, "storeSlug": "hiq"})
    assert r.status == 200, f"login failed: {r.status}"
    pg = ctx.new_page()

    def snap(fname, url, after=None, wait=3000):
        try:
            pg.goto(url, wait_until="networkidle", timeout=45000)
        except Exception:
            pass
        pg.wait_for_timeout(wait)
        if after:
            after()
            pg.wait_for_timeout(1200)
        pg.screenshot(path=str(DIR / "raw" / fname))
        print(f"✅ raw/{fname} ← {url}")

    # 01 대시보드 — RP 레이팅·티어·전적 (히어로)
    snap("01.png", f"{BASE}/dashboard")

    # 02 경기 기록 — 공식 성적표 + 매치 리스트 (3쿠션 필터: 대시보드 골드 티어와 일치)
    def to_3c_history():
        pg.locator("button", has_text="3쿠션").first.click()
    snap("02.png", f"{BASE}/history", after=to_3c_history)

    # 03 매장 랭킹 — 대시보드 하단 랭킹 카드(3쿠션 탭)로 스크롤
    def to_ranking():
        sec = pg.locator("header:has(h2:has-text('매장 랭킹'))")
        sec.locator("button", has_text="3쿠션").click()
        pg.wait_for_timeout(600)
        sec.scroll_into_view_if_needed()
        pg.mouse.wheel(0, 60)  # 헤더가 상단에 오도록 미세 조정
    snap("03.png", f"{BASE}/dashboard", after=to_ranking)

    # 04 라이벌 리스트 — 친구·상대 전적
    snap("04.png", f"{BASE}/friends")

    # 05 AI 솔루션 — 당구대 시뮬레이션
    snap("05.png", f"{BASE}/simulation", wait=4500)

    b.close()
print("캡처 완료")
