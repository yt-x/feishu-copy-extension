/**
 * 页面内轻提示
 */
export function showToast(text: string): void {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText =
    'position:fixed;top:16px;left:50%;transform:translateX(-50%);' +
    'background:rgba(31,35,41,.92);color:#fff;padding:8px 16px;border-radius:6px;' +
    'font-size:13px;z-index:999999;pointer-events:none;font-family:sans-serif';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}
