<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CheckCheck, ChevronDown, ChevronLeft, ChevronRight, Layers3, LoaderCircle, MoreHorizontal, Pause, Play, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload, FileText, KeyRound } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import FilterSelect from '@/components/FilterSelect.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { api, fmtNum } from '@/api'

const keys = ref([]), selected = ref([]), query = ref('')
const loading = ref(true), error = ref(''), showAdd = ref(false), busyIds = ref(new Set()), batchBusy = ref(false)
const tab = ref('single'), singleKey = ref(''), multiKeys = ref(''), file = ref(null), fileInputKey = ref(0)
const addResult = ref(''), addError = ref(''), adding = ref(false), pending = ref(null)
const page = ref(1), pageSize = ref('20'), tableArea = ref(null)
const pageSizeOptions = [10, 20, 50, 100].map(value => ({ value: String(value), label: `${value} 条/页` }))
const filtered = computed(() => keys.value.filter(k => `${k.name} ${k.masked}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / Number(pageSize.value))))
const pageStart = computed(() => (page.value - 1) * Number(pageSize.value))
const pageKeys = computed(() => filtered.value.slice(pageStart.value, pageStart.value + Number(pageSize.value)))
const allSelected = computed(() => pageKeys.value.length > 0 && pageKeys.value.every(k => selected.value.includes(k.id)))
const selectionState = computed(() => allSelected.value ? true : pageKeys.value.some(k => selected.value.includes(k.id)) ? 'indeterminate' : false)
const offPageSelected = computed(() => selected.value.filter(id => !pageKeys.value.some(k => k.id === id)).length)
const enabled = computed(() => keys.value.filter(k => k.enabled).length)
const cooling = computed(() => keys.value.filter(k => k.enabled && k.cooldown_seconds > 0).length)
const canAdd = computed(() => tab.value === 'single' ? !!singleKey.value.trim() : tab.value === 'multi' ? !!multiKeys.value.trim() : !!file.value)
let timer, fetching = false, disposed = false
async function load(silent = false) {
  if (fetching) return
  fetching = true
  if (!silent) loading.value = true
  try {
    const d = await api.get('/admin/api/pool')
    if (disposed) return
    keys.value = d.keys || []
    selected.value = selected.value.filter(id => keys.value.some(k => k.id === id))
    error.value = ''
  } catch (e) { error.value = e.message }
  finally { loading.value = false; fetching = false }
}
function toggleAll(value) {
  if (value === true) selected.value = [...new Set([...selected.value, ...pageKeys.value.map(k => k.id)])]
  else selected.value = selected.value.filter(id => !pageKeys.value.some(k => k.id === id))
}
function selectRow(id, value) { selected.value = value === true ? [...new Set([...selected.value, id])] : selected.value.filter(item => item !== id) }
function status(k) {
  if (!k.enabled) return { label: '已停用', tone: 'neutral' }
  if (k.cooldown_seconds > 0) return { label: `冷却 ${k.cooldown_seconds}s`, tone: 'warning' }
  return { valid: { label: '已验证', tone: 'success' }, invalid: { label: '无效', tone: 'danger' } }[k.status] || { label: '未验证', tone: 'neutral' }
}
async function updateKey(k, fields) {
  if (busyIds.value.has(k.id)) return
  busyIds.value.add(k.id)
  try { await api.patch(`/admin/api/pool/keys/${k.id}`, fields); await load(true); toast.success('上游密钥已更新') }
  catch (e) { toast.error(e.message) }
  finally { busyIds.value.delete(k.id) }
}
async function validate(k) {
  if (busyIds.value.has(k.id)) return
  busyIds.value.add(k.id)
  try { const d = await api.post(`/admin/api/pool/keys/${k.id}/validate`); d.valid ? toast.success(`${k.name} 验证通过`) : toast.error(`${k.name} 验证未通过，请检查密钥与上游连通性`); await load(true) }
  catch (e) { toast.error(e.message) }
  finally { busyIds.value.delete(k.id) }
}
function requestAction(action, ids, name) {
  const label = { enable: '启用', disable: '停用', delete: '删除' }[action]
  pending.value = { action, ids: [...ids], label, title: name ? `${label}「${name}」？` : `${label}选中的 ${ids.length} 把密钥？`, description: action === 'delete' ? '删除后该上游密钥将退出调度池，关联的视频任务可能无法继续查询。此操作无法撤销。' : `这些密钥将${action === 'enable' ? '重新参与' : '暂停参与'}上游请求调度。` }
}
async function confirmAction() {
  if (!pending.value || batchBusy.value) return
  batchBusy.value = true
  try { const { ids, action, label } = pending.value; await api.post('/admin/api/pool/batch', { ids, action }); selected.value = selected.value.filter(id => !ids.includes(id)); pending.value = null; await load(true); toast.success(`已${label} ${ids.length} 把密钥`) }
  catch (e) { toast.error(e.message) }
  finally { batchBusy.value = false }
}
async function batchValidate() {
  if (batchBusy.value || !selected.value.length) return
  batchBusy.value = true
  const ids = [...selected.value]
  let passed = 0, failed = 0
  try {
    for (const id of ids) {
      busyIds.value.add(id)
      try { const d = await api.post(`/admin/api/pool/keys/${id}/validate`); d.valid ? passed++ : failed++ }
      catch { failed++ }
      finally { busyIds.value.delete(id) }
    }
    await load(true)
    toast[failed ? 'warning' : 'success'](`验证完成：${passed} 把通过，${failed} 把未通过`)
  } finally { batchBusy.value = false }
}
function clearKeyInputs() {
  singleKey.value = ''; multiKeys.value = ''; file.value = null; fileInputKey.value++
}
function openAdd() {
  clearKeyInputs()
  tab.value = 'single'
  addError.value = ''; addResult.value = ''; showAdd.value = true
}
function setAddOpen(value) {
  if (adding.value) return
  if (!value) { clearKeyInputs(); addError.value = ''; addResult.value = '' }
  showAdd.value = value
}
async function submitAdd() {
  if (adding.value || !canAdd.value) return
  addError.value = ''; addResult.value = ''; adding.value = true
  try {
    let d
    if (tab.value === 'file') { const fd = new FormData(); fd.append('file', file.value); d = await api.postForm('/admin/api/pool/upload', fd) }
    else d = await api.post('/admin/api/pool/keys', { keys: tab.value === 'single' ? [singleKey.value.trim()] : multiKeys.value.split('\n') })
    addResult.value = `新增 ${d.added} 把密钥，跳过 ${d.skipped} 把重复密钥。`
    clearKeyInputs()
    await load(true); toast.success(addResult.value)
  } catch (e) { addError.value = e.message }
  finally { adding.value = false }
}
watch(query, () => { page.value = 1; selected.value = [] })
watch(pageSize, () => { page.value = 1 })
watch(pageCount, count => { page.value = Math.min(page.value, count) }, { flush: 'sync' })
watch([page, pageSize, query], () => {
  if (tableArea.value) tableArea.value.scrollTop = 0
}, { flush: 'post' })
onMounted(() => { load(); timer = setInterval(() => { if (!batchBusy.value && !busyIds.value.size && !showAdd.value && !pending.value) load(true) }, 5000) })
onBeforeUnmount(() => { disposed = true; clearInterval(timer) })
</script>

<template>
  <div class="pool-page flex min-h-0 min-w-0 flex-1 flex-col gap-4">
    <PageHeader class="shrink-0" title="上游密钥池" description="集中管理 Agnes 密钥，自动轮换与冷却；当前统一按 Free 档位调度。" eyebrow="Upstream pool"><Button @click="openAdd"><Plus class="size-4" />添加密钥</Button></PageHeader>
    <ErrorState :message="error" @retry="load()" />
    <div class="pool-stats grid shrink-0 grid-cols-2 gap-3 lg:grid-cols-4"><Card v-for="item in [{ label: '池内密钥', value: keys.length, note: '全部上游凭证' }, { label: '已启用', value: enabled, note: '参与请求调度' }, { label: '冷却中', value: cooling, note: '等待上游限流恢复' }, { label: '已停用', value: keys.length - enabled, note: '暂不参与调度' }]" :key="item.label" class="gap-2 px-4 py-3 shadow-none"><span class="text-xs text-muted-foreground">{{ item.label }}</span><Skeleton v-if="loading && !keys.length" class="h-8 w-12" /><span v-else class="text-2xl font-semibold tabular-nums">{{ item.value }}</span><span class="hidden text-[10px] text-muted-foreground md:block">{{ item.note }}</span></Card></div>
    <Card class="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden py-0 shadow-none">
      <div class="table-toolbar shrink-0"><div class="flex w-full flex-col gap-2 sm:flex-row sm:items-center"><div class="relative sm:w-64"><Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input v-model="query" aria-label="搜索上游密钥" placeholder="搜索名称或密钥标识…" class="pl-9" /></div></div><div class="flex shrink-0 items-center gap-2"><DropdownMenu><DropdownMenuTrigger as-child><Button variant="outline" size="sm" :disabled="!selected.length || batchBusy"><LoaderCircle v-if="batchBusy" class="size-3.5 animate-spin" />批量操作<span v-if="selected.length" class="text-muted-foreground">{{ selected.length }}</span><ChevronDown class="size-3.5" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @select="requestAction('enable', selected)"><Play class="size-4" />批量启用</DropdownMenuItem><DropdownMenuItem @select="requestAction('disable', selected)"><Pause class="size-4" />批量停用</DropdownMenuItem><DropdownMenuItem @select="batchValidate"><CheckCheck class="size-4" />验证连通性</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem class="text-destructive focus:text-destructive" @select="requestAction('delete', selected)"><Trash2 class="size-4" />批量删除</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Button variant="outline" size="icon" class="size-8" :disabled="loading" aria-label="刷新上游密钥池" @click="load()"><RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" /></Button></div></div>
      <div ref="tableArea" class="pool-table-scroll min-h-0 flex-1 overflow-auto overscroll-contain focus-visible:outline-2 focus-visible:outline-ring" role="region" aria-label="上游密钥列表" tabindex="0">
        <Table class="min-w-[960px]"><TableHeader class="sticky top-0 z-10 bg-card"><TableRow class="bg-muted/30 hover:bg-muted/30"><TableHead class="w-12 pl-5"><Checkbox :model-value="selectionState" aria-label="选择本页全部密钥" @update:model-value="toggleAll" /></TableHead><TableHead class="text-xs">名称 / 密钥</TableHead><TableHead class="text-xs">状态</TableHead><TableHead class="text-xs">启用</TableHead><TableHead class="text-xs">RPM · 文本 / 图像 / 视频</TableHead><TableHead class="text-right text-xs">成功 / 失败</TableHead><TableHead class="text-xs">最后调用</TableHead><TableHead class="w-14 pr-5"><span class="sr-only">操作</span></TableHead></TableRow></TableHeader><TableBody>
          <TableRow v-for="k in pageKeys" :key="k.id" :data-state="selected.includes(k.id) ? 'selected' : undefined"><TableCell class="pl-5"><Checkbox :model-value="selected.includes(k.id)" :aria-label="`选择 ${k.name}`" @update:model-value="selectRow(k.id, $event)" /></TableCell><TableCell class="py-4"><p class="text-xs font-medium">{{ k.name }}</p><code class="mt-1 block text-[10px] text-muted-foreground">{{ k.masked }}</code></TableCell><TableCell><StatusBadge :tone="status(k).tone">{{ status(k).label }}</StatusBadge></TableCell><TableCell><Switch :model-value="!!k.enabled" :disabled="busyIds.has(k.id) || batchBusy" :aria-label="`${k.name} 启用状态`" @update:model-value="updateKey(k, { enabled: !k.enabled })" /></TableCell><TableCell><div class="flex gap-3"><div v-for="cat in ['text', 'image', 'video']" :key="cat" class="w-11"><p class="mb-1.5 text-[10px] tabular-nums">{{ k.rpm_used[cat] }}<span class="text-muted-foreground"> / {{ k.rpm_limit[cat] }}</span></p><div class="h-1 rounded-full bg-muted"><div class="h-full rounded-full" :class="k.rpm_used[cat] >= k.rpm_limit[cat] ? 'bg-warning' : 'bg-foreground/50'" :style="{ width: `${Math.min(100, k.rpm_limit[cat] > 0 ? k.rpm_used[cat] / k.rpm_limit[cat] * 100 : 0)}%` }" /></div></div></div></TableCell><TableCell class="text-right text-xs tabular-nums">{{ fmtNum(k.success_count) }}<span class="mx-1.5 text-muted-foreground/50">/</span><span :class="k.error_count ? 'text-destructive' : 'text-muted-foreground'">{{ fmtNum(k.error_count) }}</span></TableCell><TableCell class="text-[10px] text-muted-foreground tabular-nums">{{ k.last_used_at ? k.last_used_at.slice(5) : '尚未调用' }}</TableCell><TableCell class="pr-4"><LoaderCircle v-if="busyIds.has(k.id)" class="ml-2 size-4 animate-spin text-muted-foreground" /><DropdownMenu v-else><DropdownMenuTrigger as-child><Button variant="ghost" size="icon" class="size-8" :aria-label="`${k.name} 的操作`" :disabled="batchBusy"><MoreHorizontal class="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @select="validate(k)"><ShieldCheck class="size-4" />验证连通性</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem class="text-destructive focus:text-destructive" @select="requestAction('delete', [k.id], k.name)"><Trash2 class="size-4" />删除密钥</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow>
        </TableBody></Table>
        <div v-if="loading && !keys.length" class="space-y-4 p-6"><Skeleton v-for="n in 5" :key="n" class="h-9 w-full" /></div>
        <EmptyState v-else-if="!filtered.length" :title="keys.length ? '没有匹配的上游密钥' : '让网关连接 Agnes AI'" :description="keys.length ? '调整搜索词，查看其他密钥。' : '添加一把上游密钥，或批量导入你的密钥文件。'" :icon="Layers3"><Button v-if="!keys.length" variant="outline" size="sm" @click="openAdd"><Plus class="size-3.5" />添加上游密钥</Button></EmptyState>
      </div>
      <div class="table-footer shrink-0">
        <div class="flex flex-wrap items-center gap-2">
          <span>共 {{ filtered.length }} 把<span v-if="filtered.length"> · {{ pageStart + 1 }}–{{ pageStart + pageKeys.length }}</span></span>
          <template v-if="selected.length"><span>已选 {{ selected.length }} 把<span v-if="offPageSelected">（含其他页 {{ offPageSelected }} 把）</span></span><Button variant="ghost" size="sm" class="h-6 px-1 text-xs" @click="selected = []">清空选择</Button></template>
          <span class="hidden items-center gap-1 text-[10px] text-muted-foreground 2xl:flex"><RefreshCw class="size-3" />每 5 秒刷新</span>
        </div>
        <div class="flex items-center gap-3">
          <FilterSelect v-model="pageSize" :options="pageSizeOptions" label="每页密钥条数" class="h-8 w-28" />
          <span class="whitespace-nowrap tabular-nums">{{ page }} / {{ pageCount }} 页</span>
          <div class="flex gap-1"><Button variant="outline" size="icon" class="size-7" aria-label="上一页密钥" :disabled="page <= 1" @click="page--"><ChevronLeft class="size-3.5" /></Button><Button variant="outline" size="icon" class="size-7" aria-label="下一页密钥" :disabled="page >= pageCount" @click="page++"><ChevronRight class="size-3.5" /></Button></div>
        </div>
      </div>
    </Card>
    <Dialog :open="showAdd" @update:open="setAddOpen"><DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-[520px]" :show-close-button="!adding"><DialogHeader><DialogTitle>添加上游密钥</DialogTitle><DialogDescription>导入 Agnes AI 密钥。系统会自动忽略空行并去重。</DialogDescription></DialogHeader>
      <Tabs v-model="tab" class="w-full"><TabsList class="mb-4 grid w-full grid-cols-3"><TabsTrigger value="single" :disabled="adding"><KeyRound class="mr-1.5 size-3.5" />单个密钥</TabsTrigger><TabsTrigger value="multi" :disabled="adding"><FileText class="mr-1.5 size-3.5" />批量粘贴</TabsTrigger><TabsTrigger value="file" :disabled="adding"><Upload class="mr-1.5 size-3.5" />上传文件</TabsTrigger></TabsList><TabsContent value="single"><div class="field"><Label for="upstream-key">Agnes API Key</Label><Input id="upstream-key" :key="fileInputKey" v-model="singleKey" name="new-upstream-api-key" type="password" autocomplete="new-password" data-lpignore="true" data-1p-ignore autocapitalize="none" :spellcheck="false" :disabled="adding" placeholder="sk-…" /></div></TabsContent><TabsContent value="multi"><div class="field"><Label for="upstream-keys">密钥列表</Label><Textarea id="upstream-keys" v-model="multiKeys" rows="7" class="font-mono text-xs" autocomplete="off" :spellcheck="false" :disabled="adding" placeholder="每行一把 sk- 开头的密钥" /></div></TabsContent><TabsContent value="file"><div class="rounded-lg border border-dashed bg-muted/30 p-6"><Upload class="mx-auto mb-3 size-6 text-muted-foreground" /><Label for="upstream-file" class="mb-3 justify-center text-xs">选择密钥文本文件，每行一把密钥</Label><Input id="upstream-file" :key="fileInputKey" type="file" accept=".txt,.text,.list,text/plain" class="bg-card" :disabled="adding" @change="file = $event.target.files[0] || null" /></div></TabsContent></Tabs>
      <p v-if="addResult" role="status" class="rounded-md border border-success/15 bg-success-soft px-3 py-2 text-xs text-success">{{ addResult }}</p><p v-if="addError" role="alert" class="rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ addError }}</p><DialogFooter class="border-t pt-4"><Button variant="outline" :disabled="adding" @click="setAddOpen(false)">关闭</Button><Button :disabled="adding || !canAdd" @click="submitAdd"><LoaderCircle v-if="adding" class="size-4 animate-spin" /><Plus v-else class="size-4" />{{ adding ? '正在导入' : '导入密钥' }}</Button></DialogFooter>
    </DialogContent></Dialog>
    <ConfirmDialog :open="!!pending" :title="pending?.title" :description="pending?.description" :action="`确认${pending?.label || ''}`" :destructive="pending?.action === 'delete'" :busy="batchBusy" @update:open="!$event && (pending = null)" @confirm="confirmAction" />
  </div>
</template>

<style scoped>
.pool-table-scroll :deep([data-slot="table-container"]) { overflow: visible; }
@media (max-height: 700px) {
  .pool-stats { display: none; }
  .pool-page :deep(.page-description), .pool-page :deep(.section-eyebrow) { display: none; }
}
</style>
