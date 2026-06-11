# 精灵图集后处理：自动检测背景色 -> 边缘泛洪抠图 -> 按网格切片 -> 逐格 QA -> 重组为目标几何
# 用法: python scripts/process-spritesheet.py <src.png> <dst.png> [--grid 4x4] [--cell 314]
#
# 抠图策略：从图像四边出发，把与"边界主色"色距在容差内且与边界连通的像素清成透明。
# 泛洪（而非全局色距）保证角色内部撞色像素（黑甲缝、白高光）不会被误删——
# 生成模型不保证底色听话（实测会给白/黑/洋红混着来），所以背景色按四角采样自动检测。
#
# QA 规则：
#   - 每格非空（不透明像素占比 >= 2%）
#   - 质心居中（偏离格中心 <= 18% 格宽）
#   - 同行尺寸一致（行内包围盒高度极差 <= 30%）——同行=同方向动画帧，跳变会闪
import sys
from collections import Counter, deque
from pathlib import Path

from PIL import Image

EDGE_TOLERANCE = 52  # 与背景主色的欧氏色距容差
FRINGE_ALPHA_BAND = 96  # 泛洪边界向内 1px 的去边带


def detect_background(px, w: int, h: int) -> tuple:
    samples = []
    step = max(1, w // 64)
    for x in range(0, w, step):
        samples.append(px[x, 0][:3])
        samples.append(px[x, h - 1][:3])
    for y in range(0, h, step):
        samples.append(px[0, y][:3])
        samples.append(px[w - 1, y][:3])
    # 量化到 16 级再取众数，容忍背景噪点
    quantized = Counter((r // 16, g // 16, b // 16) for r, g, b in samples)
    qr, qg, qb = quantized.most_common(1)[0][0]
    matching = [(r, g, b) for r, g, b in samples if r // 16 == qr and g // 16 == qg and b // 16 == qb]
    n = len(matching)
    return (sum(v[0] for v in matching) // n, sum(v[1] for v in matching) // n, sum(v[2] for v in matching) // n)


def flood_remove_background(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    w, h = img.size
    px = img.load()
    bg = detect_background(px, w, h)
    # 饱和底色（洋红等）边缘有很宽的混色渐变，泛洪容差放大才吃得干净；
    # 中性底色（黑/白/灰）容差必须小，否则会蚀进角色的暗部/高光。
    bg_saturation = max(bg) - min(bg)
    tolerance = 110 if bg_saturation > 80 else EDGE_TOLERANCE
    tol_sq = tolerance ** 2

    def is_bg(x: int, y: int) -> bool:
        r, g, b, _ = px[x, y]
        return (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2 <= tol_sq

    visited = bytearray(w * h)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if not visited[y * w + x] and is_bg(x, y):
                visited[y * w + x] = 1
                queue.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            if not visited[y * w + x] and is_bg(x, y):
                visited[y * w + x] = 1
                queue.append((x, y))

    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h and not visited[ny * w + nx] and is_bg(nx, ny):
                visited[ny * w + nx] = 1
                queue.append((nx, ny))

    # 清背景 + 对紧贴背景的前景像素做半透明去边
    for y in range(h):
        base = y * w
        for x in range(w):
            if visited[base + x]:
                px[x, y] = (0, 0, 0, 0)
    for y in range(h):
        base = y * w
        for x in range(w):
            if visited[base + x]:
                continue
            touches_bg = any(
                0 <= nx < w and 0 <= ny < h and visited[ny * w + nx]
                for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1))
            )
            if touches_bg:
                r, g, b, a = px[x, y]
                px[x, y] = (r, g, b, min(a, 255 - FRINGE_ALPHA_BAND))

    # 封闭孔洞（如车轮辐条之间）泛洪进不去：饱和底色时按严格色距全局清除。
    # 中性底色不做全局清除——会蚀掉角色内部暗部/高光。
    if bg_saturation > 80:
        hole_tol_sq = EDGE_TOLERANCE ** 2
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                if (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2 <= hole_tol_sq:
                    px[x, y] = (0, 0, 0, 0)

    # 饱和底色的残余溢色（泛洪边界外侧 1-2px）做色相压制兜底。
    if bg_saturation > 80:
        wide_tol_sq = (EDGE_TOLERANCE * 2.6) ** 2
        for y in range(h):
            for x in range(w):
                r, g, b, a = px[x, y]
                if a == 0:
                    continue
                d = (r - bg[0]) ** 2 + (g - bg[1]) ** 2 + (b - bg[2]) ** 2
                if d > wide_tol_sq:
                    continue
                hue_match = (
                    (bg[0] > bg[1] + 40 and r > g + 24)
                    and (bg[2] > bg[1] + 40 and b > g + 24)
                )
                if not hue_match:
                    continue
                neutral = (r + g + b) // 3
                fade = d / wide_tol_sq
                px[x, y] = (
                    (r + neutral) // 2,
                    g,
                    (b + neutral) // 2,
                    int(a * min(1.0, 0.25 + 0.75 * fade))
                )
    return img


def cell_stats(cell: Image.Image) -> dict:
    alpha = cell.getchannel("A")
    w, h = cell.size
    total = w * h
    opaque = 0
    min_x, min_y, max_x, max_y = w, h, -1, -1
    cx_sum = 0
    cy_sum = 0
    for i, a in enumerate(alpha.getdata()):
        if a > 24:
            opaque += 1
            x = i % w
            y = i // w
            cx_sum += x
            cy_sum += y
            if x < min_x: min_x = x
            if x > max_x: max_x = x
            if y < min_y: min_y = y
            if y > max_y: max_y = y
    if opaque == 0:
        return {"coverage": 0.0, "center_offset": 1.0, "bbox_h": 0}
    return {
        "coverage": opaque / total,
        "center_offset": max(
            abs(cx_sum / opaque - w / 2) / w,
            abs(cy_sum / opaque - h / 2) / h
        ),
        "bbox_h": max_y - min_y + 1
    }


def main() -> int:
    src = Path(sys.argv[1])
    dst = Path(sys.argv[2])
    grid = "4x4"
    cell_size = 314
    # directional: 行=方向、列=动画帧（行内高度必须一致，否则播动画会跳）
    # freeform:    行无动画语义（动作序列表/道具集），跳过行一致性，质心放宽
    mode = "directional"
    for i, arg in enumerate(sys.argv):
        if arg == "--grid":
            grid = sys.argv[i + 1]
        if arg == "--cell":
            cell_size = int(sys.argv[i + 1])
        if arg == "--mode":
            mode = sys.argv[i + 1]
    cols, rows = (int(v) for v in grid.split("x"))

    img = flood_remove_background(Image.open(src))
    w, h = img.size
    cw, ch = w / cols, h / rows

    failures: list[str] = []
    cells: list[list[Image.Image]] = []
    for r in range(rows):
        row_cells = []
        heights = []
        for c in range(cols):
            cell = img.crop((round(c * cw), round(r * ch), round((c + 1) * cw), round((r + 1) * ch)))
            stats = cell_stats(cell)
            if stats["coverage"] < 0.02:
                failures.append(f"r{r}c{c}: empty (coverage {stats['coverage']:.3f})")
            # 末列是攻击突进姿态，天然前倾偏心，放宽阈值；freeform 全部放宽
            center_limit = 0.26 if (mode == "freeform" or c == cols - 1) else 0.18
            if stats["center_offset"] > center_limit:
                failures.append(f"r{r}c{c}: off-center ({stats['center_offset']:.2f})")
            heights.append(stats["bbox_h"])
            row_cells.append(cell)
        valid = [v for v in heights if v > 0]
        if mode == "directional" and valid and (max(valid) - min(valid)) / max(valid) > 0.30:
            failures.append(f"row {r}: height variance {min(valid)}-{max(valid)}")
        cells.append(row_cells)

    out = Image.new("RGBA", (cell_size * cols, cell_size * rows), (0, 0, 0, 0))
    for r in range(rows):
        for c in range(cols):
            resized = cells[r][c].resize((cell_size, cell_size), Image.LANCZOS)
            out.paste(resized, (c * cell_size, r * cell_size))

    dst.parent.mkdir(parents=True, exist_ok=True)
    out.save(dst, "PNG")

    print(f"output: {dst} ({out.size[0]}x{out.size[1]}, {cols}x{rows} grid, cell {cell_size})")
    if failures:
        print("QA FAIL:")
        for f in failures:
            print(f"  - {f}")
        return 1
    print("QA PASS")
    return 0


if __name__ == "__main__":
    sys.exit(main())
