/**
 * 文档解析器
 *
 * 把用户粘贴的纯文本，或上传的 .docx，统一解析成 DocumentModel。
 *
 * 关键设计：
 * - 纯文本路径：不依赖任何外部库，能推断段落角色、层级序号，但拿不到字体字号，
 *   因此此时只跑「不依赖格式信息」的规则，并在 UI 上明确告知检查范围。
 * - .docx 路径：.docx 本质是 zip + XML，我们自己解 zip 读 word/document.xml，
 *   从而拿到真实的字体、字号、行距、首行缩进 —— 这是本工具区别于同类网页工具的核心能力。
 */

import type { DocumentModel, ParagraphModel, ParagraphRole } from './official-document.rules';
import { detectHeadingLevel } from './official-document.rules';

export interface ParseResult {
  doc: DocumentModel;
  /** 解析过程中的告警，展示给用户 */
  notices: string[];
  /** 能力说明：本次检查能覆盖哪些方面 */
  capabilities: {
    canReadFont: boolean;
    canReadPageSetup: boolean;
  };
}

/* ------------------------------------------------------------------ */
/* 纯文本解析                                                          */
/* ------------------------------------------------------------------ */

export function parsePlainText(raw: string, fileName?: string): ParseResult {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.replace(/\u3000/g, '　').trimEnd())
    .filter((l) => l.trim().length > 0);

  const paragraphs: ParagraphModel[] = lines.map((text, i) => ({
    index: i + 1,
    text: text.trim(),
    role: inferRole(text.trim(), i, lines),
  }));

  return {
    doc: {
      rawText: raw,
      paragraphs,
      meta: { fileName, fromDocx: false },
      ...extractHeadAndTail(paragraphs),
    },
    notices: [
      '当前为纯文本模式：可以检查层级序号、用语规范、标点、发文字号、日期写法等文本类规则。',
      '如需检查字体、字号、行距、页边距等版式规则，请上传 .docx 文件——本工具会直接读取文档内部的真实排版参数。',
      '所有解析与检查均在你的浏览器本地完成，文档不会上传到任何服务器。',
    ],
    capabilities: { canReadFont: false, canReadPageSetup: false },
  };
}

/* ------------------------------------------------------------------ */
/* .docx 解析（zip + OOXML）                                            */
/* ------------------------------------------------------------------ */

/**
 * 解析 .docx。
 *
 * 实现说明：.docx 是一个 zip 包，正文位于 word/document.xml。
 * 我们手写一个最小可用的 zip 读取器（只支持 STORE 与 DEFLATE），
 * 再用 DOMParser 解析 XML，避免引入额外依赖、也避免把文件传到服务端。
 */
export async function parseDocx(file: File): Promise<ParseResult> {
  const notices: string[] = [];
  const buf = await file.arrayBuffer();
  const files = await readZip(buf);

  const docXmlBytes = files.get('word/document.xml');
  if (!docXmlBytes) {
    throw new Error('无法在 .docx 中找到 word/document.xml，文件可能已损坏或不是有效的 docx。');
  }

  const xml = new TextDecoder('utf-8').decode(docXmlBytes);
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xml, 'application/xml');

  const ns = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const body = xmlDoc.getElementsByTagNameNS(ns, 'body')[0];
  if (!body) throw new Error('文档正文结构异常，未能定位到 body 节点。');

  const paragraphs: ParagraphModel[] = [];
  let index = 0;

  // 遍历 body 的直接子节点，处理段落与表格
  for (const node of Array.from(body.children)) {
    if (node.namespaceURI !== ns) continue;

    if (node.localName === 'p') {
      index += 1;
      paragraphs.push(parseParagraph(node, index, ns));
    } else if (node.localName === 'tbl') {
      // 表格内容按行展开为段落，标注为正文
      for (const row of Array.from(node.getElementsByTagNameNS(ns, 'tr'))) {
        const cells = Array.from(row.getElementsByTagNameNS(ns, 'tc'));
        const cellTexts = cells.map((c) =>
          Array.from(c.getElementsByTagNameNS(ns, 't'))
            .map((t) => t.textContent ?? '')
            .join('')
            .trim(),
        );
        const line = cellTexts.filter(Boolean).join(' | ');
        if (!line) continue;
        index += 1;
        paragraphs.push({ index, text: line, role: 'body' });
      }
      notices.push('文档中包含表格，表格内容已按行展开参与文本类检查，版式类规则不适用于表格。');
    }
  }

  // 页面设置：sectPr → pgMar / pgSz
  const sectPr = body.getElementsByTagNameNS(ns, 'sectPr')[0];
  let page: DocumentModel['page'];
  if (sectPr) {
    const pgMar = sectPr.getElementsByTagNameNS(ns, 'pgMar')[0];
    const pgSz = sectPr.getElementsByTagNameNS(ns, 'pgSz')[0];
    if (pgMar) {
      // Word 内部单位为 twip（1/20 磅），1 英寸 = 1440 twip = 25.4 mm
      const twipToMm = (v: string) => (Number(v) / 1440) * 25.4;
      page = {
        marginTopMm: twipToMm(pgMar.getAttributeNS(ns, 'top') ?? '1440'),
        marginBottomMm: twipToMm(pgMar.getAttributeNS(ns, 'bottom') ?? '1440'),
        marginLeftMm: twipToMm(pgMar.getAttributeNS(ns, 'left') ?? '1440'),
        marginRightMm: twipToMm(pgMar.getAttributeNS(ns, 'right') ?? '1440'),
        paperSize: pgSz ? describePaper(pgSz.getAttributeNS(ns, 'w'), pgSz.getAttributeNS(ns, 'h')) : undefined,
      };
    }
  }

  if (!page) {
    notices.push('未能从文档中读取页面设置，页边距相关规则已跳过。');
  }

  const filled = paragraphs
    .map((p) => ({ ...p, role: inferRole(p.text, p.index - 1, paragraphs.map((x) => x.text)) }))
    .map((p, i, arr) => refineRoleByFont(p, i, arr));

  return {
    doc: {
      rawText: filled.map((p) => p.text).join('\n'),
      paragraphs: filled,
      page,
      meta: { fileName: file.name, fromDocx: true },
      ...extractHeadAndTail(filled),
    },
    notices: [
      '已读取文档内部的真实排版参数（字体、字号、行距、页边距），版式类规则全部生效。',
      ...notices,
      '解析与检查全部在浏览器本地完成，文件不会离开你的设备。',
    ],
    capabilities: { canReadFont: true, canReadPageSetup: Boolean(page) },
  };
}

/** 解析单个 <w:p>，抽取文本与格式 */
function parseParagraph(p: Element, index: number, ns: string): ParagraphModel {
  const texts: string[] = [];
  let fontSizePt: number | undefined;
  let fontFamilyCn: string | undefined;
  let fontFamilyEn: string | undefined;
  let bold = false;
  let hasBoldFalse = false;

  // 段落级样式（pPr → rPr）作为兜底
  const pPr = p.getElementsByTagNameNS(ns, 'pPr')[0];
  const pStyle = pPr?.getElementsByTagNameNS(ns, 'rPr')[0];
  const paraFont = pStyle ? readRunFont(pStyle, ns) : undefined;
  if (paraFont) {
    fontSizePt = paraFont.sizePt;
    fontFamilyEn = paraFont.fontEn;
    fontFamilyCn = paraFont.fontCn;
    bold = paraFont.bold;
  }

  let lineSpacingPt: number | undefined;
  let firstLineIndentChars: number | undefined;

  if (pPr) {
    const spacing = pPr.getElementsByTagNameNS(ns, 'spacing')[0];
    if (spacing) {
      const line = spacing.getAttributeNS(ns, 'line');
      const rule = spacing.getAttributeNS(ns, 'lineRule');
      if (line) {
        const raw = Number(line);
        // lineRule=auto 时为 1/240 行，exact/atLeast 时为 twip
        if (rule === 'exact' || rule === 'atLeast') {
          lineSpacingPt = raw / 20;
        } else {
          // auto：line 是 240 的倍数，240 = 单倍行距
          // 用字号估算实际磅值
          const size = fontSizePt ?? 10.5;
          lineSpacingPt = Math.round(((raw / 240) * size * 1.3) * 10) / 10;
        }
      }
    }
    const ind = pPr.getElementsByTagNameNS(ns, 'ind')[0];
    if (ind) {
      const firstLine = ind.getAttributeNS(ns, 'firstLine');
      const firstLineChars = ind.getAttributeNS(ns, 'firstLineChars');
      if (firstLineChars) {
        firstLineIndentChars = Number(firstLineChars) / 100;
      } else if (firstLine) {
        // twip → 字符数：3 号字 = 16 磅 = 320 twip/字
        const sizePt = fontSizePt ?? 16;
        firstLineIndentChars =
          Math.round((Number(firstLine) / 20 / sizePt) * 10) / 10;
      }
      const hanging = ind.getAttributeNS(ns, 'hanging');
      if (hanging) firstLineIndentChars = 0;
    }
  }

  // 逐 run 读取，取正文主要字体（出现次数最多的中文字体）
  const fontVotes = new Map<string, number>();
  for (const r of Array.from(p.getElementsByTagNameNS(ns, 'r'))) {
    const rPr = r.getElementsByTagNameNS(ns, 'rPr')[0];
    const t = r.getElementsByTagNameNS(ns, 't')[0];
    if (t?.textContent) texts.push(t.textContent);

    if (!rPr) continue;
    const f = readRunFont(rPr, ns);
    if (f?.cn) fontVotes.set(f.cn, (fontVotes.get(f.cn) ?? 0) + 1);
    if (f?.sizePt !== undefined && fontSizePt === undefined) fontSizePt = f.sizePt;
    if (f?.cn && !fontFamilyCn) fontFamilyCn = f.cn;
    if (f?.en && !fontFamilyEn) fontFamilyEn = f.en;
    if (f?.bold === true) bold = true;
    if (f?.bold === false) hasBoldFalse = true;
  }

  // 以出现最多的字体为准
  if (fontVotes.size > 0) {
    fontFamilyCn = [...fontVotes.entries()].sort((a, b) => b[1] - a[1])[0][0];
  }

  const text = texts.join('');

  return {
    index,
    text,
    role: 'unknown',
    fontSizePt,
    fontFamilyCn,
    fontFamilyEn,
    bold: bold && !hasBoldFalse ? true : bold || undefined,
    lineSpacingPt,
    firstLineIndentChars,
  };
}

/** 从 rPr 中读取字体信息 */
function readRunFont(rPr: Element, ns: string) {
  const rFonts = rPr.getElementsByTagNameNS(ns, 'rFonts')[0];
  const sz = rPr.getElementsByTagNameNS(ns, 'sz')[0];
  const b = rPr.getElementsByTagNameNS(ns, 'b')[0];

  let fontCn: string | undefined;
  let fontEn: string | undefined;
  if (rFonts) {
    fontCn =
      rFonts.getAttributeNS(ns, 'eastAsia') ??
      rFonts.getAttributeNS(ns, 'ascii') ??
      undefined;
    fontEn = rFonts.getAttributeNS(ns, 'ascii') ?? undefined;
  }

  return {
    cn: fontCn,
    en: fontEn,
    // w:sz 单位为半磅
    sizePt: sz ? Number(sz.getAttributeNS(ns, 'val')) / 2 : undefined,
    bold: b ? b.getAttributeNS(ns, 'val') !== '0' : undefined,
  };
}

function describePaper(w?: string | null, h?: string | null): string | undefined {
  if (!w || !h) return undefined;
  const wMm = (Number(w) / 1440) * 25.4;
  const hMm = (Number(h) / 1440) * 25.4;
  const near = (a: number, b: number) => Math.abs(a - b) < 3;
  if (near(wMm, 210) && near(hMm, 297)) return 'A4（210 mm × 297 mm）';
  if (near(wMm, 297) && near(hMm, 420)) return 'A3（297 mm × 420 mm）';
  return `${wMm.toFixed(0)} mm × ${hMm.toFixed(0)} mm`;
}

/* ------------------------------------------------------------------ */
/* 最小 zip 读取器                                                     */
/* ------------------------------------------------------------------ */

async function readZip(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  const out = new Map<string, Uint8Array>();

  // 从尾部向前找 End of Central Directory (EOCD, 0x06054b50)
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效的 zip/docx：未找到目录结构。');

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  for (let n = 0; n < entryCount; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) break;
    const method = view.getUint16(offset + 10, true);
    const compSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder('utf-8').decode(bytes.subarray(offset + 46, offset + 46 + nameLen));

    // 定位到本地文件头，跳过自己的 name/extra
    const lNameLen = view.getUint16(localOffset + 26, true);
    const lExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const raw = bytes.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      out.set(name, raw);
    } else if (method === 8) {
      out.set(name, await inflateRaw(raw));
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  return out;
}

/** 用浏览器原生 DecompressionStream 解 DEFLATE，无需第三方库 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS = (globalThis as unknown as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (!DS) {
    throw new Error('当前浏览器不支持 DecompressionStream，无法解压 docx。请升级到较新版本的 Chrome / Edge / Safari。');
  }
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DS('deflate-raw'));
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

/* ------------------------------------------------------------------ */
/* 角色推断                                                            */
/* ------------------------------------------------------------------ */

function inferRole(text: string, i: number, all: string[]): ParagraphRole {
  const isFirstText = i === 0;
  const looksLikeTitle =
    isFirstText &&
    text.length <= 40 &&
    !/^[（(]/.test(text) &&
    !/[。；]$/.test(text) &&
    !/^附件/.test(text);

  if (looksLikeTitle) return 'title';

  // 主送机关：以冒号结尾、较短、位于文档前部
  if (i <= 3 && i > 0 && /[：:]$/.test(text) && text.length <= 30 && !/^附件/.test(text)) {
    return 'recipient';
  }

  if (/^附件\s*[:：]/.test(text)) return 'attachmentNote';

  // 成文日期：汉字数字日期或阿拉伯数字日期，且段落很短
  if (text.length <= 24 && /(二[〇零○]|19|20)\d{0,2}\s*年.*[月].*[日号]/.test(text.replace(/\s/g, ''))) {
    return 'date';
  }

  // 发文机关署名：极短且不含标点，多为「××大学××协会」
  if (text.length <= 30 && !/[。；，、：]/.test(text) && /(大学|学院|协会|团委|学生会|委员会|办公室|部)$/.test(text)) {
    return 'signature';
  }

  const level = detectHeadingLevel(text);
  if (level === 1) return 'heading1';
  if (level === 2) return 'heading2';
  if (level === 3) return 'heading3';
  if (level === 4) return 'heading4';

  // 标题化的加粗短句（无序号但像小标题）
  if (text.length <= 24 && !/[。；]$/.test(text) && i > 0 && /^(关于|关于做好|关于召开|关于举办)/.test(text)) {
    return 'title';
  }

  return 'body';
}

/** 用字体信息修正角色：小标宋→标题，黑体→一级，楷体→二级 */
function refineRoleByFont(
  p: ParagraphModel,
  i: number,
  all: ParagraphModel[],
): ParagraphModel {
  const f = p.fontFamilyCn ?? '';
  if (/小标宋/.test(f) && p.role === 'body') {
    return { ...p, role: 'title' };
  }
  if (/黑体/.test(f) && (p.role === 'body' || p.role === 'unknown')) {
    return { ...p, role: 'heading1' };
  }
  if (/楷体/.test(f) && (p.role === 'body' || p.role === 'unknown')) {
    return { ...p, role: 'heading2' };
  }
  if (p.role === 'unknown') return { ...p, role: 'body' };
  return p;
}

/** 抽取版头与附件等文档级信息 */
function extractHeadAndTail(paragraphs: ParagraphModel[]): Partial<DocumentModel> {
  const head: DocumentModel['head'] = {};
  const documents: string[] = [];

  for (const p of paragraphs.slice(0, 12)) {
    const t = p.text.trim();
    // 发文字号：机关代字 + 〔年份〕 + 序号 + 号
    const m = t.match(/([\u4e00-\u9fa5]{2,12})\s*[〔\[（(]\s*(\d{4})\s*[〕\]）)]\s*(?:第\s*)?(\d+)\s*号/);
    if (m && !head.documentNumber) {
      head.documentNumber = t;
    }
    // 发文机关标志：单独一行、以「文件」结尾
    if (/文件$/.test(t) && t.length <= 24 && !head.issuerMark) {
      head.issuerMark = t;
    }
  }

  for (const p of paragraphs) {
    if (p.role === 'attachmentNote') documents.push(p.text.trim());
  }

  const datePara = paragraphs.find((p) => p.role === 'date');
  const issueDate = datePara ? normalizeDate(datePara.text) : undefined;

  return {
    head: Object.keys(head).length ? head : undefined,
    attachments: documents.length ? documents : undefined,
    issueDate,
  };
}

/** 把汉字日期归一为 ISO 字符串，便于跨年比对 */
export function normalizeDate(text: string): string | undefined {
  const t = text.replace(/\s/g, '');
  // 注意：〇 与 ○ 不是合法的 JS 标识符，必须写成带引号的键
  const cn: Record<string, string> = {
    '〇': '0', '○': '0', '零': '0', '一': '1', '二': '2', '三': '3', '四': '4',
    '五': '5', '六': '6', '七': '7', '八': '8', '九': '9', '十': '10',
  };
  const cnMatch = t.match(/^([〇○零一二三四五六七八九十]{2,4})年([〇○零一二三四五六七八九十]{1,3})月([〇○零一二三四五六七八九十]{1,3})日/);
  if (cnMatch) {
    const toNum = (s: string) => {
      if (/^[〇○零一二三四五六七八九十]+$/.test(s) && s.length > 1 && !/[十]/.test(s)) {
        return s.split('').map((c) => cn[c] ?? '').join('');
      }
      return String(toChineseToNumber(s));
    };
    const y = toNum(cnMatch[1]);
    const m = toNum(cnMatch[2]);
    const d = toNum(cnMatch[3]);
    if (y.length === 4) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }
  const arMatch = t.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (arMatch) {
    return `${arMatch[1]}-${arMatch[2].padStart(2, '0')}-${arMatch[3].padStart(2, '0')}`;
  }
  return undefined;
}

function toChineseToNumber(s: string): number {
  const digits: Record<string, number> = {
    '〇': 0, '○': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4,
    '五': 5, '六': 6, '七': 7, '八': 8, '九': 9,
  };
  if (s === '十') return 10;
  if (s.length === 1) return digits[s] ?? 0;
  if (s.startsWith('十')) return 10 + (digits[s[1]] ?? 0);
  if (s.includes('十')) {
    const [a, b] = s.split('十');
    return (digits[a] ?? 1) * 10 + (b ? digits[b] ?? 0 : 0);
  }
  return digits[s] ?? 0;
}

/** 统一入口：根据输入类型选择解析器 */
export async function parseInput(input: { text?: string; file?: File }): Promise<ParseResult> {
  if (input.file) {
    const name = input.file.name.toLowerCase();
    if (name.endsWith('.docx')) return parseDocx(input.file);
    if (name.endsWith('.doc')) {
      throw new Error('旧版 .doc 为二进制格式，浏览器无法直接解析。请在 Word 中另存为 .docx 后重新上传。');
    }
    // 其他文本文件按纯文本处理
    const text = await input.file.text();
    return parsePlainText(text, input.file.name);
  }
  return parsePlainText(input.text ?? '');
}
