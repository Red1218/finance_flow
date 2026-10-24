# One-time: creates the release signing key and android/keystore.properties (both ignored by git).
# Back up finance-flow-release.jks and the password: without them the app can't be updated in place.
$ErrorActionPreference = 'Stop'
$dir = $PSScriptRoot
$jks = Join-Path $dir 'finance-flow-release.jks'
if (Test-Path $jks) { throw "$jks already exists - not overwriting it." }

$p1 = Read-Host 'Choose a key password (min 6 chars)' -AsSecureString
$p2 = Read-Host 'Type it again' -AsSecureString
$pw = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p1))
$pw2 = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($p2))
if ($pw -ne $pw2) { throw 'Passwords did not match.' }
if ($pw.Length -lt 6) { throw 'Password must be at least 6 characters.' }

$env:FF_KEY_PW = $pw
keytool -genkeypair -v -keystore $jks -storetype PKCS12 -alias finance-flow -keyalg RSA -keysize 2048 -validity 10000 `
  -dname 'CN=Finance Flow' -storepass:env FF_KEY_PW -keypass:env FF_KEY_PW
$code = $LASTEXITCODE
Remove-Item Env:FF_KEY_PW
if ($code -ne 0) { throw 'keytool failed.' }

# Properties files treat backslash as an escape character.
$esc = $pw.Replace('\', '\\')
@"
storeFile=../finance-flow-release.jks
storePassword=$esc
keyAlias=finance-flow
keyPassword=$esc
"@ | Set-Content -Encoding ascii (Join-Path $dir 'keystore.properties')
Write-Host "`nDone. Back up $jks and your password somewhere safe (Drive / password manager)." -ForegroundColor Green
