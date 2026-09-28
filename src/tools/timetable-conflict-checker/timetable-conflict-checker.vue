<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Course, DayMode } from './timetable-conflict.models';
import {
  DEFAULT_DAY_RANGE,
  WEEKDAY_NAMES,
  buildAdvice,
  computeFreeSlots,
  computeStats,
  detectConflicts,
  parseCourses,
  toHHMM,
  toMinutes,
} from './timetable-conflict.models';

const rawText = ref('');
const courses = ref<Course[]>([]);
const parseErrors = ref<string[]>([]);
const ownerName = ref('我');
const mode = ref<DayMode>('workday');
const dayStart = ref('08:00');
const dayEnd = ref('22:00');
const minMinutes = ref(30);

const conflicts = computed(() => detectConflicts(courses.value));
const freeSlots = computed(() =>
  computeFreeSlots(courses.value, mode.value, { start: dayStart.value, end: dayEnd.value }, minMinutes.value),
);
const stats = computed(() => computeStats(courses.value, mode.value));
const advice = computed(() => buildAdvice(conflicts.value, freeSlots.value, stats.value, 1));

const lastDay = computed(() => (mode.value === 'workday' ? 5 : 7));

/** 把一天的课表转成 0-1 的区间块，用于绘制时间轴 */
function dayBlocks(day: number) {
  const s = toMinutes(dayStart.value);
  const e = toMinutes(dayEnd.value);
  const span = e - s;
  return courses.value
    .filter((c) => c.weekday === day)
    .map((c) => {
      const cs = toMinutes(c.start);
      const ce = toMinutes(c.end);
      return {
        course: c,
        left: ((cs - s) / span) * 100,
        width: ((ce - cs) / span) * 100,
      };
    })
    .filter((b) => b.width > 0);
}

function parse() {
  const r = parseCourses(rawText.value, ownerName.value);
  courses.value = r.courses;
  parseErrors.value = r.errors;
}

function addCourse() {
  courses.value = [
    ...courses.value,
    { id: `m${Date.now()}`, name: '新课程', weekday: 1, start: '08:00', end: '09:40', owner: ownerName.value },
  ];
}

function removeCourse(id: string) {
  courses.value = courses.value.filter((c) => c.id !== id);
}

function loadSample() {
  rawText.value = [
    '周一 08:00-09:40 高等数学 教三201',
    '周一 10:00-11:40 大学物理 A101',
    '周二 08:00-09:40 数据结构 教五302',
    '周二 10:00-11:40 数据结构上机 实验楼401',
    '周三 13:30-15:10 线性代数 教二105',
    '周三 13:30-15:10 英语听说 外语楼208',
    '周四 15:30-17:10 体育（篮球） 体育馆',
    '周五 10:00-11:40 中国近现代史纲要 教一201',
  ].join('\n');
  parse();
}

const dayColor = ['#2080f0', '#18a058', '#f0a020', '#d03050', '#8a2be2', '#13c2c2', '#eb2f96'];

function formatMinutes(m: number) {
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h} 小时 ${mm} 分` : `${h} 小时`;
}
</script>

<template>
  <div>
    <n-tabs type="line" animated>
      <!-- ============ 我的课表 ============ -->
      <n-tab-pane name="input" tab="课表录入">
        <n-alert type="info" mb-3 :show-icon="true">
          <div text-sm leading-relaxed>
            支持直接粘贴教务系统复制的课表，每行一门课。识别格式：<code>周一 08:00-09:40 高等数学 教三201</code>，
            也支持节次写法 <code>周三 3-4节 线性代数 教二105</code>。数据只存在你的浏览器里。
          </div>
        </n-alert>

        <div mb-3 flex flex-wrap items-center gap-2>
          <n-button type="primary" secondary @click="loadSample">
            载入示例课表（含 1 组冲突）
          </n-button>
          <n-button secondary @click="parse">
            解析课表
          </n-button>
          <n-button quaternary @click="addCourse">
            + 手动添加课程
          </n-button>
          <n-button quaternary @click="rawText = ''; courses = []; parseErrors = []">
            清空
          </n-button>
        </div>

        <n-input
          v-model:value="rawText"
          type="textarea"
          placeholder="周一 08:00-09:40 高等数学 教三201&#10;周二 10:00-11:40 大学物理 A101"
          :autosize="{ minRows: 8, maxRows: 18 }"
        />

        <n-alert v-if="parseErrors.length" type="warning" mt-3 :show-icon="true">
          <div v-for="(e, i) in parseErrors" :key="i" text-sm>{{ e }}</div>
        </n-alert>
      </n-tab-pane>

      <!-- ============ 课表可视化 ============ -->
      <n-tab-pane name="grid" tab="课表与空闲">
        <div mb-3 flex flex-wrap items-center gap-3>
          <n-radio-group v-model:value="mode" size="small">
            <n-radio-button value="workday">仅工作日</n-radio-button>
            <n-radio-button value="fullweek">全周</n-radio-button>
          </n-radio-group>

          <n-input-group size="small" style="width: 260px">
            <n-input-group-label size="small">作息</n-input-group-label>
            <n-input v-model:value="dayStart" size="small" placeholder="08:00" />
            <n-input-group-label size="small">—</n-input-group-label>
            <n-input v-model:value="dayEnd" size="small" placeholder="22:00" />
          </n-input-group>

          <n-input-group size="small" style="width: 200px">
            <n-input-group-label size="small">最短空闲</n-input-group-label>
            <n-input-number v-model:value="minMinutes" size="small" :min="10" :max="240" :step="10" />
            <n-input-group-label size="small">分钟</n-input-group-label>
          </n-input-group>

          <div flex-1 />
          <n-tag :bordered="false" size="small" type="info">
            课程 {{ stats.totalCourses }} 门 · 每周课业 {{ formatMinutes(stats.totalClassMinutes) }}
          </n-tag>
        </div>

        <n-empty v-if="courses.length === 0" description="还没有课程，先去「课表录入」粘贴你的课表" my-12 />

        <template v-else>
          <!-- 时间轴 -->
          <div class="tt-wrap" mb-4>
            <div class="tt-head">
              <div class="tt-gutter" />
              <div class="tt-ticks">
                <span
                  v-for="h in 8"
                  :key="h"
                  class="tt-tick"
                  :style="{ left: `${((h * 2) / ((toMinutes(dayEnd) - toMinutes(dayStart)) / 60)) * 100}%` }"
                >
                  {{ toHHMM(toMinutes(dayStart) + h * 120) }}
                </span>
              </div>
            </div>

            <div v-for="d in lastDay" :key="d" class="tt-row">
              <div class="tt-gutter tt-day">{{ WEEKDAY_NAMES[d - 1] }}</div>
              <div class="tt-track">
                <span
                  v-for="(b, i) in dayBlocks(d)"
                  :key="i"
                  class="tt-block"
                  :style="{
                    left: `${b.left}%`,
                    width: `${Math.max(b.width, 2.5)}%`,
                    background: dayColor[d - 1],
                  }"
                  :title="`${b.course.name}\n${b.course.start}-${b.course.end}${b.course.location ? `\n${b.course.location}` : ''}`"
                >
                  {{ b.course.name }}
                </span>
              </div>
            </div>
          </div>

          <!-- 空闲时段 -->
          <n-card size="small" title="空闲时段" mb-4>
            <n-empty v-if="freeSlots.length === 0" description="在设定范围内没有满足条件的空闲时段" size="small" />
            <div v-else flex flex-wrap gap-2>
              <n-tag
                v-for="(s, i) in freeSlots"
                :key="i"
                :bordered="false"
                type="success"
                size="small"
              >
                {{ WEEKDAY_NAMES[s.weekday - 1] }} {{ s.start }}–{{ s.end }}
                <span op-70 ml-1>({{ formatMinutes(s.minutes) }})</span>
              </n-tag>
            </div>
          </n-card>

          <!-- 建议 -->
          <n-card size="small" title="排课建议" mb-4>
            <ul class="advice-list">
              <li v-for="(a, i) in advice" :key="i">{{ a }}</li>
            </ul>
          </n-card>
        </template>
      </n-tab-pane>

      <!-- ============ 冲突检测 ============ -->
      <n-tab-pane name="conflict" tab="冲突检测">
        <n-empty v-if="courses.length === 0" description="还没有课程数据" my-12 />

        <template v-else>
          <n-alert v-if="conflicts.length === 0" type="success" mb-3 :show-icon="true">
            未检测到课程时间冲突。
          </n-alert>
          <n-alert v-else type="error" mb-3 :show-icon="true">
            发现 {{ conflicts.length }} 组冲突，其中 {{ conflicts.filter((c) => c.type === 'exact').length }} 组为完全重叠。
          </n-alert>

          <n-card
            v-for="(c, i) in conflicts"
            :key="i"
            size="small"
            mb-2
          >
            <template #header>
              <div flex items-center gap-2>
                <n-tag :type="c.type === 'exact' ? 'error' : 'warning'" size="tiny" :bordered="false">
                  {{ c.type === 'exact' ? '完全重叠' : '部分重叠' }}
                </n-tag>
                <span text-sm>{{ WEEKDAY_NAMES[c.a.weekday - 1] }}</span>
              </div>
            </template>
            <div text-sm leading-relaxed>
              {{ c.message }}
            </div>
            <div mt-2 text-xs op-70>
              重叠时长 {{ c.overlapMinutes }} 分钟。
              <template v-if="c.type === 'partial'">
                两门课首尾相接或互相覆盖，建议核实是否为同一门课的分段安排，否则需要与任课教师沟通。
              </template>
              <template v-else>
                时间完全一致，通常意味着选课冲突或重修/免修记录未清理，请及时联系教务。
              </template>
            </div>
          </n-card>
        </template>
      </n-tab-pane>

      <!-- ============ 课程明细 ============ -->
      <n-tab-pane name="list" tab="课程明细">
        <div mb-3 flex items-center gap-2>
          <n-input v-model:value="ownerName" size="small" placeholder="我的名字" style="width: 160px" />
          <n-button size="small" secondary @click="addCourse">
            + 添加课程
          </n-button>
        </div>

        <n-empty v-if="courses.length === 0" description="还没有课程" my-12 />

        <n-data-table
          v-else
          :data="courses"
          :columns="[
            { title: '课程名', key: 'name', render: (row) => row.name },
            { title: '星期', key: 'weekday', render: (row) => WEEKDAY_NAMES[row.weekday - 1] },
            { title: '时间', key: 'time', render: (row) => `${row.start}–${row.end}` },
            { title: '地点', key: 'location', render: (row) => row.location || '—' },
            { title: '周次', key: 'weeks', render: (row) => row.weeks || '—' },
            { title: '操作', key: 'action', render: (row) => h('a', { onClick: () => removeCourse(row.id), style: 'cursor:pointer;color:#d03050' }, '删除') },
          ]"
          size="small"
        />
      </n-tab-pane>

      <!-- ============ 多人对比 ============ -->
      <n-tab-pane name="group" tab="约时间（多人）">
        <n-alert type="info" mb-3 :show-icon="true">
          把每个人的课表逐行粘进来，工具会求交集，直接告诉你「所有人都空闲」的时段。约自习、排社团例会、找小组讨论时间都用得上。
        </n-alert>

        <MultiPersonPlanner
          :day-start="dayStart"
          :day-end="dayEnd"
          :mode="mode"
          :min-minutes="minMinutes"
        />
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<script lang="ts">
import { h } from 'vue';
import MultiPersonPlanner from './multi-person-planner.vue';

export default { components: { MultiPersonPlanner } };
</script>

<style scoped>
.tt-wrap {
  border: 1px solid rgba(128, 128, 128, 0.2);
  border-radius: 8px;
  padding: 8px;
}

.tt-head,
.tt-row {
  display: flex;
  align-items: center;
}

.tt-gutter {
  width: 52px;
  flex-shrink: 0;
  font-size: 12px;
  opacity: 0.75;
}

.tt-day {
  font-weight: 500;
}

.tt-ticks {
  position: relative;
  flex: 1;
  height: 18px;
  border-bottom: 1px solid rgba(128, 128, 128, 0.2);
}

.tt-tick {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  opacity: 0.6;
}

.tt-track {
  position: relative;
  flex: 1;
  height: 34px;
  margin: 3px 0;
  border-radius: 4px;
  background: rgba(128, 128, 128, 0.08);
}

.tt-block {
  position: absolute;
  top: 3px;
  bottom: 3px;
  border-radius: 4px;
  color: #fff;
  font-size: 11px;
  line-height: 28px;
  padding: 0 6px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  box-sizing: border-box;
}

.advice-list {
  margin: 0;
  padding-left: 18px;
  font-size: 14px;
  line-height: 1.9;
}
</style>
