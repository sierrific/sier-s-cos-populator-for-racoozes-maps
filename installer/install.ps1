[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$FoundryUserData,

    [Parameter(Mandatory = $true)]
    [string]$PackagePath,

    [switch]$Force
)

$ErrorActionPreference = "Stop"
$moduleId = "racooze-cos-populator"
$resolvedData = (Resolve-Path -LiteralPath $FoundryUserData).Path
$resolvedPackage = (Resolve-Path -LiteralPath $PackagePath).Path
$modulesDirectory = Join-Path $resolvedData "Data\modules"
$target = Join-Path $modulesDirectory $moduleId
$backup = $null

if ([IO.Path]::GetExtension($resolvedPackage) -ne ".zip") {
    throw "PackagePath must point to a release ZIP."
}

$checksumFile = "$resolvedPackage.sha256"
if (Test-Path -LiteralPath $checksumFile) {
    $expectedHash = ((Get-Content -Raw -LiteralPath $checksumFile).Trim() -split "\s+")[0]
    if ($expectedHash -notmatch "^[a-fA-F0-9]{64}$") {
        throw "The checksum file is malformed: $checksumFile"
    }
    $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $resolvedPackage).Hash
    if ($actualHash -ne $expectedHash) {
        throw "The release ZIP failed SHA-256 verification."
    }
    Write-Host "Verified SHA-256 checksum."
} else {
    Write-Warning "No sibling .sha256 file was found; package integrity was not verified."
}

New-Item -ItemType Directory -Force -Path $modulesDirectory | Out-Null

if ((Test-Path -LiteralPath $target) -and -not $Force) {
    throw "The module is already installed. Re-run with -Force to preserve it as a backup and install this package."
}

$stagingRoot = Join-Path ([IO.Path]::GetTempPath()) "$moduleId-$([Guid]::NewGuid().ToString('N'))"
New-Item -ItemType Directory -Path $stagingRoot | Out-Null

try {
    if (Test-Path -LiteralPath $target) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backup = Join-Path $modulesDirectory "$moduleId.backup-$stamp"
        Move-Item -LiteralPath $target -Destination $backup
        Write-Host "Existing module moved to $backup"
    }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($resolvedPackage)
    try {
        $stagingPrefix = [IO.Path]::GetFullPath($stagingRoot + [IO.Path]::DirectorySeparatorChar)
        foreach ($entry in $archive.Entries) {
            $entryPath = $entry.FullName.Replace('/', [IO.Path]::DirectorySeparatorChar)
            $destination = [IO.Path]::GetFullPath((Join-Path $stagingRoot $entryPath))
            if ([IO.Path]::IsPathRooted($entry.FullName) -or -not $destination.StartsWith($stagingPrefix, [StringComparison]::OrdinalIgnoreCase)) {
                throw "The ZIP contains an unsafe path: $($entry.FullName)"
            }
            $unixType = (($entry.ExternalAttributes -shr 16) -band 0xF000)
            if ($unixType -eq 0xA000) {
                throw "The ZIP contains a symbolic link, which is not allowed: $($entry.FullName)"
            }
        }
    } finally {
        $archive.Dispose()
    }

    Expand-Archive -LiteralPath $resolvedPackage -DestinationPath $stagingRoot
    $manifest = Join-Path $stagingRoot "module.json"
    if (-not (Test-Path -LiteralPath $manifest)) {
        throw "The ZIP does not contain module.json at its root."
    }

    $metadata = Get-Content -Raw -LiteralPath $manifest | ConvertFrom-Json
    if ($metadata.id -ne $moduleId) {
        throw "Unexpected module id: $($metadata.id)"
    }

    Move-Item -LiteralPath $stagingRoot -Destination $target
    Write-Host "Installed $($metadata.title) $($metadata.version) to $target"
} catch {
    if ($backup -and -not (Test-Path -LiteralPath $target) -and (Test-Path -LiteralPath $backup)) {
        Move-Item -LiteralPath $backup -Destination $target
        Write-Warning "Installation failed. The previous module was restored to $target"
    }
    throw
} finally {
    if (Test-Path -LiteralPath $stagingRoot) {
        Remove-Item -Recurse -Force -LiteralPath $stagingRoot
    }
}
