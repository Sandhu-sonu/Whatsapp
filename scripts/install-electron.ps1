$url = "https://npmmirror.com/mirrors/electron/v31.7.7/electron-v31.7.7-win32-x64.zip"
$zip = "d:\whatsapp\electron.zip"
$dest = "d:\whatsapp\node_modules\electron\dist"

Write-Host "Downloading Electron v31.7.7 from mirror..."
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Write-Host "Extracting Electron to $dest..."
if (Test-Path $dest) {
    Remove-Item -Recurse -Force $dest
}
New-Item -ItemType Directory -Force -Path $dest | Out-Null
Expand-Archive -Path $zip -DestinationPath $dest -Force

Write-Host "Cleaning up temporary files..."
Remove-Item -Force $zip

Write-Host "Electron binary installed successfully!"
