param([Parameter(Mandatory=$true)][string]$Config)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NotepadAcceptanceNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr window,int command);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr window);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window,out uint processId);
  [DllImport("user32.dll")] public static extern uint SendInput(uint count,INPUT[] inputs,int size);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion union; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort key,scan; public uint flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint data,flags,time; public UIntPtr extra; }
  public static bool ControlKey(ushort key) {
    INPUT[] inputs=new INPUT[4];
    inputs[0].type=1;inputs[0].union.keyboard.key=0x11;
    inputs[1].type=1;inputs[1].union.keyboard.key=key;
    inputs[2].type=1;inputs[2].union.keyboard.key=key;inputs[2].union.keyboard.flags=2;
    inputs[3].type=1;inputs[3].union.keyboard.key=0x11;inputs[3].union.keyboard.flags=2;
    return SendInput(4,inputs,Marshal.SizeOf(typeof(INPUT)))==4;
  }
}
'@
$configuration=[System.IO.File]::ReadAllText($Config)|ConvertFrom-Json
# Text selection uses the consumer's UIA provider, never WM_SETTEXT/ValuePattern
# writes or a second paste path. Microsoft API contracts:
# https://learn.microsoft.com/en-us/dotnet/api/system.windows.automation.textpattern.getselection
# https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/find-and-highlight-text-using-ui-automation
$script:status=@{status='starting';lastSerial='';commandError=''}
$script:root=$null;$script:editor=$null;$script:textPattern=$null;$script:valuePattern=$null;$script:suffix='';$script:handle=[IntPtr]::Zero;$script:owner=0;$script:runtime='';$script:ownerStarted=$null
function Write-State {
  $temporary=$configuration.output+'.tmp'
  [System.IO.File]::WriteAllText($temporary,($script:status|ConvertTo-Json -Compress -Depth 5))
  [System.IO.File]::Copy($temporary,$configuration.output,$true)
}
function Owned-Document {
  if ($null -eq $script:root -or -not [NotepadAcceptanceNative]::IsWindow($script:handle)) { throw 'The owned Notepad document closed.' }
  [uint32]$ownerNow=0;[void][NotepadAcceptanceNative]::GetWindowThreadProcessId($script:handle,[ref]$ownerNow)
  if ($ownerNow -ne $script:owner) { throw 'Notepad window ownership changed.' }
  $process=Get-Process -Id $ownerNow -ErrorAction Stop
  if ($process.ProcessName -ine 'notepad' -or $process.StartTime.ToUniversalTime().Ticks -ne $script:ownerStarted) { throw 'Notepad process identity changed.' }
  if ($script:root.Current.Name.IndexOf([string]$configuration.token,[StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Notepad changed away from the owned document; no other document was read.' }
  if ([string]::Join('.',$script:editor.GetRuntimeId()) -ne $script:runtime) { throw 'The owned Notepad editor changed.' }
}
function Raw-DocumentText {
  if ($null -ne $script:valuePattern) { return [string]$script:valuePattern.Current.Value }
  return [string]$script:textPattern.DocumentRange.GetText(-1)
}
function Document-Text {
  Owned-Document
  $value=Raw-DocumentText
  if ($script:suffix -and $value.EndsWith($script:suffix,[StringComparison]::Ordinal)) { return $value.Substring(0,$value.Length-$script:suffix.Length) }
  return $value
}
function Focus-Document([bool]$Select) {
  Owned-Document
  [void][NotepadAcceptanceNative]::ShowWindow($script:handle,9)
  [void][NotepadAcceptanceNative]::SetForegroundWindow($script:handle)
  $script:editor.SetFocus()
  if ($Select) { $script:textPattern.DocumentRange.Select() }
  $deadline=[DateTime]::UtcNow.AddSeconds(3)
  do {
    Start-Sleep -Milliseconds 60
    $focused=[System.Windows.Automation.AutomationElement]::FocusedElement
    if ([NotepadAcceptanceNative]::GetForegroundWindow() -eq $script:handle -and $null -ne $focused -and [string]::Join('.',$focused.GetRuntimeId()) -eq $script:runtime) { return }
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Windows did not focus the exact owned Notepad editor.'
}
function Observe-Document {
  $script:status.text=Document-Text
  $script:status.foreground=[NotepadAcceptanceNative]::GetForegroundWindow() -eq $script:handle
  $focused=[System.Windows.Automation.AutomationElement]::FocusedElement
  $script:status.editorFocused=$null -ne $focused -and [string]::Join('.',$focused.GetRuntimeId()) -eq $script:runtime
  $selection=@($script:textPattern.GetSelection())
  $selected=if ($selection.Count -eq 1) {[string]$selection[0].GetText(-1)} else {''}
  if ($script:suffix -and $selected.EndsWith($script:suffix,[StringComparison]::Ordinal)) { $selected=$selected.Substring(0,$selected.Length-$script:suffix.Length) }
  $script:status.selectedText=$selected
}
try {
  $candidates=@((Join-Path $env:SystemRoot 'System32\notepad.exe'),(Join-Path $env:SystemRoot 'notepad.exe'))
  $executable=$candidates|Where-Object {[System.IO.File]::Exists($_)}|Select-Object -First 1
  if (-not $executable) {
    $script:status.status='unavailable';$script:status.reason='No installed Windows Notepad executable was found in the Windows system directories.';Write-State;exit 0
  }
  try { $launcher=Start-Process -FilePath $executable -ArgumentList ('"'+[string]$configuration.document+'"') -PassThru }
  catch { $script:status.status='unavailable';$script:status.reason='Windows Notepad could not be launched: '+$_.Exception.Message;Write-State;exit 0 }
  $deadline=[DateTime]::UtcNow.AddSeconds(25)
  do {
    $windows=[System.Windows.Automation.AutomationElement]::RootElement.FindAll([System.Windows.Automation.TreeScope]::Children,[System.Windows.Automation.Condition]::TrueCondition)
    foreach ($window in $windows) {
      try {
        if ($window.Current.Name.IndexOf([string]$configuration.token,[StringComparison]::OrdinalIgnoreCase) -lt 0) { continue }
        $process=Get-Process -Id $window.Current.ProcessId -ErrorAction Stop
        if ($process.ProcessName -ine 'notepad') { continue }
        # The unique active filename scopes every content read to our fixture.
        $types=[System.Windows.Automation.OrCondition]::new(
          [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Document),
          [System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::Edit))
        $editors=$window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$types)
        foreach ($candidate in $editors) {
          if ($candidate.Current.IsOffscreen -or -not $candidate.Current.IsEnabled -or $candidate.Current.IsPassword) { continue }
          $text=$null;if (-not $candidate.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$text)) { continue }
          $value=$null;[void]$candidate.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$value)
          $raw=if ($null -ne $value) {[string]$value.Current.Value} else {[string]$text.DocumentRange.GetText(-1)}
          $suffix=$null
          foreach ($terminator in @('',"`r","`r`n","`n")) { if ($raw -ceq ([string]$configuration.seed+$terminator)) {$suffix=$terminator;break} }
          if ($null -eq $suffix) { continue }
          $script:root=$window;$script:editor=$candidate;$script:textPattern=$text;$script:valuePattern=$value;$script:suffix=$suffix
          $script:handle=[IntPtr]$window.Current.NativeWindowHandle;$script:owner=$process.Id;$script:ownerStarted=$process.StartTime.ToUniversalTime().Ticks;$script:runtime=[string]::Join('.',$candidate.GetRuntimeId())
          $version='';try {$version=[string]$process.MainModule.FileVersionInfo.FileVersion} catch {}
          $script:status=@{status='ready';lastSerial='';commandError='';handle=$script:handle.ToInt64().ToString();processId=$script:owner;runtime=$script:runtime;version=$version;processHandoff=$process.Id -ne $launcher.Id;providerTerminator=$suffix.Replace("`r",'CR').Replace("`n",'LF')}
          break
        }
      } catch { }
      if ($null -ne $script:editor) { break }
    }
    if ($null -eq $script:editor) { Start-Sleep -Milliseconds 150 }
  } while ($null -eq $script:editor -and [DateTime]::UtcNow -lt $deadline)
  if ($null -eq $script:editor) {
    if (@(Get-Process -Name notepad -ErrorAction SilentlyContinue).Count -eq 0) {
      $script:status.status='unavailable';$script:status.reason='A Windows Notepad launcher exists, but it did not start a Notepad process. The Windows feature or Store application may be absent.';Write-State;exit 0
    }
    throw 'Installed Notepad did not expose the exact synthetic document through UI Automation within 25 seconds.'
  }
  Focus-Document $true;Observe-Document;Write-State
  $keepRunning=$true
  while ($keepRunning) {
    if ([System.IO.File]::Exists($configuration.commands)) {
      $command=[System.IO.File]::ReadAllText($configuration.commands)|ConvertFrom-Json
      if ($command.serial -and $command.serial -ne $script:status.lastSerial) {
        $script:status.lastSerial=[string]$command.serial;$script:status.commandError=''
        try {
          if ($command.action -eq 'focus') { Focus-Document $true }
          elseif ($command.action -eq 'save') {
            Focus-Document $false
            if (-not [NotepadAcceptanceNative]::ControlKey(0x53)) { throw 'Windows rejected the fixture save key.' }
            Start-Sleep -Milliseconds 250
          } elseif ($command.action -eq 'close') {
            Focus-Document $false
            if (-not [NotepadAcceptanceNative]::ControlKey(0x53)) { throw 'Windows rejected the fixture save key.' }
            Start-Sleep -Milliseconds 250
            Owned-Document
            $tabs=$script:root.FindAll([System.Windows.Automation.TreeScope]::Descendants,[System.Windows.Automation.PropertyCondition]::new([System.Windows.Automation.AutomationElement]::ControlTypeProperty,[System.Windows.Automation.ControlType]::TabItem))
            if ($tabs.Count -gt 0) {
              # A Store Notepad process/window can own unrelated tabs. CtrlW
              # closes only the active, title-verified synthetic document.
              if (-not [NotepadAcceptanceNative]::ControlKey(0x57)) { throw 'Windows rejected closing the owned Notepad tab.' }
            } else {
              $windowPattern=$null
              if (-not $script:root.TryGetCurrentPattern([System.Windows.Automation.WindowPattern]::Pattern,[ref]$windowPattern)) { throw 'The owned Notepad window cannot be closed safely.' }
              $windowPattern.Close()
            }
            $closedDeadline=[DateTime]::UtcNow.AddSeconds(5)
            do {
              Start-Sleep -Milliseconds 100
              $stillOwned=$false
              try {$stillOwned=[NotepadAcceptanceNative]::IsWindow($script:handle) -and $script:root.Current.Name.IndexOf([string]$configuration.token,[StringComparison]::OrdinalIgnoreCase) -ge 0} catch {}
            } while ($stillOwned -and [DateTime]::UtcNow -lt $closedDeadline)
            $script:status.documentClosed=-not $stillOwned;$script:status.status='closed';$keepRunning=$false
          } else { throw 'Unknown Notepad fixture action.' }
        } catch { $script:status.commandError=$_.Exception.Message }
      }
    }
    if ($keepRunning) { Observe-Document }
    Write-State
    Start-Sleep -Milliseconds 100
  }
} catch {
  $script:status.status='failed';$script:status.reason=$_.Exception.Message
  try { Write-State } catch {}
  exit 1
}
