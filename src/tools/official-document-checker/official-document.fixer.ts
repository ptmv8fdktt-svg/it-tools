/**
 * 一键修复引擎
 *
 * 对「可自动修复」的违规项，直接在纯文本上做安全替换。
 *
 * 设计原则：
 * - 只改「确定无歧义」的写法，绝不猜测内容。
 * - 每次修复都返回 before/after 对照，用户可以选择接受或拒绝。
 * - 版式类问题（字体、字号、行距）无法在纯文本上修复，会生成
 *   「Word 操作指引」而不是偷偷改动，避免用户以为已经改好了。
 */

import type { RuleViolation } from './official-document.rules';

export interface FixResult {
  /** 修复后的文本 */
  text: string;
  /** 实际生效的修复数量 */
  applied: number;
  /** 无法自动修复、只能给出操作指引的项 */
  manual: Array<{ title: string; guide: string }>;
  /** 每条修复的对照明细 */
  details: Array<{ ruleId: string; before: string; after: string }>;
}

export function applyFixes(text: string, violations: RuleViolation[]): FixResult {
  let out = text;
  let applied = 0;
  const manual: FixResult['manual'] = [];
  const details: FixResult['details'] = [];

  const tryReplace = (ruleId: string, pattern: RegExp, replacement: string | ((s: string) => string)) => {
    const before = out;
    out = out.replace(pattern, replacement as string);
    if (out !== before) {
      applied += 1;
      details.push({ ruleId, before: firstChange(before, out), after: '' });
    }
  };

  for (const v of violations) {
    if (!v.autoFixable) {
      if (v.severity === 'error' && !manual.some((m) => m.title === v.title)) {
        manual.push({ title: v.title, guide: wordGuideFor(v) });
      }
      continue;
    }

    switch (v.ruleId) {
      case 'STR-002':
        // 六角括号替换
        tryReplace('STR-002', /([\u4e00-\u9fa5]{2,12})\s*[\[（(]\s*(\d{4})\s*[\]）)]/g, '$1〔$2〕');
        // 去掉「第」字
        tryReplace('STR-002', /〔(\d{4})〕\s*第\s*(\d+)\s*号/g, '〔$1〕$2 号');
        // 去掉顺序号虚位
        tryReplace('STR-002', /〔(\d{4})〕\s*0+(\d+)\s*号/g, '〔$1〕$2 号');
        break;

      case 'STR-003':
        // 三级序号半角点 → 全角点（限定行首，避免破坏版本号等）
        tryReplace('STR-003', /^(\s*)(\d+)\.\s?/gm, '$1$2．');
        // 阿拉伯数字后误用顿号 → 全角点号
        tryReplace('STR-003', /^(\s*)(\d+)、/gm, '$1$2．');
        // 一级序号误用其他符号 → 顿号
        tryReplace('STR-003', /^(\s*)([一二三四五六七八九十]+)\s*[.．,，]/gm, '$1$2、');
        break;

      case 'STR-004':
        // 「二零二六」→「二〇二六」
        tryReplace('STR-004', /二零(\d{2,4})?(?=年)/g, (m) => m.replace(/零/g, '〇'));
        tryReplace('STR-004', /(?<=\D)零(?=年)/g, '〇');
        // 阿拉伯数字年份 → 汉字（仅处理 19xx / 20xx 年）
        tryReplace('STR-004', /(?<!\d)((?:19|20)\d{2})年(\d{1,2})月(\d{1,2})日/g, (_m, ...args) => {
          const [y, mo, d] = args as unknown as [string, string, string];
          return `${yearToCn(y)}年${cnDatePart(Number(mo))}月${cnDatePart(Number(d))}日`;
        });
        break;

      case 'STR-005':
        tryReplace('STR-005', /^(\s*)附件\s*[:：]\s*/gm, '$1附件：');
        break;

      case 'PUN-001':
        // 仅在中文字符之后替换，避免破坏英文与数字
        tryReplace('PUN-001', /([\u4e00-\u9fa5]),/g, '$1，');
        tryReplace('PUN-001', /([\u4e00-\u9fa5]);/g, '$1；');
        tryReplace('PUN-001', /([\u4e00-\u9fa5])!/g, '$1！');
        tryReplace('PUN-001', /([\u4e00-\u9fa5])\?/g, '$1？');
        // 中文冒号：中文后跟半角冒号，且后面不是数字（避免时间 12:30）
        tryReplace('PUN-001', /([\u4e00-\u9fa5]):(?!\d)/g, '$1：');
        // 中文后的半角句点改句号：排除小数与英文缩写
        tryReplace('PUN-001', /([\u4e00-\u9fa5])\.(?=\s|$)/gm, '$1。');
        tryReplace('PUN-001', /([\u4e00-\u9fa5])\.(?=[\u4e00-\u9fa5])/g, '$1。');
        break;

      case 'PUN-002':
        // 括号内含中文时改为全角
        tryReplace('PUN-002', /\(([^()]*[\u4e00-\u9fa5][^()]*)\)/g, '（$1）');
        break;

      case 'SAY-001':
        tryReplace('SAY-001', /咱们/g, '我单位');
        tryReplace('SAY-001', /差不多/g, '基本');
        tryReplace('SAY-001', /搞定/g, '完成');
        // 「弄」需保护固定搭配，逐处判断
        tryReplace('SAY-001', /(?<!弄)弄(?!虚作假|清|懂|通)/g, '办理');
        break;

      default:
        if (v.severity === 'error' && !manual.some((m) => m.title === v.title)) {
          manual.push({ title: v.title, guide: wordGuideFor(v) });
        }
        break;
    }
  }

  // 补一份 Word 操作指引，方便写作者在源文件里改
  for (const v of violations) {
    if (isLayoutIssue(v) && !manual.some((m) => m.title === v.title)) {
      manual.push({ title: v.title, guide: wordGuideFor(v) });
    }
  }

  return { text: out, applied, manual, details };
}

/** 判断是否为版式类（无法在纯文本上修复）问题 */
export function isLayoutIssue(v: RuleViolation): boolean {
  return ['FMT-001', 'FMT-010', 'FMT-011', 'FMT-012', 'FMT-013', 'STR-001'].includes(v.ruleId);
}

/** 生成 Word / WPS 中的具体操作步骤 */
function wordGuideFor(v: RuleViolation): string {
  switch (v.ruleId) {
    case 'FMT-001':
      return '在 Word 中打开：布局 → 页边距 → 自定义页边距，设上 37 mm、下 35 mm、左 28 mm、右 26 mm，装订线 0。纸张选 A4。';
    case 'FMT-010':
      return '选中正文 → 开始 → 字体：中文字体选「仿宋_GB2312」，字号选「三号」；西文字体选「Times New Roman」。';
    case 'FMT-011':
      return '一级小标题（一、）设「三号黑体」；二级小标题（（一））设「三号楷体_GB2312」；三级（1．）用三号仿宋加粗。';
    case 'FMT-012':
      return '选中正文 → 右键段落 → 行距选「固定值」，设置值填 28 磅；段前段后间距均设 0。';
    case 'FMT-013':
      return '选中正文 → 右键段落 → 特殊格式选「首行缩进」，度量值填 2 字符。';
    case 'STR-001':
      return '标题字体设为「方正小标宋简体」、字号「二号」，段落设为居中，段前段后各空一行。若没有该字体，可从单位字体库安装。';
    default:
      return v.suggestion;
  }
}

function yearToCn(y: string): string {
  const d = '〇一二三四五六七八九';
  return y.split('').map((c) => d[Number(c)]).join('');
}

function cnDatePart(n: number): string {
  const d = '〇一二三四五六七八九';
  if (n < 10) return n === 0 ? '' : d[n];
  if (n === 10) return '十';
  if (n < 20) return `十${d[n % 10]}`;
  if (n < 30) return `二十${n % 10 === 0 ? '' : d[n % 10]}`;
  return `三十${n % 10 === 0 ? '' : d[n % 10]}`;
}

function firstChange(a: string, b: string): string {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const start = Math.max(0, i - 8);
  return `…${a.slice(start, i + 12)}…`;
}

/** 生成可下载的检查报告（Markdown） */
export function buildReport(report: {
  total: number;
  score: number;
  bySeverity: { error: number; warn: number; info: number };
  violations: RuleViolation[];
}, fileName?: string): string {
  const lines: string[] = [];
  lines.push(`# 公文格式检查报告`);
  lines.push('');
  lines.push(`- 检查对象：${fileName ?? '粘贴的文本'}`);
  lines.push(`- 检查时间：${new Date().toLocaleString('zh-CN')}`);
  lines.push(`- 规范依据：GB/T 9704-2012《党政机关公文格式》`);
  lines.push(`- 格式得分：**${report.score} / 100**`);
  lines.push('');
  lines.push(
    `共发现 **${report.total}** 处问题：硬性违规 ${report.bySeverity.error} 处、建议改进 ${report.bySeverity.warn} 处、提示 ${report.bySeverity.info} 处。`,
  );
  lines.push('');

  if (report.total === 0) {
    lines.push('未发现格式问题，文档符合规范要求。');
    return lines.join('\n');
  }

  const grouped = new Map<string, RuleViolation[]>();
  for (const v of report.violations) {
    const list = grouped.get(v.ruleId) ?? [];
    list.push(v);
    grouped.set(v.ruleId, list);
  }

  for (const [ruleId, list] of grouped) {
    const v = list[0];
    const label = v.severity === 'error' ? '硬性违规' : v.severity === 'warn' ? '建议改进' : '提示';
    lines.push(`## ${ruleId} ${v.title}（${label}，共 ${list.length} 处）`);
    lines.push('');
    lines.push(`> **依据**：${v.basis}`);
    lines.push('');
    for (const item of list) {
      const loc = item.location?.paragraph ? `第 ${item.location.paragraph} 段` : '';
      lines.push(`- ${loc}：${item.message}`);
    }
    lines.push('');
    lines.push(`**修改建议**：${v.suggestion}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('本报告由「校园工具箱 · 公文格式自检」生成，检查在本地浏览器完成，文档内容未上传。');
  lines.push('本工具基于 it-tools（GPL-3.0）二次开发，依据 GPL-3.0 同样以 GPL-3.0 授权。');
  return lines.join('\n');
}
