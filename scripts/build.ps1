# Save current directory
$originalLocation = Get-Location

# Set up paths
$rootPath = (Resolve-Path "$PSScriptRoot/..").Path
$backendPath = Join-Path $rootPath "backend"
$binPath = Join-Path $rootPath "bin"

# Run build
Set-Location $rootPath

pnpm build

# Read name and version from Cargo.toml
$cargoTomlPath = Join-Path $backendPath "Cargo.toml"
$nameLine = Select-String -Path $cargoTomlPath -Pattern '^\s*name\s*=\s*".+"'
$versionLine = Select-String -Path $cargoTomlPath -Pattern '^\s*version\s*=\s*".+"'

if ($nameLine -match '"([^"]+)"') {
    $appName = $Matches[1]
}
else {
    Write-Error "Package name not found in Cargo.toml"
    exit 1
}

if ($versionLine -match '"([^"]+)"') {
    $version = $Matches[1]
}
else {
    Write-Error "Version not found in Cargo.toml"
    exit 1
}

# Paths
$installer = Join-Path $backendPath "target/release/bundle/nsis/${appName}_${version}_x64-setup.exe"
$compiledBinary = Join-Path $backendPath "target/release/$appName.exe"
$portableBinary = Join-Path $binPath "${appName}_$version.exe"

# Ensure output directories
New-Item -ItemType Directory -Force -Path $binPath | Out-Null

# Copy compiled binary
Copy-Item -Force -Path $compiledBinary -Destination $portableBinary 

# Copy installer if it exists
if (Test-Path $installer) {
    Copy-Item -Force -Path $installer -Destination $binPath
}
else {
    Write-Warning "Installer not found: $installer"
}

Set-Location $originalLocation
Write-Host "Build complete: Portable binary and NSIS installer copied to $binPath"
Get-ChildItem $binPath