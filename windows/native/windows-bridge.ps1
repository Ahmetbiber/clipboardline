param([ValidateSet('Capture','Restore','PreparePaste','Paste','Monitor','CopyImages')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class ClipBoardLineNative {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int command);
  [DllImport("user32.dll")] public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion union; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort key; public ushort scan; public uint flags; public uint time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint data,flags,time; public UIntPtr extra; }
  public static bool Paste() {
    INPUT[] events = new INPUT[4];
    events[0].type = 1; events[0].union.keyboard.key = 0x11;
    events[1].type = 1; events[1].union.keyboard.key = 0x56;
    events[2].type = 1; events[2].union.keyboard.key = 0x56; events[2].union.keyboard.flags = 2;
    events[3].type = 1; events[3].union.keyboard.key = 0x11; events[3].union.keyboard.flags = 2;
    return SendInput(4, events, Marshal.SizeOf(typeof(INPUT))) == 4;
  }
}
'@
function FocusInfo {
  $window = [ClipBoardLineNative]::GetForegroundWindow()
  [uint32]$owner = 0
  [void][ClipBoardLineNative]::GetWindowThreadProcessId($window, [ref]$owner)
  $element = [System.Windows.Automation.AutomationElement]::FocusedElement
  $editable = $false; $secure = $false; $runtime = ''
  if ($null -ne $element) {
    $current = $element.Current
    $secure = $current.IsPassword
    $runtime = [string]::Join('.', $element.GetRuntimeId())
    $value = $null
    if ($current.IsEnabled -and -not $secure -and $current.ProcessId -eq $owner -and $runtime) {
      if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$value)) { $editable = -not $value.Current.IsReadOnly }
      else {
        $textPattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$textPattern)) {
          $readOnly = $textPattern.DocumentRange.GetAttributeValue([System.Windows.Automation.TextPattern]::IsReadOnlyAttribute)
          if ($readOnly -is [bool]) { $editable = -not $readOnly }
        }
      }
    }
  }
  return @{handle=$window.ToInt64().ToString();processId=$owner;runtime=$runtime;editable=$editable;secure=$secure}
}
function HeldShortcutKeys { @(0x11,0x12,0x10,0x0D,0x5B,0x5C) | Where-Object { [ClipBoardLineNative]::GetAsyncKeyState($_) -lt 0 } }
try {
  if ($Mode -notin @('CopyImages','Monitor')) {
    # PowerShell's dynamic caller can prevent UIA's one-time default proxy load.
    # Register Microsoft's strongly named Win32 providers before reading UIA.
    # https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/register-a-client-side-provider-assembly
    $proxies=[System.Reflection.Assembly]::Load('UIAutomationClientsideProviders, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35')
    [System.Windows.Automation.ClientSettings]::RegisterClientSideProviderAssembly($proxies.GetName())
  }
  if ($Mode -eq 'CopyImages') {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $payload = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($payload.files.Count -lt 1 -or $payload.files.Count -gt 1000) { throw 'Invalid image batch.' }
    foreach ($file in $payload.files) { if (-not [System.IO.File]::Exists($file) -or [System.IO.Path]::GetExtension($file) -ne '.png') { throw 'Managed image is unavailable.' } }
    $data = New-Object System.Windows.Forms.DataObject
    $data.SetData([System.Windows.Forms.DataFormats]::FileDrop, [string[]]$payload.files)
    $bitmap = [System.Drawing.Image]::FromFile($payload.files[0])
    try {
      $data.SetImage($bitmap)
      if ($payload.text) { $data.SetText([string]$payload.text) }
      $markerStream = [System.IO.MemoryStream]::new([Convert]::FromBase64String($payload.marker))
      $data.SetData('ClipBoardLine.Internal.v1', $markerStream)
      [System.Windows.Forms.Clipboard]::SetDataObject($data,$true,5,100)
    } finally { $bitmap.Dispose() }
    @{ok=$true} | ConvertTo-Json -Compress
  } elseif ($Mode -eq 'Monitor') {
    $last = [uint32]0
    while ($true) {
      $sequence = [ClipBoardLineNative]::GetClipboardSequenceNumber()
      if ($sequence -ne $last) { @{sequence=$sequence} | ConvertTo-Json -Compress; $last=$sequence }
      Start-Sleep -Milliseconds 250
    }
  } elseif ($Mode -eq 'Capture') {
    FocusInfo | ConvertTo-Json -Compress
  } else {
    $phase=@{started=[DateTime]::UtcNow.ToString('o')}
    $expected = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($expected.handle -notmatch '^\d+$' -or $expected.processId -le 0) { throw 'No previous application was captured.' }
    $window = [IntPtr][Int64]::Parse($expected.handle)
    [uint32]$owner = 0
    [void][ClipBoardLineNative]::GetWindowThreadProcessId($window,[ref]$owner)
    if (-not [ClipBoardLineNative]::IsWindow($window) -or $owner -ne $expected.processId) { throw 'The previous application has closed.' }
    [uint32]$frontOwner = 0
    [void][ClipBoardLineNative]::GetWindowThreadProcessId([ClipBoardLineNative]::GetForegroundWindow(),[ref]$frontOwner)
    if ($frontOwner -ne $expected.processId -and $frontOwner -ne $expected.sourceProcessId) { throw 'Another application became active. Reopen the shelves from the intended field.' }
    if ($Mode -ne 'Restore' -and -not $expected.prepared) {
      # Keep the source focused until the invoking shortcut is fully released.
      # A held Enter must never start repeating inside the destination app.
      $releaseDeadline=[DateTime]::UtcNow.AddSeconds(2)
      $releasedSince=$null
      do {
        [uint32]$releaseOwner=0
        [void][ClipBoardLineNative]::GetWindowThreadProcessId([ClipBoardLineNative]::GetForegroundWindow(),[ref]$releaseOwner)
        if ($releaseOwner -ne $expected.processId -and $releaseOwner -ne $expected.sourceProcessId) { throw 'Another application became active while the shortcut was held.' }
        $held=@(HeldShortcutKeys)
        if ($held.Count -eq 0) {
          if ($null -eq $releasedSince) { $releasedSince=[DateTime]::UtcNow }
          # Async key state changes before queued key messages are consumed.
          # Keep the source focused through a continuous release interval.
          if (([DateTime]::UtcNow-$releasedSince).TotalMilliseconds -ge 150) { break }
        } else { $releasedSince=$null }
        Start-Sleep -Milliseconds 30
      } while ([DateTime]::UtcNow -lt $releaseDeadline)
      if ($held.Count -gt 0 -or $null -eq $releasedSince -or ([DateTime]::UtcNow-$releasedSince).TotalMilliseconds -lt 150) { throw 'Release the shortcut keys, then try paste again.' }
      $phase.released=[DateTime]::UtcNow.ToString('o')
    }
    if ($Mode -eq 'Paste' -and $expected.prepared) {
      if ([ClipBoardLineNative]::GetForegroundWindow() -ne $window) { throw 'Focus changed before paste. No keys were sent.' }
    } else {
      [void][ClipBoardLineNative]::ShowWindow($window,9)
      [void][ClipBoardLineNative]::SetForegroundWindow($window)
    }
    $phase.activationRequested=[DateTime]::UtcNow.ToString('o')
    $deadline = [DateTime]::UtcNow.AddSeconds(2)
    $stable = 0
    do {
      Start-Sleep -Milliseconds 30
      $held = @(HeldShortcutKeys)
      if ([ClipBoardLineNative]::GetForegroundWindow() -ne $window) {
        [uint32]$currentOwner = 0
        [void][ClipBoardLineNative]::GetWindowThreadProcessId([ClipBoardLineNative]::GetForegroundWindow(),[ref]$currentOwner)
        if ($currentOwner -ne $expected.sourceProcessId) { throw 'Focus changed before paste. No keys were sent.' }
        $stable = 0
      } elseif ($Mode -eq 'Restore') { if ($held.Count -eq 0) { break } }
      else {
        $actual = FocusInfo
        if ($actual.secure -or ($actual.editable -and $actual.runtime -ne $expected.runtime)) { throw 'Focus changed. Select an editable field and reopen the shelves.' }
        if ($held.Count -eq 0 -and $expected.editable -and -not $expected.secure -and $actual.editable -and $actual.runtime -eq $expected.runtime) { $stable++ } else { $stable=0 }
      }
    } while ($stable -lt 2 -and [DateTime]::UtcNow -lt $deadline)
    if ([ClipBoardLineNative]::GetForegroundWindow() -ne $window -or $held.Count -gt 0) { throw 'Windows did not restore the intended field after the shortcut was released.' }
    if ($Mode -ne 'Restore' -and $stable -lt 2) { throw 'Focus changed. Select an editable field and reopen the shelves.' }
    $phase.targetStable=[DateTime]::UtcNow.ToString('o')
    if ($Mode -eq 'Paste') {
      $final=FocusInfo
      if (-not $final.editable -or $final.secure -or $final.processId -ne $expected.processId -or $final.runtime -ne $expected.runtime) { throw 'Focus changed immediately before paste. No keys were sent.' }
      if (-not [ClipBoardLineNative]::Paste()) { throw 'Windows blocked keyboard input. Elevated applications may require manual paste.' }
      $phase.inputSent=[DateTime]::UtcNow.ToString('o')
    }
    @{ok=$true;mode=$Mode;phase=$phase} | ConvertTo-Json -Compress
  }
} catch { @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
