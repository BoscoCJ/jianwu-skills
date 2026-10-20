param(
    [Parameter(Mandatory = $true)][string]$InputFile,
    [string]$OutputDirectory,
    [int]$Width = 1920,
    [int]$Height = 1080
)
$ErrorActionPreference = 'Stop'
$resolvedInput = (Resolve-Path -LiteralPath $InputFile).Path
if (-not $OutputDirectory) {
    $OutputDirectory = Join-Path (Split-Path -Parent $resolvedInput) (([IO.Path]::GetFileNameWithoutExtension($resolvedInput)) + '-artifacts')
}
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$powerpoint = New-Object -ComObject PowerPoint.Application
$presentation = $null
try {
    $presentation = $powerpoint.Presentations.Open($resolvedInput, -1, 0, 0)
    $results = @()
    $images = @()
    foreach ($slide in $presentation.Slides) {
        $filename = Join-Path $OutputDirectory ('render-{0:00}.png' -f $slide.SlideIndex)
        $slide.Export($filename, 'PNG', $Width, $Height)
        $images += [PSCustomObject]@{ slide = $slide.SlideIndex; sha256 = (Get-FileHash -LiteralPath $filename -Algorithm SHA256).Hash.ToLowerInvariant() }
        $textShapes = @()
        foreach ($shape in $slide.Shapes) {
            if ($shape.HasTextFrame -and $shape.TextFrame.HasText) {
                $range = $shape.TextFrame2.TextRange
                $textShapes += [PSCustomObject]@{
                    name = $shape.Name
                    text = $range.Text
                    font = $range.Font.Name
                    fontSize = $range.Font.Size
                    autoSize = $shape.TextFrame2.AutoSize
                    rotation = $shape.Rotation
                    boundHeight = $range.BoundHeight
                    frameHeight = $shape.Height
                }
            }
        }
        $results += [PSCustomObject]@{ slide = $slide.SlideIndex; shapes = $slide.Shapes.Count; textShapes = $textShapes }
    }
    $results | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'powerpoint-audit.json') -Encoding UTF8
    [PSCustomObject]@{ pptx_sha256 = (Get-FileHash -LiteralPath $resolvedInput -Algorithm SHA256).Hash.ToLowerInvariant(); images = $images } |
        ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $OutputDirectory 'render-manifest.json') -Encoding UTF8
    Write-Output ('Rendered {0} slides using Microsoft PowerPoint.' -f $presentation.Slides.Count)
}
finally {
    if ($presentation) { $presentation.Close() }
    $powerpoint.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint) | Out-Null
}
