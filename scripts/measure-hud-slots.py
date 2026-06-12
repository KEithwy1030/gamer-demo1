# 量测 HUD 资产的羊皮纸槽位几何（一次性工具，供 hudOverlay 布局重建用）
# 输出：原生尺寸 + 每个连通列区段内羊皮纸像素的 bbox（像素与占比）
from PIL import Image
import os

ASSETS = [
    "medieval-hud-status-cpa-image2-20260501.png",
    "medieval-hud-objective-cpa-image2-20260501.png",
    "medieval-hud-timer-cpa-image2-20260501.png",
    "medieval-hud-command-cpa-image2-20260501.png",
    "medieval-hud-skills-cpa-image2-20260501.png",
]
BASE = os.path.join("client", "public", "assets", "generated", "hud")


def is_parchment(px):
    r, g, b, a = px
    return a > 200 and r > 150 and g > 125 and b > 85 and r > b and abs(r - g) < 70


def main():
    for name in ASSETS:
        img = Image.open(os.path.join(BASE, name)).convert("RGBA")
        w, h = img.size
        data = img.load()
        cols = [0] * w
        hits = set()
        for x in range(0, w, 2):
            for y in range(0, h, 2):
                if is_parchment(data[x, y]):
                    cols[x] += 1
                    hits.add((x, y))
        threshold = max(2, (h // 2) * 0.12)
        runs = []
        start = None
        for x in range(0, w, 2):
            if cols[x] >= threshold:
                if start is None:
                    start = x
            else:
                if start is not None:
                    runs.append((start, x - 2))
                    start = None
        if start is not None:
            runs.append((start, w - 1))

        print(f"=== {name}  native {w}x{h} ===")
        for x0, x1 in runs:
            if x1 - x0 < 12:
                continue
            xs = [p for p in hits if x0 <= p[0] <= x1]
            if not xs:
                continue
            min_x = min(p[0] for p in xs)
            max_x = max(p[0] for p in xs)
            min_y = min(p[1] for p in xs)
            max_y = max(p[1] for p in xs)
            print(
                f"slot px [{min_x},{min_y} -> {max_x},{max_y}]  "
                f"ratio [x {min_x/w:.3f}-{max_x/w:.3f}, y {min_y/h:.3f}-{max_y/h:.3f}]"
            )


if __name__ == "__main__":
    main()
