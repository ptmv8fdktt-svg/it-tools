import { describe, expect, it } from 'vitest';
import type { Course } from './timetable-conflict.models';
import {
  buildAdvice,
  computeFreeSlots,
  computeStats,
  detectConflicts,
  parseCourses,
  toHHMM,
  toMinutes,
} from './timetable-conflict.models';

function c(partial: Partial<Course> & { weekday: number; start: string; end: string }): Course {
  return { id: Math.random().toString(36), name: '课程', ...partial };
}

describe('timetable-conflict.models', () => {
  describe('时间工具', () => {
    it('解析 HH:mm', () => {
      expect(toMinutes('08:00')).toBe(480);
      expect(toMinutes('13:30')).toBe(810);
      expect(toMinutes('9:05')).toBe(545);
    });

    it('容忍全角冒号与点号', () => {
      expect(toMinutes('08：00')).toBe(480);
      expect(toMinutes('8.30')).toBe(510);
    });

    it('非法输入返回 NaN', () => {
      expect(Number.isNaN(toMinutes('abc'))).toBe(true);
      expect(Number.isNaN(toMinutes('25:00'))).toBe(true);
    });

    it('分钟转 HH:mm', () => {
      expect(toHHMM(480)).toBe('08:00');
      expect(toHHMM(810)).toBe('13:30');
    });
  });

  describe('冲突检测', () => {
    it('无冲突时返回空', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40', name: '高数' }),
        c({ weekday: 1, start: '10:00', end: '11:40', name: '物理' }),
      ];
      expect(detectConflicts(courses)).toHaveLength(0);
    });

    it('完全重叠判定为 exact', () => {
      const courses = [
        c({ weekday: 3, start: '13:30', end: '15:10', name: '线性代数' }),
        c({ weekday: 3, start: '13:30', end: '15:10', name: '英语听说' }),
      ];
      const conflicts = detectConflicts(courses);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('exact');
      expect(conflicts[0].overlapMinutes).toBe(100);
    });

    it('部分重叠判定为 partial 并给出重叠分钟数', () => {
      const courses = [
        c({ weekday: 2, start: '08:00', end: '10:00', name: 'A' }),
        c({ weekday: 2, start: '09:00', end: '11:00', name: 'B' }),
      ];
      const conflicts = detectConflicts(courses);
      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].type).toBe('partial');
      expect(conflicts[0].overlapMinutes).toBe(60);
    });

    it('首尾相接不算冲突', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40', name: 'A' }),
        c({ weekday: 1, start: '09:40', end: '11:20', name: 'B' }),
      ];
      expect(detectConflicts(courses)).toHaveLength(0);
    });

    it('不同星期的相同时段不算冲突', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40', name: 'A' }),
        c({ weekday: 2, start: '08:00', end: '09:40', name: 'B' }),
      ];
      expect(detectConflicts(courses)).toHaveLength(0);
    });

    it('不同人的课程不互相判冲突', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40', name: 'A', owner: '我' }),
        c({ weekday: 1, start: '08:00', end: '09:40', name: 'B', owner: '同学' }),
      ];
      expect(detectConflicts(courses)).toHaveLength(0);
    });

    it('三门课互相重叠时给出全部冲突对', () => {
      const courses = [
        c({ weekday: 4, start: '08:00', end: '10:00', name: 'A' }),
        c({ weekday: 4, start: '08:30', end: '10:30', name: 'B' }),
        c({ weekday: 4, start: '09:00', end: '11:00', name: 'C' }),
      ];
      expect(detectConflicts(courses)).toHaveLength(3);
    });
  });

  describe('空闲时段计算', () => {
    it('无课时全天都空闲', () => {
      const slots = computeFreeSlots([], 'workday', { start: '08:00', end: '22:00' }, 30);
      expect(slots).toHaveLength(5);
      expect(slots[0].minutes).toBe(14 * 60);
    });

    it('课程之间的空档被正确切分', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40' }),
        c({ weekday: 1, start: '10:00', end: '11:40' }),
      ];
      const slots = computeFreeSlots(courses, 'workday', { start: '08:00', end: '22:00' }, 10);
      const monday = slots.filter((s) => s.weekday === 1);
      expect(monday).toHaveLength(2);
      expect(monday[0].start).toBe('09:40');
      expect(monday[0].end).toBe('10:00');
      expect(monday[0].minutes).toBe(20);
      expect(monday[1].start).toBe('11:40');
      expect(monday[1].end).toBe('22:00');
    });

    it('过滤掉碎片时间', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40' }),
        c({ weekday: 1, start: '10:00', end: '11:40' }),
      ];
      const slots = computeFreeSlots(courses, 'workday', { start: '08:00', end: '22:00' }, 30);
      // 20 分钟的空档应被过滤
      expect(slots.filter((s) => s.weekday === 1)).toHaveLength(1);
    });

    it('重叠课程先合并再计算', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '10:00' }),
        c({ weekday: 1, start: '09:00', end: '11:00' }),
      ];
      const slots = computeFreeSlots(courses, 'workday', { start: '08:00', end: '22:00' }, 10);
      const monday = slots.filter((s) => s.weekday === 1);
      expect(monday).toHaveLength(1);
      expect(monday[0].start).toBe('11:00');
    });

    it('fullweek 模式包含周末', () => {
      const slots = computeFreeSlots([], 'fullweek', { start: '08:00', end: '22:00' }, 30);
      expect(slots).toHaveLength(7);
    });

    it('课程跨越作息边界时不产生负时长', () => {
      const courses = [c({ weekday: 1, start: '07:00', end: '23:00' })];
      const slots = computeFreeSlots(courses, 'workday', { start: '08:00', end: '22:00' }, 10);
      expect(slots.filter((s) => s.weekday === 1)).toHaveLength(0);
      expect(slots.every((s) => s.minutes > 0)).toBe(true);
    });
  });

  describe('统计', () => {
    it('统计课程数与课时', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40' }),
        c({ weekday: 2, start: '10:00', end: '11:40' }),
      ];
      const s = computeStats(courses, 'workday');
      expect(s.totalCourses).toBe(2);
      expect(s.totalClassMinutes).toBe(200);
      expect(s.freeMinutes).toBe(5 * 840 - 200);
    });

    it('识别最忙的一天', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40' }),
        c({ weekday: 3, start: '08:00', end: '12:00' }),
        c({ weekday: 3, start: '13:30', end: '17:00' }),
      ];
      const s = computeStats(courses, 'workday');
      expect(s.busiestDay?.weekday).toBe(3);
      expect(s.busiestDay?.minutes).toBe(450);
    });

    it('无课程时最忙的一天为 null', () => {
      expect(computeStats([], 'workday').busiestDay).toBeNull();
    });
  });

  describe('课表文本解析', () => {
    it('解析标准格式', () => {
      const r = parseCourses('周一 08:00-09:40 高等数学 教三201');
      expect(r.errors).toHaveLength(0);
      expect(r.courses).toHaveLength(1);
      expect(r.courses[0].weekday).toBe(1);
      expect(r.courses[0].start).toBe('08:00');
      expect(r.courses[0].end).toBe('09:40');
      expect(r.courses[0].name).toBe('高等数学');
      expect(r.courses[0].location).toBe('教三201');
    });

    it('解析节次格式', () => {
      const r = parseCourses('周三 3-4节 线性代数 教二105');
      expect(r.errors).toHaveLength(0);
      expect(r.courses[0].start).toBe('13:30');
      expect(r.courses[0].end).toBe('15:10');
      expect(r.courses[0].name).toBe('线性代数');
    });

    it('兼容星期与周几写法', () => {
      expect(parseCourses('星期三 08:00-09:40 课程').courses[0].weekday).toBe(3);
      expect(parseCourses('礼拜天 08:00-09:40 课程').courses[0].weekday).toBe(7);
      expect(parseCourses('周日 08:00-09:40 课程').courses[0].weekday).toBe(7);
    });

    it('解析周次信息', () => {
      const r = parseCourses('周一 08:00-09:40 高等数学 教三201 1-16周');
      expect(r.courses[0].weeks).toBe('1-16');
    });

    it('无法识别的行进入 errors 而不是静默丢弃', () => {
      const r = parseCourses('这一行没有星期也没有时间');
      expect(r.courses).toHaveLength(0);
      expect(r.errors).toHaveLength(1);
      expect(r.errors[0]).toContain('第 1 行');
    });

    it('混合输入时正确行仍被保留', () => {
      const text = ['周一 08:00-09:40 高等数学 教三201', '乱码行', '周二 10:00-11:40 物理 A101'].join('\n');
      const r = parseCourses(text);
      expect(r.courses).toHaveLength(2);
      expect(r.errors).toHaveLength(1);
    });

    it('多行完整课表', () => {
      const text = [
        '周一 08:00-09:40 高等数学 教三201',
        '周一 10:00-11:40 大学物理 A101',
        '周三 13:30-15:10 线性代数 教二105',
        '周五 15:30-17:10 体育 体育馆',
      ].join('\n');
      const r = parseCourses(text);
      expect(r.courses).toHaveLength(4);
      expect(r.errors).toHaveLength(0);
    });

    it('记录 owner 以支持多人', () => {
      const r = parseCourses('周一 08:00-09:40 高等数学', '小明');
      expect(r.courses[0].owner).toBe('小明');
    });
  });

  describe('建议生成', () => {
    it('无冲突时给出正面反馈', () => {
      const advice = buildAdvice([], [], computeStats([], 'workday'), 1);
      expect(advice[0]).toContain('未检测到');
    });

    it('有冲突时提示优先处理并说明原因', () => {
      const courses = [
        c({ weekday: 1, start: '08:00', end: '09:40', name: 'A' }),
        c({ weekday: 1, start: '08:00', end: '09:40', name: 'B' }),
      ];
      const advice = buildAdvice(detectConflicts(courses), [], computeStats(courses, 'workday'), 1);
      expect(advice.join()).toContain('硬冲突');
      expect(advice.join()).toContain('教务');
    });

    it('多人场景下措辞改为共同空闲', () => {
      const slots = computeFreeSlots([], 'workday', { start: '08:00', end: '22:00' }, 30);
      const advice = buildAdvice([], slots, computeStats([], 'workday'), 3);
      expect(advice.join()).toContain('共同空闲');
    });
  });
});
