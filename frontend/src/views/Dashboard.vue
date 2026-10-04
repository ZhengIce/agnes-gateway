<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Activity, ArrowUpRight, ArrowRight, Coins, Copy, KeyRound, RefreshCw, ShieldCheck, Zap } from '@lucide/vue'
import { init, use } from 'echarts/core'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useClipboard } from '@/composables/useClipboard'
import { api, fmtNum, fmtCost } from '@/api'

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer])
const { copy } = useClipboard()
const range = ref('24h')
const totals = ref({})
const series = ref([])
const byModel = ref([])
const byKey = ref([])
const loading = ref(true)
const error = ref('')
const updated = ref('')
const chartElement = ref(null)
const baseUrl = `${location.origin}/v1`
const modelTotal = computed(() => byModel.value.reduce((sum, row) => sum + Number(row.tokens || 0), 0))
const metrics = computed(() => [
  { label: '总请求数', value: fmtNum(totals.value.requests), icon: Activity, note: '所有 API 请求', unit: '次' },
  { label: 'Token 用量', value: fmtNum(totals.value.tokens), icon: Zap, note: '输入与输出 Token 合计', unit: 'tokens' },
  { label: '预估成本', value: fmtCost(totals.value.cost), icon: Coins, note: '按当前配置价格计量', unit: 'CNY' },
  { label: '错误率', value: `${((totals.value.error_rate || 0) * 100).toFixed(1)}%`, icon: ShieldCheck, note: `${fmtNum(totals.value.errors)} 次请求异常`, unit: '' },
])
let chart, resizeObserver, requestVersion = 0
let disposed = false
async function load() {
  const version = ++requestVersion
  loading.value = true
  error.value = ''
  try {
    const d = await api.get(`/admin/api/overview?range=${range.value}`)
    if (disposed || version !== requestVersion) return
    totals.value = d.totals || {}
    series.value = d.series || []
    byModel.value = d.by_model || []
    byKey.value = d.by_key || []
    updated.value = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    await nextTick()
    render()
  } catch (e) { if (version === requestVersion) error.value = e.message }
  finally { if (version === requestVersion) loading.value = false }
}
function render() {
  if (!chart) return
  chart.setOption({
    animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    textStyle: { fontFamily: 'Segoe UI, Microsoft YaHei, sans-serif', fontSize: 11 },
    tooltip: { trigger: 'axis', backgroundColor: '#fff', borderColor: '#e4e4e7', textStyle: { fontSize: 12, color: '#27272a' }, axisPointer: { type: 'line', lineStyle: { color: '#a1a1aa', type: 'dashed' } } },
    grid: { left: 45, right: 52, top: 22, bottom: 28 },
    xAxis: { type: 'category', boundaryGap: false, data: series.value.map(s => range.value === '7d' ? s.bucket.slice(5) : s.bucket.slice(11) + ':00'), axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: '#71717a', margin: 14 } },
    yAxis: [
      { type: 'value', minInterval: 1, splitNumber: 4, axisLabel: { color: '#71717a' }, splitLine: { lineStyle: { color: '#efeff1', type: 'dashed' } } },
      { type: 'value', splitNumber: 4, axisLabel: { color: '#8e8e98', formatter: v => v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : v }, splitLine: { show: false } },
    ],
    series: [
      { name: '请求数', type: 'line', smooth: 0.25, showSymbol: series.value.length < 2, symbolSize: 6, lineStyle: { color: '#27272a', width: 2 }, itemStyle: { color: '#27272a' }, areaStyle: { color: '#e8e8eb', opacity: 0.45 }, data: series.value.map(s => s.requests) },
      { name: 'Token', type: 'line', yAxisIndex: 1, smooth: 0.25, showSymbol: series.value.length < 2, symbolSize: 5, lineStyle: { color: '#8d98aa', width: 1.5, type: 'dashed' }, itemStyle: { color: '#8d98aa' }, data: series.value.map(s => s.tokens) },
    ],
  }, true)
  chart.resize()
}
onMounted(async () => {
  await nextTick()
  chart = init(chartElement.value)
  resizeObserver = new ResizeObserver(() => chart?.resize())
  resizeObserver.observe(chartElement.value)
  load()
})
watch(range, load)
onBeforeUnmount(() => { disposed = true; resizeObserver?.disconnect(); chart?.dispose() })
</script>

<template>
  <div class="page-stack">
    <PageHeader title="网关总览" description="所有调用，一目了然。掌握你的 API 用量与运行情况。" eyebrow="Overview">
      <Tabs v-model="range"><TabsList class="h-9"><TabsTrigger value="24h" class="text-xs">近 24 小时</TabsTrigger><TabsTrigger value="7d" class="text-xs">近 7 天</TabsTrigger></TabsList></Tabs>
      <Button variant="outline" size="icon" :disabled="loading" aria-label="刷新总览" @click="load"><RefreshCw class="size-4" :class="{ 'animate-spin': loading }" /></Button>
    </PageHeader>
    <ErrorState :message="error" @retry="load" />
    <div class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card v-for="metric in metrics" :key="metric.label" class="gap-4 py-5 shadow-none">
        <CardHeader class="flex flex-row items-center justify-between px-5"><CardTitle class="text-xs font-medium text-muted-foreground">{{ metric.label }}</CardTitle><component :is="metric.icon" class="size-4 text-muted-foreground/70" :stroke-width="1.6" /></CardHeader>
        <CardContent class="px-5"><Skeleton v-if="loading" class="mb-3 h-9 w-28" /><p v-else class="metric-value">{{ metric.value }}<span v-if="metric.unit" class="ml-2 text-[10px] font-normal tracking-normal text-muted-foreground">{{ metric.unit }}</span></p><p class="mt-3 text-[11px] text-muted-foreground">{{ metric.note }}</p></CardContent>
      </Card>
    </div>
    <div class="grid gap-5 xl:grid-cols-[1.85fr_1fr]">
      <Card class="min-w-0 gap-3 shadow-none">
        <CardHeader class="flex flex-row flex-wrap items-start justify-between gap-3"><div><CardTitle class="text-sm font-semibold">调用趋势</CardTitle><CardDescription class="mt-1 text-xs">请求量与 Token 消耗的时间分布</CardDescription></div><div class="flex gap-4 pt-1 text-[10px] text-muted-foreground"><span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-foreground" />请求数</span><span class="flex items-center gap-1.5"><span class="h-0.5 w-3 bg-chart-2" />Token</span></div></CardHeader>
        <CardContent class="relative px-2"><div ref="chartElement" class="h-[260px] w-full" role="img" aria-label="API 请求与 Token 用量趋势图" /><div v-if="loading" class="absolute inset-4 flex items-end gap-3 bg-card"><Skeleton v-for="n in 12" :key="n" class="flex-1" :style="{ height: `${25 + (n * 17) % 65}%` }" /></div><EmptyState v-else-if="!series.length" class="absolute inset-0 bg-card" title="还没有调用记录" description="使用对外密钥发起请求后，趋势将显示在这里。" :icon="Activity" /></CardContent>
      </Card>
      <Card class="min-w-0 gap-5 shadow-none">
        <CardHeader><CardTitle class="text-sm font-semibold">模型用量</CardTitle><CardDescription class="mt-1 text-xs">按 Token 消耗排名 · Top 5</CardDescription></CardHeader>
        <CardContent><div v-if="loading" class="space-y-7"><Skeleton v-for="n in 4" :key="n" class="h-7 w-full" /></div><EmptyState v-else-if="!byModel.length" title="暂无模型用量" description="各模型的使用情况会自动汇总。" :icon="Zap" /><div v-else class="space-y-5"><div v-for="(model, index) in [...byModel].sort((a, b) => b.tokens - a.tokens).slice(0, 5)" :key="model.model"><div class="mb-2 flex items-center justify-between gap-2 text-xs"><span class="flex min-w-0 items-center gap-2"><span class="text-[10px] text-muted-foreground">0{{ index + 1 }}</span><span class="truncate" :title="model.model">{{ model.model }}</span></span><span class="shrink-0 font-medium tabular-nums">{{ fmtNum(model.tokens) }}</span></div><div class="h-1.5 overflow-hidden rounded-full bg-muted"><div class="h-full rounded-full bg-foreground/75" :style="{ width: `${modelTotal ? model.tokens / modelTotal * 100 : 0}%` }" /></div></div></div><p v-if="byModel.length" class="mt-6 border-t pt-4 text-[10px] text-muted-foreground">仅统计已返回或估算的 Token 用量</p></CardContent>
      </Card>
    </div>
    <Card class="gap-0 overflow-hidden py-0 shadow-none">
      <div class="table-toolbar"><div><h2 class="text-sm font-semibold">密钥使用情况</h2><p class="mt-1 text-xs text-muted-foreground">按调用量汇总，追踪每个客户端的用量。</p></div><Button variant="ghost" size="sm" as-child><router-link to="/keys">管理密钥<ArrowUpRight class="size-3.5" /></router-link></Button></div>
      <Table><TableHeader><TableRow class="bg-muted/30 hover:bg-muted/30"><TableHead class="pl-6 text-xs">对外密钥</TableHead><TableHead class="text-right text-xs">请求数</TableHead><TableHead class="text-right text-xs">Token 用量</TableHead><TableHead class="pr-6 text-right text-xs">预估成本</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="(item, index) in byKey" :key="index"><TableCell class="py-4 pl-6"><span class="flex items-center gap-2.5 text-xs font-medium"><KeyRound class="size-3.5 text-muted-foreground" />{{ item.name }}</span></TableCell><TableCell class="text-right text-xs tabular-nums">{{ fmtNum(item.requests) }}</TableCell><TableCell class="text-right text-xs tabular-nums">{{ fmtNum(item.tokens) }}</TableCell><TableCell class="pr-6 text-right text-xs tabular-nums">{{ fmtCost(item.cost) }}</TableCell></TableRow></TableBody></Table>
      <div v-if="loading && !byKey.length" class="space-y-3 p-6"><Skeleton v-for="n in 3" :key="n" class="h-6 w-full" /></div><EmptyState v-else-if="!byKey.length" title="等待第一次调用" description="创建对外密钥并连接客户端，即可开始统计。" :icon="KeyRound"><Button variant="outline" size="sm" as-child><router-link to="/keys">前往对外密钥<ArrowRight class="size-3" /></router-link></Button></EmptyState>
      <div class="table-footer"><span>{{ range === '24h' ? '最近 24 小时' : '最近 7 天' }}的数据</span><span v-if="updated" class="tabular-nums">更新于 {{ updated }}</span></div>
    </Card>
    <div class="flex flex-col items-start justify-between gap-4 rounded-xl border border-dashed px-5 py-4 sm:flex-row sm:items-center"><div><p class="text-xs font-medium">准备好连接你的客户端？</p><p class="mt-1 text-[11px] text-muted-foreground">使用 OpenAI 兼容地址与网关签发的 ag- 密钥。</p></div><div class="flex max-w-full items-center gap-2"><code class="truncate text-xs text-muted-foreground">{{ baseUrl }}</code><Button variant="ghost" size="icon" class="size-8 shrink-0" aria-label="复制 API 地址" @click="copy(baseUrl)"><Copy class="size-3.5" /></Button></div></div>
  </div>
</template>
