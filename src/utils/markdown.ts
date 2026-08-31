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

function blockToMd(el: Element): string {
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
  return htmlToMarkdown(wrapper);
}
