# 鐢熸垚涓栫晫瑁呴グ鍥鹃泦锛?6 绉嶅簾鍦熷皬鐗╀欢锛?x4 缃戞牸锛屾磱绾㈠簳锛?# 鍓嶇疆锛歴sh -N -L 18080:127.0.0.1:8080 闅ч亾宸插紑
$ErrorActionPreference = "Continue"
$outDir = "$env:TEMP\gamer_sheets\raw"
New-Item -ItemType Directory -Force $outDir | Out-Null
$script = "C:\Users\wuyon\.claude\skills\sub2-image-2\scripts\sub2_image2_generate.py"

$outPath = Join-Path $outDir "atlas_world_decor_4x4.png"
if (Test-Path $outPath) { Write-Output "skip existing decor atlas"; exit 0 }

$prompt = "Realistic painted dark fantasy game prop sprite sheet, exactly 4x4 grid of equal square cells, each cell contains ONE different small wasteland ground prop, all rendered in the SAME 3/4 top-down view from a 40-degree tilted camera, same scale and same soft top-left lighting across all cells, each prop centered with empty margin, flat solid pure black background (#000000) everywhere including between cells, NO grid lines, NO borders, NO text. The 16 props (left to right, top to bottom): 1 pile of bleached bones, 2 broken cart wheel, 3 dead thorny shrub, 4 small mossy rock pile, 5 snapped spear stuck in ground, 6 rotten wooden stump, 7 scattered clay pots shards, 8 ribcage skeleton remains, 9 scorched earth patch, 10 cracked round shield on ground, 11 broken sword half-buried, 12 dry tuft of wasteland grass, 13 cluster of pale mushrooms, 14 crumbled brick rubble, 15 leaning wooden grave marker, 16 weathered standing stone with crow. Muted earthy palette, weathered and grim"

Write-Output "generating decor atlas ..."
python $script --base-url "http://127.0.0.1:18080/v1" --output $outPath --size "1024x1024" $prompt
Get-ChildItem $outDir -Filter *.png | Select-Object Name, Length

