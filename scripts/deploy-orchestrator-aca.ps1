param(
  [Parameter(Mandatory = $true)][string]$SubscriptionId,
  [Parameter(Mandatory = $true)][string]$ResourceGroup,
  [string]$Location = "westeurope",
  [string]$ContainerAppName = "yta-orchestrator",
  [string]$ContainerEnvName = "yta-orchestrator-env",
  [string]$AcrName = "",
  [string]$ImageTag = "",
  [Parameter(Mandatory = $true)][string]$AzureAiProjectEndpoint,
  [string]$AzureTenantId = "",
  [string]$AzureClientId = "",
  [string]$AzureClientSecret = "",
  [string]$AzureFoundryRunPath = "/threads/runs",
  [string]$Cpu = "1.0",
  [string]$Memory = "2.0Gi"
)

$ErrorActionPreference = "Stop"

function Require-Command([string]$name) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $name"
  }
}

Require-Command "az"

Write-Host "Selecting subscription $SubscriptionId..."
az account set --subscription $SubscriptionId | Out-Null

Write-Host "Ensuring resource group $ResourceGroup..."
az group create --name $ResourceGroup --location $Location | Out-Null

if ([string]::IsNullOrWhiteSpace($AcrName)) {
  $AcrName = ("yta" + ($SubscriptionId -replace "-", "").Substring(0, 8) + "acr").ToLower()
}

if ([string]::IsNullOrWhiteSpace($ImageTag)) {
  $ImageTag = (Get-Date -Format "yyyyMMddHHmmss")
}

$repo = "yta-orchestrator"
$image = "${AcrName}.azurecr.io/${repo}:${ImageTag}"

Write-Host "Ensuring ACR $AcrName..."
az acr show --name $AcrName --resource-group $ResourceGroup 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  az acr create --name $AcrName --resource-group $ResourceGroup --sku Basic --admin-enabled true | Out-Null
}

Write-Host "Building container image $image ..."
az acr build --registry $AcrName --image "${repo}:${ImageTag}" --file orchestration/Dockerfile orchestration | Out-Null

Write-Host "Ensuring Container Apps environment $ContainerEnvName..."
az containerapp env show --name $ContainerEnvName --resource-group $ResourceGroup 1>$null 2>$null
if ($LASTEXITCODE -ne 0) {
  az containerapp env create --name $ContainerEnvName --resource-group $ResourceGroup --location $Location | Out-Null
}

Write-Host "Ensuring Container App $ContainerAppName with minReplicas=1..."
az containerapp show --name $ContainerAppName --resource-group $ResourceGroup 1>$null 2>$null
$exists = ($LASTEXITCODE -eq 0)

if (-not $exists) {
  $createArgs = @(
    "containerapp", "create",
    "--name", $ContainerAppName,
    "--resource-group", $ResourceGroup,
    "--environment", $ContainerEnvName,
    "--image", $image,
    "--target-port", "8790",
    "--ingress", "external",
    "--min-replicas", "1",
    "--max-replicas", "3",
    "--cpu", $Cpu,
    "--memory", $Memory,
    "--registry-server", "$AcrName.azurecr.io",
    "--env-vars", "PORT=8790", "AZURE_AI_PROJECT_ENDPOINT=$AzureAiProjectEndpoint", "AZURE_FOUNDRY_RUN_PATH=$AzureFoundryRunPath",
    "--system-assigned"
  )
  if ($AzureTenantId -and $AzureClientId -and $AzureClientSecret) {
    $createArgs += @("--env-vars", "AZURE_TENANT_ID=$AzureTenantId", "AZURE_CLIENT_ID=$AzureClientId")
    $createArgs += @("--secrets", "AZURE_CLIENT_SECRET=$AzureClientSecret")
    $createArgs += @("--secret-env-vars", "AZURE_CLIENT_SECRET=AZURE_CLIENT_SECRET")
  }
  & az @createArgs | Out-Null
} else {
  az containerapp update `
    --name $ContainerAppName `
    --resource-group $ResourceGroup `
    --image $image `
    --min-replicas 1 `
    --max-replicas 3 `
    --set-env-vars `
      "PORT=8790" `
      "AZURE_AI_PROJECT_ENDPOINT=$AzureAiProjectEndpoint" `
      "AZURE_FOUNDRY_RUN_PATH=$AzureFoundryRunPath" | Out-Null

  if ($AzureTenantId -and $AzureClientId -and $AzureClientSecret) {
    az containerapp update `
      --name $ContainerAppName `
      --resource-group $ResourceGroup `
      --set-env-vars `
        "AZURE_TENANT_ID=$AzureTenantId" `
        "AZURE_CLIENT_ID=$AzureClientId" | Out-Null

    az containerapp secret set `
      --name $ContainerAppName `
      --resource-group $ResourceGroup `
      --secrets "AZURE_CLIENT_SECRET=$AzureClientSecret" | Out-Null
  }
}

$fqdn = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query properties.configuration.ingress.fqdn -o tsv
$principalId = az containerapp show --name $ContainerAppName --resource-group $ResourceGroup --query identity.principalId -o tsv

Write-Host "Deployed: https://$fqdn"
Write-Host "Health probe URL: https://$fqdn/health"
Write-Host "Container App managed identity principalId: $principalId"
