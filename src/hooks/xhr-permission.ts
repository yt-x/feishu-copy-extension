/**
 * XHR 权限响应改写
 * 拦截飞书的权限 API 响应，将 copy 等权限位置为 1（启用）
 *
 * 必须在 MAIN world 中运行，因为需要 hook XMLHttpRequest.prototype
 */

interface PermissionActions {
  copy?: number;
  download?: number;
  export?: number;
  print?: number;
  [key: string]: number | undefined;
}

interface PermissionResponse {
  data?: {
    actions?: PermissionActions;
  };
}

/** 需要拦截的权限 API 端点路径片段 */
const PERMISSION_ENDPOINTS = [
  'space/api/suite/permission/document/actions/state/',
  'space/api/explore/v2/permission/',
];

/**
 * 安装 XHR 响应改写 hook
 */
export function installXHRHook(options: { bypassCopy?: boolean; forceExport?: boolean } = {}): void {
  const { bypassCopy = true, forceExport = true } = options;

  const rawOpen = XMLHttpRequest.prototype.open;

  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string | URL,
    async?: boolean,
    username?: string | null,
    password?: string | null,
  ): void {
    const urlStr = String(url);

    // 检查是否是需要拦截的权限接口
    const isPermissionEndpoint = PERMISSION_ENDPOINTS.some((ep) => urlStr.includes(ep));
    if (!isPermissionEndpoint) {
      return rawOpen.call(this, method, url, async as boolean, username, password);
    }

    // 监听响应完成
    this.addEventListener('readystatechange', function () {
      if (this.readyState !== 4) return;

      try {
        let rawResponse: string;
        try {
          rawResponse = this.responseText;
        } catch {
          rawResponse = this.response as string;
        }

        if (!rawResponse) return;

        const response: PermissionResponse = JSON.parse(rawResponse);
        if (!response?.data?.actions) return;

        let modified = false;
        const actions = response.data.actions;

        // 启用复制
        if (bypassCopy && actions.copy !== undefined && actions.copy !== 1) {
          actions.copy = 1;
          modified = true;
        }

        // 强制启用导出/下载/打印
        if (forceExport) {
          const exportKeys = ['download', 'export', 'print'];
          for (const key of exportKeys) {
            if (actions[key] !== undefined && actions[key] !== 1) {
              actions[key] = 1;
              modified = true;
            }
          }
        }

        if (modified) {
          const modifiedJson = JSON.stringify(response);
          Object.defineProperty(this, 'responseText', {
            value: modifiedJson,
            configurable: true,
            writable: true,
          });
          Object.defineProperty(this, 'response', {
            value: this.responseType === 'json' ? response : modifiedJson,
            configurable: true,
            writable: true,
          });
          console.log('%c[飞书复制助手]%c XHR权限已改写', 'color:#3370ff;font-weight:bold', '', actions);
        }
      } catch (e) {
        // 解析失败静默忽略
      }
    });

    return rawOpen.call(this, method, url, async as boolean, username, password);
  };
}

/**
 * 安装 Fetch API 响应改写 hook（安全版）
 *
 * 设计约束：
 * - 仅拦截 HTTP 200 的 JSON 响应
 * - 仅处理匹配的权限 API 端点
 * - 所有非权限请求 100% 透明透传
 * - 异常静默降级，不阻断飞书任何正常请求
 */
export function installFetchHook(options: { bypassCopy?: boolean; forceExport?: boolean } = {}): void {
  const { bypassCopy = true, forceExport = true } = options;

  // 在 document_start 时机缓存原生 fetch（飞书尚未覆盖）
  const rawFetch = window.fetch.bind(window);

  window.fetch = async function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    // Step 1: 发起原始请求（不修改任何请求参数）
    let response: Response;
    try {
      response = await rawFetch(input, init);
    } catch (fetchErr) {
      // fetch 本身失败（网络错误等），直接抛出，不干预
      throw fetchErr;
    }

    // Step 2: 快速过滤 — 非 200 非 JSON 直接透传
    if (response.status !== 200) return response;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return response;

    // Step 3: 提取 URL 字符串
    let urlStr = '';
    try {
      urlStr = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : '';
    } catch {
      return response;
    }

    // Step 4: 仅拦截权限 API 端点
    const isPermissionEndpoint = PERMISSION_ENDPOINTS.some((ep) => urlStr.includes(ep));
    if (!isPermissionEndpoint) return response;

    // Step 5: 安全解析 JSON 并修改权限位
    try {
      const cloned = response.clone();
      const text = await cloned.text();

      if (!text || text.length === 0) return response;

      const json: PermissionResponse = JSON.parse(text);
      if (!json?.data?.actions) return response;

      let modified = false;
      const actions = json.data.actions;

      if (bypassCopy && typeof actions.copy === 'number' && actions.copy !== 1) {
        actions.copy = 1;
        modified = true;
      }

      if (forceExport) {
        for (const key of ['download', 'export', 'print']) {
          if (typeof actions[key] === 'number' && actions[key] !== 1) {
            actions[key] = 1;
            modified = true;
          }
        }
      }

      if (modified) {
        console.log(
          '%c[飞书复制助手]%c Fetch 权限已改写',
          'color:#52c41a;font-weight:bold',
          '',
          JSON.stringify(actions),
        );
        // 返回全新 Response，header 完整保留
        return new Response(JSON.stringify(json), {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
      }
    } catch {
      // JSON 解析失败或权限结构不匹配 → 静默返回原始响应
    }

    return response;
  };
}
