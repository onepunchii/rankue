# 수족관 장식 그림 따내기 — raw(흰 바탕 먹 판화) → client/public/fishing/decor/<id>.webp(흰 바탕 그대로, 화면이 먹선만 따낸다) + s/<id>.webp(꾸미기 칸의 작은 그림)
# python3 export-deco.py  (저장소 맨 위에서)
from PIL import Image, ImageOps
import os
RAW = "reports/cue-case-1016/raw"
OUT = "client/public/fishing/decor"
# 장식 id → 받은 그림 이름, 종류
ITEMS = {
    "bg-dawn": ("bg-dawn", "bg"), "bg-moon": ("bg-moon", "bg"), "bg-mist": ("bg-mist", "bg"),
    "floor-sand": ("floor-sand", "floor"), "floor-pebble": ("floor-pebble", "floor"), "floor-ledge": ("floor-rock", "floor"), "floor-mud": ("floor-mud", "floor"),
    "seagrass": ("seagrass", "big"), "rock": ("rock", "big"), "kelp": ("kelp", "big"), "wreck": ("wreck", "big"), "lighthouse": ("lighthouse", "big"),
    "tetrapod": ("tetrapod", "big"), "boat": ("boat", "big"), "trap": ("trap", "big"), "reed": ("reed", "big"), "lotus": ("lotus", "big"),
    "shell": ("shell", "prop"), "anchor": ("lantern", "prop"), "lamp": ("lamp", "prop"), "frame": ("frame", "prop"), "float": ("float", "prop"),
    "crewbuoy": ("crewbuoy", "prop"), "goldanchor": ("goldanchor", "prop"),
}
os.makedirs(OUT + "/s", exist_ok=True)

def bbox(im, thr):
    g = im.convert("L").point(lambda v: 255 if v < thr else 0)
    return g.getbbox()

for id, (raw, kind) in ITEMS.items():
    im = Image.open(f"{RAW}/deco-{raw}.png").convert("RGB")
    # 가장자리의 얇은 회색 테(그림 틀이 끼어 있는 경우)를 먼저 걷는다
    w, h = im.size
    im = im.crop((int(w * 0.012), int(h * 0.012), int(w * 0.988), int(h * 0.988)))
    thr = 236 if kind == "bg" else 228
    b = bbox(im, thr)
    if b:
        x0, y0, x1, y1 = b
        pad = int(max(x1 - x0, y1 - y0) * 0.02)
        im = im.crop((max(0, x0 - pad), max(0, y0 - pad), min(im.width, x1 + pad), min(im.height, y1 + pad)))
    # 바탕을 순백으로 — 한지 · 밤바다 위에서 네모 자국이 남지 않게
    im = im.point(lambda v: 255 if v > 244 else v)
    if kind == "bg":
        im = ImageOps.contain(im, (1600, 1600))
        # 옅은 그림 — 선을 조금 진하게(감마)
        im = im.point(lambda v: int(255 * (v / 255) ** 1.6))
    elif kind == "floor":
        im = ImageOps.contain(im, (1000, 1000))
    else:
        im = ImageOps.contain(im, (560, 560))
    im.save(f"{OUT}/{id}.webp", "WEBP", quality=72 if kind in ("bg", "floor") else 80, method=6)
    t = ImageOps.contain(im, (240, 240))
    t.save(f"{OUT}/s/{id}.webp", "WEBP", quality=78, method=6)
    print(id, im.size, os.path.getsize(f"{OUT}/{id}.webp") // 1024, "KB")
