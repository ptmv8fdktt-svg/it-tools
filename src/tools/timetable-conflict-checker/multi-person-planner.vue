<script setup lang="ts">
/**
 * 多人课表求交集：算出所有人都空闲的时段。
 *
 * 这是本工具相对同类课表应用最实用的差异点——教务处不会帮你对齐四个人的时间。
 */
import { computed, ref } from 'vue';
import type { Course, DayMode } from './timetable-conflict.models';
import {
  WEEKDAY_NAMES,
  computeFreeSlots,
  parseCourses,
  toHHMM,
  toMinutes,
} from './timetable-conflict.models';

const props = defineProps<{
  dayStart: string;
  dayEnd: string;
  mode: DayMode;
  minMinutes: number;
}>();

interface Person {
  id: number;
  name: string;
  text: string;
  courses: Course[];
  errors: string[];
  expanded: boolean;
}

let seq = 0;
const people = ref<Person[]>([
  { id: ++seq, name: '我', text: '', courses: [], errors: [], expanded: true },
]);

const minOverlap = ref(60);

function addPerson() {
  people.value.push({
    id: ++seq,
    name: `同学 ${people.value.length + 1}`,
    text: '',
    courses: [],
    errors: [],
    expanded: true,
  });
}

function removePerson(id: number) {
  people.value = people.value.filter((p) => p.id !== id);
}

function parsePerson(p: Person) {
  const r = parseCourses(p.text, p.name);
  p.courses = r.courses;
  p.errors = r.errors;
}

const allCourses = computed(() => people.value.flatMap((p) => p.courses));
const parsedCount = computed(() => people.value.filter((p) => p.courses.length > 0).length);

/** 全体共同空闲：直接对全部课程求交集的补集 */
const commonFree = computed(() =>
  computeFreeSlots(
    allCourses.value,
    props.mode,
    { start: props.dayStart, end: props.dayEnd },
    minOverlap.value,
  ),
);

/** 按天聚合，便于选「哪一天开会」 */
const freeByDay = computed(() => {
  const map = new Map<number, typeof commonFree.value>();
  for (const s of commonFree.value) {
    const list = map.get(s.weekday) ?? [];
    list.push(s);
    map.set(s.weekday, list);
  }
  return [...map.entries()].sort((a, b) => a[0] - b[0]);
});

/** 评分：完全空闲人数最多的时段（这里简化为选最长时段推荐） */
const recommendation = computed(() => {
  if (commonFree.value.length === 0) return null;
  return commonFree.value.reduce((a, b) => (b.minutes > a.minutes ? b : a));
});

/** 每个人在该时段的占用情况，用于解释「为什么这个时段不行」 */
function dayLoad(day: number) {
  const perPerson = people.value
    .filter((p) => p.courses.length > 0)
    .map((p) => {
      const mins = p.courses
        .filter((c) => c.weekday === day)
        .reduce((s, c) => s + Math.max(0, toMinutes(c.end) - toMinutes(c.start)), 0);
      return { name: p.name, minutes: mins };
    });
  return perPerson;
}
</script>

<template>
  <div>
    <div mb-3 flex flex-wrap items-center gap-2>
      <n-button size="small" type="primary" secondary @click="addPerson">
        + 添加一位同学
      </n-button>
      <n-input-group size="small" style="width: 240px">
        <n-input-group-label size="small">最短共同空闲</n-input-group-label>
        <n-input-number v-model:value="minOverlap" size="small" :min="30" :max="300" :step="30" />
        <n-input-group-label size="small">分钟</n-input-group-label>
      </n-input-group>
      <div flex-1 />
      <n-tag :bordered="false" size="small">
        已录入 {{ parsedCount }} / {{ people.length }} 人
      </n-tag>
    </div>

    <n-card v-for="p in people" :key="p.id" size="small" mb-2>
      <template #header>
        <div flex items-center gap-2>
          <n-input v-model:value="p.name" size="small" style="width: 140px" />
          <n-tag v-if="p.courses.length" size="tiny" :bordered="false" type="success">
            {{ p.courses.length }} 门课
          </n-tag>
          <div flex-1 />
          <n-button size="tiny" quaternary @click="p.expanded = !p.expanded">
            {{ p.expanded ? '收起' : '展开' }}
          </n-button>
          <n-button
            v-if="people.length > 1"
            size="tiny"
            quaternary
            type="error"
            @click="removePerson(p.id)"
          >
            删除
          </n-button>
        </div>
      </template>

      <template v-if="p.expanded">
        <n-input
          v-model:value="p.text"
          type="textarea"
          size="small"
          placeholder="周一 08:00-09:40 高等数学 教三201"
          :autosize="{ minRows: 3, maxRows: 10 }"
        />
        <div mt-2 flex items-center gap-2>
          <n-button size="tiny" type="primary" @click="parsePerson(p)">
            解析
          </n-button>
          <span v-if="p.errors.length" text-xs style="color: #d03050">
            {{ p.errors.length }} 行未能识别
          </span>
        </div>
      </template>
    </n-card>

    <n-divider />

    <template v-if="parsedCount >= 2">
      <n-alert v-if="recommendation" type="success" mb-3 :show-icon="true">
        推荐时间：<strong>{{ WEEKDAY_NAMES[recommendation.weekday - 1] }} {{ recommendation.start }}–{{ recommendation.end }}</strong>，
        共 {{ (recommendation.minutes / 60).toFixed(1) }} 小时，是当前所有人共同空闲最长的时段。
      </n-alert>
      <n-alert v-else type="warning" mb-3 :show-icon="true">
        在设定的作息范围内，没有找到满足「最短共同空闲 {{ minOverlap }} 分钟」的时段。可以放宽时长要求，或缩小参与人数。
      </n-alert>

      <n-card v-for="[day, slots] in freeByDay" :key="day" size="small" mb-2">
        <template #header>
          <div flex items-center gap-3>
            <span text-sm font-medium>{{ WEEKDAY_NAMES[day - 1] }}</span>
            <span text-xs op-60>
              <template v-for="(l, i) in dayLoad(day)" :key="i">
                {{ l.name }} 有课 {{ (l.minutes / 60).toFixed(1) }}h<template v-if="i < dayLoad(day).length - 1"> · </template>
              </template>
            </span>
          </div>
        </template>
        <div flex flex-wrap gap-2>
          <n-tag v-for="(s, i) in slots" :key="i" type="success" size="small" :bordered="false">
            {{ s.start }}–{{ s.end }}
            <span op-70 ml-1>({{ (s.minutes / 60).toFixed(1) }}h)</span>
          </n-tag>
        </div>
      </n-card>
    </template>

    <n-empty
      v-else
      description="至少录入两个人的课表，才能计算共同空闲时段"
      my-8
    />
  </div>
</template>
