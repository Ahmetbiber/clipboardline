param([ValidateSet('Capture','CaptureDiagnostics','Restore','PreparePaste','ValidatePaste','Paste','Monitor','CopyImages')][string]$Mode)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$automationReferences = @(
  [System.Windows.Automation.ClientSettings].Assembly.Location
  [System.Windows.Automation.AutomationIdentifier].Assembly.Location
) | Select-Object -Unique
Add-Type -ReferencedAssemblies $automationReferences -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Windows.Automation;
public static class ClipBoardLineNative {
  private static bool automationInitialized;
  [System.Runtime.CompilerServices.MethodImpl(System.Runtime.CompilerServices.MethodImplOptions.NoInlining)]
  public static void InitializeAutomation() {
    if(automationInitialized)return;
    var providers=System.Reflection.Assembly.Load("UIAutomationClientsideProviders, Version=4.0.0.0, Culture=neutral, PublicKeyToken=31bf3856ad364e35");
    System.Windows.Automation.ClientSettings.RegisterClientSideProviderAssembly(providers.GetName());
    automationInitialized=true;
  }
  private static readonly object outputLock = new object();
  private static string lastFocus;
  private static AutomationFocusChangedEventHandler focusHandler;
  public static string FocusSnapshot() { return DescribeFocus(AutomationElement.FocusedElement,false); }
  public static string FocusDiagnostics() {
    var window=GetForegroundWindow();uint owner=0;GetWindowThreadProcessId(window,out owner);
    var element=AutomationElement.FocusedElement;var entries=new System.Collections.Generic.List<string>();
    // Capability metadata only: never Name, Value, text, selection or ranges.
    for(int depth=0;element!=null&&depth<5;depth++) {
      var current=element.Current;object value;bool hasValue=false,hasText=false,hasLegacy=false;string valueReadOnly="null",textReadOnly="null",legacyRole="null",legacyState="null";
      if(current.IsEnabled&&!current.IsPassword) {
        hasValue=element.TryGetCurrentPattern(ValuePattern.Pattern,out value);
        if(hasValue)valueReadOnly=((ValuePattern)value).Current.IsReadOnly?"true":"false";
        hasText=element.TryGetCurrentPattern(TextPattern.Pattern,out value);
        if(hasText) { var readOnly=((TextPattern)value).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);if(readOnly is bool)textReadOnly=(bool)readOnly?"true":"false"; }
        hasLegacy=element.TryGetCurrentPattern(LegacyIAccessiblePattern.Pattern,out value);
        if(hasLegacy) { var legacy=((LegacyIAccessiblePattern)value).Current;legacyRole=legacy.Role.ToString();legacyState=legacy.State.ToString(); }
      }
      entries.Add("{\"processId\":"+current.ProcessId+",\"runtime\":\""+String.Join(".",element.GetRuntimeId())+"\",\"controlType\":"+current.ControlType.Id+",\"nativeHandle\":"+current.NativeWindowHandle+",\"enabled\":"+(current.IsEnabled?"true":"false")+",\"secure\":"+(current.IsPassword?"true":"false")+",\"keyboardFocusable\":"+(current.IsKeyboardFocusable?"true":"false")+",\"keyboardFocused\":"+(current.HasKeyboardFocus?"true":"false")+",\"valuePattern\":"+(hasValue?"true":"false")+",\"valueReadOnly\":"+valueReadOnly+",\"textPattern\":"+(hasText?"true":"false")+",\"textReadOnly\":"+textReadOnly+",\"legacyPattern\":"+(hasLegacy?"true":"false")+",\"legacyRole\":"+legacyRole+",\"legacyState\":"+legacyState+"}");
      element=TreeWalker.RawViewWalker.GetParent(element);
    }
    return "{\"ok\":true,\"handle\":\""+window.ToInt64()+"\",\"processId\":"+owner+",\"chain\":["+String.Join(",",entries)+"]}";
  }

  private static string DescribeFocus(AutomationElement element,bool fromEvent) {
    var window=GetForegroundWindow(); uint owner=0; GetWindowThreadProcessId(window,out owner);
    bool editable=false,secure=false; string runtime="";
    if(element!=null) {
      var current=element.Current; secure=current.IsPassword;
      runtime=String.Join(".",element.GetRuntimeId());
      object pattern;
      if(current.IsEnabled&&!secure&&current.ProcessId==owner&&runtime.Length>0) {
        if(element.TryGetCurrentPattern(ValuePattern.Pattern,out pattern)) editable=!((ValuePattern)pattern).Current.IsReadOnly;
        else if(element.TryGetCurrentPattern(TextPattern.Pattern,out pattern)) {
          var readOnly=((TextPattern)pattern).DocumentRange.GetAttributeValue(TextPattern.IsReadOnlyAttribute);
          if(readOnly is bool) editable=!(bool)readOnly;
        }
      }
      // A focus callback may arrive after the foreground has already changed.
      // Never mistake a background provider's event for a fresh destination.
      if(fromEvent&&current.ProcessId!=owner)return null;
    }
    return "{\"handle\":\""+window.ToInt64()+"\",\"processId\":"+owner+",\"runtime\":\""+runtime+"\",\"editable\":"+(editable?"true":"false")+",\"secure\":"+(secure?"true":"false")+"}";
  }
  private static void EmitFocus(string snapshot) {
    if(snapshot==null)return;
    lock(outputLock) { if(lastFocus==snapshot)return;lastFocus=snapshot;Console.Out.WriteLine("{\"focus\":"+snapshot+"}");Console.Out.Flush(); }
  }
  public static void ObserveFocus() {
    focusHandler=delegate(object sender,AutomationFocusChangedEventArgs args) {
      try { EmitFocus(DescribeFocus(sender as AutomationElement,true)); } catch(Exception) {}
    };
    Automation.AddAutomationFocusChangedEventHandler(focusHandler);
  }
  public static void EmitCurrentFocus() { try { EmitFocus(FocusSnapshot()); } catch(Exception) {} }
  public static void EmitSequence(uint sequence) { lock(outputLock) { Console.Out.WriteLine("{\"sequence\":"+sequence+"}");Console.Out.Flush(); } }
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
  public static bool Paste(IntPtr expectedWindow,uint expectedOwner) {
    uint owner=0;var foreground=GetForegroundWindow();GetWindowThreadProcessId(foreground,out owner);
    if(foreground!=expectedWindow||owner!=expectedOwner)return false;
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
  $snapshot=[ClipBoardLineNative]::FocusSnapshot()
  if (-not $snapshot) { throw 'The focused element changed while it was being inspected.' }
  return $snapshot | ConvertFrom-Json
}
function HeldShortcutKeys { @(0x11,0x12,0x10,0x0D,0x5B,0x5C) | Where-Object { [ClipBoardLineNative]::GetAsyncKeyState($_) -lt 0 } }
try {
  if ($Mode -ne 'CopyImages') {
    # PowerShell's dynamic caller can prevent UIA's one-time default proxy load.
    # Register Microsoft's strongly named Win32 providers before reading UIA.
    # https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/register-a-client-side-provider-assembly
    # UIA walks the first caller's ReflectedType; a PowerShell DynamicMethod
    # has none. A non-inlined compiled frame keeps that framework walk valid.
    [ClipBoardLineNative]::InitializeAutomation()
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
    $pngStream = [System.IO.MemoryStream]::new([System.IO.File]::ReadAllBytes($payload.files[0]))
    try {
      $data.SetImage($bitmap)
      # Preserve the exact full-resolution PNG (including alpha) for editors
      # that prefer PNG over the first-image Windows bitmap fallback.
      $data.SetData('PNG',$pngStream)
      if ($payload.text) { $data.SetText([string]$payload.text) }
      $markerStream = [System.IO.MemoryStream]::new([Convert]::FromBase64String($payload.marker))
      $data.SetData('ClipBoardLine.Internal.v1', $markerStream)
      [System.Windows.Forms.Clipboard]::SetDataObject($data,$true,5,100)
    } finally { $bitmap.Dispose();$pngStream.Dispose();if($markerStream){$markerStream.Dispose()} }
    @{ok=$true} | ConvertTo-Json -Compress
  } elseif ($Mode -eq 'Monitor') {
    [ClipBoardLineNative]::ObserveFocus()
    $last = [uint32]0
    while ($true) {
      $sequence = [ClipBoardLineNative]::GetClipboardSequenceNumber()
      if ($sequence -ne $last) { [ClipBoardLineNative]::EmitSequence($sequence); $last=$sequence }
      [ClipBoardLineNative]::EmitCurrentFocus()
      Start-Sleep -Milliseconds 250
    }
  } elseif ($Mode -eq 'CaptureDiagnostics') {
    [ClipBoardLineNative]::FocusDiagnostics()
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
    # A long key-release interval can outlive a closed/reused HWND or a
    # different foreground application. Check both again before activation.
    [uint32]$readyOwner=0
    [void][ClipBoardLineNative]::GetWindowThreadProcessId($window,[ref]$readyOwner)
    if (-not [ClipBoardLineNative]::IsWindow($window) -or $readyOwner -ne $expected.processId) { throw 'The previous application has closed.' }
    [uint32]$readyForeground=0
    [void][ClipBoardLineNative]::GetWindowThreadProcessId([ClipBoardLineNative]::GetForegroundWindow(),[ref]$readyForeground)
    if ($readyForeground -ne $expected.processId -and $readyForeground -ne $expected.sourceProcessId) { throw 'Another application became active. No focus was changed.' }
    if ($Mode -in @('Paste','ValidatePaste') -and $expected.prepared) {
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
        if ($actual.processId -ne $expected.processId -or $actual.handle -ne $expected.handle -or $actual.secure -or ($actual.editable -and $actual.runtime -ne $expected.runtime)) { throw 'Focus changed. Select an editable field and reopen the shelves.' }
        if ($held.Count -eq 0 -and $expected.editable -and -not $expected.secure -and $actual.editable -and $actual.runtime -eq $expected.runtime) { $stable++ } else { $stable=0 }
      }
    } while ($stable -lt 2 -and [DateTime]::UtcNow -lt $deadline)
    if ([ClipBoardLineNative]::GetForegroundWindow() -ne $window -or $held.Count -gt 0) { throw 'Windows did not restore the intended field after the shortcut was released.' }
    if ($Mode -ne 'Restore' -and $stable -lt 2) { throw 'Focus changed. Select an editable field and reopen the shelves.' }
    $phase.targetStable=[DateTime]::UtcNow.ToString('o')
    if ($Mode -in @('Paste','ValidatePaste')) {
      $final=FocusInfo
      if (-not $final.editable -or $final.secure -or $final.processId -ne $expected.processId -or $final.handle -ne $expected.handle -or $final.runtime -ne $expected.runtime) { throw 'Focus changed immediately before paste. No keys were sent.' }
      if ($Mode -eq 'Paste') {
        if (-not [ClipBoardLineNative]::Paste($window,[uint32]$expected.processId)) { throw 'Windows blocked keyboard input or focus changed. Elevated applications may require manual paste.' }
        $phase.inputSent=[DateTime]::UtcNow.ToString('o')
      }
    }
    @{ok=$true;mode=$Mode;phase=$phase} | ConvertTo-Json -Compress
  }
} catch { @{ok=$false;error=$_.Exception.Message} | ConvertTo-Json -Compress; exit 1 }
