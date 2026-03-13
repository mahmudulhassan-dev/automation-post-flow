$ErrorActionPreference = "Stop"

$repo = "gitroomhq/postiz-app"
$apiUrl = "https://api.github.com/repos/$repo/releases/latest"
$outputPath = "docs/postiz-upstream-latest.json"

Write-Host "Fetching latest release from $repo ..."
$release = Invoke-RestMethod -Uri $apiUrl -Method Get -Headers @{ "User-Agent" = "amanaflow-upstream-sync" }

$payload = [ordered]@{
    checked_at_utc = (Get-Date).ToUniversalTime().ToString("o")
    repository = $repo
    tag_name = $release.tag_name
    release_name = $release.name
    published_at = $release.published_at
    html_url = $release.html_url
    notes = $release.body
}

$json = $payload | ConvertTo-Json -Depth 6
Set-Content -Path $outputPath -Value $json -Encoding UTF8

Write-Host "Saved release info to $outputPath"
