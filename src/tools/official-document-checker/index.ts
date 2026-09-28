import { FileCheck } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.official-document-checker.title'),
  path: '/official-document-checker',
  description: translate('tools.official-document-checker.description'),
  keywords: [
    '公文',
    '格式',
    '校验',
    '检查',
    'GB/T 9704',
    '党政机关公文格式',
    '通知',
    '红头文件',
    '发文字号',
    '成文日期',
    '仿宋',
    '黑体',
    '小标宋',
    '行距',
    '页边距',
    'word',
    'docx',
    '排版',
    'document',
    'official document',
    'format check',
    'gbt9704',
    'gongwen',
    'gongwen geshi',
  ],
  component: () => import('./official-document-checker.vue'),
  icon: FileCheck,
  createdAt: new Date('2026-09-28'),
});
