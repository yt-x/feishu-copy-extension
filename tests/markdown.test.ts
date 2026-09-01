// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import {
  htmlToMarkdown,
  blocksToMarkdown,
  collectVisibleContentBlocks,
  collectImageAssets,
} from '../src/utils/markdown';

function el(html: string): Element {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('htmlToMarkdown', () => {
  it('converts text block with inline formatting', () => {
    const root = el(
      '<div data-block-type="text">普通<strong>加粗</strong><em>斜体</em>' +
        '<a href="https://example.com">链接</a><code>code</code></div>',
    );
    expect(htmlToMarkdown(root)).toBe(
      '普通**加粗***斜体*[链接](https://example.com)`code`',
    );
  });

  it('converts headings by level', () => {
    const root = el(
      '<div data-block-type="heading1">标题一</div>' +
        '<div data-block-type="heading3">标题三</div>',
    );
    expect(htmlToMarkdown(root)).toBe('# 标题一\n\n### 标题三');
  });

  it('converts bullet / ordered / todo', () => {
    const root = el(
      '<div data-block-type="bullet">无序项</div>' +
        '<div data-block-type="ordered">有序项</div>' +
        '<div data-block-type="todo"><input type="checkbox" checked>已完成</div>' +
        '<div data-block-type="todo">未完成</div>',
    );
    expect(htmlToMarkdown(root)).toBe(
      '- 无序项\n\n1. 有序项\n\n- [x] 已完成\n\n- [ ] 未完成',
    );
  });

  it('converts code block and divider', () => {
    const root = el(
      '<div data-block-type="code"><code>const a = 1;</code></div>' +
        '<div data-block-type="divider"></div>',
    );
    expect(htmlToMarkdown(root)).toBe('```\nconst a = 1;\n```\n\n---');
  });

  it('converts quote/callout with > prefix', () => {
    const root = el('<div data-block-type="quote">引用内容</div>');
    expect(htmlToMarkdown(root)).toBe('> 引用内容');
  });

  it('converts image block to markdown image', () => {
    const root = el(
      '<div data-block-type="image"><span class="img"><img src="https://x/feishu.png"></span></div>',
    );
    expect(htmlToMarkdown(root)).toBe('![](https://x/feishu.png)');
  });

  it('converts table block to markdown table', () => {
    const root = el(
      '<div class="docx-table-block"><table>' +
        '<tr><td>表头1</td><td>表头2</td></tr>' +
        '<tr><td>A</td><td>B</td></tr>' +
        '</table></div>',
    );
    expect(htmlToMarkdown(root)).toBe(
      '| 表头1 | 表头2 |\n| --- | --- |\n| A | B |',
    );
  });

  it('recurses into grid containers', () => {
    const root = el(
      '<div data-block-type="grid"><div data-block-type="grid_column">' +
        '<div data-block-type="text">左栏</div></div>' +
        '<div data-block-type="grid_column"><div data-block-type="text">右栏</div>' +
        '</div></div>',
    );
    expect(htmlToMarkdown(root)).toBe('左栏\n\n右栏');
  });

  it('strips selected-mask from table cells', () => {
    const root = el(
      '<div class="docx-table-block"><table><tr>' +
        '<td>内容<div class="selected-mask"></div></td>' +
        '</tr></table></div>',
    );
    expect(htmlToMarkdown(root)).toContain('内容');
    expect(htmlToMarkdown(root)).not.toContain('selected-mask');
  });

  it('escapes pipe chars in table cells', () => {
    const root = el(
      '<div class="docx-table-block"><table><tr><td>a|b</td></tr></table></div>',
    );
    expect(htmlToMarkdown(root)).toContain('a\\|b');
  });
});

describe('collectVisibleContentBlocks', () => {
  it('skips container types and table-internal blocks', () => {
    const root = el(
      '<div data-block-type="page">' +
        '<div data-block-type="grid"><div data-block-type="grid_column">' +
        '<div data-block-type="text">栏内文本</div>' +
        '</div></div>' +
        '<div data-block-type="text">普通文本</div>' +
        '<div class="docx-table-block"><table><tr><td><div data-block-type="text">表内文本</div></td></tr></table></div>' +
        '</div>',
    );
    const blocks = collectVisibleContentBlocks(
      root.querySelector('[data-block-type="page"]')!,
    );
    const texts = blocks.map((b) => (b.textContent || '').trim());
    expect(texts).toContain('栏内文本');
    expect(texts).toContain('普通文本');
    // 表格块整体收集，表内 text 块不单独出现
    expect(blocks.some((b) => b.classList.contains('docx-table-block'))).toBe(true);
    expect(
      blocks.filter((b) => b.getAttribute('data-block-type') === 'text').length,
    ).toBe(2);
  });
});

describe('collectImageAssets', () => {
  it('downloads images, rewrites to assets/ relative paths, keeps failed URLs', async () => {
    const png = new Blob(['fake-png-bytes'], { type: 'image/png' });
    const rawFetch = global.fetch;
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('ok.png')) {
        return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } });
      }
      return new Response('forbidden', { status: 403 });
    }) as typeof fetch;

    try {
      const md = '![](https://x/ok.png)\n\n![](https://x/fail.png)\n\n![](https://x/ok.png)';
      const { markdown: out, assets } = await collectImageAssets(md);
      expect(assets.length).toBe(1);
      expect(assets[0].filename).toBe('img-001.png');
      expect(out).toContain('![](assets/img-001.png)');
      expect(out).toContain('![](https://x/fail.png)');
      // 同一 URL 去重，两处引用都重写为同一路径
      expect(out.match(/assets\/img-001\.png/g)?.length).toBe(2);
    } finally {
      global.fetch = rawFetch;
    }
  });

  it('returns markdown unchanged when no images', async () => {
    const md = '# 标题\n\n纯文本';
    const { markdown: out, assets } = await collectImageAssets(md);
    expect(out).toBe(md);
    expect(assets).toEqual([]);
  });
});

describe('blocksToMarkdown', () => {
  it('joins blocks with blank lines and skips empty', () => {
    const blocks = [
      el('<div data-block-type="text">一</div>').firstElementChild!,
      el('<div data-block-type="text"></div>').firstElementChild!,
      el('<div data-block-type="text">二</div>').firstElementChild!,
    ];
    expect(blocksToMarkdown(blocks)).toBe('一\n\n二');
  });
});
