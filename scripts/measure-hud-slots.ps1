# 量测 HUD 资产的羊皮纸槽位几何（一次性工具，供 hudOverlay 布局重建用）
# 判定：偏亮的暖色羊皮纸像素；输出每个连通列区段的 bbox（原生像素 + 占比）
Add-Type -AssemblyName System.Drawing

$assets = @(
  'medieval-hud-status-cpa-image2-20260501.png',
  'medieval-hud-objective-cpa-image2-20260501.png',
  'medieval-hud-timer-cpa-image2-20260501.png',
  'medieval-hud-command-cpa-image2-20260501.png',
  'medieval-hud-skills-cpa-image2-20260501.png'
)
$base = 'client\public\assets\generated\hud'

foreach ($name in $assets) {
  $bmp = New-Object System.Drawing.Bitmap (Join-Path $base $name)
  $w = $bmp.Width; $h = $bmp.Height
  $step = 3
  # 列覆盖率
  $colHits = New-Object int[] ([int][Math]::Ceiling($w / $step))
  $map = @{}
  for ($x = 0; $x -lt $w; $x += $step) {
    for ($y = 0; $y -lt $h; $y += $step) {
      $c = $bmp.GetPixel($x, $y)
      if ($c.A -gt 200 -and $c.R -gt 150 -and $c.G -gt 125 -and $c.B -gt 85 -and $c.R -gt $c.B -and ([Math]::Abs([int]$c.R - [int]$c.G) -lt 70)) {
        $colHits[[int]($x / $step)]++
        $map["$x,$y"] = $true
      }
    }
  }
  $colThreshold = [Math]::Max(2, ($h / $step) * 0.12)
  # 找列区段
  $runs = @(); $runStart = -1
  for ($i = 0; $i -lt $colHits.Length; $i++) {
    if ($colHits[$i] -ge $colThreshold) { if ($runStart -lt 0) { $runStart = $i } }
    else { if ($runStart -ge 0) { $runs += ,@($runStart * $step, ($i - 1) * $step); $runStart = -1 } }
  }
  if ($runStart -ge 0) { $runs += ,@($runStart * $step, ($colHits.Length - 1) * $step) }

  Write-Output "=== $name  native ${w}x${h} ==="
  foreach ($run in $runs) {
    $x0 = $run[0]; $x1 = $run[1]
    if (($x1 - $x0) -lt 12) { continue }
    $minY = $h; $maxY = 0; $minX = $w; $maxX = 0
    for ($x = $x0; $x -le $x1; $x += $step) {
      for ($y = 0; $y -lt $h; $y += $step) {
        if ($map.ContainsKey("$x,$y")) {
          if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
          if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
        }
      }
    }
    $rx0 = [Math]::Round($minX / $w, 3); $rx1 = [Math]::Round($maxX / $w, 3)
    $ry0 = [Math]::Round($minY / $h, 3); $ry1 = [Math]::Round($maxY / $h, 3)
    Write-Output ("slot px [{0},{1} -> {2},{3}]  ratio [x {4}-{5}, y {6}-{7}]" -f $minX, $minY, $maxX, $maxY, $rx0, $rx1, $ry0, $ry1)
  }
  $bmp.Dispose()
}
