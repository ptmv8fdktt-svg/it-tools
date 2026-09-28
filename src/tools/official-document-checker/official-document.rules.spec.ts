import { describe, expect, it } from 'vitest';
import type { DocumentModel, ParagraphModel } from './official-document.rules';
import { checkDocument, detectHeadingLevel, normalizeFontName, toChineseNumeral } from './official-document.rules';

function p(partial: Partial<ParagraphModel> & { text: string; index: number }): ParagraphModel {
  return { role: 'body', ...partial };
}

function doc(partial: Partial<DocumentModel>): DocumentModel {
  return { rawText: '', paragraphs: [], ...partial };
}

describe('official-document.rules', () => {
  describe('工具函数', () => {
    it('字体别名归一化', () => {
      expect(normalizeFontName('仿宋')).toBe('仿宋_GB2312');
      expect(normalizeFontName('FangSong')).toBe('仿宋_GB2312');
      expect(normalizeFontName('楷体')).toBe('楷体_GB2312');
      expect(normalizeFontName('黑体')).toBe('黑体');
    });

    it('识别四级层级序号', () => {
      expect(detectHeadingLevel('一、总体要求')).toBe(1);
      expect(detectHeadingLevel('（一）工作目标')).toBe(2);
      expect(detectHeadingLevel('1．实施步骤')).toBe(3);
      expect(detectHeadingLevel('（1）具体安排')).toBe(4);
      expect(detectHeadingLevel('这是一段正文。')).toBe(0);
      // 半角点号不应被识别为合规三级序号
      expect(detectHeadingLevel('1. 实施步骤')).toBe(0);
    });

    it('汉字数字转换', () => {
      expect(toChineseNumeral(3)).toBe('三');
      expect(toChineseNumeral(10)).toBe('十');
      expect(toChineseNumeral(15)).toBe('十五');
      expect(toChineseNumeral(28)).toBe('二十八');
    });
  });

  describe('页面设置规则 FMT-001', () => {
    it('页边距合规时通过', () => {
      const r = checkDocument(
        doc({
          page: { marginTopMm: 37, marginLeftMm: 28 },
          paragraphs: [p({ index: 1, text: '正文', role: 'body' })],
        }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'FMT-001')).toHaveLength(0);
    });

    it('页边距不合规时报错并给出具体数值', () => {
      const r = checkDocument(
        doc({
          page: { marginTopMm: 25.4, marginLeftMm: 31.8 },
          paragraphs: [p({ index: 1, text: '正文', role: 'body' })],
        }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'FMT-001');
      expect(hits).toHaveLength(2);
      expect(hits[0].message).toContain('37');
      expect(hits[0].severity).toBe('error');
    });
  });

  describe('字体字号规则', () => {
    it('正文使用仿宋三号时通过', () => {
      const r = checkDocument(
        doc({
          paragraphs: [p({ index: 1, text: '正文内容。', role: 'body', fontFamilyCn: '仿宋_GB2312', fontSizePt: 16 })],
        }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'FMT-010')).toHaveLength(0);
    });

    it('正文误用宋体五号时报错', () => {
      const r = checkDocument(
        doc({
          paragraphs: [p({ index: 1, text: '正文内容。', role: 'body', fontFamilyCn: '宋体', fontSizePt: 10.5 })],
        }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'FMT-010');
      expect(hits).toHaveLength(2); // 字体 + 字号
      expect(hits.every((h) => h.autoFixable)).toBe(true);
    });

    it('一级标题应使用黑体，用楷体时报错', () => {
      const r = checkDocument(
        doc({
          paragraphs: [p({ index: 1, text: '一、总体要求', role: 'heading1', fontFamilyCn: '楷体_GB2312' })],
        }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'FMT-011');
      expect(hits).toHaveLength(1);
      expect(hits[0].suggestion).toContain('黑体');
    });

    it('行距非 28 磅时给出建议', () => {
      const r = checkDocument(
        doc({
          paragraphs: [p({ index: 1, text: '正文。', role: 'body', lineSpacingPt: 20 })],
        }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'FMT-012');
      expect(hits).toHaveLength(1);
      expect(hits[0].severity).toBe('warn');
    });

    it('首行未缩进 2 字符时给出建议', () => {
      const r = checkDocument(
        doc({
          paragraphs: [p({ index: 1, text: '正文。', role: 'body', firstLineIndentChars: 0 })],
        }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'FMT-013')).toHaveLength(1);
    });
  });

  describe('标题规则 STR-001', () => {
    it('缺少标题时报错', () => {
      const r = checkDocument(doc({ paragraphs: [p({ index: 1, text: '正文。', role: 'body' })] }));
      expect(r.violations.filter((v) => v.ruleId === 'STR-001')).toHaveLength(1);
    });

    it('标题字体正确时通过', () => {
      const r = checkDocument(
        doc({
          paragraphs: [
            p({ index: 1, text: '关于开展招新工作的通知', role: 'title', fontFamilyCn: '方正小标宋简体', fontSizePt: 22 }),
          ],
        }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-001')).toHaveLength(0);
    });
  });

  describe('发文字号规则 STR-002', () => {
    it('使用六角括号且无第、无虚位时通过', () => {
      const r = checkDocument(
        doc({
          head: { documentNumber: '校团字〔2026〕5 号' },
          paragraphs: [],
        }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-002')).toHaveLength(0);
    });

    it('方括号、「第」字、虚位均应报错', () => {
      const r = checkDocument(doc({ head: { documentNumber: '校团字[2026]第 005 号' }, paragraphs: [] }));
      const hits = r.violations.filter((v) => v.ruleId === 'STR-002');
      expect(hits.length).toBeGreaterThanOrEqual(2);
      expect(hits.map((h) => h.title).join()).toContain('六角括号');
    });
  });

  describe('层级序号规则 STR-003', () => {
    it('合规序号通过', () => {
      const r = checkDocument(
        doc({
          paragraphs: [
            p({ index: 1, text: '一、总体要求', role: 'heading1' }),
            p({ index: 2, text: '（一）工作目标', role: 'heading2' }),
            p({ index: 3, text: '1．实施步骤', role: 'heading3' }),
          ],
        }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-003')).toHaveLength(0);
    });

    it('三级序号用半角点号时报错并可修复', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '1. 实施步骤', role: 'heading3' })] }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'STR-003');
      expect(hits).toHaveLength(1);
      expect(hits[0].autoFixable).toBe(true);
      expect(hits[0].message).toContain('半角点号');
    });

    it('一级序号误用点号时报错', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '一. 总体要求', role: 'heading1' })] }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-003').length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('成文日期规则 STR-004', () => {
    it('汉字日期通过', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '二〇二六年九月二十八日', role: 'date' })] }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-004')).toHaveLength(0);
    });

    it('阿拉伯数字日期报错', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '2026年10月1日', role: 'date' })] }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'STR-004');
      expect(hits).toHaveLength(1);
      expect(hits[0].autoFixable).toBe(true);
    });

    it('年份用「零」而非「〇」时给出提醒', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '二零二六年九月二十八日', role: 'date' })] }),
      );
      expect(r.violations.some((v) => v.ruleId === 'STR-004')).toBe(true);
    });
  });

  describe('附件说明规则 STR-005', () => {
    it('规范附件说明通过', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '附件：1.招新申请表', role: 'attachmentNote' })] }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-005')).toHaveLength(0);
    });

    it('未以「附件：」开头时报错', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '附招新申请表一份', role: 'attachmentNote' })] }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'STR-005')).toHaveLength(1);
    });

    it('多个附件未编号时报错', () => {
      const r = checkDocument(
        doc({
          paragraphs: [
            p({ index: 1, text: '附件：招新申请表', role: 'attachmentNote' }),
            p({ index: 2, text: '附件：系统操作说明', role: 'attachmentNote' }),
          ],
        }),
      );
      expect(r.violations.some((v) => v.ruleId === 'STR-005' && v.title.includes('序号'))).toBe(true);
    });
  });

  describe('标点符号规则', () => {
    it('中文后接半角逗号时报错', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '第一,第二,第三。', role: 'body' })] }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'PUN-001')).toHaveLength(1);
    });

    it('英文与数字中的半角标点不误报', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: 'Call the API at 12:30, then retry.', role: 'body' })] }),
      );
      expect(r.violations.filter((v) => v.ruleId === 'PUN-001')).toHaveLength(0);
    });

    it('括号不配对时报错', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '现将有关事项（详见附件通知如下。', role: 'body' })] }),
      );
      expect(r.violations.some((v) => v.ruleId === 'PUN-002')).toBe(true);
    });
  });

  describe('用语规范规则 SAY-001', () => {
    it('识别口语化用词', () => {
      const r = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '咱们各社团请及时提交材料。', role: 'body' })] }),
      );
      const hits = r.violations.filter((v) => v.ruleId === 'SAY-001');
      expect(hits).toHaveLength(1);
      expect(hits[0].message).toContain('咱们');
    });
  });

  describe('评分机制', () => {
    it('完全合规的文档得满分', () => {
      const r = checkDocument(
        doc({
          page: { marginTopMm: 37, marginLeftMm: 28 },
          paragraphs: [
            p({ index: 1, text: '关于开展招新工作的通知', role: 'title', fontFamilyCn: '方正小标宋简体', fontSizePt: 22 }),
            p({ index: 2, text: '各学院学生分会：', role: 'recipient' }),
            p({ index: 3, text: '为进一步丰富校园文化生活，现将有关事项通知如下。', role: 'body', fontFamilyCn: '仿宋_GB2312', fontSizePt: 16, lineSpacingPt: 28, firstLineIndentChars: 2 }),
            p({ index: 4, text: '校团委', role: 'signature' }),
            p({ index: 5, text: '二〇二六年九月二十八日', role: 'date' }),
          ],
        }),
      );
      expect(r.score).toBe(100);
      expect(r.bySeverity.error).toBe(0);
    });

    it('问题越多得分越低，且同一规则重复命中做边际递减', () => {
      const many = checkDocument(
        doc({
          paragraphs: Array.from({ length: 10 }, (_, i) =>
            p({ index: i + 1, text: `第${i + 1}段正文。`, role: 'body', fontFamilyCn: '宋体', fontSizePt: 10.5 })),
        }),
      );
      const few = checkDocument(
        doc({ paragraphs: [p({ index: 1, text: '正文。', role: 'body', fontFamilyCn: '宋体', fontSizePt: 10.5 })] }),
      );
      expect(many.score).toBeLessThan(few.score);
      expect(many.score).toBeGreaterThanOrEqual(0);
    });

    it('得分不会为负', () => {
      const r = checkDocument(
        doc({
          page: { marginTopMm: 10, marginLeftMm: 10 },
          paragraphs: Array.from({ length: 30 }, (_, i) =>
            p({ index: i + 1, text: '一. 咱们搞一下这个事,行不行', role: 'body', fontFamilyCn: '宋体', fontSizePt: 9, lineSpacingPt: 10, firstLineIndentChars: 0 })),
        }),
      );
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThan(50);
    });

    it('统计维度正确', () => {
      const r = checkDocument(
        doc({
          paragraphs: [
            p({ index: 1, text: '正文。', role: 'body', fontFamilyCn: '宋体', fontSizePt: 10.5 }),
          ],
        }),
      );
      expect(r.total).toBe(r.violations.length);
      expect(r.bySeverity.error + r.bySeverity.warn + r.bySeverity.info).toBe(r.total);
      expect(r.applicable).toBeGreaterThan(0);
    });
  });
});
