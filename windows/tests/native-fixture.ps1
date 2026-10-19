param([string]$Output)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$form=New-Object System.Windows.Forms.Form
$form.Text='ClipBoardLine native paste acceptance fixture'
$form.Size=New-Object System.Drawing.Size(800,520)
$editor=New-Object System.Windows.Forms.RichTextBox
$editor.Dock='Fill'
$editor.Font=New-Object System.Drawing.Font('Segoe UI',16)
$form.Controls.Add($editor)
$timer=New-Object System.Windows.Forms.Timer
$timer.Interval=150
$timer.Add_Tick({
  try {
    $files=[System.Windows.Forms.Clipboard]::GetFileDropList()
    $value=@{ready=$true;handle=$form.Handle.ToInt64().ToString();processId=$PID;text=$editor.Text;hasImage=$editor.Rtf.Contains('\pict');dropCount=$files.Count}
    $temporary=$Output+'.tmp'
    [System.IO.File]::WriteAllText($temporary,($value|ConvertTo-Json -Compress))
    [System.IO.File]::Copy($temporary,$Output,$true)
  }catch{}
})
$form.Add_Shown({$form.Activate();$editor.Focus();$timer.Start()})
[System.Windows.Forms.Application]::Run($form)
