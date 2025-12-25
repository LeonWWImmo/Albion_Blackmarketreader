$ErrorActionPreference = "Stop"

# Temp ItemList nur mit 2 Items
$items = @("2H_BOW","2H_CLAYMORE")
$tmp = [System.IO.Path]::GetFullPath("Data\ItemList.tmp.json")
$items | ConvertTo-Json | Out-File -Encoding utf8 $tmp

try {
  dotnet run -- --item-list "$tmp" --bm-days 14
}
finally {
  Remove-Item $tmp -ErrorAction SilentlyContinue
}
