# 批量生成新物品图标（gpt-image-2 via SSH 隧道），洋红底，后续由 process-item-icons.py 抠图
# 前置：ssh -N -L 18080:127.0.0.1:8080 已开启
$ErrorActionPreference = "Continue"
$outDir = "$env:TEMP\gamer_icons"
New-Item -ItemType Directory -Force $outDir | Out-Null
$script = "C:\Users\wuyon\.claude\skills\sub2-image-2\scripts\sub2_image2_generate.py"
$suffix = ", realistic painted fantasy style, weathered, centered at 3/4 view, isolated on a pure solid magenta background (#FF00FF), no shadow on background, no text, no watermark, medieval game inventory item icon"

$items = @(
  @{ file = "icon_weapon_warblade_v1.png";      prompt = "Single broad military arming sword, polished grey steel blade with brass crossguard and wire-wrapped grip" },
  @{ file = "icon_weapon_nightfang_v1.png";     prompt = "Single curved fang-like dagger, blackened steel blade with subtle dark blue sheen, compact wrapped hilt" },
  @{ file = "icon_weapon_falx_v1.png";          prompt = "Single sinister hooked falx blade, forward-curving dark steel with dried blood-red tint along the edge, two-handed wooden haft" },
  @{ file = "icon_weapon_serpent_pike_v1.png";  prompt = "Single long cavalry pike with wavy serpentine flamberge blade tip, dark wood shaft with steel langets" },
  @{ file = "icon_weapon_halberd_v1.png";       prompt = "Single ancient gravekeeper halberd, aged bronze axe blade with tomb engravings, long dark oak shaft" },
  @{ file = "icon_armor_barbute_v1.png";        prompt = "Single cast iron barbute helmet with T-shaped face slit, dull hammered surface with rivets" },
  @{ file = "icon_armor_plague_mask_v1.png";    prompt = "Single leather plague doctor beak mask with round brass-rimmed glass goggles, dark oiled leather with straps" },
  @{ file = "icon_armor_ghoul_wrap_v1.png";     prompt = "Single crude chest armor wrap made of pale stitched hide, sinewy straps and bone toggles" },
  @{ file = "icon_armor_brigandine_v1.png";     prompt = "Single brigandine vest, dark cloth covering with rows of brass rivets over hidden steel plates" },
  @{ file = "icon_armor_bracers_v1.png";        prompt = "Single pair of supple leather bracers with buckled straps and reinforced knuckle stitching" },
  @{ file = "icon_armor_tabi_v1.png";           prompt = "Single pair of silent black split-toe tabi boots with cloth leg wraps, soft soles" },
  @{ file = "icon_armor_sabatons_v1.png";       prompt = "Single pair of heavy plate armor sabatons, articulated steel foot guards with squared toes" },
  @{ file = "icon_treasure_candelabrum_v1.png"; prompt = "Single tarnished silver three-armed candelabrum with melted wax remnants, ornate baroque base" },
  @{ file = "icon_treasure_signet_v1.png";      prompt = "Single heavy gold bishop signet ring with engraved crest and deep purple amethyst stone" },
  @{ file = "icon_treasure_coin_hoard_v1.png";  prompt = "Single small pile of ancient gold and silver coins with worn embossed faces, a few coins scattered" },
  @{ file = "icon_treasure_reliquary_v1.png";   prompt = "Single gilded reliquary casket, small golden box with gabled lid, gem inlays and saint engravings" },
  @{ file = "icon_treasure_crown_v1.png";       prompt = "Single battered royal crown of a fallen king, dented gold with empty gem sockets and one remaining ruby" },
  @{ file = "icon_consumable_ration_v1.png";    prompt = "Single field ration bundle, dark bread and dried meat strips wrapped in rough cloth tied with twine" },
  @{ file = "icon_consumable_medkit_v1.png";    prompt = "Single medieval army surgeon kit, open leather satchel with rolled bandages, needle and small tonic bottle" },
  @{ file = "icon_consumable_berserk_v1.png";   prompt = "Single aggressive potion vial of bubbling crimson liquid, jagged glass with iron claw-shaped holder" }
)

$jobs = @()
foreach ($item in $items) {
  $outPath = Join-Path $outDir $item.file
  if (Test-Path $outPath) { Write-Output "skip existing $($item.file)"; continue }
  $fullPrompt = $item.prompt + $suffix
  $jobs += Start-Job -ScriptBlock {
    param($script, $outPath, $prompt)
    python $script --base-url "http://127.0.0.1:18080/v1" --output $outPath --size "1024x1024" $prompt 2>&1 | Out-String
  } -ArgumentList $script, $outPath, $fullPrompt
  Start-Sleep -Milliseconds 500
}

$jobs | Wait-Job -Timeout 1500 | Out-Null
foreach ($job in $jobs) {
  $result = Receive-Job $job -ErrorAction SilentlyContinue
  if ($result -match '"ok": true') { Write-Output "OK job $($job.Id)" } else { Write-Output "FAIL job $($job.Id): $($result | Select-Object -First 1)" }
}
$jobs | Remove-Job -Force -ErrorAction SilentlyContinue
Get-ChildItem $outDir -Filter *.png | Select-Object Name, Length
