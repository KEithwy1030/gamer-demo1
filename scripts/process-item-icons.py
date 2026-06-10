# 物品图标后处理：洋红底抠图 -> 透明背景 -> 256x256
# 用法: python scripts/process-item-icons.py <src_dir> <dst_dir>
# gpt-image-2 不支持透明背景参数，所以生成时用纯洋红 (#FF00FF) 底色，
# 这里按色距抠掉，并对边缘洋红溢色做去边处理。
import sys
from pathlib import Path

from PIL import Image

KEY = (255, 0, 255)
DIST_THRESHOLD = 120  # 与洋红的欧氏色距低于此 -> 透明
FRINGE_THRESHOLD = 200  # 半透明边缘去洋红溢色的判定带


def color_dist_sq(r: int, g: int, b: int) -> int:
    return (r - KEY[0]) ** 2 + (g - KEY[1]) ** 2 + (b - KEY[2]) ** 2


def process(src: Path, dst: Path) -> None:
    img = Image.open(src).convert("RGBA")
    px = img.load()
    w, h = img.size
    thr_sq = DIST_THRESHOLD ** 2
    fringe_sq = FRINGE_THRESHOLD ** 2
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            d = color_dist_sq(r, g, b)
            if d <= thr_sq:
                px[x, y] = (0, 0, 0, 0)
            elif d <= fringe_sq and r > g and b > g:
                # 洋红溢色边缘：压掉品红分量（取 R/B 与 G 的中和），保留 alpha
                m = (r + b) // 2
                nr = (r + g) // 2
                nb = (b + g) // 2
                alpha = int(a * min(1.0, (d - thr_sq) / max(1, fringe_sq - thr_sq)))
                px[x, y] = (nr, g, nb, alpha)
    img = img.resize((256, 256), Image.LANCZOS)
    dst.parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, "PNG")
    print(f"processed {src.name} -> {dst}")


def main() -> None:
    src_dir = Path(sys.argv[1])
    dst_dir = Path(sys.argv[2])
    for src in sorted(src_dir.glob("*.png")):
        process(src, dst_dir / src.name)


if __name__ == "__main__":
    main()
