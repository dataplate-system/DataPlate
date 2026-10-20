param(
  [string]$LogoPath = "frontend/images/brand/logo-dataplate.png"
)

Add-Type -AssemblyName System.Drawing

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$sourcePath = Join-Path $repoRoot $LogoPath
$appImageDir = Join-Path $repoRoot "frontend/images/app"
$resourceDir = Join-Path $repoRoot "resources"
New-Item -ItemType Directory -Force -Path $appImageDir, $resourceDir | Out-Null

$logo = [System.Drawing.Image]::FromFile($sourcePath)
$navy = [System.Drawing.ColorTranslator]::FromHtml("#111827")

function New-DataPlateImage {
  param(
    [string]$Path,
    [int]$Size,
    [double]$LogoWidthRatio,
    [bool]$Transparent = $false,
    [bool]$AddName = $false
  )

  $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  if ($Transparent) { $graphics.Clear([System.Drawing.Color]::Transparent) } else { $graphics.Clear($navy) }

  $targetWidth = [int]($Size * $LogoWidthRatio)
  $targetHeight = [int]($targetWidth * $logo.Height / $logo.Width)
  $x = [int](($Size - $targetWidth) / 2)
  $yOffset = if ($AddName) { -[int]($Size * 0.06) } else { 0 }
  $y = [int](($Size - $targetHeight) / 2) + $yOffset
  $graphics.DrawImage($logo, $x, $y, $targetWidth, $targetHeight)

  if ($AddName) {
    $fontSize = [single]($Size * 0.065)
    $font = New-Object System.Drawing.Font "Segoe UI", $fontSize, ([System.Drawing.FontStyle]::Bold)
    $brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $nameRect = New-Object System.Drawing.RectangleF 0, ([single]($Size * 0.64)), $Size, ([single]($Size * 0.12))
    $graphics.DrawString("DataPlate", $font, $brush, $nameRect, $format)
    $format.Dispose()
    $brush.Dispose()
    $font.Dispose()
  }

  $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $bitmap.Dispose()
}

New-DataPlateImage -Path (Join-Path $resourceDir "icon.png") -Size 1024 -LogoWidthRatio 0.58
New-DataPlateImage -Path (Join-Path $resourceDir "icon-foreground.png") -Size 1024 -LogoWidthRatio 0.46 -Transparent $true
New-DataPlateImage -Path (Join-Path $resourceDir "icon-background.png") -Size 1024 -LogoWidthRatio 0
New-DataPlateImage -Path (Join-Path $resourceDir "splash.png") -Size 2732 -LogoWidthRatio 0.30 -AddName $true
New-DataPlateImage -Path (Join-Path $appImageDir "icon-192.png") -Size 192 -LogoWidthRatio 0.58
New-DataPlateImage -Path (Join-Path $appImageDir "icon-512.png") -Size 512 -LogoWidthRatio 0.58
New-DataPlateImage -Path (Join-Path $appImageDir "icon-maskable-512.png") -Size 512 -LogoWidthRatio 0.46

$logo.Dispose()
Write-Host "Mobile assets generated in resources/ and frontend/images/app/."
