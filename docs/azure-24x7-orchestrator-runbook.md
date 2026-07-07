# Azure 24x7 Orchestrator Runbook

This deploys the independent orchestrator as an always-on Azure Container App.

## Why this is 24/7

- Container App runs with `minReplicas=1` (never scales to zero).
- Platform restarts unhealthy containers automatically.
- `/health` endpoint is exposed for external uptime checks.

## Deploy

From repo root:

```powershell
./scripts/deploy-orchestrator-aca.ps1 `
  -SubscriptionId "acc2e070-e40f-45c3-86db-72e051ce7947" `
  -ResourceGroup "cloud-shell-storage-westeurope" `
  -Location "westeurope" `
  -ContainerAppName "yta-orchestrator" `
  -ContainerEnvName "yta-orchestrator-env" `
  -AcrName "ytaorch7430acr" `
  -AzureAiProjectEndpoint "https://anasalsawy-7430-resource.services.ai.azure.com/api/projects/anasalsawy-7430"
```

## Identity and Foundry access

The deploy script enables system-assigned managed identity for the app.

After deploy, assign role to that principal:

```powershell
$scope = "/subscriptions/acc2e070-e40f-45c3-86db-72e051ce7947/resourceGroups/cloud-shell-storage-westeurope/providers/Microsoft.CognitiveServices/accounts/anasalsawy-7430-resource"

$principalId = az containerapp show `
  -n yta-orchestrator `
  -g cloud-shell-storage-westeurope `
  --query identity.principalId -o tsv

az role assignment create `
  --assignee-object-id $principalId `
  --assignee-principal-type ServicePrincipal `
  --role "Azure AI Developer" `
  --scope $scope
```

## Verify

```powershell
az containerapp show -n yta-orchestrator -g cloud-shell-storage-westeurope --query "properties.template.scale.minReplicas" -o tsv
# expected: 1
```

```powershell
$fqdn = az containerapp show -n yta-orchestrator -g cloud-shell-storage-westeurope --query "properties.configuration.ingress.fqdn" -o tsv
Invoke-WebRequest "https://$fqdn/health"
```

## Bridge from Supabase

Set these secrets in your Supabase project and redeploy `war-room`:

- `ORCHESTRATOR_BASE_URL=https://<fqdn>`
- `ORCHESTRATOR_SHARED_SECRET=<long-random>`

Then make `war-room` forward `post/tick` to the orchestrator service.
