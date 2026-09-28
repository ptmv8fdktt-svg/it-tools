/**
 * 课表冲突检测与空闲时段计算
 *
 * 解决的真实问题：
 * 1. 教务处系统只告诉你「这门课在哪」，不告诉你「两门课撞了」。
 * 2. 排社团例会、约小组讨论、找自习搭子时，没人愿意手动比对四个人的课表。
 *
 * 本模块把课表建模为「时间块集合」，提供：
 * - 冲突检测（同一时段重叠，区分「完全冲突」与「部分重叠」）
 * - 跨人课表求交集，直接算出所有人都空闲的时段
 * - 剩余时间统计
 */

export interface Course {
  id: string;
  /** 课程名 */
  name: string;
  /** 星期，1 = 周一 … 7 = 周日 */
  weekday: number;
  /** 开始时间，HH:mm */
  start: string;
  /** 结束时间，HH:mm */
  end: string;
  /** 上课地点 */
  location?: string;
  /** 教师 */
  teacher?: string;
  /** 周次范围，如「1-16」「1-8,10-16」 */
  weeks?: string;
  /** 所属学生，用于多人对比 */
  owner?: string;
}

export interface Conflict {
  type: 'exact' | 'partial';
  a: Course;
  b: Course;
  /** 重叠的分钟数 */
  overlapMinutes: number;
  message: string;
}

export interface FreeSlot {
  weekday: number;
  start: string;
  end: string;
  minutes: number;
}

export type DayMode = 'workday' | 'fullweek';

/** 一天的作息边界，用于计算「空闲」 */
export interface DayRange {
  start: string;
  end: string;
}

export const DEFAULT_DAY_RANGE: DayRange = { start: '08:00', end: '22:00' };

export const WEEKDAY_NAMES = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];

/* ------------------------------------------------------------------ */
/* 时间工具                                                            */
/* ------------------------------------------------------------------ */

export function toMinutes(hhmm: string): number {
  const m = hhmm.trim().match(/^(\d{1,2})\s*[:：.]?\s*(\d{0,2})$/);
  if (!m) return Number.NaN;
  const h = Number(m[1]);
  const min = Number(m[2] || 0);
  if (h > 23 || min > 59) return Number.NaN;
  return h * 60 + min;
}

export function toHHMM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function overlaps(a: Course, b: Course): number {
  if (a.weekday !== b.weekday) return 0;
  const s = Math.max(toMinutes(a.start), toMinutes(b.start));
  const e = Math.min(toMinutes(a.end), toMinutes(b.end));
  return Math.max(0, e - s);
}

/* ------------------------------------------------------------------ */
/* 冲突检测                                                            */
/* ------------------------------------------------------------------ */

export function detectConflicts(courses: Course[]): Conflict[] {
  const out: Conflict[] = [];
  // 只看同一 owner 内部；跨 owner 的差异由「共同空闲」功能处理
  const byOwner = new Map<string, Course[]>();
  for (const c of courses) {
    const key = c.owner ?? '__self__';
    const list = byOwner.get(key) ?? [];
    list.push(c);
    byOwner.set(key, list);
  }

  for (const [, list] of byOwner) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        const ov = overlaps(a, b);
        if (ov <= 0) continue;

        const aStart = toMinutes(a.start);
        const aEnd = toMinutes(a.end);
        const bStart = toMinutes(b.start);
        const bEnd = toMinutes(b.end);
        const exact = aStart === bStart && aEnd === bEnd;

        out.push({
          type: exact ? 'exact' : 'partial',
          a,
          b,
          overlapMinutes: ov,
          message: exact
            ? `${WEEKDAY_NAMES[a.weekday - 1]} ${a.name} 与 ${b.name} 时间完全相同，属于硬冲突。`
            : `${WEEKDAY_NAMES[a.weekday - 1]} ${a.name}（${a.start}-${a.end}）与 ${b.name}（${b.start}-${b.end}）重叠 ${ov} 分钟。`,
        });
      }
    }
  }

  return out.sort((x, y) => x.a.weekday - y.a.weekday || toMinutes(x.a.start) - toMinutes(y.a.start));
}

/* ------------------------------------------------------------------ */
/* 空闲时段计算                                                        */
/* ------------------------------------------------------------------ */

/**
 * 计算空闲时段。
 *
 * @param courses 参与计算的课程（多人时传入全部人的课表，取交集即「共同空闲」）
 * @param mode workday 只算周一到周五；fullweek 算满七天
 * @param range 每天的作息边界，默认 08:00–22:00
 * @param minMinutes 最短有效空闲时长（分钟），用于过滤碎片时间，默认 30
 */
export function computeFreeSlots(
  courses: Course[],
  mode: DayMode = 'workday',
  range: DayRange = DEFAULT_DAY_RANGE,
  minMinutes = 30,
): FreeSlot[] {
  const dayStart = toMinutes(range.start);
  const dayEnd = toMinutes(range.end);
  const lastDay = mode === 'workday' ? 5 : 7;
  const slots: FreeSlot[] = [];

  for (let day = 1; day <= lastDay; day++) {
    const busy = courses
      .filter((c) => c.weekday === day)
      .map((c) => [toMinutes(c.start), toMinutes(c.end)] as [number, number])
      .filter(([s, e]) => !Number.isNaN(s) && !Number.isNaN(e) && e > s)
      .sort((x, y) => x[0] - y[0]);

    // 合并重叠区间
    const merged: Array<[number, number]> = [];
    for (const [s, e] of busy) {
      const last = merged[merged.length - 1];
      if (last && s <= last[1]) {
        last[1] = Math.max(last[1], e);
      } else {
        merged.push([s, e]);
      }
    }

    let cursor = dayStart;
    for (const [s, e] of merged) {
      if (s - cursor >= minMinutes) {
        slots.push({
          weekday: day,
          start: toHHMM(cursor),
          end: toHHMM(s),
          minutes: s - cursor,
        });
      }
      cursor = Math.max(cursor, e);
    }
    if (dayEnd - cursor >= minMinutes) {
      slots.push({
        weekday: day,
        start: toHHMM(cursor),
        end: toHHMM(dayEnd),
        minutes: dayEnd - cursor,
      });
    }
  }

  return slots;
}

/** 汇总每个人的课时与空闲统计 */
export interface CourseStats {
  totalCourses: number;
  totalClassMinutes: number;
  busiestDay: { weekday: number; minutes: number } | null;
  freeMinutes: number;
}

export function computeStats(courses: Course[], mode: DayMode = 'workday'): CourseStats {
  const totalClassMinutes = courses.reduce((sum, c) => {
    const d = toMinutes(c.end) - toMinutes(c.start);
    return sum + (Number.isNaN(d) ? 0 : Math.max(0, d));
  }, 0);

  const byDay = new Map<number, number>();
  for (const c of courses) {
    const d = toMinutes(c.end) - toMinutes(c.start);
    if (Number.isNaN(d)) continue;
    byDay.set(c.weekday, (byDay.get(c.weekday) ?? 0) + Math.max(0, d));
  }

  let busiest: CourseStats['busiestDay'] = null;
  for (const [weekday, minutes] of byDay) {
    if (!busiest || minutes > busiest.minutes) busiest = { weekday, minutes };
  }

  const days = mode === 'workday' ? 5 : 7;
  const perDay = toMinutes(DEFAULT_DAY_RANGE.end) - toMinutes(DEFAULT_DAY_RANGE.start);
  const freeMinutes = days * perDay - totalClassMinutes;

  return { totalCourses: courses.length, totalClassMinutes, busiestDay: busiest, freeMinutes };
}

/* ------------------------------------------------------------------ */
/* 课表文本解析                                                        */
/* ------------------------------------------------------------------ */

/**
 * 从粘贴的课表文本解析课程。
 *
 * 支持两种常见格式：
 *
 * 格式 A（逐行，推荐）：
 *   周一 08:00-09:40 高等数学 教三 201
 *   周二 10:00-11:40 大学物理 A101 张三
 *
 * 格式 B（从教务系统复制，节次用数字）：
 *   周一 1-2节 高等数学 教三201
 *   周三 3-4节 大学物理 A101
 */
export interface ParseCoursesResult {
  courses: Course[];
  errors: string[];
}

const SECTION_TIMES: Record<string, [string, string]> = {
  // 常见的大学作息：第 1 节 08:00 起，每节 45 分钟，两节连上
  '1': ['08:00', '09:40'],
  '2': ['10:00', '11:40'],
  '3': ['13:30', '15:10'],
  '4': ['15:30', '17:10'],
  '5': ['18:30', '20:10'],
  '6': ['20:20', '22:00'],
};

export function parseCourses(text: string, owner?: string): ParseCoursesResult {
  const courses: Course[] = [];
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let seq = 0;

  for (const [i, line] of lines.entries()) {
    const weekday = parseWeekday(line);
    if (weekday === 0) {
      errors.push(`第 ${i + 1} 行未识别到星期：${excerpt(line)}`);
      continue;
    }

    // 优先匹配 HH:mm-HH:mm
    const timeMatch = line.match(/(\d{1,2}[:：]\d{2})\s*[-~—－]\s*(\d{1,2}[:：]\d{2})/);
    let start: string | undefined;
    let end: string | undefined;

    if (timeMatch) {
      start = timeMatch[1].replace('：', ':');
      end = timeMatch[2].replace('：', ':');
    } else {
      // 退化为节次模式：1-2节 / 第1-2节 / 1、2节
      const secMatch = line.match(/(\d+)\s*[-~—－、]\s*(\d+)\s*节/);
      if (secMatch) {
        const a = SECTION_TIMES[secMatch[1]];
        const b = SECTION_TIMES[secMatch[2]];
        if (a && b) {
          start = a[0];
          end = b[1];
        }
      } else {
        const single = line.match(/第?\s*(\d+)\s*节/);
        if (single && SECTION_TIMES[single[1]]) {
          [start, end] = SECTION_TIMES[single[1]];
        }
      }
    }

    if (!start || !end) {
      errors.push(`第 ${i + 1} 行未识别到上课时间：${excerpt(line)}`);
      continue;
    }

    const name = parseCourseName(line);
    if (!name) {
      errors.push(`第 ${i + 1} 行未识别到课程名：${excerpt(line)}`);
      continue;
    }

    const weekMatch = line.match(/(\d+(?:\s*[-~—－]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-~—－]\s*\d+)?)*)\s*周/);

    seq += 1;
    courses.push({
      id: `c${seq}`,
      name,
      weekday,
      start,
      end,
      location: parseLocation(line),
      weeks: weekMatch ? weekMatch[1].replace(/\s/g, '') : undefined,
      owner,
    });
  }

  return { courses, errors };
}

function parseWeekday(line: string): number {
  const map: Array<[RegExp, number]> = [
    [/周\s*一|星期\s*一|礼拜\s*一|mon(day)?/i, 1],
    [/周\s*二|星期\s*二|礼拜\s*二|tue(sday)?/i, 2],
    [/周\s*三|星期\s*三|礼拜\s*三|wed(nesday)?/i, 3],
    [/周\s*四|星期\s*四|礼拜\s*四|thu(rsday)?/i, 4],
    [/周\s*五|星期\s*五|礼拜\s*五|fri(day)?/i, 5],
    [/周\s*六|星期\s*六|礼拜\s*六|sat(urday)?/i, 6],
    [/周\s*日|周\s*天|星期\s*日|星期\s*天|sun(day)?/i, 7],
  ];
  for (const [re, n] of map) {
    if (re.test(line)) return n;
  }
  return 0;
}

function parseCourseName(line: string): string | undefined {
  // 去掉星期与时间片段后，剩下的第一段视为课程名
  let rest = line
    .replace(/周\s*[一二三四五六日天]|星期\s*[一二三四五六日天]|礼拜\s*[一二三四五六日天]/g, ' ')
    .replace(/\d{1,2}[:：]\d{2}\s*[-~—－]\s*\d{1,2}[:：]\d{2}/g, ' ')
    .replace(/第?\s*\d+\s*[-~—－、]\s*\d+\s*节|第?\s*\d+\s*节/g, ' ')
    .replace(/\d+(?:\s*[-~—－]\s*\d+)?(?:\s*,\s*\d+(?:\s*[-~—－]\s*\d+)?)*\s*周/g, ' ')
    .replace(/[（(][^）)]*[）)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // 先摘除末尾的教室标识，再摘除末尾的教师姓名
  const LOCATION_TAIL =
    /(?:\s+(?:教|教学楼|实验楼|综合楼|图书馆|体育馆|风雨操场|活动中心|外语楼|主楼|东楼|西楼|南楼|北楼)[\u4e00-\u9fa5]*\s*\d{0,4}|\s+[A-Fa-f]\s*\d{2,4}|\s+[\u4e00-\u9fa5]{2,6}\d{2,4})+$/;
  rest = rest.replace(LOCATION_TAIL, ' ').trim();

  // 教师名：2-3 个汉字，且不含场所关键字
  rest = rest
    .replace(/\s+([\u4e00-\u9fa5]{2,3})(老师|教授)?$/, (m, name) =>
      /(楼|室|馆|场|中心|区|班|系|院)/.test(name) ? m : ' ',
    )
    .trim();

  return rest || undefined;
}

function parseLocation(line: string): string | undefined {
  const m = line.match(
    /((?:教|教学楼|实验楼|综合楼|图书馆|体育馆|风雨操场|活动中心)[\u4e00-\u9fa5]*\s*\d{0,4}|[A-Fa-f]\s*\d{2,4}|[\u4e00-\u9fa5]{2,6}\d{2,4})/,
  );
  return m ? m[1].replace(/\s/g, '') : undefined;
}

function excerpt(s: string, max = 30) {
  return s.length <= max ? s : `${s.slice(0, max)}…`;
}

/* ------------------------------------------------------------------ */
/* 建议语                                                            */
/* ------------------------------------------------------------------ */

export function buildAdvice(
  conflicts: Conflict[],
  freeSlots: FreeSlot[],
  stats: CourseStats,
  peopleCount: number,
): string[] {
  const out: string[] = [];

  if (conflicts.length === 0) {
    out.push('未检测到课程时间冲突，当前课表可以正常执行。');
  } else {
    const hard = conflicts.filter((c) => c.type === 'exact').length;
    out.push(
      `发现 ${conflicts.length} 组时间冲突${hard ? `，其中 ${hard} 组为完全重叠的硬冲突` : ''}，建议优先处理。`,
    );
    out.push('硬冲突通常意味着选课系统异常或存在重修/免修记录，请尽快联系教务老师核实；部分重叠可考虑申请调课或与任课教师沟通。');
  }

  if (stats.busiestDay) {
    out.push(
      `${WEEKDAY_NAMES[stats.busiestDay.weekday - 1]}课业最重，共 ${(stats.busiestDay.minutes / 60).toFixed(1)} 小时课程，建议不要把社团例会安排在这一天。`,
    );
  }

  const longSlots = freeSlots.filter((s) => s.minutes >= 90);
  if (longSlots.length > 0) {
    const best = longSlots.reduce((a, b) => (b.minutes > a.minutes ? b : a));
    out.push(
      `${peopleCount > 1 ? '所有人共同空闲' : '空闲'}时段共 ${freeSlots.length} 段。最长的一段是${WEEKDAY_NAMES[best.weekday - 1]} ${best.start}–${best.end}（${(best.minutes / 60).toFixed(1)} 小时），适合安排例会或小组讨论。`,
    );
  } else if (freeSlots.length === 0) {
    out.push('在设定的作息范围内没有找到满足时长要求的空闲时段，可以放宽最短时长或在设置中调整作息边界。');
  }

  const perDay = new Map<number, number>();
  for (const s of freeSlots) perDay.set(s.weekday, (perDay.get(s.weekday) ?? 0) + s.minutes);
  if (perDay.size > 0) {
    const bestDay = [...perDay.entries()].sort((a, b) => b[1] - a[1])[0];
    out.push(
      `按天看，${WEEKDAY_NAMES[bestDay[0] - 1]}空闲最多（${(bestDay[1] / 60).toFixed(1)} 小时），是最容易约到人的一天。`,
    );
  }

  return out;
}
