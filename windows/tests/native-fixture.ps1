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
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=100
$timer.Add_Tick({
  try {
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
        else { throw 'Unknown fixture command.' }
      }
    }
  } catch { $script:commandError=$_.Exception.Message }
  try {
    $files=[System.Windows.Forms.Clipboard]::GetFileDropList()
    $focused=(@($controls.Keys|Where-Object {$controls[$_].Focused})|Select-Object -First 1)
    $value=@{ready=$true;handle=$form.Handle.ToInt64().ToString();foreground=[FixtureFocus]::GetForegroundWindow().ToInt64().ToString();processId=$PID;text=$controls.rich.Text;plainText=$controls.plain.Text;readOnlyText=$controls.readonly.Text;passwordLength=$controls.password.Text.Length;hasImage=$controls.rich.Rtf.Contains('\pict');dropCount=$files.Count;focused=$focused;lastSerial=$script:lastSerial;commandError=$script:commandError}
    $temporary=$Output+'.tmp'
    [System.IO.File]::WriteAllText($temporary,($value|ConvertTo-Json -Compress))
    [System.IO.File]::Copy($temporary,$Output,$true)
  }catch{}
})
$form.Add_Shown({$form.Activate();$form.ActiveControl=$controls.rich;[void]$controls.rich.Focus();$timer.Start()})
[System.Windows.Forms.Application]::Run($form)
