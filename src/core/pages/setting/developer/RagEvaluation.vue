<template>
  <div class="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">

    <!-- 标题 -->
    <div class="space-y-2">
      <h3 class="text-lg font-medium">{{ t('settings.developer.evaluation.title') }}</h3>
      <p class="text-sm text-muted-foreground">{{ t('settings.developer.evaluation.description') }}</p>
    </div>

    <!-- ==================== 评估概览卡片 ==================== -->
    <div class="space-y-3">
      <h4 class="text-sm font-medium text-muted-foreground">{{ t('settings.developer.evaluation.overview') }}</h4>

      <div v-if="evalStore.stats.totalEvaluations === 0" class="text-sm text-muted-foreground p-6 text-center border rounded-xl bg-muted/20">
        {{ t('settings.developer.evaluation.noData') }}
      </div>

      <div v-else class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <!-- 忠实度 -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.faithfulness') }}</span>
            <div class="flex items-center gap-1">
              <TrendArrow :trend="evalStore.trends?.faithfulness" />
              <ShieldCheck class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div class="text-2xl font-bold" :style="{ color: getScoreColor(evalStore.stats.avgFaithfulness) }">
            {{ formatScore(evalStore.stats.avgFaithfulness) }}
          </div>
          <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.faithfulnessDesc') }}</div>
        </div>

        <!-- 回答相关性 -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.answerRelevance') }}</span>
            <div class="flex items-center gap-1">
              <TrendArrow :trend="evalStore.trends?.relevance" />
              <Target class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div class="text-2xl font-bold" :style="{ color: getScoreColor(evalStore.stats.avgRelevance) }">
            {{ formatScore(evalStore.stats.avgRelevance) }}
          </div>
          <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.answerRelevanceDesc') }}</div>
        </div>

        <!-- 上下文精度 -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.contextPrecision') }}</span>
            <div class="flex items-center gap-1">
              <TrendArrow :trend="evalStore.trends?.precision" />
              <Crosshair class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div class="text-2xl font-bold" :style="{ color: getScoreColor(evalStore.stats.avgPrecision) }">
            {{ formatScore(evalStore.stats.avgPrecision) }}
          </div>
          <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.contextPrecisionDesc') }}</div>
        </div>

        <!-- 上下文召回率（新增） -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.contextRecall') }}</span>
            <div class="flex items-center gap-1">
              <TrendArrow :trend="evalStore.trends?.recall" />
              <BookOpen class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div class="text-2xl font-bold" :style="{ color: getScoreColor(evalStore.stats.avgRecall) }">
            {{ formatScore(evalStore.stats.avgRecall) }}
          </div>
          <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.contextRecallDesc') }}</div>
        </div>

        <!-- 答案完整性（新增） -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.answerCompleteness') }}</span>
            <div class="flex items-center gap-1">
              <TrendArrow :trend="evalStore.trends?.completeness" />
              <CheckCheck class="h-3.5 w-3.5 text-muted-foreground" />
            </div>
          </div>
          <div class="text-2xl font-bold" :style="{ color: getScoreColor(evalStore.stats.avgCompleteness) }">
            {{ formatScore(evalStore.stats.avgCompleteness) }}
          </div>
          <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.answerCompletenessDesc') }}</div>
        </div>

        <!-- 平均延迟 -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.avgLatency') }}</span>
            <Clock class="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div class="text-2xl font-bold text-foreground">
            {{ Math.round(evalStore.stats.avgLatency) }}<span class="text-sm font-normal text-muted-foreground ml-1">{{ t('settings.developer.evaluation.ms') }}</span>
          </div>
        </div>

        <!-- Rerank 使用率 -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.rerankRate') }}</span>
            <ListOrdered class="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div class="text-2xl font-bold text-foreground">
            {{ (evalStore.stats.rerankUsageRate * 100).toFixed(0) }}%
          </div>
        </div>

        <!-- 总评估次数 -->
        <div class="p-4 rounded-xl border bg-card/50 space-y-2">
          <div class="flex items-center justify-between">
            <span class="text-xs text-muted-foreground">{{ t('settings.developer.evaluation.totalEvaluations') }}</span>
            <BarChart3 class="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <div class="text-2xl font-bold text-foreground">
            {{ evalStore.stats.totalEvaluations }}
          </div>
        </div>
      </div>
    </div>

    <Separator />

    <!-- ==================== 评估历史 ==================== -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h4 class="text-sm font-medium text-muted-foreground">{{ t('settings.developer.evaluation.history') }}</h4>
        <Button v-if="evalStore.evaluations.length > 0" variant="ghost" size="sm" class="text-xs text-destructive" @click="handleClearHistory">
          <Trash2 class="h-3 w-3 mr-1" /> {{ t('settings.developer.evaluation.clearHistory') }}
        </Button>
      </div>

      <div v-if="evalStore.evaluations.length === 0" class="text-sm text-muted-foreground p-4 text-center border rounded-xl bg-muted/20">
        {{ t('settings.developer.evaluation.noData') }}
      </div>

      <div v-else class="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        <div
          v-for="evaluation in reversedEvaluations"
          :key="evaluation.id"
          class="p-3 border rounded-xl bg-card/30 hover:bg-card/60 transition-colors cursor-pointer"
          @click="toggleExpand(evaluation.id)"
        >
          <div class="flex items-center justify-between">
            <div class="flex-1 min-w-0 mr-3">
              <p class="text-sm font-medium truncate">{{ evaluation.query }}</p>
              <p class="text-[10px] text-muted-foreground mt-0.5">
                {{ formatTime(evaluation.createdAt) }} · {{ evaluation.retrievalLatencyMs }}{{ t('settings.developer.evaluation.ms') }}
                <span v-if="evaluation.judgeModel" class="ml-1 opacity-60">· {{ evaluation.judgeModel }}</span>
              </p>
            </div>
            <div class="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              <span class="text-xs font-mono px-1.5 py-0.5 rounded" :style="{ backgroundColor: getScoreColor(evaluation.faithfulness) + '20', color: getScoreColor(evaluation.faithfulness) }">
                F:{{ formatScore(evaluation.faithfulness) }}
              </span>
              <span class="text-xs font-mono px-1.5 py-0.5 rounded" :style="{ backgroundColor: getScoreColor(evaluation.answerRelevance) + '20', color: getScoreColor(evaluation.answerRelevance) }">
                R:{{ formatScore(evaluation.answerRelevance) }}
              </span>
              <span class="text-xs font-mono px-1.5 py-0.5 rounded" :style="{ backgroundColor: getScoreColor(evaluation.contextPrecision) + '20', color: getScoreColor(evaluation.contextPrecision) }">
                P:{{ formatScore(evaluation.contextPrecision) }}
              </span>
              <span class="text-xs font-mono px-1.5 py-0.5 rounded" :style="{ backgroundColor: getScoreColor(evaluation.contextRecall ?? -1) + '20', color: getScoreColor(evaluation.contextRecall ?? -1) }">
                C:{{ formatScore(evaluation.contextRecall ?? -1) }}
              </span>
              <span class="text-xs font-mono px-1.5 py-0.5 rounded" :style="{ backgroundColor: getScoreColor(evaluation.answerCompleteness ?? -1) + '20', color: getScoreColor(evaluation.answerCompleteness ?? -1) }">
                K:{{ formatScore(evaluation.answerCompleteness ?? -1) }}
              </span>
            </div>
          </div>

          <!-- 展开详情 -->
          <div v-if="expandedId === evaluation.id" class="mt-3 pt-3 border-t space-y-2 text-xs">
            <div>
              <span class="font-medium text-muted-foreground">{{ t('settings.developer.evaluation.answer') }}:</span>
              <p class="mt-1 text-foreground/80 whitespace-pre-wrap break-words">{{ evaluation.answer.slice(0, 500) }}{{ evaluation.answer.length > 500 ? '...' : '' }}</p>
            </div>
            <div>
              <span class="font-medium text-muted-foreground">{{ t('settings.developer.evaluation.contexts') }} ({{ evaluation.contexts.length }}):</span>
              <div v-for="(ctx, i) in evaluation.contexts" :key="i" class="mt-1 p-2 bg-muted/30 rounded text-foreground/60 break-words">
                {{ ctx.slice(0, 200) }}{{ ctx.length > 200 ? '...' : '' }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Separator />

    <!-- ==================== 测试集管理 ==================== -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-sm font-medium text-muted-foreground">{{ t('settings.developer.evaluation.benchmark') }}</h4>
          <p class="text-[10px] text-muted-foreground mt-0.5">{{ t('settings.developer.evaluation.benchmarkDesc') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button v-if="evalStore.benchmarks.length > 0" variant="ghost" size="sm" class="text-xs text-destructive" @click="handleClearBenchmarks">
            <Trash2 class="h-3 w-3 mr-1" /> {{ t('settings.developer.evaluation.clearBenchmarks') }}
          </Button>
          <Button size="sm" @click="handleGenerateBenchmark" :disabled="evalStore.isGenerating">
            <Loader2 v-if="evalStore.isGenerating" class="h-3.5 w-3.5 animate-spin mr-1" />
            <Sparkles v-else class="h-3.5 w-3.5 mr-1" />
            {{ evalStore.isGenerating ? t('settings.developer.evaluation.generating') : t('settings.developer.evaluation.generateBenchmark') }}
          </Button>
        </div>
      </div>

      <!-- 生成进度 -->
      <div v-if="evalStore.isGenerating" class="p-3 border rounded-xl bg-primary/5">
        <div class="flex items-center justify-between text-xs mb-2">
          <span>{{ evalStore.generationProgress.fileName }}</span>
          <span>{{ evalStore.generationProgress.current }}/{{ evalStore.generationProgress.total }}</span>
        </div>
        <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div class="h-full bg-primary rounded-full transition-all" :style="{ width: `${(evalStore.generationProgress.current / Math.max(evalStore.generationProgress.total, 1)) * 100}%` }"></div>
        </div>
      </div>

      <!-- 测试用例列表 -->
      <div v-if="evalStore.benchmarks.length === 0 && !evalStore.isGenerating" class="text-sm text-muted-foreground p-4 text-center border rounded-xl bg-muted/20">
        {{ t('settings.developer.evaluation.noBenchmarks') }}
      </div>

      <div v-else-if="evalStore.benchmarks.length > 0" class="space-y-2 max-h-[300px] overflow-y-auto pr-1">
        <div
          v-for="benchmark in evalStore.benchmarks"
          :key="benchmark.id"
          class="group p-3 border rounded-xl bg-card/30 hover:bg-card/60 transition-colors"
        >
          <div class="flex items-start justify-between">
            <div class="flex-1 min-w-0 mr-2">
              <div class="flex items-center gap-1.5 mb-1">
                <p class="text-sm font-medium truncate">{{ benchmark.question }}</p>
              </div>
              <p class="text-xs text-muted-foreground mt-1 line-clamp-2">{{ benchmark.expectedAnswer }}</p>
              <div class="flex items-center gap-1.5 mt-1.5">
                <span class="text-[10px] text-muted-foreground/60">{{ benchmark.sourceFile }}</span>
                <span v-if="benchmark.difficulty" class="px-1.5 py-0.5 rounded text-[10px]"
                  :class="{
                    'bg-emerald-500/10 text-emerald-500': benchmark.difficulty === 'easy',
                    'bg-amber-500/10 text-amber-500': benchmark.difficulty === 'medium',
                    'bg-rose-500/10 text-rose-500': benchmark.difficulty === 'hard'
                  }">
                  {{ t(`settings.developer.evaluation.difficulty_${benchmark.difficulty}`) }}
                </span>
                <span v-if="benchmark.type" class="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-500 text-[10px]">
                  {{ t(`settings.developer.evaluation.type_${benchmark.type}`) }}
                </span>
              </div>
            </div>
            <Button variant="ghost" size="icon" class="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" @click="evalStore.deleteBenchmark(benchmark.id)">
              <X class="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <Separator />

    <!-- ==================== 回归测试 ==================== -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <div>
          <h4 class="text-sm font-medium text-muted-foreground">{{ t('settings.developer.evaluation.regression') }}</h4>
          <p class="text-[10px] text-muted-foreground mt-0.5">{{ t('settings.developer.evaluation.regressionDesc') }}</p>
        </div>
        <div class="flex items-center gap-2">
          <Button v-if="evalStore.benchmarkRuns.length > 0" variant="ghost" size="sm" class="text-xs text-destructive" @click="handleClearRuns">
            <Trash2 class="h-3 w-3 mr-1" /> {{ t('settings.developer.evaluation.clearRuns') }}
          </Button>
          <Button size="sm" @click="handleRunRegression" :disabled="evalStore.isRunningBenchmark || evalStore.benchmarks.length === 0">
            <Loader2 v-if="evalStore.isRunningBenchmark" class="h-3.5 w-3.5 animate-spin mr-1" />
            <Play v-else class="h-3.5 w-3.5 mr-1" />
            {{ evalStore.isRunningBenchmark ? t('settings.developer.evaluation.running') : t('settings.developer.evaluation.runRegression') }}
          </Button>
        </div>
      </div>

      <!-- 运行进度 -->
      <div v-if="evalStore.isRunningBenchmark" class="p-3 border rounded-xl bg-primary/5">
        <div class="flex items-center justify-between text-xs mb-2">
          <span class="truncate">{{ evalStore.benchmarkProgress.question }}...</span>
          <span>{{ evalStore.benchmarkProgress.current }}/{{ evalStore.benchmarkProgress.total }}</span>
        </div>
        <div class="w-full h-1.5 bg-muted rounded-full overflow-hidden">
          <div class="h-full bg-primary rounded-full transition-all" :style="{ width: `${(evalStore.benchmarkProgress.current / Math.max(evalStore.benchmarkProgress.total, 1)) * 100}%` }"></div>
        </div>
      </div>

      <!-- 运行历史 -->
      <div v-if="evalStore.benchmarkRuns.length === 0 && !evalStore.isRunningBenchmark" class="text-sm text-muted-foreground p-4 text-center border rounded-xl bg-muted/20">
        {{ t('settings.developer.evaluation.noRuns') }}
      </div>

      <div v-else-if="evalStore.benchmarkRuns.length > 0" class="space-y-2">
        <div
          v-for="(run, runIndex) in reversedRuns"
          :key="run.id"
          class="p-4 border rounded-xl bg-card/30 space-y-3"
        >
          <div class="flex items-center justify-between">
            <div>
              <p class="text-sm font-medium">{{ run.runName }}</p>
              <p class="text-[10px] text-muted-foreground">
                {{ formatTime(run.createdAt) }} · {{ run.totalCases }} {{ t('settings.developer.evaluation.cases') }}
                <span v-if="run.judgeModel" class="ml-1 opacity-60">· {{ run.judgeModel }}</span>
              </p>
            </div>
            <Button variant="ghost" size="icon" class="h-6 w-6" @click="evalStore.deleteBenchmarkRun(run.id)">
              <Trash2 class="h-3 w-3" />
            </Button>
          </div>

          <!-- 得分条：6 维度 -->
          <div class="grid grid-cols-3 gap-2">
            <div class="text-center p-2 rounded-lg bg-muted/30">
              <div class="text-lg font-bold" :style="{ color: getScoreColor(run.avgFaithfulness) }">{{ formatScore(run.avgFaithfulness) }}</div>
              <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.faithfulness') }}</div>
              <DiffBadge v-if="runIndex === 0 && evalStore.latestRunDiff" :value="evalStore.latestRunDiff.faithfulness" />
            </div>
            <div class="text-center p-2 rounded-lg bg-muted/30">
              <div class="text-lg font-bold" :style="{ color: getScoreColor(run.avgRelevance) }">{{ formatScore(run.avgRelevance) }}</div>
              <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.answerRelevance') }}</div>
              <DiffBadge v-if="runIndex === 0 && evalStore.latestRunDiff" :value="evalStore.latestRunDiff.relevance" />
            </div>
            <div class="text-center p-2 rounded-lg bg-muted/30">
              <div class="text-lg font-bold" :style="{ color: getScoreColor(run.avgPrecision) }">{{ formatScore(run.avgPrecision) }}</div>
              <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.contextPrecision') }}</div>
              <DiffBadge v-if="runIndex === 0 && evalStore.latestRunDiff" :value="evalStore.latestRunDiff.precision" />
            </div>
            <div class="text-center p-2 rounded-lg bg-muted/30">
              <div class="text-lg font-bold" :style="{ color: getScoreColor(run.avgRecall ?? -1) }">{{ formatScore(run.avgRecall ?? -1) }}</div>
              <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.contextRecall') }}</div>
              <DiffBadge v-if="runIndex === 0 && evalStore.latestRunDiff" :value="evalStore.latestRunDiff.recall" />
            </div>
            <div class="text-center p-2 rounded-lg bg-muted/30">
              <div class="text-lg font-bold" :style="{ color: getScoreColor(run.avgCorrectness ?? -1) }">{{ formatScore(run.avgCorrectness ?? -1) }}</div>
              <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.answerCorrectness') }}</div>
              <DiffBadge v-if="runIndex === 0 && evalStore.latestRunDiff" :value="evalStore.latestRunDiff.correctness" />
            </div>
            <div class="text-center p-2 rounded-lg bg-muted/30">
              <div class="text-lg font-bold" :style="{ color: getScoreColor(run.avgCompleteness ?? -1) }">{{ formatScore(run.avgCompleteness ?? -1) }}</div>
              <div class="text-[10px] text-muted-foreground">{{ t('settings.developer.evaluation.answerCompleteness') }}</div>
              <DiffBadge v-if="runIndex === 0 && evalStore.latestRunDiff" :value="evalStore.latestRunDiff.completeness" />
            </div>
          </div>

          <!-- 参数快照 -->
          <div class="flex flex-wrap gap-2 text-[10px]">
            <span class="px-1.5 py-0.5 rounded bg-muted font-mono">chunk: {{ run.configSnapshot.chunkSize }}</span>
            <span class="px-1.5 py-0.5 rounded bg-muted font-mono">overlap: {{ run.configSnapshot.chunkOverlap }}</span>
            <span class="px-1.5 py-0.5 rounded bg-muted font-mono">top-k: {{ run.configSnapshot.resultCount }}</span>
            <span class="px-1.5 py-0.5 rounded bg-muted font-mono">threshold: {{ run.configSnapshot.similarityThreshold }}</span>
            <span class="px-1.5 py-0.5 rounded bg-muted font-mono">avg: {{ Math.round(run.avgLatencyMs) }}ms</span>
          </div>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, h } from 'vue'
import { useI18n } from '@/composables/useI18n'
import { useEvaluationStore } from '@/stores/evaluation'
import { useArticleStore } from '@/stores/article'
import { useToast } from '@/composables/useToast'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  ShieldCheck, Target, Crosshair, Clock, ListOrdered,
  BarChart3, Trash2, Sparkles, Loader2, X, Play,
  BookOpen, CheckCheck, TrendingUp, TrendingDown, Minus
} from 'lucide-vue-next'
import { ask } from '@tauri-apps/plugin-dialog'
import { logger } from '@/utils/logger'

const { t } = useI18n()
const evalStore = useEvaluationStore()
const articleStore = useArticleStore()
const { success, error } = useToast()

const expandedId = ref<string | null>(null)

// 反序（最新在前）
const reversedEvaluations = computed(() => [...evalStore.evaluations].reverse().slice(0, 50))
const reversedRuns = computed(() => [...evalStore.benchmarkRuns].reverse())

onMounted(async () => {
  await evalStore.loadAll()
})

// ==================== 子组件 ====================

/** 趋势箭头组件 */
const TrendArrow = (props: { trend?: 'up' | 'down' | 'stable' | null }) => {
  if (!props.trend) return null
  if (props.trend === 'up') return h(TrendingUp, { class: 'h-3 w-3 text-emerald-500' })
  if (props.trend === 'down') return h(TrendingDown, { class: 'h-3 w-3 text-rose-500' })
  return h(Minus, { class: 'h-3 w-3 text-muted-foreground' })
}

/** Diff 徽章组件（回归测试对比） */
const DiffBadge = (props: { value: number }) => {
  if (Math.abs(props.value) < 0.005) return null
  const pct = (props.value * 100).toFixed(0)
  const isPositive = props.value > 0
  return h('span', {
    class: `text-[10px] font-mono mt-0.5 block ${isPositive ? 'text-emerald-500' : 'text-rose-500'}`
  }, `${isPositive ? '+' : ''}${pct}%`)
}

// ==================== 操作 ====================

const toggleExpand = (id: string) => {
  expandedId.value = expandedId.value === id ? null : id
}

const handleClearHistory = async () => {
  const confirmed = await ask(t('settings.developer.evaluation.clearHistoryConfirm'), { kind: 'warning' })
  if (confirmed) {
    await evalStore.clearEvaluations()
    success(t('settings.developer.evaluation.toast.cleared'))
  }
}

const handleClearBenchmarks = async () => {
  const confirmed = await ask(t('settings.developer.evaluation.clearBenchmarksConfirm'), { kind: 'warning' })
  if (confirmed) {
    await evalStore.clearBenchmarks()
    success(t('settings.developer.evaluation.toast.cleared'))
  }
}

const handleClearRuns = async () => {
  const confirmed = await ask(t('settings.developer.evaluation.clearRunsConfirm'), { kind: 'warning' })
  if (confirmed) {
    await evalStore.clearBenchmarkRuns()
    success(t('settings.developer.evaluation.toast.cleared'))
  }
}

const handleGenerateBenchmark = async () => {
  try {
    // 获取工作区所有 md 文件路径
    if (articleStore.allArticle.length === 0) {
      await articleStore.loadAllArticle()
    }
    
    logger.evaluation.info(`[UI] allArticle 总数: ${articleStore.allArticle.length}`)
    
    const mdFiles = articleStore.allArticle
      .filter(a => a.path.endsWith('.md'))
      .map(a => a.path)

    logger.evaluation.info(`[UI] 筛选到 ${mdFiles.length} 个 md 文件:`, mdFiles)

    if (mdFiles.length === 0) {
      error(t('settings.developer.evaluation.toast.noMarkdownFound'))
      return
    }

    const count = await evalStore.generateBenchmarks(mdFiles, 3)
    logger.evaluation.info(`[UI] generateBenchmarks 返回: ${count}`)
    if (count > 0) {
      success(t('settings.developer.evaluation.toast.generatedCases', { count }))
    } else {
      error(t('settings.developer.evaluation.toast.generateFailedContent'))
    }
  } catch (e) {
    logger.evaluation.error('[UI] handleGenerateBenchmark 异常:', e)
    error(t('settings.developer.evaluation.toast.generateFailedConfig'))
  }
}

const handleRunRegression = async () => {
  try {
    const run = await evalStore.executeBenchmarkRun()
    if (run) {
      success(t('settings.developer.evaluation.toast.regressionComplete'))
    }
  } catch (e) {
    error(t('settings.developer.evaluation.toast.regressionFailed'))
  }
}

// ==================== 工具 ====================

const formatScore = (score: number | undefined) => {
  if (score === undefined || score < 0) return 'N/A'
  return (score * 100).toFixed(0) + '%'
}

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit'
  })
}

const getScoreColor = (score: number | undefined) => {
  if (score === undefined || score < 0) return '#6b7280'
  if (score >= 0.8) return '#10b981'  // 绿
  if (score >= 0.6) return '#f59e0b'  // 黄
  return '#ef4444'                     // 红
}
</script>
