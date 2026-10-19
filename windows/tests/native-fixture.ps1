param([string]$Output,[string]$Commands)
$ErrorActionPreference='Stop'
if (-not $Commands) { $Commands=$Output+'.commands' }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FixtureFocus {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] public static extern uint SendInput(uint count, INPUT[] inputs, int size);
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public InputUnion union; }
  [StructLayout(LayoutKind.Explicit)] public struct InputUnion { [FieldOffset(0)] public KEYBDINPUT keyboard; [FieldOffset(0)] public MOUSEINPUT mouse; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort key,scan; public uint flags,time; public UIntPtr extra; }
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx,dy; public uint data,flags,time; public UIntPtr extra; }
  public static void PasteShortcut(bool release) {
    INPUT[] inputs=new INPUT[2];
    inputs[0].type=1; inputs[0].union.keyboard.key=(ushort)(release?0x0D:0x11);
    inputs[1].type=1; inputs[1].union.keyboard.key=(ushort)(release?0x11:0x0D);
    if(release){inputs[0].union.keyboard.flags=2;inputs[1].union.keyboard.flags=2;}
    if(SendInput(2,inputs,Marshal.SizeOf(typeof(INPUT)))!=2)throw new Exception("Fixture SendInput was blocked.");
  }
}
'@
$form=New-Object System.Windows.Forms.Form
$form.Text='ClipBoardLine native paste acceptance fixture'
$form.Size=New-Object System.Drawing.Size(850,650)
$layout=New-Object System.Windows.Forms.TableLayoutPanel
$layout.Dock='Fill';$layout.ColumnCount=1;$layout.RowCount=8
$form.Controls.Add($layout)
$controls=@{}
foreach($target in @('rich','plain','readonly','password')) {
  $label=New-Object System.Windows.Forms.Label
  $label.Text=$target;$label.AutoSize=$true;$layout.Controls.Add($label)
  if ($target -eq 'rich' -or $target -eq 'readonly') { $control=New-Object System.Windows.Forms.RichTextBox }
  else { $control=New-Object System.Windows.Forms.TextBox;$control.Multiline=$target -eq 'plain' }
  $control.Dock='Fill';$control.Font=New-Object System.Drawing.Font('Segoe UI',14)
  $control.Name='fixture-'+$target
  if ($target -eq 'readonly') { $control.ReadOnly=$true;$control.Text='Read-only fixture content' }
  if ($target -eq 'password') { $control.UseSystemPasswordChar=$true }
  $layout.Controls.Add($control);$controls[$target]=$control
}
$layout.RowStyles.Clear()
foreach($height in @(22,190,22,100,22,75,22,40)) { [void]$layout.RowStyles.Add([System.Windows.Forms.RowStyle]::new([System.Windows.Forms.SizeType]::Absolute,$height)) }
$script:lastSerial='';$script:commandError=''
$script:keyDeadline=$null
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=100
$timer.Add_Tick({
  try {
    if ($script:keyDeadline -and [DateTime]::UtcNow -ge $script:keyDeadline) { [FixtureFocus]::PasteShortcut($true);$script:keyDeadline=$null }
    if ([System.IO.File]::Exists($Commands)) {
      $command=[System.IO.File]::ReadAllText($Commands)|ConvertFrom-Json
      if ($command.serial -and $command.serial -ne $script:lastSerial) {
        $script:lastSerial=$command.serial;$script:commandError=''
        if ($command.action -eq 'focus') {
          $control=$controls[[string]$command.target]
          if ($null -eq $control) { throw 'Unknown fixture control.' }
          if ($command.seed -ne $null) { $control.Text=[string]$command.seed }
          $form.Activate();$form.ActiveControl=$control;[void]$control.Focus()
          if ($command.selectAll) { $control.SelectAll() }
        } elseif ($command.action -eq 'keys') { [System.Windows.Forms.SendKeys]::SendWait([string]$command.keys) }
        elseif ($command.action -eq 'hold-paste') { if($command.duration -lt 100 -or $command.duration -gt 1800){throw 'Invalid fixture key duration.'};$script:keyDeadline=[DateTime]::UtcNow.AddMilliseconds($command.duration);[FixtureFocus]::PasteShortcut($false) }
        elseif ($command.action -eq 'release-keys') { [FixtureFocus]::PasteShortcut($true);$script:keyDeadline=$null }
        else { throw 'Unknown fixture command.' }
      }
    }
  } catch { $script:commandError=$_.Exception.Message }
  try {
    $files=[System.Windows.Forms.Clipboard]::GetFileDropList()
    $focused=(@($controls.Keys|Where-Object {$controls[$_].Focused})|Select-Object -First 1)
    $value=@{ready=$true;handle=$form.Handle.ToInt64().ToString();foreground=[FixtureFocus]::GetForegroundWindow().ToInt64().ToString();processId=$PID;text=$controls.rich.Text;plainText=$controls.plain.Text;readOnlyText=$controls.readonly.Text;passwordLength=$controls.password.Text.Length;hasImage=$controls.rich.Rtf.Contains('\pict');dropCount=$files.Count;focused=$focused;lastSerial=$script:lastSerial;commandError=$script:commandError;shortcutHeld=([FixtureFocus]::GetAsyncKeyState(0x11) -lt 0 -and [FixtureFocus]::GetAsyncKeyState(0x0D) -lt 0)}
    $temporary=$Output+'.tmp'
    [System.IO.File]::WriteAllText($temporary,($value|ConvertTo-Json -Compress))
    [System.IO.File]::Copy($temporary,$Output,$true)
  }catch{}
})
$form.Add_Shown({$form.Activate();$form.ActiveControl=$controls.rich;[void]$controls.rich.Focus();$timer.Start()})
$form.Add_FormClosing({[FixtureFocus]::PasteShortcut($true)})
[System.Windows.Forms.Application]::Run($form)
