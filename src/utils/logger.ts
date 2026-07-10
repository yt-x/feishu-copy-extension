/**
 * 调试日志工具
 */

let _debugEnabled = false;

export function setDebug(enabled: boolean): void {
  _debugEnabled = enabled;
}

export function log(...args: unknown[]): void {
  if (_debugEnabled) {
    console.log('%c[飞书复制助手]', 'color:#3370ff;font-weight:bold', ...args);
  }
}

export function warn(...args: unknown[]): void {
  if (_debugEnabled) {
    console.warn('%c[飞书复制助手]', 'color:#b76e00;font-weight:bold', ...args);
  }
}

export function error(...args: unknown[]): void {
  console.error('%c[飞书复制助手]', 'color:#ff4d4f;font-weight:bold', ...args);
}
