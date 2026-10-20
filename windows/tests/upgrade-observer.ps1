param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
$configuration=[System.IO.File]::ReadAllText($Config)|ConvertFrom-Json
$state=@{status='starting';sourceProcessId=$configuration.sourceProcessId;installer=$configuration.installer}
function Write-State {
  $temporary=$configuration.output+'.tmp'
  [System.IO.File]::WriteAllText($temporary,($state|ConvertTo-Json -Compress -Depth 5))
  [System.IO.File]::Copy($temporary,$configuration.output,$true)
}
$process=$null
try {
  if ($configuration.sourceProcessId -le 0 -or -not [System.IO.Path]::IsPathRooted([string]$configuration.installer)) { throw 'Invalid owned installer observer configuration.' }
  $state.status='waiting';Write-State
  $waitMilliseconds=45000
  if ($null -ne $configuration.awaitInstallerMilliseconds) {
    if ($configuration.awaitInstallerMilliseconds -lt 1000 -or $configuration.awaitInstallerMilliseconds -gt 300000) { throw 'Invalid bounded installer observation deadline.' }
    $waitMilliseconds=[int]$configuration.awaitInstallerMilliseconds
  }
  $deadline=[DateTime]::UtcNow.AddMilliseconds($waitMilliseconds)
  $row=$null
  do {
    $row=Get-CimInstance Win32_Process -Filter ('ParentProcessId='+[int]$configuration.sourceProcessId)|Where-Object {$_.ExecutablePath -eq [string]$configuration.installer}|Select-Object -First 1
    if ($null -eq $row) { Start-Sleep -Milliseconds 100 }
  } while ($null -eq $row -and [DateTime]::UtcNow -lt $deadline)
  if ($null -eq $row) { throw 'No exact installer child of the candidate process was observed.' }
  $state.processId=[int]$row.ProcessId;$state.commandLine=[string]$row.CommandLine;$state.executablePath=[string]$row.ExecutablePath;$state.createdAt=[DateTime]::UtcNow.ToString('o');$state.status='running';Write-State
  $process=Get-Process -Id $row.ProcessId -ErrorAction Stop
  # .NET Framework's ExitCode requires a retained process handle; WaitForExit
  # alone uses a temporary handle. Direct getters propagate failures instead
  # of PowerShell's property adapter silently returning null.
  # https://github.com/microsoft/referencesource/blob/main/System/services/monitoring/system/diagnosticts/Process.cs
  $processHandle=$process.get_Handle()
  if ($null -eq $processHandle -or $processHandle -eq [System.IntPtr]::Zero) { throw 'The exact installer process handle could not be retained.' }
  $state.handleRetained=$true
  $state.hasExited=$process.WaitForExit(180000)
  if ($state.hasExited) {
    $exitCode=$process.get_ExitCode()
    if ($null -eq $exitCode) { throw 'The exited installer did not provide a native exit code.' }
    $state.exitCode=[int]$exitCode;$state.status='exited'
  } else { $state.status='still-running' }
} catch { $state.status='failed';$state.error=$_.Exception.Message }
finally { if ($null -ne $process) { $process.Dispose() } }
Write-State
