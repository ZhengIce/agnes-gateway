<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Boxes, MessageSquare, Image, Film, Search, RefreshCw, Copy, ArrowUpRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import { useClipboard } from '@/composables/useClipboard'
import { api } from '@/api'

const models = ref([]), query = ref(''), category = ref('all')
const loading = ref(false), error = ref(''), warning = ref(''), verifiedOn = ref(''), pricingSource = ref('')
const { copy } = useClipboard()
const categories = [
  { value: 'all', label: '全部模型', icon: Boxes },
  { value: 'text', label: '文本', icon: MessageSquare },
  { value: 'image', label: '生图', icon: Image },
  { value: 'video', label: '生视频', icon: Film },
]
const kinds = Object.fromEntries(categories.map(item => [item.value, item]))
const counts = computed(() => Object.fromEntries(categories.map(item => [
  item.value, models.value.filter(model => item.value === 'all' || model.kind === item.value).length,
])))
const filtered = computed(() => models.value.filter(model =>
  (category.value === 'all' || model.kind === category.value)
  && `${model.id} ${model.name} ${model.description}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const money = amount => `¥${Number(amount).toLocaleString('zh-CN', { maximumFractionDigits: 4 })}`
let disposed = false
async function load(refresh = false) {
  if (loading.value) return
  loading.value = true
  error.value = ''
  try {
    const data = await api.get(`/admin/api/models${refresh ? '?refresh=true' : ''}`)
    if (disposed) return
    models.value = data.models || []
    warning.value = data.warning || ''
    verifiedOn.value = data.pricing_verified_on || ''
    pricingSource.value = data.pricing_source || ''
  } catch (failure) { if (!disposed) error.value = failure.message }
  finally { if (!disposed) loading.value = false }
}
onMounted(() => load())
onBeforeUnmount(() => { disposed = true })
</script>

<template>
  <div class="page-stack">
    <PageHeader title="模型列表" description="浏览模型能力、使用场景和官方参考价格。" eyebrow="Model catalog">
      <Button variant="outline" :disabled="loading" @click="load(true)">
        <RefreshCw class="size-4" :class="{ 'motion-safe:animate-spin': loading }" />刷新模型
      </Button>
    </PageHeader>
    <ErrorState :message="error" @retry="load(true)" />
    <p v-if="warning" role="status" class="rounded-lg border bg-muted/30 px-4 py-3 text-xs leading-5 text-muted-foreground">{{ warning }}</p>

    <div class="flex flex-wrap items-center justify-between gap-4">
      <div class="flex max-w-full flex-wrap gap-1 rounded-lg border bg-muted/30 p-1" role="group" aria-label="按模型能力筛选">
        <Button v-for="item in categories" :key="item.value" variant="ghost" size="sm"
          class="gap-2 text-xs" :class="category === item.value ? 'bg-card text-foreground shadow-xs hover:bg-card' : 'text-muted-foreground'"
          :aria-pressed="category === item.value" @click="category = item.value">
          <component :is="item.icon" class="size-3.5" />{{ item.label }}
          <span class="text-[10px] tabular-nums text-muted-foreground">{{ counts[item.value] }}</span>
        </Button>
      </div>
      <div class="relative w-full sm:w-64">
        <Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input v-model="query" aria-label="搜索模型" placeholder="搜索名称或能力…" class="pl-9" />
      </div>
    </div>

    <div v-if="loading && !models.length" class="grid gap-4 md:grid-cols-2 2xl:grid-cols-3" aria-label="正在加载模型">
      <Skeleton v-for="index in 6" :key="index" class="h-80 rounded-xl" />
    </div>
    <EmptyState v-else-if="!filtered.length && !error" title="没有匹配的模型" description="试试其他名称，或切换模型类型。" :icon="Boxes" />
    <div v-else class="grid items-stretch gap-4 md:grid-cols-2 2xl:grid-cols-3">
      <Card v-for="model in filtered" :key="model.id" class="flex min-w-0 flex-col gap-0 overflow-hidden p-0 shadow-none">
        <div class="flex-1 p-5">
          <div class="mb-4 flex items-start justify-between gap-3">
            <div class="flex size-10 shrink-0 items-center justify-center rounded-lg border bg-muted/30">
              <component :is="(kinds[model.kind] || kinds.text).icon" class="size-5 text-foreground" :stroke-width="1.5" aria-hidden="true" />
            </div>
            <div class="flex flex-wrap justify-end gap-1.5 text-[10px]">
              <span class="rounded-md border px-2 py-1">{{ (kinds[model.kind] || kinds.text).label }}</span>
              <span class="rounded-md bg-muted/60 px-2 py-1 text-muted-foreground">{{ model.upcoming ? '即将上线' : model.listed_upstream ? '上游已返回' : '文档收录' }}</span>
            </div>
          </div>
          <h2 class="break-words text-base font-semibold">{{ model.name }}</h2>
          <div class="mt-1 flex min-w-0 items-center gap-1">
            <code class="min-w-0 break-all text-[11px] leading-5 text-muted-foreground">{{ model.id }}</code>
            <Button variant="ghost" size="icon" class="size-6 shrink-0 text-muted-foreground" :aria-label="`复制模型 ID：${model.id}`"
              @click="copy(model.id, '模型 ID 已复制')"><Copy class="size-3" /></Button>
          </div>
          <p class="mt-3 text-xs leading-6 text-muted-foreground">{{ model.description }}</p>
          <div v-if="model.features?.length" class="mt-4 flex flex-wrap gap-1.5">
            <span v-for="feature in model.features" :key="feature" class="rounded-md bg-muted/50 px-2 py-1 text-[10px] text-muted-foreground">{{ feature }}</span>
          </div>
        </div>
        <div class="border-t px-5 py-4">
          <div class="mb-3 flex items-center justify-between gap-2">
            <h3 class="text-xs font-medium">官方参考价格</h3>
            <span v-if="model.promotion" class="text-[10px] text-muted-foreground">当前优惠</span>
          </div>
          <dl v-if="model.prices?.length" class="space-y-2">
            <div v-for="row in model.prices" :key="row.label" class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-xs">
              <dt class="text-muted-foreground">{{ row.label }}</dt>
              <dd class="text-right tabular-nums">
                <del v-if="row.original != null && row.original !== row.amount" class="mr-2 text-[10px] text-muted-foreground">{{ money(row.original) }}</del>
                <span class="font-medium">{{ money(row.amount) }}</span><span class="ml-1 text-[10px] text-muted-foreground">/ {{ row.unit }}</span>
              </dd>
            </div>
          </dl>
          <p v-else class="text-xs leading-6 text-muted-foreground">暂无已核实的公开价格。</p>
          <p v-if="model.price_note" class="mt-3 text-[10px] leading-5 text-muted-foreground">{{ model.price_note }}</p>
          <a v-if="model.doc" :href="model.doc" target="_blank" rel="noopener noreferrer"
            class="mt-4 inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
            查看模型文档<ArrowUpRight class="size-3" />
          </a>
        </div>
      </Card>
    </div>
    <div v-if="models.length" class="space-y-1 text-[11px] leading-6 text-muted-foreground">
      <p>显示 {{ filtered.length }} / {{ models.length }} 个模型。目录包含官方文档与当前上游返回的型号，能否调用取决于密钥权限。</p>
      <p>价格核对日期：{{ verifiedOn }}。价格为官方文档快照，优惠和实际费用以上游账单为准；不等同于网关的成本估算配置。
        <a v-if="pricingSource" :href="pricingSource" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-foreground hover:underline">定价来源<ArrowUpRight class="size-3" /></a>
      </p>
    </div>
  </div>
</template>
