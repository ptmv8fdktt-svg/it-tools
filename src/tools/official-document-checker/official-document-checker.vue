<script setup lang="ts">
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { parseInput } from './official-document.parser';
import type { ParseResult } from './official-document.parser';
import type { CheckReport, Severity } from './official-document.rules';
import { checkDocument } from './official-document.rules';
import { applyFixes, buildReport, isLayoutIssue } from './official-document.fixer';
import SampleDocument from './official-document.sample.md';

const { t } = useI18n();

const rawText = ref('');
const fileName = ref<string | undefined>();
const parseResult = ref<ParseResult | null>(null);
const report = ref<CheckReport | null>(null);
const busy = ref(false);
const errorMsg = ref('');
const activeSeverity = ref<Severity | 'all'>('all');
const showFixPreview = ref(false);
const fixPreview = ref<ReturnType<typeof applyFixes> | null>(null);
const fixedText = ref('');

const ACCEPT = '.docx,.txt,.md,.markdown';

const hasFormatInfo = computed(() => parseResult.value?.capabilities.canReadFont ?? false);

const filtered = computed(() => {
  if (!report.value) return [];
  if (activeSeverity.value === 'all') return report.value.violations;
  return report.value.violations.filter((v) => v.severity === activeSeverity.value);
});

async function run(input: { text?: string; file?: File }) {
  busy.value = true;
  errorMsg.value = '';
  try {
    const parsed = await parseInput(input);
    const r = checkDocument(parsed.doc);
    parseResult.value = parsed;
    report.value = r;
    fileName.value = parsed.doc.meta?.fileName;
    showFixPreview.value = false;
  } catch (e) {
    errorMsg.value = e instanceof Error ? e.message : String(e);
    parseResult.value = null;
    report.value = null;
  } finally {
    busy.value = false;
  }
}

function onTextInput() {
  if (rawText.value.trim().length === 0) {
    parseResult.value = null;
    report.value = null;
    return;
  }
  run({ text: rawText.value });
}

async function onFile(e: Event) {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (!f) return;
  await run({ file: f });
}

function loadSample() {
  rawText.value = SampleDocument as unknown as string;
  run({ text: rawText.value });
}

function previewFix() {
  if (!report.value) return;
  const result = applyFixes(rawText.value, report.value.violations);
  fixPreview.value = result;
  fixedText.value = result.text;
  showFixPreview.value = true;
}

function acceptFix() {
  rawText.value = fixedText.value;
  showFixPreview.value = false;
  run({ text: rawText.value });
}

const severityMeta: Record<Severity, { label: string; type: 'error' | 'warning' | 'info'; color: string }> = {
  error: { label: '硬性违规', type: 'error', color: '#d03050' },
  warn: { label: '建议改进', type: 'warning', color: '#f0a020' },
  info: { label: '提示', type: 'info', color: '#2080f0' },
};

function downloadReport() {
  if (!report.value) return;
  const md = buildReport(report.value, fileName.value);
  const blob = new Blob(['\ufeff', md], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `公文格式检查报告-${new Date().toISOString().slice(0, 10)}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function scoreColor(s: number) {
  if (s >= 90) return '#18a058';
  if (s >= 70) return '#f0a020';
  return '#d03050';
}

function highlight(text: string) {
  // 把需要提示的片段标出来，便于在原文中快速定位
  return text;
}
</script>

<template>
  <div>
    <div mb-4 flex flex-wrap items-center gap-2>
      <n-button type="primary" secondary @click="loadSample">
        <template #icon>
          <n-icon><span>📄</span></n-icon>
        </template>
        载入示例公文（含 12 处典型错误）
      </n-button>

      <label>
        <input
          type="file"
          :accept="ACCEPT"
          class="hidden"
          @change="onFile"
        >
        <n-button secondary tag="span" style="pointer-events: none">
          <template #icon>
            <n-icon><span>📎</span></n-icon>
          </template>
          上传 .docx 检查字体字号
        </n-button>
      </label>

      <n-button quaternary @click="rawText = ''; parseResult = null; report = null">
        清空
      </n-button>

      <div flex-1 />

      <n-button v-if="report" secondary type="success" @click="downloadReport">
        <template #icon>
          <n-icon><span>⬇️</span></n-icon>
        </template>
        导出检查报告
      </n-button>
    </div>

    <n-alert v-if="errorMsg" type="error" mb-3 :show-icon="true">
      {{ errorMsg }}
    </n-alert>

    <n-alert v-if="parseResult" type="info" mb-3 :show-icon="true">
      <div v-for="(n, i) in parseResult.notices" :key="i" text-sm leading-relaxed>
        {{ n }}
      </div>
    </n-alert>

    <div grid gap-4 lg:grid-cols-2>
      <!-- 左：输入区 -->
      <div>
        <div mb-2 flex items-center justify-between>
          <span font-medium>粘贴公文正文</span>
          <span v-if="fileName" text-xs op-60>{{ fileName }}</span>
        </div>
        <n-input
          v-model:value="rawText"
          type="textarea"
          placeholder="把公文正文粘贴到这里，或点击上方按钮上传 .docx 文件。&#10;&#10;例如：&#10;　　关于开展 2026 年秋季学期社团招新工作的通知&#10;各学院学生分会：&#10;　　为进一步丰富校园文化生活……"
          :autosize="{ minRows: 16, maxRows: 30 }"
          @update:value="onTextInput"
        />
        <div mt-2 text-xs op-60>
          输入即检查，无需点击按钮。文本模式可查层级序号、标点、用语、发文字号；上传 .docx 可额外查字体、字号、行距、页边距。
        </div>
      </div>

      <!-- 右：结果区 -->
      <div>
        <template v-if="report">
          <!-- 得分卡 -->
          <div
            mb-3
            rounded-lg
            p-4
            style="background: var(--n-color-modal, rgba(128,128,128,0.06))"
          >
            <div flex items-center gap-4>
              <div
                class="score-ring"
                :style="{ '--score-color': scoreColor(report.score) }"
              >
                <span text-2xl font-bold>{{ report.score }}</span>
              </div>
              <div flex-1>
                <div text-base font-medium>
                  格式得分 {{ report.score }} / 100
                </div>
                <div mt-1 text-xs op-70>
                  通过规则 {{ report.passed }} / {{ report.applicable }} 条 · 共 {{ report.total }} 处问题
                </div>
                <div mt-2 flex flex-wrap gap-1>
                  <n-tag
                    v-for="s in (['error', 'warn', 'info'] as Severity[])"
                    :key="s"
                    :type="severityMeta[s].type"
                    size="small"
                    :bordered="false"
                  >
                    {{ severityMeta[s].label }} {{ report.bySeverity[s] }}
                  </n-tag>
                </div>
              </div>
            </div>

            <n-space v-if="!hasFormatInfo" mt-3>
              <n-tag type="warning" size="small" :bordered="false">
                纯文本模式：版式类规则未生效
              </n-tag>
            </n-space>
          </div>

          <div v-if="report.total > 0" mb-3 flex flex-wrap items-center gap-2>
            <n-radio-group v-model:value="activeSeverity" size="small">
              <n-radio-button value="all">
                全部 {{ report.total }}
              </n-radio-button>
              <n-radio-button value="error">
                违规 {{ report.bySeverity.error }}
              </n-radio-button>
              <n-radio-button value="warn">
                建议 {{ report.bySeverity.warn }}
              </n-radio-button>
              <n-radio-button value="info">
                提示 {{ report.bySeverity.info }}
              </n-radio-button>
            </n-radio-group>

            <div flex-1 />

            <n-button size="small" type="primary" @click="previewFix">
              一键修复可自动处理项
            </n-button>
          </div>

          <n-empty v-if="report.total === 0" description="未发现格式问题，文档符合规范要求 🎉" my-8 />

          <!-- 问题列表 -->
          <div class="result-list">
            <n-card
              v-for="(v, i) in filtered"
              :key="i"
              size="small"
              mb-2
              :bordered="true"
            >
              <template #header>
                <div flex items-center gap-2>
                  <n-tag :type="severityMeta[v.severity].type" size="tiny" :bordered="false">
                    {{ severityMeta[v.severity].label }}
                  </n-tag>
                  <span text-sm font-medium>{{ v.title }}</span>
                  <span text-xs op-50>{{ v.ruleId }}</span>
                </div>
              </template>

              <div text-sm leading-relaxed>
                {{ v.message }}
              </div>

              <div
                v-if="v.location?.excerpt"
                mt-2
                rounded
                px-2
                py-1
                font-mono
                text-xs
                style="background: rgba(208,48,80,0.07)"
              >
                {{ v.location.excerpt }}
              </div>

              <div mt-2 text-xs op-70>
                <div><strong>依据：</strong>{{ v.basis }}</div>
                <div mt-1><strong>建议：</strong>{{ v.suggestion }}</div>
              </div>

              <div v-if="isLayoutIssue(v)" mt-2>
                <n-tag size="tiny" :bordered="false" type="warning">
                  需在 Word 中调整版式
                </n-tag>
              </div>
            </n-card>
          </div>
        </template>

        <n-empty v-else description="粘贴正文或上传文档后，这里会显示检查结果" my-16 />
      </div>
    </div>

    <!-- 一键修复预览 -->
    <n-modal
      v-model:show="showFixPreview"
      preset="card"
      title="修复预览"
      style="max-width: 720px"
    >
      <template v-if="fixPreview">
        <n-alert v-if="fixPreview.applied === 0" type="warning" mb-3 :show-icon="true">
          当前问题均为版式类（字体、字号、行距、页边距），无法通过文本替换修复。请按下方指引在 Word 中调整。
        </n-alert>

        <template v-else>
          <n-alert type="success" mb-3 :show-icon="true">
            可自动修复 {{ fixPreview.applied }} 处文本类问题。确认后原文将被替换。
          </n-alert>

          <div v-if="fixPreview.manual.length" mb-3>
            <div mb-1 text-sm font-medium>需手动处理的版式问题：</div>
            <n-card v-for="(m, i) in fixPreview.manual" :key="i" size="small" mb-2>
              <div text-sm font-medium>{{ m.title }}</div>
              <div mt-1 text-xs op-70>{{ m.guide }}</div>
            </n-card>
          </div>

          <div mb-2 text-sm font-medium>修复后文本预览：</div>
          <n-input
            v-model:value="fixedText"
            type="textarea"
            :autosize="{ minRows: 8, maxRows: 16 }"
          />
        </template>
      </template>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showFixPreview = false">
            取消
          </n-button>
          <n-button
            v-if="fixPreview && fixPreview.applied > 0"
            type="primary"
            @click="acceptFix"
          >
            应用修复并重新检查
          </n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.score-ring {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: conic-gradient(var(--score-color) calc(var(--score, 0) * 1%), rgba(128, 128, 128, 0.15) 0);
  position: relative;
}

.score-ring::before {
  content: '';
  position: absolute;
  inset: 6px;
  border-radius: 50%;
  background: var(--n-color, #fff);
}

.score-ring span {
  position: relative;
  z-index: 1;
}

.result-list {
  max-height: 620px;
  overflow-y: auto;
  padding-right: 4px;
}

.hidden {
  display: none;
}
</style>
