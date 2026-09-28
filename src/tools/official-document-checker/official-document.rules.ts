/**
 * 公文格式校验规则集
 *
 * 规则依据：GB/T 9704-2012《党政机关公文格式》
 *           以及高校学生组织常见的《公文格式规范》内部要求
 *
 * 设计原则：
 * 1. 每条规则只检查一件事，返回结构化结果，便于 UI 逐条展示与定位。
 * 2. 规则分为 error（硬性违规，评审必扣分）/ warn（建议改进）/ info（提示）三级。
 * 3. 所有规则均为纯函数，无副作用，可单测、可离线运行。
 */

export type Severity = 'error' | 'warn' | 'info';

export type RuleCategory =
  | '页面设置'
  | '版头'
  | '主体'
  | '版记'
  | '字体字号'
  | '层级序号'
  | '标点符号'
  | '用语规范';

export interface RuleSpec {
  /** 规则编号，如 FMT-001，便于在报告与规范文档中互相引用 */
  id: string;
  category: RuleCategory;
  severity: Severity;
  /** 规则标题，出现在检查结果里 */
  title: string;
  /** 规则依据，引用规范原文，方便写作者理解为什么 */
  basis: string;
  /**
   * 检查函数。
   * @param doc 待检查的文档解析结果
   * @returns 违规项列表；空数组表示通过
   */
  check: (doc: DocumentModel) => RuleViolation[];
}

export interface RuleViolation {
  ruleId: string;
  severity: Severity;
  category: RuleCategory;
  title: string;
  basis: string;
  /** 人类可读的问题描述 */
  message: string;
  /** 建议的修改方式 */
  suggestion: string;
  /** 在正文中的定位信息，用于 UI 高亮 */
  location?: {
    /** 段落序号，从 1 开始 */
    paragraph?: number;
    /** 该段落内的字符区间 [start, end) */
    span?: [number, number];
    /** 原文片段，用于展示与快速定位 */
    excerpt?: string;
  };
  /** 是否可被一键修复 */
  autoFixable?: boolean;
}

/* ------------------------------------------------------------------ */
/* 文档模型：解析后的中间表示                                           */
/* ------------------------------------------------------------------ */

export interface ParagraphModel {
  index: number;
  /** 段落纯文本（已去除首尾空白，但保留层级序号） */
  text: string;
  /** 推断出的段落角色 */
  role: ParagraphRole;
  /** 有效字号（磅），未知为 undefined */
  fontSizePt?: number;
  /** 中文字体名，如「仿宋_GB2312」 */
  fontFamilyCn?: string;
  /** 西文字体名 */
  fontFamilyEn?: string;
  /** 是否加粗 */
  bold?: boolean;
  /** 行距（磅），未知为 undefined */
  lineSpacingPt?: number;
  /** 首行缩进字符数，未知为 undefined */
  firstLineIndentChars?: number;
}

export type ParagraphRole =
  | 'title'
  | 'recipient'
  | 'body'
  | 'heading1'
  | 'heading2'
  | 'heading3'
  | 'heading4'
  | 'attachmentNote'
  | 'signature'
  | 'date'
  | 'unknown';

export interface DocumentModel {
  /** 原始纯文本，用于片段截取 */
  rawText: string;
  paragraphs: ParagraphModel[];
  /** 页面设置 */
  page?: {
    /** 上边距毫米 */
    marginTopMm?: number;
    marginBottomMm?: number;
    marginLeftMm?: number;
    marginRightMm?: number;
    /** 纸张规格描述 */
    paperSize?: string;
  };
  /** 版头信息 */
  head?: {
    /** 发文机关标志（红头文字） */
    issuerMark?: string;
    /** 发文字号，如「校团字〔2026〕5 号」 */
    documentNumber?: string;
  };
  /** 成文日期，ISO 字符串 */
  issueDate?: string;
  /** 附件说明行 */
  attachments?: string[];
  /** 文档级元信息 */
  meta?: {
    /** 来源文件名 */
    fileName?: string;
    /** 是否从 .docx 解析（可读到字体信息） */
    fromDocx?: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* 工具函数                                                            */
/* ------------------------------------------------------------------ */

/** 中文规范要求的字体，允许的等价写法归一到标准名 */
const FONT_ALIASES: Record<string, string> = {
  仿宋: '仿宋_GB2312',
  仿宋gb2312: '仿宋_GB2312',
  仿宋_gb2312: '仿宋_GB2312',
  fangsong: '仿宋_GB2312',
  方正仿宋_gbk: '仿宋_GB2312',
  楷体: '楷体_GB2312',
  楷体gb2312: '楷体_GB2312',
  楷体_gb2312: '楷体_GB2312',
  kaiti: '楷体_GB2312',
  黑体: '黑体',
  simhei: '黑体',
  宋体: '宋体',
  simsun: '宋体',
  方正小标宋简体: '方正小标宋简体',
  小标宋: '方正小标宋简体',
};

export function normalizeFontName(name?: string): string | undefined {
  if (!name) return undefined;
  const key = name.trim().toLowerCase().replace(/\s+/g, '');
  return FONT_ALIASES[key] ?? name.trim();
}

/** 浮点近似比较，容忍 Word 中字号/行距的舍入误差 */
export function approxEqual(a?: number, b?: number, tolerance = 0.6): boolean {
  if (a === undefined || b === undefined) return false;
  return Math.abs(a - b) <= tolerance;
}

/** 把阿拉伯数字转成公文要求的汉字数字（用于年月日、附件序号） */
export function toChineseNumeral(n: number): string {
  const digits = '零一二三四五六七八九';
  if (n < 10) return digits[n];
  if (n < 20) return `十${n % 10 === 0 ? '' : digits[n % 10]}`;
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${digits[tens]}十${ones === 0 ? '' : digits[ones]}`;
  }
  return String(n);
}

/** 是否以正确的阿拉伯数字加半角点号形式的层级序号开头，返回层级 1-4，否则 0 */
export function detectHeadingLevel(text: string): 0 | 1 | 2 | 3 | 4 {
  const t = text.trim();
  if (/^[一二三四五六七八九十]+、/.test(t)) return 1;
  if (/^（[一二三四五六七八九十]+）/.test(t)) return 2;
  if (/^\d+．/.test(t)) return 3;
  if (/^（\d+）/.test(t)) return 4;
  return 0;
}

/** 常见的错误层级写法 → 正确写法，用于一键修复 */
export const HEADING_FIXES: Array<{ pattern: RegExp; replace: (m: string) => string; note: string }> = [
  { pattern: /^(\d+)\.\s*/, replace: () => '', note: '三级序号应使用「1．」（全角点号），而非「1.」' },
];

/* ------------------------------------------------------------------ */
/* 具体规则                                                            */
/* ------------------------------------------------------------------ */

const fmt001: RuleSpec = {
  id: 'FMT-001',
  category: '页面设置',
  severity: 'error',
  title: '页面边距不符合规范',
  basis: 'GB/T 9704-2012 6.1：公文用纸天头（上白边）37 mm±1 mm，订口（左白边）28 mm±1 mm，版心尺寸 156 mm×225 mm。',
  check: (doc) => {
    if (!doc.page) return [];
    const out: RuleViolation[] = [];
    const expect = [
      { key: 'marginTopMm' as const, label: '上边距', target: 37 },
      { key: 'marginLeftMm' as const, label: '左边距', target: 28 },
    ];
    for (const { key, label, target } of expect) {
      const v = doc.page[key];
      if (v === undefined) continue;
      if (Math.abs(v - target) > 1.5) {
        out.push({
          ruleId: 'FMT-001',
          severity: 'error',
          category: '页面设置',
          title: '页面边距不符合规范',
          basis: fmt001.basis,
          message: `${label}为 ${v.toFixed(1)} mm，规范要求 ${target} mm±1 mm。`,
          suggestion: `页面设置中将${label}调整为 ${target} mm。`,
        });
      }
    }
    return out;
  },
};

const FONT_TITLE = '方正小标宋简体';
const FONT_BODY = '仿宋_GB2312';
const FONT_H1 = '黑体';
const FONT_H2 = '楷体_GB2312';

const fmt010: RuleSpec = {
  id: 'FMT-010',
  category: '字体字号',
  severity: 'error',
  title: '正文字体或字号不符合规范',
  basis: 'GB/T 9704-2012 7.3.1：公文正文一般用 3 号仿宋体字，行距一般为 28 磅。',
  check: (doc) =>
    doc.paragraphs
      .filter((p) => p.role === 'body')
      .flatMap((p) => {
        const violations: RuleViolation[] = [];
        const fontCn = normalizeFontName(p.fontFamilyCn);
        if (fontCn && fontCn !== FONT_BODY) {
          violations.push({
            ruleId: 'FMT-010',
            severity: 'error',
            category: '字体字号',
            title: '正文字体或字号不符合规范',
            basis: fmt010.basis,
            message: `第 ${p.index} 段正文使用「${p.fontFamilyCn}」，规范要求「仿宋_GB2312」。`,
            suggestion: '将正文中文字体统一设为「仿宋_GB2312」。',
            location: { paragraph: p.index, excerpt: excerptOf(p.text) },
            autoFixable: true,
          });
        }
        if (p.fontSizePt !== undefined && !approxEqual(p.fontSizePt, 16, 0.5)) {
          violations.push({
            ruleId: 'FMT-010',
            severity: 'error',
            category: '字体字号',
            title: '正文字体或字号不符合规范',
            basis: fmt010.basis,
            message: `第 ${p.index} 段正文为 ${p.fontSizePt} 磅，规范要求 3 号字（16 磅）。`,
            suggestion: '将正文段落字号统一设为 3 号（16 磅）。',
            location: { paragraph: p.index, excerpt: excerptOf(p.text) },
            autoFixable: true,
          });
        }
        return violations;
      }),
};

const fmt011: RuleSpec = {
  id: 'FMT-011',
  category: '字体字号',
  severity: 'error',
  title: '一级小标题未使用黑体 / 二级小标题未使用楷体',
  basis: 'GB/T 9704-2012 7.3.2：一级标题用 3 号黑体，二级标题用 3 号楷体，三级标题用 3 号仿宋加粗。',
  check: (doc) =>
    doc.paragraphs
      .flatMap((p) => {
        const expect =
          p.role === 'heading1' ? FONT_H1 : p.role === 'heading2' ? FONT_H2 : undefined;
        if (!expect) return [];
        const actual = normalizeFontName(p.fontFamilyCn);
        if (actual && actual !== expect) {
          return [
            {
              ruleId: 'FMT-011',
              severity: 'error' as Severity,
              category: '字体字号' as RuleCategory,
              title: '一级小标题未使用黑体 / 二级小标题未使用楷体',
              basis: fmt011.basis,
              message: `第 ${p.index} 段「${excerptOf(p.text)}」使用「${p.fontFamilyCn}」，规范要求「${expect}」。`,
              suggestion: `将该小标题中文字体设为「${expect}」。`,
              location: { paragraph: p.index, excerpt: excerptOf(p.text) },
              autoFixable: true,
            },
          ];
        }
        return [];
      }),
};

const fmt012: RuleSpec = {
  id: 'FMT-012',
  category: '字体字号',
  severity: 'warn',
  title: '行距不是 28 磅',
  basis: 'GB/T 9704-2012 7.3.1：正文行距一般为 28 磅，每页 22 行、每行 28 个字。',
  check: (doc) =>
    doc.paragraphs
      .filter((p) => p.role === 'body' && p.lineSpacingPt !== undefined)
      .flatMap((p) =>
        approxEqual(p.lineSpacingPt, 28, 1.5)
          ? []
          : [
              {
                ruleId: 'FMT-012',
                severity: 'warn' as Severity,
                category: '字体字号' as RuleCategory,
                title: '行距不是 28 磅',
                basis: fmt012.basis,
                message: `第 ${p.index} 段行距为 ${p.lineSpacingPt} 磅，规范建议 28 磅。`,
                suggestion: '段落设置中把行距设为「固定值 28 磅」。',
                location: { paragraph: p.index, excerpt: excerptOf(p.text) },
                autoFixable: true,
              },
            ],
      ),
};

const fmt013: RuleSpec = {
  id: 'FMT-013',
  category: '字体字号',
  severity: 'warn',
  title: '段落首行未缩进 2 字符',
  basis: '公文正文每段首行缩进 2 个字符，与 3 号字对应约 32 磅。',
  check: (doc) =>
    doc.paragraphs
      .filter((p) => p.role === 'body' && p.firstLineIndentChars !== undefined)
      .flatMap((p) =>
        approxEqual(p.firstLineIndentChars, 2, 0.3)
          ? []
          : [
              {
                ruleId: 'FMT-013',
                severity: 'warn' as Severity,
                category: '字体字号' as RuleCategory,
                title: '段落首行未缩进 2 字符',
                basis: fmt013.basis,
                message: `第 ${p.index} 段首行缩进 ${p.firstLineIndentChars} 个字符，规范要求 2 个字符。`,
                suggestion: '段落设置 → 特殊格式 → 首行缩进 2 字符。',
                location: { paragraph: p.index, excerpt: excerptOf(p.text) },
                autoFixable: true,
              },
            ],
      ),
};

const str001: RuleSpec = {
  id: 'STR-001',
  category: '主体',
  severity: 'error',
  title: '缺少发文机关标志或标题位置异常',
  basis: 'GB/T 9704-2012 7.2.1：公文标题一般用 2 号小标宋体字，编排于红色分隔线下空二行位置，分一行或多行居中排布。',
  check: (doc) => {
    const title = doc.paragraphs.find((p) => p.role === 'title');
    if (!title) {
      return [
        {
          ruleId: 'STR-001',
          severity: 'error',
          category: '主体',
          title: '缺少发文机关标志或标题位置异常',
          basis: str001.basis,
          message: '未识别到公文标题。标题是公文的必要组成部分。',
          suggestion: '在红色分隔线下空二行位置添加标题，使用 2 号方正小标宋简体。',
        },
      ];
    }
    const out: RuleViolation[] = [];
    const font = normalizeFontName(title.fontFamilyCn);
    if (font && font !== FONT_TITLE) {
      out.push({
        ruleId: 'STR-001',
        severity: 'error',
        category: '主体',
        title: '标题字体不符合规范',
        basis: str001.basis,
        message: `标题使用「${title.fontFamilyCn}」，规范要求「方正小标宋简体」。`,
        suggestion: '把标题字体设为「方正小标宋简体」，字号 2 号（22 磅）。',
        location: { paragraph: title.index, excerpt: excerptOf(title.text) },
        autoFixable: true,
      });
    }
    if (title.fontSizePt !== undefined && !approxEqual(title.fontSizePt, 22, 1)) {
      out.push({
        ruleId: 'STR-001',
        severity: 'error',
        category: '主体',
        title: '标题字号不符合规范',
        basis: str001.basis,
        message: `标题为 ${title.fontSizePt} 磅，规范要求 2 号字（22 磅）。`,
        suggestion: '将标题字号设为 2 号（22 磅）。',
        location: { paragraph: title.index, excerpt: excerptOf(title.text) },
        autoFixable: true,
      });
    }
    return out;
  },
};

const str002: RuleSpec = {
  id: 'STR-002',
  category: '版头',
  severity: 'error',
  title: '发文字号格式不正确',
  basis: 'GB/T 9704-2012 7.2.4：发文字号由发文机关代字、年份、发文顺序号组成；年份用六角括号〔〕括入，行政公文不加「第」，也不编虚位（即 1 不编为 001）。',
  check: (doc) => {
    const num = doc.head?.documentNumber;
    if (!num) return [];
    const out: RuleViolation[] = [];
    if (!/[〔]/.test(num)) {
      out.push({
        ruleId: 'STR-002',
        severity: 'error',
        category: '版头',
        title: '发文字号未使用六角括号',
        basis: str002.basis,
        message: `发文字号「${num}」未使用六角括号〔〕，可能使用了方括号[]或圆括号()。`,
        suggestion: '年份改用六角括号，例如「校团字〔2026〕5 号」。',
        autoFixable: true,
      });
    }
    if (/第\s*\d+\s*号/.test(num)) {
      out.push({
        ruleId: 'STR-002',
        severity: 'error',
        category: '版头',
        title: '发文字号不应有「第」字',
        basis: str002.basis,
        message: `发文字号「${num}」中含「第」字，行政公文发文字号不写「第」。`,
        suggestion: '删除「第」字，例如「校团字〔2026〕第 5 号」→「校团字〔2026〕5 号」。',
        autoFixable: true,
      });
    }
    if (/〔\s*\d*\s*0\d+\s*〕/.test(num)) {
      out.push({
        ruleId: 'STR-002',
        severity: 'error',
        category: '版头',
        title: '发文字号编排了虚位',
        basis: str002.basis,
        message: `发文字号「${num}」的顺序号有前导零（如 005），规范要求不编虚位。`,
        suggestion: '去掉顺序号的前导零，例如「〔2026〕005 号」→「〔2026〕5 号」。',
        autoFixable: true,
      });
    }
    return out;
  },
};

const str003: RuleSpec = {
  id: 'STR-003',
  category: '层级序号',
  severity: 'error',
  title: '层级序号使用不规范',
  basis: 'GB/T 9704-2012 附录：文中结构层次序数依次可用「一、」「（一）」「1．」「（1）」标注。第三层为阿拉伯数字加全角点号，第四层加全角圆括号。',
  check: (doc) =>
    doc.paragraphs.flatMap((p) => {
      const t = p.text.trim();
      const out: RuleViolation[] = [];
      // 三级序号误用半角点：1. / 1.1
      if (/^\d+\.(?=\s|[^\d.])/.test(t)) {
        out.push({
          ruleId: 'STR-003',
          severity: 'error',
          category: '层级序号',
          title: '三层序号误用半角点号',
          basis: str003.basis,
          message: `第 ${p.index} 段「${excerptOf(t)}」使用了半角点号「.」，规范要求全角点号「．」。`,
          suggestion: '把「1.」改为「1．」（全角点号，不跟半角空格）。',
          location: {
            paragraph: p.index,
            span: [0, t.search(/^\d+\./) + 2],
            excerpt: excerptOf(t),
          },
          autoFixable: true,
        });
      }
      // 一级序号误用顿号以外的符号（含「1、」这种把三级写在一级位置的错误）
      if (/^[一二三四五六七八九十]+\s*[.．,，]/.test(t) && !/^[一二三四五六七八九十]+、/.test(t)) {
        out.push({
          ruleId: 'STR-003',
          severity: 'error',
          category: '层级序号',
          title: '一级序号符号不规范',
          basis: str003.basis,
          message: `第 ${p.index} 段「${excerptOf(t)}」的一级序号后未使用顿号「、」。`,
          suggestion: '一级序号统一写作「一、」「二、」。',
          location: { paragraph: p.index, excerpt: excerptOf(t) },
          autoFixable: true,
        });
      }
      // 阿拉伯数字后误用顿号：应是「1．」而非「1、」
      if (/^\d+\s*、/.test(t)) {
        out.push({
          ruleId: 'STR-003',
          severity: 'error',
          category: '层级序号',
          title: '三级序号误用顿号',
          basis: str003.basis,
          message: `第 ${p.index} 段「${excerptOf(t)}」使用了「${t.match(/^\d+/)?.[0]}、」，规范中三级序号为阿拉伯数字加全角点号。`,
          suggestion: '把「1、」改为「1．」（全角点号）。',
          location: { paragraph: p.index, excerpt: excerptOf(t) },
          autoFixable: true,
        });
      }
      return out;
    }),
};

const str004: RuleSpec = {
  id: 'STR-004',
  category: '主体',
  severity: 'error',
  title: '成文日期未使用汉字数字',
  basis: 'GB/T 9704-2012 7.3.5.1：成文日期用阿拉伯数字将年、月、日标全，年份应标全称，月、日不编虚位。高校内部规范常要求使用汉字数字，如「二〇二六年九月二十八日」。',
  check: (doc) =>
    doc.paragraphs
      .filter((p) => p.role === 'date')
      .flatMap((p) => {
        const t = p.text.trim();
        const isArabic = /\d{4}\s*年/.test(t);
        if (isArabic) {
          return [
            {
              ruleId: 'STR-004',
              severity: 'error' as Severity,
              category: '主体' as RuleCategory,
              title: '成文日期未使用汉字数字',
              basis: str004.basis,
              message: `第 ${p.index} 段成文日期「${t}」使用阿拉伯数字年份，规范要求年份标全称、用汉字数字。`,
              suggestion: '改为汉字数字写法，例如「二〇二六年九月二十八日」。注意「〇」用汉字零，不用「零」或「○」。',
              location: { paragraph: p.index, excerpt: excerptOf(t) },
              autoFixable: true,
            },
          ];
        }
        if (/[○零0]/.test(t) && /二?[○零0]?二[○零0]/.test(t) && /○/.test(t) === false && /零/.test(t)) {
          return [
            {
              ruleId: 'STR-004',
              severity: 'warn' as Severity,
              category: '主体' as RuleCategory,
              title: '年份中使用了「零」而非「〇」',
              basis: str004.basis,
              message: `第 ${p.index} 段成文日期「${t}」中的零写作「零」，规范写法为汉字「〇」。`,
              suggestion: '把「二零二六」改为「二〇二六」。',
              location: { paragraph: p.index, excerpt: excerptOf(t) },
              autoFixable: true,
            },
          ];
        }
        return [];
      }),
};

const str005: RuleSpec = {
  id: 'STR-005',
  category: '主体',
  severity: 'error',
  title: '附件说明格式不规范',
  basis: 'GB/T 9704-2012 7.3.4：如有附件，在正文下空一行左空二字编排「附件」二字，后标全角冒号和名称。附件如有序号，使用阿拉伯数字（如「附件：1.×××」）。',
  check: (doc) => {
    const notes = doc.paragraphs.filter((p) => p.role === 'attachmentNote');
    return notes.flatMap((p, i) => {
      const t = p.text.trim();
      const out: RuleViolation[] = [];
      if (!/^附件\s*[:：]/.test(t)) {
        out.push({
          ruleId: 'STR-005',
          severity: 'error' as Severity,
          category: '主体' as RuleCategory,
          title: '附件说明格式不规范',
          basis: str005.basis,
          message: `第 ${p.index} 段「${excerptOf(t)}」未以「附件：」开头。`,
          suggestion: '附件说明写作「附件：1.××××」，冒号使用全角。',
          location: { paragraph: p.index, excerpt: excerptOf(t) },
          autoFixable: true,
        });
      }
      if (notes.length > 1 && !/^附件\s*[:：]\s*\d+/.test(t)) {
        out.push({
          ruleId: 'STR-005',
          severity: 'error' as Severity,
          category: '主体' as RuleCategory,
          title: '多个附件未编序号',
          basis: str005.basis,
          message: `第 ${p.index} 段存在多个附件但未编号，规范要求用阿拉伯数字标序号。`,
          suggestion: `改为「附件：${i + 1}.××××」。`,
          location: { paragraph: p.index, excerpt: excerptOf(t) },
          autoFixable: true,
        });
      }
      return out;
    });
  },
};

const pun001: RuleSpec = {
  id: 'PUN-001',
  category: '标点符号',
  severity: 'warn',
  title: '中英文标点混用',
  basis: '公文正文一律使用中文全角标点；英文缩写、数字单位等内部标点除外。',
  check: (doc) =>
    doc.paragraphs.flatMap((p) => {
      // 中文字符后紧跟半角逗号/分号/冒号/叹号/问号，判定为混用
      const mid = p.text.match(/[\u4e00-\u9fa5][,;:!?]/g);
      // 以句子形式结束却用半角句点：中文 + 句点 + 行尾，或中文 + 句点 + 中文
      // 排除小数、版本号、英文缩写（如 U.S.）等情形
      const period = p.text.match(/[\u4e00-\u9fa5]\.(?=\s|$|[\u4e00-\u9fa5])/g);
      const total = (mid?.length ?? 0) + (period?.length ?? 0);
      if (total === 0) return [];
      const samples = [...(mid ?? []), ...(period ?? [])].slice(0, 4).join(' ');
      return [
        {
          ruleId: 'PUN-001',
          severity: 'warn' as Severity,
          category: '标点符号' as RuleCategory,
          title: '中英文标点混用',
          basis: pun001.basis,
          message: `第 ${p.index} 段发现 ${total} 处中文后接半角标点：${samples}。`,
          suggestion: '把半角「,」「;」「:」「!」「?」「.」改为全角「，」「；」「：」「！」「？」「。」。',
          location: { paragraph: p.index, excerpt: excerptOf(p.text) },
          autoFixable: true,
        },
      ];
    }),
};

const pun002: RuleSpec = {
  id: 'PUN-002',
  category: '标点符号',
  severity: 'warn',
  title: '括号不配对或使用半角括号',
  basis: '公文中的括号应成对出现，中文语境下使用全角括号「（）」。',
  check: (doc) =>
    doc.paragraphs.flatMap((p) => {
      const open = (p.text.match(/[（(]/g) ?? []).length;
      const close = (p.text.match(/[）)]/g) ?? []).length;
      const out: RuleViolation[] = [];
      if (open !== close) {
        out.push({
          ruleId: 'PUN-002',
          severity: 'warn' as Severity,
          category: '标点符号' as RuleCategory,
          title: '括号不配对或使用半角括号',
          basis: pun002.basis,
          message: `第 ${p.index} 段左括号 ${open} 个、右括号 ${close} 个，不配对。`,
          suggestion: '检查并补全括号。',
          location: { paragraph: p.index, excerpt: excerptOf(p.text) },
        });
      }
      if (/[\u4e00-\u9fa5]\(/.test(p.text) || /\)[\u4e00-\u9fa5]/.test(p.text)) {
        out.push({
          ruleId: 'PUN-002',
          severity: 'warn' as Severity,
          category: '标点符号' as RuleCategory,
          title: '括号不配对或使用半角括号',
          basis: pun002.basis,
          message: `第 ${p.index} 段中文内容中使用了半角括号「()」。`,
          suggestion: '改为全角括号「（）」。',
          location: { paragraph: p.index, excerpt: excerptOf(p.text) },
          autoFixable: true,
        });
      }
      return out;
    }),
};

const say001: RuleSpec = {
  id: 'SAY-001',
  category: '用语规范',
  severity: 'warn',
  title: '出现口语化或非公文用语',
  basis: '公文应使用规范书面语，避免口语、网络用语及模糊表述。',
  check: (doc) => {
    // 注意：「弄」在「弄虚作假」「弄清」等固定搭配中属于规范用语，需排除
    const IDIOMS = ['弄虚作假', '弄清', '弄懂', '弄通'];
    const BAD = [
      { w: '咱们', r: '我单位／我校' },
      { w: '大家', r: '全体成员' },
      { w: '搞', r: '开展' },
      { w: '差不多', r: '基本／大致' },
      { w: '挺好的', r: '情况良好' },
      { w: '大概吧', r: '（删除，改为确定表述）' },
      { w: '搞定', r: '完成' },
      { w: '弄', r: '办理' },
    ];
    return doc.paragraphs.flatMap((p) =>
      BAD.filter((b) => {
        if (!p.text.includes(b.w)) return false;
        // 若该词只出现在固定搭配中，则不报
        const withoutIdiom = IDIOMS.reduce((acc, idiom) => acc.replaceAll(idiom, ''), p.text);
        return withoutIdiom.includes(b.w);
      }).map((b) => ({
        ruleId: 'SAY-001',
        severity: 'warn' as Severity,
        category: '用语规范' as RuleCategory,
        title: '出现口语化或非公文用语',
        basis: say001.basis,
        message: `第 ${p.index} 段出现口语词「${b.w}」，不适合公文语境。`,
        suggestion: `改为「${b.r}」。`,
        location: { paragraph: p.index, excerpt: excerptOf(p.text) },
        autoFixable: true,
      })),
    );
  },
};

const say002: RuleSpec = {
  id: 'SAY-002',
  category: '用语规范',
  severity: 'info',
  title: '数字用法需核对',
  basis: 'GB/T 15835《出版物上数字用法》：成文日期、农历、概数等用汉字；统计数据、编号、计量数值用阿拉伯数字。',
  check: (doc) =>
    doc.paragraphs
      .filter((p) => p.role === 'body' && /[一二三四五六七八九十百千]+(?:人|次|个|项|元|天|小时)/.test(p.text))
      .flatMap((p) => [
        {
          ruleId: 'SAY-002',
          severity: 'info' as Severity,
          category: '用语规范' as RuleCategory,
          title: '数字用法需核对',
          basis: say002.basis,
          message: `第 ${p.index} 段的统计数值使用了汉字数字，若为统计数据建议改用阿拉伯数字。`,
          suggestion: '统计数据、计量数值使用阿拉伯数字，如「15 人」；概数、次序用汉字。',
          location: { paragraph: p.index, excerpt: excerptOf(p.text) },
        },
      ]),
};

/** 规则全集：新增规则只需在此登记 */
export const RULES: RuleSpec[] = [
  fmt001,
  fmt010,
  fmt011,
  fmt012,
  fmt013,
  str001,
  str002,
  str003,
  str004,
  str005,
  pun001,
  pun002,
  say001,
  say002,
];

/* ------------------------------------------------------------------ */
/* 检查入口                                                            */
/* ------------------------------------------------------------------ */

export interface CheckReport {
  /** 总违规数 */
  total: number;
  bySeverity: Record<Severity, number>;
  byCategory: Record<string, number>;
  violations: RuleViolation[];
  /** 规则总分：100 分制，按严重度扣分 */
  score: number;
  /** 已通过的规则数 / 适用规则总数 */
  passed: number;
  applicable: number;
}

const PENALTY: Record<Severity, number> = { error: 8, warn: 3, info: 1 };

export function checkDocument(doc: DocumentModel): CheckReport {
  const violations: RuleViolation[] = [];
  let applicable = 0;

  for (const rule of RULES) {
    const found = rule.check(doc);
    // 规则参与了检查（无论是否通过）计为适用
    applicable += 1;
    violations.push(...found);
  }

  const bySeverity: Record<Severity, number> = { error: 0, warn: 0, info: 0 };
  const byCategory: Record<string, number> = {};
  for (const v of violations) {
    bySeverity[v.severity] += 1;
    byCategory[v.category] = (byCategory[v.category] ?? 0) + 1;
  }

  // 同一规则多次命中做边际递减，避免单个规则刷低分数
  const penaltyByRule = new Map<string, number>();
  for (const v of violations) {
    const seen = penaltyByRule.get(v.ruleId) ?? 0;
    penaltyByRule.set(v.ruleId, seen + 1);
  }
  let deduction = 0;
  for (const [ruleId, count] of penaltyByRule) {
    const sev = violations.find((v) => v.ruleId === ruleId)!.severity;
    const unit = PENALTY[sev];
    // 第 1 处全额，之后每处 50% 折扣
    deduction += unit + (count - 1) * unit * 0.5;
  }

  const passedRules = new Set(RULES.map((r) => r.id)).size - penaltyByRule.size;

  return {
    total: violations.length,
    bySeverity,
    byCategory,
    violations: violations.sort(
      (a, b) => severityRank(a.severity) - severityRank(b.severity) || a.ruleId.localeCompare(b.ruleId),
    ),
    score: Math.max(0, Math.round(100 - deduction)),
    passed: passedRules,
    applicable,
  };
}

function severityRank(s: Severity): number {
  return s === 'error' ? 0 : s === 'warn' ? 1 : 2;
}

function excerptOf(text: string, max = 28): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}
