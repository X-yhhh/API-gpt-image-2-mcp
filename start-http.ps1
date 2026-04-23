param(
  [string]$BindHost = "127.0.0.1",
  [int]$Port = 3000,
  [string]$Endpoint = "/mcp"
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $scriptDir "server.mjs"

node $serverPath --transport http --host $BindHost --port $Port --endpoint $Endpoint
