# 把 capture-hit-feel.mjs 的帧序列合成交付用 GIF + 验收用接触表
from PIL import Image
import glob
import os

FRAME_DIR = os.path.join(".codex-artifacts", "hit-feel")
frames = sorted(glob.glob(os.path.join(FRAME_DIR, "frame-*.jpg")))
if not frames:
    raise SystemExit("no frames found")

# GIF（缩到 800 宽，30fps≈33ms/帧）
images = [Image.open(f).convert("RGB") for f in frames]
w, h = images[0].size
scale = 800 / w
gif_frames = [img.resize((800, int(h * scale)), Image.LANCZOS).quantize(colors=128) for img in images]
gif_path = os.path.join(FRAME_DIR, "hit-feel.gif")
gif_frames[0].save(
    gif_path,
    save_all=True,
    append_images=gif_frames[1:],
    duration=33,
    loop=0,
    optimize=True,
)
print(f"gif: {gif_path} ({os.path.getsize(gif_path) // 1024} KB, {len(gif_frames)} frames)")

# 接触表：均匀取 12 帧拼 4x3（验收顿帧/白闪/挫动/数字的关键帧）
picks = [frames[int(i * (len(frames) - 1) / 11)] for i in range(12)]
thumb_w = 420
thumbs = []
for f in picks:
    img = Image.open(f).convert("RGB")
    s = thumb_w / img.width
    thumbs.append(img.resize((thumb_w, int(img.height * s)), Image.LANCZOS))
tw, th = thumbs[0].size
sheet = Image.new("RGB", (tw * 4, th * 3), (10, 10, 10))
for i, t in enumerate(thumbs):
    sheet.paste(t, ((i % 4) * tw, (i // 4) * th))
sheet_path = os.path.join(FRAME_DIR, "contact-sheet.png")
sheet.save(sheet_path)
print(f"sheet: {sheet_path}")
