param(
    [string]$RepoName = 'ecology-paper-digest',
    [ValidateSet('public', 'private')][string]$Visibility = 'public'
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot
$Gh = (Get-Command gh.exe -ErrorAction SilentlyContinue | Select-Object -First 1).Source
if (-not $Gh) {
    $portable = 'D:\tools\gh\bin\gh.exe'
    if (Test-Path -LiteralPath $portable) { $Gh = $portable }
}
if (-not $Gh) { throw 'GitHub CLI not found. Install it to D:\tools\gh or add gh.exe to PATH.' }

& $Gh auth status *> $null
if ($LASTEXITCODE -ne 0) {
    Write-Host 'Starting GitHub login...'
    & $Gh auth login --hostname github.com --git-protocol https --web --skip-ssh-key
    if ($LASTEXITCODE -ne 0) { throw 'GitHub login failed. Retry with: gh auth login --with-token' }
}

$Login = (& $Gh api user --jq .login).Trim()
if (-not $Login) { throw 'Could not read GitHub login.' }
$Email = (& $Gh api user --jq '.email // empty').Trim()
if (-not $Email) { $Email = "$Login@users.noreply.github.com" }

Push-Location $Root
try {
    git config user.name $Login
    git config user.email $Email

    & $Gh repo view "$Login/$RepoName" *> $null
    if ($LASTEXITCODE -ne 0) {
        & $Gh repo create $RepoName --$Visibility --source . --remote origin --push
        if ($LASTEXITCODE -ne 0) { throw 'Repository creation or push failed.' }
    } else {
        $remote = git remote get-url origin 2>$null
        if ($LASTEXITCODE -ne 0) {
            git remote add origin "https://github.com/$Login/$RepoName.git"
        } else {
            git remote set-url origin "https://github.com/$Login/$RepoName.git"
        }
        git push -u origin main
        if ($LASTEXITCODE -ne 0) { throw 'Git push failed.' }
    }

    try {
        $pagesUrl = (& $Gh api --method POST "repos/$Login/$RepoName/pages" -f build_type=workflow --jq .html_url).Trim()
    } catch {
        $pagesUrl = (& $Gh api "repos/$Login/$RepoName/pages" --jq .html_url).Trim()
    }

    & $Gh workflow run update-reports.yml --repo "$Login/$RepoName"
    Write-Host "Repository: https://github.com/$Login/$RepoName"
    Write-Host "Pages: $pagesUrl"
    Write-Host 'The first report workflow has been started.'
} finally {
    Pop-Location
}
