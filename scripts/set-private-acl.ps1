param(
  [Parameter(Mandatory = $true)]
  [string]$TargetPath,

  [Parameter(Mandatory = $true)]
  [ValidateSet("File", "Directory")]
  [string]$Kind
)

$ErrorActionPreference = "Stop"

$userSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
$systemSid = [System.Security.Principal.SecurityIdentifier]::new("S-1-5-18")
$rights = [System.Security.AccessControl.FileSystemRights]::FullControl
$allow = [System.Security.AccessControl.AccessControlType]::Allow

if ($Kind -eq "Directory") {
  $security = [System.Security.AccessControl.DirectorySecurity]::new()
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $propagation = [System.Security.AccessControl.PropagationFlags]::None
} else {
  $security = [System.Security.AccessControl.FileSecurity]::new()
  $inheritance = [System.Security.AccessControl.InheritanceFlags]::None
  $propagation = [System.Security.AccessControl.PropagationFlags]::None
}

$security.SetOwner($userSid)
$security.SetAccessRuleProtection($true, $false)
$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
  $userSid,
  $rights,
  $inheritance,
  $propagation,
  $allow
))
$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
  $systemSid,
  $rights,
  $inheritance,
  $propagation,
  $allow
))

if ($Kind -eq "Directory") {
  [System.IO.Directory]::SetAccessControl($TargetPath, $security)
  $applied = [System.IO.Directory]::GetAccessControl($TargetPath)
} else {
  [System.IO.File]::SetAccessControl($TargetPath, $security)
  $applied = [System.IO.File]::GetAccessControl($TargetPath)
}

if (-not $applied.AreAccessRulesProtected) {
  throw "ACL inheritance is still enabled"
}

$allowedSids = @($userSid.Value, $systemSid.Value)
$rules = $applied.GetAccessRules(
  $true,
  $true,
  [System.Security.Principal.SecurityIdentifier]
)
foreach ($rule in $rules) {
  if (
    $rule.AccessControlType -eq $allow -and
    $allowedSids -notcontains $rule.IdentityReference.Value
  ) {
    throw "unexpected allow ACL entry: $($rule.IdentityReference.Value)"
  }
}
