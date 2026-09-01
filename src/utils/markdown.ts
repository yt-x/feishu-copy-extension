/**
 * 飞书文档 DOM → Markdown 转换器
 *
 * 基于 data-block-type 识别块级结构，递归处理嵌套容器（page/grid/grid_column）。
 * 纯 DOM 操作，ISOLATED 与 MAIN world 均可使用。
 */

const CONTAINER_TYPES = new Set(['page', 'grid', 'grid_column', 'grid-column']);

function inlineMd(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }
  if (!(node instanceof Element)) return '';

  const tag = node.tagName.toLowerCase();
  const children = (): string => Array.from(node.childNodes).map(inlineMd).join('');

  switch (tag) {
    case 'strong':
    case 'b':
      return '**' + children() + '**';
    case 'em':
    case 'i':
      return '*' + children() + '*';
    case 's':
    case 'del':
      return '~~' + children() + '~~';
    case 'code':
      return '`' + (node.textContent || '') + '`';
    case 'br':
      return '\n';
    case 'a': {
      const href = node.getAttribute('href') || '';
      const text = children().trim() || href;
      return '[' + text + '](' + href + ')';
    }
    case 'img': {
      const src = node.getAttribute('src') || '';
      return src ? '![](' + src + ')' : '';
    }
    default:
      return children();
  }
}

function blockText(el: Element): string {
  return Array.from(el.childNodes).map(inlineMd).join('').trim();
}

function tableToMd(el: Element): string {
  const table = el.tagName === 'TABLE' ? el : el.querySelector('table');
  if (!table) return blockText(el);

  const rows: string[][] = [];
  table.querySelectorAll('tr').forEach((tr) => {
    const cells: string[] = [];
    tr.querySelectorAll('td, th').forEach((td) => {
      cells.push((td.textContent || '').trim().replace(/\|/g, '\\|').replace(/\n+/g, ' '));
    });
    if (cells.length > 0) rows.push(cells);
  });
  if (rows.length === 0) return '';

  const width = Math.max(...rows.map((r) => r.length));
  const normalize = (r: string[]): string[] =>
    r.concat(Array(Math.max(0, width - r.length)).fill(''));

  const lines: string[] = [];
  lines.push('| ' + normalize(rows[0]).join(' | ') + ' |');
  lines.push('| ' + Array(width).fill('---').join(' | ') + ' |');
  for (const row of rows.slice(1)) {
    lines.push('| ' + normalize(row).join(' | ') + ' |');
  }
  return lines.join('\n');
}

function isTableBlock(el: Element): boolean {
  return (
    el.matches('.docx-table-block, .table-block, [data-block-type="table"]') ||
    el.tagName === 'TABLE'
  );
}

function blockToMd(el: Element): string {
  // 表格块优先（其内部 text 块不应拆散，保持 table 结构）
  if (isTableBlock(el)) return tableToMd(el);

  const type = el.getAttribute('data-block-type') || '';

  if (CONTAINER_TYPES.has(type)) {
    return childrenToMd(el);
  }

  if (/^heading[1-9]$/.test(type)) {
    const level = parseInt(type.slice(-1), 10);
    return '#'.repeat(level) + ' ' + blockText(el);
  }

  switch (type) {
    case 'text':
      return blockText(el);
    case 'bullet':
      return '- ' + blockText(el);
    case 'ordered':
      return '1. ' + blockText(el);
    case 'todo': {
      const checked =
        el.querySelector('input[type="checkbox"]:checked') !== null ||
        /checked|done/.test(el.className);
      return (checked ? '- [x] ' : '- [ ] ') + blockText(el);
    }
    case 'quote':
    case 'callout': {
      const text = childrenToMd(el) || blockText(el);
      return text
        .split('\n')
        .map((line) => '> ' + line)
        .join('\n');
    }
    case 'code': {
      const codeEl = el.querySelector('code, pre');
      const code = (codeEl || el).textContent || '';
      return '```\n' + code.replace(/\n$/, '') + '\n```';
    }
    case 'divider':
      return '---';
    case 'image': {
      const img = el.querySelector('img');
      const src = img?.currentSrc || img?.src || '';
      return src ? '![](' + src + ')' : '';
    }
    case 'table':
      return tableToMd(el);
    default:
      break;
  }

  // 无 data-block-type 的容器（如 table-block 包装）按标签名/内容处理
  const tag = el.tagName.toLowerCase();
  if (tag === 'table') return tableToMd(el);
  if (/^h[1-6]$/.test(tag)) return '#'.repeat(parseInt(tag[1], 10)) + ' ' + blockText(el);

  // 含子块则递归，否则按段落处理
  if (el.querySelector('[data-block-type]')) return childrenToMd(el);
  return blockText(el);
}

function childrenToMd(el: Element): string {
  const parts: string[] = [];
  for (const child of Array.from(el.children)) {
    const md = blockToMd(child);
    if (md.trim()) parts.push(md);
  }
  // 没有元素子节点但有文本（如 text block 内部）
  if (parts.length === 0) return '';
  return parts.join('\n\n');
}

/**
 * 转换任意根元素为 Markdown
 */
export function htmlToMarkdown(root: Element): string {
  if (root.hasAttribute('data-block-type')) {
    return blockToMd(root);
  }
  return childrenToMd(root);
}

/**
 * 飞书文档正文容器
 */
export function findDocContainer(): Element | null {
  return (
    document.querySelector('[data-page-id]') ||
    document.querySelector('.docx-page-block-children-wrapper') ||
    document.querySelector('.docx-page-block')
  );
}

/**
 * 整篇文档 → Markdown
 */
export function docToMarkdown(): string {
  const container = findDocContainer();
  if (!container) return '';
  return htmlToMarkdown(container);
}

/**
 * 当前选区 → Markdown
 */
export function selectionToMarkdown(): string {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return '';

  const wrapper = document.createElement('div');
  for (let i = 0; i < selection.rangeCount; i++) {
    wrapper.appendChild(selection.getRangeAt(i).cloneContents());
  }
  const md = htmlToMarkdown(wrapper);
  if (md.trim()) return md;
  // 单段内联选区：克隆结果只有文本节点/内联元素，没有块级结构
  return (wrapper.textContent || '').trim();
}

/**
 * 收集容器内的叶子内容块（跳过 page/grid 等容器与表格内部块）
 * 供整篇导出的虚拟滚动收集使用
 */
export function collectVisibleContentBlocks(container: Element): Element[] {
  const out: Element[] = [];
  container.querySelectorAll('[data-block-type], .docx-table-block').forEach((el) => {
    const type = el.getAttribute('data-block-type') || '';
    if (CONTAINER_TYPES.has(type)) return;
    // 表格内部的叶子块跳过（表格块整体转换）
    const tableAncestor = el.closest('.docx-table-block');
    if (tableAncestor && tableAncestor !== el) return;
    out.push(el);
  });
  return out;
}

/**
 * 一组块元素 → Markdown（用于整篇导出的跨屏收集结果）
 */
export function blocksToMarkdown(blocks: Element[]): string {
  const parts: string[] = [];
  for (const block of blocks) {
    const md = blockToMd(block);
    if (md.trim()) parts.push(md);
  }
  return parts.join('\n\n');
}

const IMAGE_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
};

export interface ImageAsset {
  /** 原始图片 URL */
  url: string;
  /** zip 内文件名（assets/ 下） */
  filename: string;
  blob: Blob;
}

/**
 * 抓取 Markdown 中的图片为本地资源，URL 重写为 assets/ 相对路径
 *
 * 飞书图片为 blob: 或需登录态的 drive-stream URL，离开页面会话即失效。
 * 页面上下文内 fetch 携带会话凭证可拿到图片数据。
 * 单张失败时保留原始 URL（降级），不阻断整体导出。
 */
export async function collectImageAssets(
  markdown: string,
): Promise<{ markdown: string; assets: ImageAsset[] }> {
  const pattern = /!\[[^\]]*\]\(([^)\s]+)\)/g;
  const urls = Array.from(
    new Set(Array.from(markdown.matchAll(pattern)).map((m) => m[1])),
  );
  if (urls.length === 0) return { markdown, assets: [] };

  const assets: ImageAsset[] = [];
  const urlToPath = new Map<string, string>();

  await Promise.all(
    urls.map(async (url, index) => {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (!resp.ok) return;
        const blob = await resp.blob();
        if (!blob.type.startsWith('image/')) return;
        const ext = IMAGE_EXT[blob.type] || '.png';
        const filename = `img-${String(index + 1).padStart(3, '0')}${ext}`;
        assets.push({ url, filename, blob });
        urlToPath.set(url, `assets/${filename}`);
      } catch {
        // 失败保留原始 URL
      }
    }),
  );

  const rewritten = markdown.replace(pattern, (match, url: string) =>
    urlToPath.has(url) ? `![](${urlToPath.get(url)})` : match,
  );
  return { markdown: rewritten, assets };
}
