import { CalendarStats } from '@vicons/tabler';
import { defineTool } from '../tool';
import { translate } from '@/plugins/i18n.plugin';

export const tool = defineTool({
  name: translate('tools.timetable-conflict-checker.title'),
  path: '/timetable-conflict-checker',
  description: translate('tools.timetable-conflict-checker.description'),
  keywords: [
    '课表',
    '课程表',
    '冲突',
    '撞课',
    '空闲',
    '空闲时段',
    '排课',
    '教务',
    '选课',
    '例会',
    '社团',
    '时间管理',
    '多人',
    '约时间',
    'timetable',
    'schedule',
    'conflict',
    'free time',
  ],
  component: () => import('./timetable-conflict-checker.vue'),
  icon: CalendarStats,
  createdAt: new Date('2026-09-28'),
});
