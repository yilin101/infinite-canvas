param(
    [string]$RemoteUrl = "git@github.com:yilin101/infinite-canvas.git",
    [string]$Branch = "main",
    [string]$Message = "chore: add personal fork maintenance setup"
)

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    throw "未找到 git，请先安装 Git for Windows：https://git-scm.com/download/win"
}

if (-not (Test-Path ".git\HEAD")) {
    git init
    git branch -M $Branch
}

$remote = git remote 2>$null
if ($remote -contains "origin") {
    git remote set-url origin $RemoteUrl
} else {
    git remote add origin $RemoteUrl
}

git add .
git commit -m $Message
git push -u origin $Branch
