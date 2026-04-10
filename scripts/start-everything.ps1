$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'

function Write-Step($message) {
  Write-Host "[blockerp] $message"
}

function Stop-ListeningPorts([int[]]$ports) {
  foreach ($port in $ports) {
    $connections = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($connection in $connections) {
      try {
        Stop-Process -Id $connection.OwningProcess -Force -ErrorAction SilentlyContinue
      } catch {
      }
    }
  }
}

function Wait-ForPort([int]$port, [int]$timeoutSeconds = 30) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $listening = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    if ($listening) {
      return $true
    }
    Start-Sleep -Seconds 1
  }
  return $false
}

function Wait-ForHttpOk([string]$url, [int]$timeoutSeconds = 45) {
  $deadline = (Get-Date).AddSeconds($timeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
    }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Set-EnvValue([string]$key, [string]$value) {
  if (-not (Test-Path $envPath)) {
    New-Item -ItemType File -Path $envPath -Force | Out-Null
  }

  $content = Get-Content $envPath -Raw
  if ($null -eq $content) { $content = '' }
  $line = "$key=$value"
  if ($content -match "(?m)^$key=.*$") {
    $updated = [regex]::Replace($content, "(?m)^$key=.*$", $line)
  } else {
    $trimmed = $content.TrimEnd()
    if ([string]::IsNullOrWhiteSpace($trimmed)) {
      $updated = "$line`r`n"
    } else {
      $updated = "$trimmed`r`n$line`r`n"
    }
  }

  Set-Content -Path $envPath -Value $updated
}

function Start-ServiceWindow([string]$title, [string]$command) {
  $wrapped = "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location '$projectRoot'; $command"
  Start-Process -FilePath powershell.exe -ArgumentList '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', $wrapped | Out-Null
}

Set-Location $projectRoot
New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot '.logs') | Out-Null

Write-Step 'Cleaning ports 3000, 4000, 8545'
Stop-ListeningPorts @(3000, 4000, 8545)

Set-EnvValue 'CLIENT_ORIGIN' 'http://localhost:3000'
Set-EnvValue 'VITE_API_URL' 'http://localhost:4000/api'

Write-Step 'Starting Hardhat local blockchain on 8545'
Start-ServiceWindow 'BlockERP Hardhat' 'npm.cmd run node'

if (-not (Wait-ForPort -port 8545 -timeoutSeconds 40)) {
  throw 'Hardhat RPC did not start on port 8545.'
}

Write-Step 'Deploying ERPRecordAnchor'
$prevEAP = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
$deployOutput = & npm.cmd run deploy:anchor -- --network localhost 2>&1 | Out-String
$deployExitCode = $LASTEXITCODE
$ErrorActionPreference = $prevEAP
if ($deployExitCode -ne 0) {
  throw "ERPRecordAnchor deployment failed with exit code $deployExitCode."
}
Write-Host $deployOutput
$match = [regex]::Match($deployOutput, 'ERPRecordAnchor deployed at:\s*(0x[a-fA-F0-9]{40})')
if ($match.Success) {
  Set-EnvValue 'RECORD_ANCHOR_ADDRESS' $match.Groups[1].Value
  Write-Step "Saved RECORD_ANCHOR_ADDRESS=$($match.Groups[1].Value)"
} else {
  Write-Step 'Anchor deployment output did not contain a contract address. Continuing with existing .env value.'
}

Write-Step 'Starting backend on 4000'
Start-ServiceWindow 'BlockERP Backend' 'npm.cmd run server'

if (-not (Wait-ForHttpOk -url 'http://localhost:4000/api/health' -timeoutSeconds 60)) {
  Write-Step 'Backend did not report healthy on /api/health within 60 seconds.'
} else {
  Write-Step 'Backend is responding on http://localhost:4000/api/health'
}

Write-Step 'Starting frontend on 3000'
Start-ServiceWindow 'BlockERP Frontend' 'npm.cmd run dev -- --host localhost --port 3000 --strictPort'

Write-Host ''
Write-Host 'BlockERP local stack started.'
Write-Host 'Frontend: http://localhost:3000'
Write-Host 'Backend:  http://localhost:4000'
Write-Host 'Health:   http://localhost:4000/api/health'
Write-Host 'Login:    admin@blockerp.local / ChangeMe123!'
