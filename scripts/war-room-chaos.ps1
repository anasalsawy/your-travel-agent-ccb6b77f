param(
  [string]$BaseUrl = "https://wpwdxtyufpewdyffxlgo.supabase.co/functions/v1",
  [string]$AnonKey = "",
  [int]$AttemptsPerAgent = 2,
  [int]$TickCycles = 6
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($AnonKey)) {
  if ($env:VITE_SUPABASE_PUBLISHABLE_KEY) {
    $AnonKey = $env:VITE_SUPABASE_PUBLISHABLE_KEY
  } elseif (Test-Path ".env") {
    $line = Get-Content ".env" | Where-Object { $_ -match "^VITE_SUPABASE_PUBLISHABLE_KEY=" } | Select-Object -First 1
    if ($line) {
      $AnonKey = ($line -replace '^VITE_SUPABASE_PUBLISHABLE_KEY="?([^"]+)"?$', '$1')
    }
  }
}

if ([string]::IsNullOrWhiteSpace($AnonKey)) {
  throw "Anon key missing. Pass -AnonKey or set VITE_SUPABASE_PUBLISHABLE_KEY."
}

$Headers = @{
  apikey        = $AnonKey
  Authorization = "Bearer $AnonKey"
  "Content-Type"= "application/json"
}

$agents = @(
  "assistant",
  "YTA-ASSISTANT",
  "BUILDEROFAGENTS",
  "internal-app-test-buildrunner",
  "shopper-lead",
  "shopper-helper-1",
  "shopper-helper-2",
  "shopper-helper-3"
)

function Invoke-Edge([string]$fn, [hashtable]$body) {
  $json = $body | ConvertTo-Json -Depth 8
  Invoke-WebRequest -Method Post -Uri "$BaseUrl/$fn" -Headers $Headers -Body $json -SkipHttpErrorCheck
}

function Decode-Json($resp) {
  try { return $resp.Content | ConvertFrom-Json -Depth 12 } catch { return $null }
}

Write-Host "== Agent Matrix =="
$rows = @()
foreach ($agent in $agents) {
  for ($i = 1; $i -le $AttemptsPerAgent; $i++) {
    $resp = Invoke-Edge "foundry-agent-run" @{
      agentName  = $agent
      channel    = "war-room"
      externalId = "war-room"
      source     = "chaos-matrix"
      message    = "Chaos test attempt ${i}: call war_room_post with ACK and one actionable line."
    }
    $j = Decode-Json $resp
    $steps = if ($j -and $j.steps) { @($j.steps).Count } else { 0 }
    $posted = $false
    if ($j -and $j.steps) { $posted = (@($j.steps | Where-Object { $_.tool -eq "war_room_post" }).Count -gt 0) }
    $err = if ($j -and $j.error) { [string]$j.error } else { "" }
    $ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
    $row = [pscustomobject]@{
      phase = "matrix"
      agent = $agent
      attempt = $i
      http = $resp.StatusCode
      ok = $ok
      posted = $posted
      steps = $steps
      error = $err
    }
    $rows += $row
    Write-Host ("{0} try#{1}: http={2} ok={3} posted={4} steps={5}" -f $agent, $i, $resp.StatusCode, $ok, $posted, $steps)
    if ($err) { Write-Host ("  err: " + $err.Substring(0, [Math]::Min(220, $err.Length))) }
  }
}

Write-Host "`n== Scenario Tasks =="
$scenarios = @(
  @{ name = "booking"; agent = "YTA-ASSISTANT"; msg = "Task: produce booking recovery plan for CAI->JED next week, then post ACK/WORKING via war_room_post with concrete next action." },
  @{ name = "shopping"; agent = "shopper-lead"; msg = "Task: create shopping mission for Nike backpack under 80 USD and post status via war_room_post; if blocked, include blocker and fallback." },
  @{ name = "building"; agent = "BUILDEROFAGENTS"; msg = "Task: propose fix plan for stuck war-room agents and post WORKING via war_room_post with first infra action." }
)
foreach ($s in $scenarios) {
  $resp = Invoke-Edge "foundry-agent-run" @{
    agentName  = $s.agent
    channel    = "war-room"
    externalId = "war-room"
    source     = "chaos-scenario"
    message    = $s.msg
  }
  $j = Decode-Json $resp
  $steps = if ($j -and $j.steps) { @($j.steps).Count } else { 0 }
  $posted = $false
  if ($j -and $j.steps) { $posted = (@($j.steps | Where-Object { $_.tool -eq "war_room_post" }).Count -gt 0) }
  $err = if ($j -and $j.error) { [string]$j.error } else { "" }
  $txt = if ($j -and $j.text) { ([string]$j.text).Replace("`r", " ").Replace("`n", " ") } else { "" }
  $rows += [pscustomobject]@{
    phase = "scenario"
    agent = $s.agent
    attempt = 1
    http = $resp.StatusCode
    ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
    posted = $posted
    steps = $steps
    error = $err
  }
  Write-Host ("{0}/{1}: http={2} posted={3} steps={4}" -f $s.name, $s.agent, $resp.StatusCode, $posted, $steps)
  if ($err) { Write-Host ("  err: " + $err.Substring(0, [Math]::Min(220, $err.Length))) }
  if ($txt) { Write-Host ("  text: " + $txt.Substring(0, [Math]::Min(220, $txt.Length))) }
}

Write-Host "`n== Tick Pressure =="
for ($t = 1; $t -le $TickCycles; $t++) {
  $resp = Invoke-Edge "war-room" @{ action = "tick" }
  $j = Decode-Json $resp
  $next = ""
  $speech = ""
  if ($j) {
    if ($j.ticked) {
      $next = [string]$j.ticked.plan.next_speaker
      $speech = [string]$j.ticked.plan.speech
    } elseif ($j.plan) {
      $next = [string]$j.plan.next_speaker
      $speech = [string]$j.plan.speech
    }
  }
  $rows += [pscustomobject]@{
    phase = "tick"
    agent = $next
    attempt = $t
    http = $resp.StatusCode
    ok = ($resp.StatusCode -ge 200 -and $resp.StatusCode -lt 300)
    posted = $false
    steps = 0
    error = ""
  }
  $s = $speech.Replace("`r", " ").Replace("`n", " ")
  Write-Host ("tick#{0}: http={1} next={2} speech={3}" -f $t, $resp.StatusCode, $next, $s.Substring(0, [Math]::Min(160, $s.Length)))
  Start-Sleep -Milliseconds 500
}

Write-Host "`n== Summary =="
$group = $rows | Group-Object phase, agent | Sort-Object Name
foreach ($g in $group) {
  $pass = @($g.Group | Where-Object { $_.ok }).Count
  $fail = @($g.Group | Where-Object { -not $_.ok }).Count
  Write-Host ("{0}: pass={1} fail={2}" -f $g.Name, $pass, $fail)
}

$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$out = "tmp_war_room_chaos_${ts}.json"
$rows | ConvertTo-Json -Depth 8 | Set-Content $out
Write-Host ("Saved: " + $out)
