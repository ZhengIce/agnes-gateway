<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowUpRight, ChevronLeft, ChevronRight, Copy, RefreshCw, ScrollText, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import { useClipboard } from '@/composables/useClipboard'
import { api, fmtNum, fmtCost } from '@/api'

const { copy } = useClipboard()
const logs = ref([]), total = ref(0), offset = ref(0), loading = ref(true), error = ref('')
const keyFilter = ref('all'), modelFilter = ref('all'), typeFilter = ref('all'), statusFilter = ref('all')
const keyOptions = ref([]), models = ref([]), detail = ref(null)
const keySelectOptions = computed(() => [{ value: 'all', label: '全部密钥' }, ...keyOptions.value.map(k => ({ value: String(k.id), label: k.name }))])
const modelOptions = computed(() => [{ value: 'all', label: '全部模型' }, ...models.value.map(model => ({ value: model, label: model }))])
const statusOptions = [{ value: 'all', label: '全部状态' }, { value: 'success', label: '成功请求' }, { value: 'error', label: '异常请求' }]
const typeOptions = [
  { value: 'all', label: '全部请求' }, { value: 'text', label: '文本请求' },
  { value: 'image', label: '图片生成' }, { value: 'video_create', label: '视频生成' },
  { value: 'video_query', label: '视频查询' }, { value: 'models', label: '模型列表查询' },
]
const hasFilters = computed(() => keyFilter.value !== 'all' || statusFilter.value !== 'all' || modelFilter.value !== 'all' || typeFilter.value !== 'all')
function requestLabel(row) {
  const type = row.request_type || (row.category === 'video' ? (row.endpoint === 'agnesapi' ? 'video_query' : 'video_create') : row.category)
  return typeOptions.find(option => option.value === type)?.label || '其他请求'
}
let version = 0
async function load() {
  const current = ++version
  loading.value = true; error.value = ''
  try {
    const p = new URLSearchParams({ limit: '50', offset: String(offset.value) })
    if (keyFilter.value !== 'all') p.set('api_key_id', keyFilter.value)
    if (modelFilter.value !== 'all') { p.set('model', modelFilter.value); p.set('model_exact', 'true') }
    if (typeFilter.value !== 'all') p.set('request_type', typeFilter.value)
    if (statusFilter.value !== 'all') p.set('status', statusFilter.value)
    const d = await api.get(`/admin/api/logs?${p}`)
    if (current !== version) return false
    logs.value = d.logs || []; total.value = d.total || 0
    models.value = d.models || []
    return true
  } catch (e) { if (current === version) error.value = e.message; return false }
  finally { if (current === version) loading.value = false }
}
function search() { offset.value = 0; load() }
function reset() { keyFilter.value = 'all'; modelFilter.value = 'all'; typeFilter.value = 'all'; statusFilter.value = 'all'; search() }
async function page(direction) { const previous = offset.value; offset.value = Math.max(0, offset.value + direction * 50); if (!await load()) offset.value = previous }
onMounted(() => { load(); api.get('/admin/api/keys').then(d => { keyOptions.value = d.keys || [] }).catch(e => toast.error(`密钥筛选加载失败：${e.message}`)) })
</script>

<template>
  <div class="page-stack">
    <PageHeader title="请求日志" description="每次调用都有迹可循，定位异常并查看详细用量。" eyebrow="Request logs"><Button variant="outline" :disabled="loading" @click="load"><RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />刷新日志</Button></PageHeader>
    <ErrorState :message="error" @retry="load" />
    <Card class="gap-0 overflow-hidden py-0 shadow-none">
      <form class="flex flex-wrap items-center gap-2 border-b p-4 sm:px-5" @submit.prevent="search">
        <div class="w-full min-w-0 sm:w-[240px]"><FilterSelect v-model="modelFilter" label="按模型筛选日志" :options="modelOptions" class="min-w-0 [&>span]:truncate" @update:model-value="search" /></div>
        <div class="w-36"><FilterSelect v-model="typeFilter" label="按请求类型筛选" :options="typeOptions" @update:model-value="search" /></div>
        <div class="w-36"><FilterSelect v-model="keyFilter" label="按对外密钥筛选" :options="keySelectOptions" @update:model-value="search" /></div>
        <div class="w-32"><FilterSelect v-model="statusFilter" label="按请求状态筛选" :options="statusOptions" @update:model-value="search" /></div>
        <Button type="submit" variant="secondary" :disabled="loading">查询</Button>
        <Button v-if="hasFilters" type="button" variant="ghost" size="sm" :disabled="loading" @click="reset"><X class="size-3.5" />重置</Button>
        <span class="ml-auto hidden text-xs text-muted-foreground xl:block">{{ fmtNum(total) }} 条记录</span>
      </form>
      <Table class="min-w-[1060px]"><TableHeader><TableRow class="bg-muted/30 hover:bg-muted/30"><TableHead class="pl-5 text-xs">时间 / 密钥</TableHead><TableHead class="text-xs">类型 / 端点 / 模型</TableHead><TableHead class="text-xs">状态</TableHead><TableHead class="text-right text-xs">耗时</TableHead><TableHead class="text-right text-xs">输入 / 输出 Token</TableHead><TableHead class="text-right text-xs">成本</TableHead><TableHead class="text-xs">错误信息</TableHead><TableHead class="w-12 pr-4"><span class="sr-only">详情</span></TableHead></TableRow></TableHeader><TableBody><TableRow v-for="r in logs" :key="r.id"><TableCell class="py-3.5 pl-5"><p class="text-[11px] whitespace-nowrap tabular-nums">{{ r.ts }}</p><p class="mt-1 text-[10px] text-muted-foreground">{{ r.api_key_name || '未关联密钥' }}</p></TableCell><TableCell><p class="text-[11px] font-medium">{{ requestLabel(r) }}</p><p class="mt-1 max-w-[240px] truncate font-mono text-[10px] text-muted-foreground" :title="r.endpoint">/{{ r.endpoint.replace(/^\//, '') }}</p><p class="mt-1 max-w-[240px] truncate text-[10px] text-muted-foreground" :title="r.model">{{ r.model || '未指定模型' }}</p></TableCell><TableCell><div class="flex items-center gap-1.5"><StatusBadge :tone="r.status < 400 ? 'success' : 'danger'">{{ r.status }}</StatusBadge><span v-if="r.stream" class="rounded border px-1 py-0.5 text-[9px] text-muted-foreground">SSE</span></div></TableCell><TableCell class="text-right text-[11px] tabular-nums">{{ r.latency_ms != null ? fmtNum(r.latency_ms) : '—' }}<span class="ml-1 text-[9px] text-muted-foreground">ms</span></TableCell><TableCell class="text-right text-[11px] tabular-nums">{{ r.prompt_tokens != null ? fmtNum(r.prompt_tokens) : '—' }}<span class="mx-1.5 text-muted-foreground/50">/</span>{{ r.completion_tokens != null ? fmtNum(r.completion_tokens) : '—' }}</TableCell><TableCell class="text-right text-[11px] tabular-nums">{{ fmtCost(r.cost_yuan) }}</TableCell><TableCell><p class="max-w-[165px] truncate text-[10px]" :class="r.error ? 'text-destructive' : 'text-muted-foreground'" :title="r.error || ''">{{ r.error || '—' }}</p></TableCell><TableCell class="pr-4"><Button variant="ghost" size="icon" class="size-7" :aria-label="`查看请求 ${r.id} 的详情`" @click="detail = r"><ArrowUpRight class="size-3.5 text-muted-foreground" /></Button></TableCell></TableRow></TableBody></Table>
      <div v-if="loading && !logs.length" class="space-y-4 p-6"><Skeleton v-for="n in 6" :key="n" class="h-9 w-full" /></div><EmptyState v-else-if="!logs.length" :title="hasFilters ? '未找到符合条件的记录' : '暂无请求日志'" :description="hasFilters ? '调整筛选条件，再试一次。' : '通过网关发起的 API 请求将自动记录在这里。'" :icon="ScrollText" />
      <div class="table-footer"><span>共 {{ fmtNum(total) }} 条<span v-if="total"> · 当前 {{ offset + 1 }}–{{ Math.min(offset + 50, total) }} 条</span></span><div class="flex items-center gap-3"><span class="tabular-nums">第 {{ Math.floor(offset / 50) + 1 }} / {{ Math.max(1, Math.ceil(total / 50)) }} 页</span><div class="flex gap-1"><Button variant="outline" size="icon" class="size-7" aria-label="上一页日志" :disabled="loading || offset === 0" @click="page(-1)"><ChevronLeft class="size-3.5" /></Button><Button variant="outline" size="icon" class="size-7" aria-label="下一页日志" :disabled="loading || offset + 50 >= total" @click="page(1)"><ChevronRight class="size-3.5" /></Button></div></div></div>
    </Card>
    <p class="text-[11px] leading-5 text-muted-foreground">成本按网关当前计价配置估算。流式响应以已返回的用量为准，缺失时可能采用估算值。</p>
    <Dialog :open="!!detail" @update:open="!$event && (detail = null)"><DialogContent class="max-h-[88dvh] overflow-y-auto sm:max-w-[600px]"><DialogHeader><DialogTitle>请求详情 <span class="ml-1 font-mono text-sm font-normal text-muted-foreground">#{{ detail?.id }}</span></DialogTitle><DialogDescription>{{ detail?.ts }} · {{ detail?.api_key_name || '未关联密钥' }}</DialogDescription></DialogHeader><template v-if="detail"><div class="flex items-center gap-2"><StatusBadge :tone="detail.status < 400 ? 'success' : 'danger'">HTTP {{ detail.status }}</StatusBadge><StatusBadge :dot="false">{{ detail.category }}</StatusBadge><StatusBadge v-if="detail.stream" :dot="false">流式响应</StatusBadge></div><dl class="grid grid-cols-2 gap-x-5 gap-y-4 rounded-lg border p-4 text-xs"><div v-for="(value, label) in { '模型': detail.model || '未指定', '耗时': `${detail.latency_ms ?? '—'} ms`, '输入 Token': detail.prompt_tokens ?? '—', '输出 Token': detail.completion_tokens ?? '—', '图像数量': detail.image_count ?? '—', '图像尺寸': detail.image_size || '—', '视频时长': detail.video_seconds != null ? `${detail.video_seconds} 秒` : '—', '预估成本': fmtCost(detail.cost_yuan) }" :key="label"><dt class="mb-1 text-muted-foreground">{{ label }}</dt><dd class="break-all">{{ value }}</dd></div></dl><div class="code-block break-all whitespace-normal">/{{ detail.endpoint.replace(/^\//, '') }}</div><div v-if="detail.error" class="rounded-lg border border-destructive/20 bg-destructive/5 p-4"><p class="mb-2 text-xs font-medium text-destructive">错误详情</p><pre class="text-xs leading-6 break-all whitespace-pre-wrap text-destructive">{{ detail.error }}</pre></div><Button variant="outline" class="justify-self-end" @click="copy(JSON.stringify(detail, null, 2), '请求详情已复制')"><Copy class="size-3.5" />复制详情</Button></template></DialogContent></Dialog>
  </div>
</template>
