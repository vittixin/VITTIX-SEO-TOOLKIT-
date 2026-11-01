param([string]$OutputDirectory = (Join-Path (Get-Location) 'test-results/local-server'))
$rsa = [System.Security.Cryptography.RSA]::Create(2048)
$request = [System.Security.Cryptography.X509Certificates.CertificateRequest]::new(
  'CN=fixture.test',
  $rsa,
  [System.Security.Cryptography.HashAlgorithmName]::SHA256,
  [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
)
$san = [System.Security.Cryptography.X509Certificates.SubjectAlternativeNameBuilder]::new()
$san.AddDnsName('fixture.test')
$request.CertificateExtensions.Add($san.Build())
$certificate = $request.CreateSelfSigned([datetimeoffset]::Now.AddMinutes(-1), [datetimeoffset]::Now.AddDays(1))
$output = $OutputDirectory
New-Item -ItemType Directory -Force -Path $output | Out-Null
[System.IO.File]::WriteAllBytes((Join-Path $output 'cert.pfx'), $certificate.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, 'local-test-only'))
