import { describe, expect, it } from 'vitest';
import { applyFixes, buildReport, isLayoutIssue } from './official-document.fixer';
import { checkDocument } from './official-document.rules';
import type { DocumentModel } from './official-document.rules';

function docWith(rawText: string, partial: Partial<DocumentModel> = {}): DocumentModel {
  return {
    rawText,
    paragraphs: rawText.split('\n').map((t, i) => ({ index: i + 1, text: t.trim(), role: 'body' as const })),
    ...partial,
  };
}

describe('official-document.fixer', () => {
  describe('版式问题判定', () => {
    it('字体字号行距页边距属于版式问题', () => {
      const v = checkDocument(
        docWith('正文。', {}),
      ).violations.find((x) => x.ruleId === 'STR-001')!;
      expect(isLayoutIssue(v)).toBe(true);
    });

    it('标点用语属于文本问题', () => {
      const r = checkDocument(docWith('第一,第二。'));
      const v = r.violations.find((x) => x.ruleId === 'PUN-001')!;
      expect(isLayoutIssue(v)).toBe(false);
    });
  });

  describe('一键修复', () => {
    it('修复半角标点', () => {
      const text = '第一,第二;第三。';
      const r = checkDocument(docWith(text));
      const fix = applyFixes(text, r.violations);
      expect(fix.text).toBe('第一，第二；第三。');
      expect(fix.applied).toBeGreaterThan(0);
    });

    it('修复三级序号半角点号为全角', () => {
      const text = '1. 实施步骤';
      const r = checkDocument(docWith(text));
      const fix = applyFixes(text, r.violations);
      expect(fix.text).toContain('1．');
      expect(fix.text).not.toContain('1. ');
    });

    it('修复发文字号：方括号→六角括号、去第、去虚位', () => {
      const text = '校团字[2026]第 005 号';
      const r = checkDocument(docWith(text, { head: { documentNumber: text } }));
      const fix = applyFixes(text, r.violations);
      expect(fix.text).toContain('〔2026〕');
      expect(fix.text).not.toContain('第');
      expect(fix.text).not.toContain('005');
    });

    it('阿拉伯数字日期改为汉字', () => {
      const text = '2026年10月1日';
      const r = checkDocument(
        docWith(text, {
          paragraphs: [{ index: 1, text, role: 'date' }],
        }),
      );
      const fix = applyFixes(text, r.violations);
      expect(fix.text).toBe('二〇二六年十月一日');
    });

    it('中文括号半角转全角', () => {
      const text = '现将有关事项（详见附件）通知如下。（见附件1）';
      const withHalf = '现将有关事项(详见附件)通知如下。';
      const r = checkDocument(docWith(withHalf));
      const fix = applyFixes(withHalf, r.violations);
      expect(fix.text).toBe('现将有关事项（详见附件）通知如下。');
    });

    it('版式问题不修改文本，而是给出 Word 操作指引', () => {
      const text = '正文。';
      const r = checkDocument(
        docWith(text, {
          paragraphs: [{ index: 1, text, role: 'body', fontFamilyCn: '宋体', fontSizePt: 10.5 }],
        }),
      );
      const fix = applyFixes(text, r.violations);
      expect(fix.manual.length).toBeGreaterThan(0);
      expect(fix.manual.some((m) => m.guide.includes('Word'))).toBe(true);
    });

    it('不改动无法确定的内容', () => {
      const text = '会议定于 12:30 开始,请联系 admin@school.edu.cn。';
      const r = checkDocument(docWith(text));
      const fix = applyFixes(text, r.violations);
      // 时间与邮箱不应被破坏
      expect(fix.text).toContain('12:30');
      expect(fix.text).toContain('admin@school.edu.cn');
    });
  });

  describe('报告生成', () => {
    it('生成包含得分与依据的 Markdown 报告', () => {
      const r = checkDocument(
        docWith('第一,第二。', {
          paragraphs: [{ index: 1, text: '第一,第二。', role: 'body', fontFamilyCn: '宋体' }],
        }),
      );
      const md = buildReport(r, '测试通知.docx');
      expect(md).toContain('# 公文格式检查报告');
      expect(md).toContain('测试通知.docx');
      expect(md).toContain('GB/T 9704-2012');
      expect(md).toContain('**依据**');
      expect(md).toContain('GPL-3.0');
    });

    it('无问题时报告说明合规', () => {
      const r = checkDocument(
        docWith('二〇二六年九月二十八日', {
          page: { marginTopMm: 37, marginLeftMm: 28 },
          paragraphs: [
            { index: 1, text: '关于开展招新工作的通知', role: 'title', fontFamilyCn: '方正小标宋简体', fontSizePt: 22 },
            { index: 2, text: '各学院学生分会：', role: 'recipient' },
            { index: 3, text: '为进一步丰富校园文化生活，现将有关事项通知如下。', role: 'body', fontFamilyCn: '仿宋_GB2312', fontSizePt: 16, lineSpacingPt: 28, firstLineIndentChars: 2 },
            { index: 4, text: '校团委', role: 'signature' },
            { index: 5, text: '二〇二六年九月二十八日', role: 'date' },
          ],
        }),
      );
      const md = buildReport(r);
      expect(r.total).toBe(0);
      expect(md).toContain('未发现格式问题');
    });
  });
});
