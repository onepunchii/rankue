"""
큐 케이스 그림 내보내기 — 바탕 따내기 · 큐 굵기 맞추기 · webp(2026-10-16, 기획서 9장 "넣기 전에 할 일").

    python3 -I docs/01-plan/features/billiards-cue-case/tools/export.py [원본 폴더 — 기본 reports/cue-case-1016/raw]

- 큐(rack-*.png, 1584×672, 짙은 회색 바탕 — 가장자리로 갈수록 어둡다): 세로줄마다 위 · 아래 바탕을 따로 재서 그 줄의 바탕과 다른 구간을
  큐로 본다(검은 흑단 큐 · 고무 범퍼가 바탕과 비슷해 색 하나로는 못 가른다). 줄마다의 위 · 아래 끝을 옆줄과 고르게 다듬고,
  큐가 있는 상자만 잘라 **모두 같은 크기(1000×80)로** 맞춘다 — 장식장에 한 줄씩 쌓일 때 굵기 · 길이가 같아야 깔끔하다.
- 초크 · 장갑 · 페넌트(정사각, 순검정 바탕): 가장자리에서 이어진 검정만 걷는다(검은 장갑 안쪽은 흰 테두리로 막혀 남는다). 256×256.
- 내보내는 곳: client/public/billiards/case/{cue,chalk,glove,pennant}/<id>.webp — id 는 원본 이름에서 머리말(rack- 등)을 뗀 것.
numpy 가 없는 환경이라 PIL 만 쓴다.
"""
import os, sys
from collections import deque
from PIL import Image, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "../../../../.."))
SRC = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "reports/cue-case-1016/raw"))
OUT = os.path.join(ROOT, "client/public/billiards/case")
CUE_W, CUE_H = 1000, 80
SQ = 256


def median(v):
    s = sorted(v)
    return s[len(s) // 2]


def cue(name):
    im = Image.open(os.path.join(SRC, name)).convert("RGB")
    w, h = im.size
    px = im.load()
    band = 70  # 위 · 아래 이만큼은 늘 바탕
    tops, bots = [], []
    for x in range(w):
        top_bg = [median([px[x, y][c] for y in range(8, band)]) for c in range(3)]
        bot_bg = [median([px[x, y][c] for y in range(h - band, h - 8)]) for c in range(3)]
        # 큐의 위 · 아래 끝은 급한 경계다(그림자 · 네온 번짐은 완만하다). 바탕과 다르고(d) 위아래로 급하게 바뀌는(g) 맨 바깥 두 점
        col = [px[x, y] for y in range(h)]
        lum = [sum(p) / 3 for p in col]
        first = last = -1
        for y in range(band, h - band):
            t = (y - band) / max(1, h - 2 * band)
            p = col[y]
            d = max(abs(p[c] - (top_bg[c] * (1 - t) + bot_bg[c] * t)) for c in range(3))
            g = abs(lum[min(h - 1, y + 2)] - lum[max(0, y - 2)])
            if d > 18 and g > 14:
                if first < 0:
                    first = y
                last = y
        best = (last - first, first, last)
        tops.append(best[1]); bots.append(best[2])
    # 큐가 있는 줄 — 큐 굵기의 30% 이상인 구간이 있는 줄만
    hs = [b - t for t, b in zip(tops, bots) if t >= 0]
    full = median(sorted(hs)[len(hs) // 2:]) if hs else 0
    cols = [x for x in range(w) if tops[x] >= 0 and bots[x] - tops[x] >= full * 0.3]
    if not cols:
        raise RuntimeError(f"큐를 못 찾음: {name}")
    x0, x1 = cols[0], cols[-1]
    # 옆줄과 고르게 — 9줄 중앙값(가장자리 들쭉날쭉 · 그림자 한두 점을 지운다)
    def smooth(arr):
        out = []
        for x in range(w):
            win = [arr[k] for k in range(max(x0, x - 10), min(x1, x + 10) + 1) if arr[k] >= 0]
            out.append(median(win) if win and x0 <= x <= x1 else -1)
        return out
    st, sb = smooth(tops), smooth(bots)
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x in range(x0, x1 + 1):
        if st[x] < 0:
            continue
        for y in range(st[x], sb[x] + 1):
            mp[x, y] = 255
    mask = mask.filter(ImageFilter.GaussianBlur(0.7))
    ys = [y for x in range(x0, x1 + 1) if st[x] >= 0 for y in (st[x], sb[x])]
    box = (x0, min(ys), x1 + 1, max(ys) + 1)
    rgba = im.convert("RGBA")
    rgba.putalpha(mask)
    crop = rgba.crop(box).resize((CUE_W, CUE_H), Image.LANCZOS)
    return crop, (box[2] - box[0]) / max(1, box[3] - box[1])


def square(name, kind):
    """
    가장자리에서 시작해 **완만하게 이어지는** 어두운 바탕을 따라간다(뒤의 은은한 빛무리 · 비네트도 바탕). 물건의 테두리는 급한 경계라 거기서 멈춘다.
    페넌트는 줄 안쪽에 갇힌 순검정 틈도 바탕이다(검은 부분이 없는 그림).
    """
    im = Image.open(os.path.join(SRC, name)).convert("RGB").resize((SQ * 2, SQ * 2), Image.LANCZOS)
    w, h = im.size
    px = im.load()
    L = [[max(px[x, y]) for y in range(h)] for x in range(w)]
    bg = [[False] * h for _ in range(w)]
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if L[x][y] <= 60:
                bg[x][y] = True; q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if L[x][y] <= 60 and not bg[x][y]:
                bg[x][y] = True; q.append((x, y))
    while q:
        x, y = q.popleft()
        l0 = L[x][y]
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h and not bg[nx][ny]:
                l1 = L[nx][ny]
                if l1 <= 60 and abs(l1 - l0) <= 3:
                    bg[nx][ny] = True; q.append((nx, ny))
    if kind == "pennant":
        for x in range(w):
            for y in range(h):
                if L[x][y] <= 8:
                    bg[x][y] = True
    mask = Image.new("L", (w, h), 0)
    mp = mask.load()
    for x in range(w):
        for y in range(h):
            if not bg[x][y]:
                mp[x, y] = 255
    mask = mask.filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.convert("RGBA")
    rgba.putalpha(mask)
    return rgba.resize((SQ, SQ), Image.LANCZOS)


KIND = {"rack-": "cue", "chalk-": "chalk", "glove-": "glove", "pennant-": "pennant"}
only = set(sys.argv[2].split(",")) if len(sys.argv) > 2 else None
for d in KIND.values():
    os.makedirs(os.path.join(OUT, d), exist_ok=True)
ratios = []
for f in sorted(os.listdir(SRC)):
    if not f.endswith(".png"):
        continue
    pre = next((p for p in KIND if f.startswith(p)), None)
    if not pre:
        continue
    iid = f[len(pre):-4]
    if only and iid not in only:
        continue
    kind = KIND[pre]
    out = os.path.join(OUT, kind, f"{iid}.webp")
    if kind == "cue":
        img, r = cue(f)
        ratios.append((r, iid))
    else:
        img = square(f, kind)
    img.save(out, "WEBP", quality=84, method=6)
    print(f"{kind:8} {iid:28} {os.path.getsize(out):>7}B", flush=True)
if ratios:
    ratios.sort()
    print("큐의 원래 길이 : 굵기 — 가장 짧은 것", ratios[:3], "가장 긴 것", ratios[-3:])
