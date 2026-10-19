param([ValidateSet('Capture','Restore','Paste','Monitor','CopyImages')][string]$Mode)
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
    if ($current.IsEnabled -and -not $secure) {
      if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$value)) { $editable = -not $value.Current.IsReadOnly }
      elseif ($current.ControlType -eq [System.Windows.Automation.ControlType]::Edit -or $current.ControlType -eq [System.Windows.Automation.ControlType]::Document) { $editable = $true }
    }
  }
  return @{handle=$window.ToInt64().ToString();processId=$owner;runtime=$runtime;editable=$editable;secure=$secure}
}
try {
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
    $expected = [Console]::In.ReadToEnd() | ConvertFrom-Json
    if ($expected.handle -notmatch '^\d+$' -or $expected.processId -le 0) { throw 'No previous application was captured.' }
    $window = [IntPtr][Int64]::Parse($expected.handle)
    [uint32]$owner = 0
    [void][ClipBoardLineNative]::GetWindowThreadProcessId($window,[ref]$owner)
    if (-not [ClipBoardLineNative]::IsWindow($window) -or $owner -ne $expected.processId) { throw 'The previous application has closed.' }
    [void][ClipBoardLineNative]::ShowWindow($window,9)
    [void][ClipBoardLineNative]::SetForegroundWindow($window)
    $deadline = [DateTime]::UtcNow.AddSeconds(2)
    do {
      Start-Sleep -Milliseconds 30
      $held = @([ClipBoardLineNative]::GetAsyncKeyState(0x11),[ClipBoardLineNative]::GetAsyncKeyState(0x12),[ClipBoardLineNative]::GetAsyncKeyState(0x10)) | Where-Object { $_ -lt 0 }
    } while ($held.Count -gt 0 -and [DateTime]::UtcNow -lt $deadline)
    if ([ClipBoardLineNative]::GetForegroundWindow() -ne $window) { throw 'Windows did not return focus to the previous application.' }
    if ($Mode -eq 'Paste') {
      $actual = FocusInfo
      if ($held.Count -gt 0 -or -not $expected.editable -or $expected.secure -or -not $actual.editable -or $actual.secure -or
          $actual.runtime -ne $expected.runtime) { throw 'Focus changed. Select an editable field and reopen the shelves.' }
      if (-not [ClipBoardLineNative]::Paste()) { throw 'Windows blocked keyboard input. Elevated applications may require manual paste.' }
    }
    @{ok=$true} | ConvertTo-Json -Compress
  }
} catch { @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
