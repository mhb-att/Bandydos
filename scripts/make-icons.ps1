# Generates square PWA icons (192, 512) and a maskable 512 from the wide
# silhouette logo composed on the brand-orange background.

Add-Type -AssemblyName System.Drawing

$logoPath = Join-Path $PSScriptRoot "..\public\logo.png"
$outDir   = Join-Path $PSScriptRoot "..\public"

$logo = [System.Drawing.Image]::FromFile($logoPath)
$brand = [System.Drawing.ColorTranslator]::FromHtml("#FF3D1F")

function New-Icon([int]$size, [string]$file, [double]$logoScale = 0.78) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g   = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    $brush = New-Object System.Drawing.SolidBrush($brand)
    $g.FillRectangle($brush, 0, 0, $size, $size)
    $brush.Dispose()

    # Fit the wide logo within `logoScale` of the canvas while preserving aspect.
    $aspect = $logo.Width / $logo.Height
    $maxW   = $size * $logoScale
    $maxH   = $size * $logoScale
    if ($aspect -gt 1) {
        $w = $maxW
        $h = $maxW / $aspect
    } else {
        $h = $maxH
        $w = $maxH * $aspect
    }
    $x = ($size - $w) / 2
    $y = ($size - $h) / 2
    $g.DrawImage($logo, $x, $y, $w, $h)
    $g.Dispose()

    $outPath = Join-Path $outDir $file
    $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "wrote $outPath"
}

New-Icon -size 192 -file "icon-192.png"             -logoScale 0.78
New-Icon -size 512 -file "icon-512.png"             -logoScale 0.78
# Maskable: leave a "safe zone" of 20% padding so the silhouette isn't clipped
# when the OS applies its own circular/squircle mask.
New-Icon -size 512 -file "icon-maskable-512.png"    -logoScale 0.55
# Apple touch icon (180px is the iOS preferred size).
New-Icon -size 180 -file "apple-touch-icon.png"     -logoScale 0.78
# Favicon
New-Icon -size 64  -file "favicon-64.png"           -logoScale 0.84

$logo.Dispose()
