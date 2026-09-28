import { describe, expect, it } from 'vitest';
import { parsePlainText, normalizeDate } from './official-document.parser';

describe('official-document.parser', () => {
  describe('纯文本解析', () => {
    it('推断段落角色', () => {
      const text = [
        '关于开展 2026 年秋季学期学生社团集中招新工作的通知',
        '各学院学生分会：',
        '　　为进一步丰富校园文化生活，现将有关事项通知如下：',
        '一、活动时间',
        '2026 年 10 月 12 日至 10 月 14 日。',
        '附件：1.招新申请表',
        '校团委学生社团联合会',
        '二〇二六年九月二十八日',
      ].join('\n');

      const { doc, capabilities } = parsePlainText(text);
      const roles = doc.paragraphs.map((p) => p.role);

      expect(roles[0]).toBe('title');
      expect(roles[1]).toBe('recipient');
      expect(roles[2]).toBe('body');
      expect(roles[3]).toBe('heading1');
      expect(roles[5]).toBe('attachmentNote');
      expect(roles[6]).toBe('signature');
      expect(roles[7]).toBe('date');

      // 纯文本模式拿不到字体信息
      expect(capabilities.canReadFont).toBe(false);
      expect(capabilities.canReadPageSetup).toBe(false);
    });

    it('抽取发文字号', () => {
      const text = ['校团字〔2026〕5 号', '关于开展招新工作的通知', '各学院学生分会：', '正文内容。'].join('\n');
      const { doc } = parsePlainText(text);
      expect(doc.head?.documentNumber).toBe('校团字〔2026〕5 号');
    });

    it('抽取附件说明列表', () => {
      const text = ['通知', '附件：1.申请表', '附件：2.操作说明'].join('\n');
      const { doc } = parsePlainText(text);
      expect(doc.attachments).toHaveLength(2);
    });

    it('忽略空行与全角空格', () => {
      const text = ['标题', '', '　　', '正文。'].join('\n');
      const { doc } = parsePlainText(text);
      expect(doc.paragraphs).toHaveLength(2);
    });

    it('给出能力范围说明', () => {
      const { notices } = parsePlainText('标题\n正文。');
      expect(notices.some((n) => n.includes('本地'))).toBe(true);
      expect(notices.some((n) => n.includes('.docx'))).toBe(true);
    });
  });

  describe('日期归一化', () => {
    it('汉字日期', () => {
      expect(normalizeDate('二〇二六年九月二十八日')).toBe('2026-09-28');
      expect(normalizeDate('二〇二六年十月一日')).toBe('2026-10-01');
    });

    it('阿拉伯数字日期', () => {
      expect(normalizeDate('2026年10月1日')).toBe('2026-10-01');
      expect(normalizeDate('2026年1月9日')).toBe('2026-01-09');
    });

    it('非日期文本返回 undefined', () => {
      expect(normalizeDate('正文内容')).toBeUndefined();
      expect(normalizeDate('联系电话 12345678')).toBeUndefined();
    });
  });

  describe('层级识别与 parser 协作', () => {
    it('四级序号均被正确识别', () => {
      const text = ['标题', '一、总体要求', '（一）工作目标', '1．实施步骤', '（1）具体安排'].join('\n');
      const { doc } = parsePlainText(text);
      expect(doc.paragraphs[1].role).toBe('heading1');
      expect(doc.paragraphs[2].role).toBe('heading2');
      expect(doc.paragraphs[3].role).toBe('heading3');
      expect(doc.paragraphs[4].role).toBe('heading4');
    });
  });
});
