# 批量生成怪物精灵图集（gpt-image-2 via SSH 隧道），洋红底
# 前置：ssh -N -L 18080:127.0.0.1:8080 隧道已开
# 产出到 %TEMP%\gamer_sheets\raw\，由 process-spritesheet.py 切片 QA 后入库
$ErrorActionPreference = "Continue"
$outDir = "$env:TEMP\gamer_sheets\raw"
New-Item -ItemType Directory -Force $outDir | Out-Null
$script = "C:\Users\wuyon\.claude\skills\sub2-image-2\scripts\sub2_image2_generate.py"

# 共同纪律：2.5D 倾斜俯视、4x4 网格、同一生物、无网格线
$common = "Pixel-art-free realistic painted dark fantasy game sprite sheet, exactly 4x4 grid of equal square cells, the SAME creature in every cell at the same scale, 3/4 top-down view as seen from a 40-degree tilted camera (we see the top of head/back and the front/side), each creature centered in its cell with empty margin, flat solid magenta background (#FF00FF) everywhere including between cells, NO grid lines, NO borders, NO text, NO labels, consistent soft top-left lighting, muted earthy palette"

$directional = "ROW LAYOUT (top to bottom): row 1 = creature seen from its front (facing the viewer/south); row 2 = creature facing left (west profile); row 3 = creature facing right (east profile); row 4 = creature seen from behind (facing away/north). COLUMN LAYOUT (left to right) within each row: pose 1 standing idle, pose 2 mid-stride step with left limb forward, pose 3 mid-stride step with right limb forward, pose 4 aggressive attack lunge"

$sheets = @(
  @{
    file = "monster_normal_sheet_4x4.png"
    prompt = "A starving corpse-hound: a gaunt feral dog-like ghoul creature with mangy grey-brown hide, exposed ribs, glowing pale eyes and a low predatory stance. $directional. $common"
  },
  @{
    file = "monster_elite_sheet_4x4.png"
    prompt = "A hulking plague butcher: a heavyset humanoid brute wearing rusted scrap armor, a stained leather apron and a crude cleaver, hunched powerful shoulders. $directional. $common"
  },
  @{
    file = "monster_boss_sheet_4x4.png"
    prompt = "A colossal rust-king golem: a towering armored giant fused from corroded iron plates, glowing ember core in its chest, all 16 cells show it FACING THE VIEWER (front view only). ROW LAYOUT (top to bottom), 4 cells each left to right: row 1 = idle breathing sequence (subtle weight shift); row 2 = walking sequence (alternating heavy steps); row 3 = overhead smash attack sequence (raise arms, swing down, impact, recover); row 4 = first 2 cells hurt recoil flinching, last 2 cells collapsing to its knees then fallen. $common"
  }
)

foreach ($sheet in $sheets) {
  $outPath = Join-Path $outDir $sheet.file
  if (Test-Path $outPath) { Write-Output "skip existing $($sheet.file)"; continue }
  Write-Output "generating $($sheet.file) ..."
  python $script --base-url "http://127.0.0.1:18080/v1" --output $outPath --size "1024x1024" $sheet.prompt
}

Get-ChildItem $outDir -Filter *.png | Select-Object Name, Length
