# Feishu Copy Helper - automated regression script
#
# Usage: powershell -File scripts/regression.ps1 [-DocUrl <url>] [-Session <name>]
#
# Prereq: opencli daemon running, Browser Bridge connected,
#         extension loaded in the opencli-controlled Chrome.
#
# Coverage (code-verifiable items from TEST.md):
#   R1 hooks installed (marker / XHR / fetch / preventDefault / CSS)
#   R2 Layer 4 dynamic gating matrix (bridged config -> copy interception)
#   R3 table cross-cell overlay extraction (simulated selected-mask -> table HTML)
#   R4 config bridge hot-switch (contextmenu effective immediately)
#
# Manual items (cannot automate) see TEST.md: real Ctrl+C clipboard content,
# native context menu, permission toast, Ctrl+S/Ctrl+P dialogs, exported .md.

param(
  [string]$DocUrl = "https://waytoagi.feishu.cn/wiki/F6F1wbGN7iTp9akVWqHcubOhnqe",
  [string]$Session = "regression"
)

$ErrorActionPreference = "Continue"
$script:failed = 0

function Eval-Page([string]$js) {
  $out = opencli browser $Session eval $js 2>$null
  return ($out | Select-String -Pattern '^\{' | Select-Object -First 1).Line
}

function Check([string]$name, [bool]$pass, [string]$detail = "") {
  if ($pass) {
    Write-Host "PASS  $name" -ForegroundColor Green
  } else {
    Write-Host "FAIL  $name  $detail" -ForegroundColor Red
    $script:failed++
  }
}

Write-Host "== open test doc ==" -ForegroundColor Cyan
opencli browser $Session open $DocUrl | Out-Null
opencli browser $Session wait time 8 | Out-Null

# R1: hooks installed
$r1 = Eval-Page "JSON.stringify({loaded:window.__FEISHU_COPY_LOADED===true,xhr:!XMLHttpRequest.prototype.open.toString().includes('[native code]'),fetch:!window.fetch.toString().includes('[native code]'),pd:!Event.prototype.preventDefault.toString().includes('[native code]'),css:!!document.querySelector('[id*=__feishu_copy_]')})" | ConvertFrom-Json
Check "R1.1 marker __FEISHU_COPY_LOADED" $r1.loaded
Check "R1.2 XHR hook installed" $r1.xhr
Check "R1.3 fetch hook installed" $r1.fetch
Check "R1.4 preventDefault hook installed" $r1.pd
Check "R1.5 CSS injected" $r1.css

# R2: Layer 4 dynamic gating matrix
$r2 = Eval-Page "(async()=>{const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));const sync=(cfg)=>window.postMessage({source:'feishu-copy-bridge',type:'CONFIG_SYNC',config:cfg},location.origin);const doCopy=()=>{const els=[...document.querySelectorAll('.docx-page-block *')].filter(e=>e.children.length===0&&e.offsetHeight>0&&e.textContent.trim().length>10);if(!els.length)return null;const range=document.createRange();range.selectNodeContents(els[0]);const sel=window.getSelection();sel.removeAllRanges();sel.addRange(range);const dt=new DataTransfer();const ev=new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true});document.dispatchEvent(ev);return {intercepted:ev.defaultPrevented,text:(dt.getData('text/plain')||'').length>0}};sync({keepTableFormat:false});await sleep(120);const plain=doCopy();sync({bypassCopy:false,keepTableFormat:false});await sleep(120);const off=doCopy();sync({bypassCopy:true,keepTableFormat:true});await sleep(120);return JSON.stringify({plain,off})})()" | ConvertFrom-Json
Check "R2.1 keepTableFormat=off intercepts and writes plain text" ($r2.plain.intercepted -and $r2.plain.text) ($r2.plain | ConvertTo-Json -Compress)
Check "R2.2 bypassCopy=off leaves event alone" (-not $r2.off.intercepted) ($r2.off | ConvertTo-Json -Compress)

# R3: table overlay extraction (simulated Feishu cross-cell selection)
$r3 = Eval-Page "(()=>{const host=document.querySelector('.docx-page-block')||document.body;const t=document.createElement('table');t.innerHTML='<tr><td>A1</td><td>B1</td></tr><tr><td>A2</td><td>B2</td></tr>';t.querySelectorAll('td').forEach(td=>{const m=document.createElement('div');m.className='selected-mask';td.appendChild(m)});host.appendChild(t);window.getSelection().removeAllRanges();const dt=new DataTransfer();const ev=new ClipboardEvent('copy',{clipboardData:dt,bubbles:true,cancelable:true});document.dispatchEvent(ev);const html=dt.getData('text/html');const plain=dt.getData('text/plain');t.remove();return JSON.stringify({hasTableHtml:html.indexOf('<table>')>=0&&html.indexOf('A1')>=0&&html.indexOf('B2')>=0,hasTsv:plain.indexOf('A1')>=0,prevented:ev.defaultPrevented})})()" | ConvertFrom-Json
Check "R3.1 table selection writes text/html" $r3.hasTableHtml
Check "R3.2 table selection writes TSV plain text" $r3.hasTsv
Check "R3.3 table selection event taken over" $r3.prevented

# R4: config bridge hot-switch (contextmenu)
$r4 = Eval-Page "(async()=>{const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));const test=()=>{const e=new Event('contextmenu',{cancelable:true});e.preventDefault();return e.defaultPrevented};const before=test();window.postMessage({source:'feishu-copy-bridge',type:'CONFIG_SYNC',config:{bypassContextMenu:false}},location.origin);await sleep(120);const off=test();window.postMessage({source:'feishu-copy-bridge',type:'CONFIG_SYNC',config:{bypassContextMenu:true}},location.origin);await sleep(120);const on=test();return JSON.stringify({before,off,on})})()" | ConvertFrom-Json
Check "R4.1 contextmenu hook active by default" (-not $r4.before)
Check "R4.2 bridge-off disables instantly" $r4.off
Check "R4.3 bridge-on restores instantly" (-not $r4.on)

# R5: external links open in new tab (click intercepted), internal untouched
# (listener installs after async config load; retry to absorb page-settle timing)
$r5Script = "(()=>{const test=(href)=>{const a=document.createElement('a');a.href=href;a.textContent='x';document.body.appendChild(a);const ev=new MouseEvent('click',{cancelable:true,bubbles:true});a.dispatchEvent(ev);a.remove();return ev.defaultPrevented};return JSON.stringify({external:test('https://example.com/page'),internal:test('https://waytoagi.feishu.cn/wiki/abc'),anchor:test('#section')})})()"
$r5 = $null
for ($i = 0; $i -lt 3; $i++) {
  $r5 = Eval-Page $r5Script | ConvertFrom-Json
  if ($r5.external -eq $true) { break }
  opencli browser $Session wait time 2 | Out-Null
}
Check "R5.1 external link intercepted (new tab)" $r5.external
Check "R5.2 internal link untouched" (-not $r5.internal)
Check "R5.3 anchor link untouched" (-not $r5.anchor)

Write-Host ""
if ($script:failed -eq 0) {
  Write-Host "== ALL PASSED ==" -ForegroundColor Green
  exit 0
} else {
  Write-Host "== $($script:failed) FAILED ==" -ForegroundColor Red
  exit 1
}
