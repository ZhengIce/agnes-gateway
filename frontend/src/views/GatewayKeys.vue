<script setup>
import { computed, nextTick, onMounted, ref } from 'vue'
import { Copy, KeyRound, Plus, MoreHorizontal, Pencil, Search, Trash2, LoaderCircle, RefreshCw, ShieldCheck, CircleCheck } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Skeleton } from '@/components/ui/skeleton'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { useClipboard } from '@/composables/useClipboard'
import { api, fmtNum, fmtCost } from '@/api'

const { copy } = useClipboard()
const keys = ref([]), query = ref(''), loading = ref(true), error = ref('')
const showEdit = ref(false), editingId = ref(null), editError = ref(''), saving = ref(false)
const createdKey = ref(''), deleteTarget = ref(null), deleting = ref(false), busyIds = ref(new Set())
const baseUrl = `${location.origin}/v1`
const emptyForm = () => ({ name: '', rpmText: '', rpmImage: '', rpmVideo: '', dailyQuota: '', costQuota: '', models: '', expiresAt: '' })
const form = ref(emptyForm())
const filtered = computed(() => keys.value.filter(k => `${k.name} ${k.masked}`.toLowerCase().includes(query.value.trim().toLowerCase())))
const enabledCount = computed(() => keys.value.filter(k => k.enabled).length)
async function load() {
  loading.value = true; error.value = ''
  try { keys.value = (await api.get('/admin/api/keys')).keys || [] }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}
function openCreate() { editingId.value = null; form.value = emptyForm(); editError.value = ''; showEdit.value = true }
function openEdit(k) {
  editingId.value = k.id
  const l = k.rpm_limits || {}
  form.value = { name: k.name, rpmText: l.text ?? '', rpmImage: l.image ?? '', rpmVideo: l.video ?? '', dailyQuota: k.daily_token_quota ?? '', costQuota: k.total_cost_quota ?? '', models: (k.allowed_models || []).join(', '), expiresAt: k.expires_at ? k.expires_at.replace(' ', 'T').slice(0, 16) : '' }
  editError.value = ''; showEdit.value = true
}
function buildPayload() {
  const f = form.value, rpm = {}
  if (f.rpmText) rpm.text = Number(f.rpmText)
  if (f.rpmImage) rpm.image = Number(f.rpmImage)
  if (f.rpmVideo) rpm.video = Number(f.rpmVideo)
  return { name: f.name.trim(), rpm_limits: rpm, daily_token_quota: f.dailyQuota !== '' ? Number(f.dailyQuota) : null, total_cost_quota: f.costQuota !== '' ? Number(f.costQuota) : null, allowed_models: f.models.split(/[,，]/).map(s => s.trim()).filter(Boolean), expires_at: f.expiresAt ? f.expiresAt.replace('T', ' ') + ':00' : null }
}
async function save() {
  if (saving.value || !form.value.name.trim()) return
  saving.value = true; editError.value = ''
  try {
    let newKey = ''
    if (editingId.value) { await api.patch(`/admin/api/keys/${editingId.value}`, buildPayload()); toast.success('密钥配置已保存') }
    else { newKey = (await api.post('/admin/api/keys', buildPayload())).key }
    showEdit.value = false
    await nextTick()
    if (newKey) createdKey.value = newKey
    await load()
  } catch (e) { editError.value = e.message }
  finally { saving.value = false }
}
async function toggle(k) {
  if (busyIds.value.has(k.id)) return
  busyIds.value.add(k.id)
  try { await api.patch(`/admin/api/keys/${k.id}`, { enabled: !k.enabled }); toast.success(k.enabled ? '密钥已停用' : '密钥已启用'); await load() }
  catch (e) { toast.error(e.message) }
  finally { busyIds.value.delete(k.id) }
}
async function remove() {
  if (!deleteTarget.value || deleting.value) return
  deleting.value = true
  try { await api.del(`/admin/api/keys/${deleteTarget.value.id}`); deleteTarget.value = null; toast.success('密钥已删除'); await load() }
  catch (e) { toast.error(e.message) }
  finally { deleting.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page-stack">
    <PageHeader title="对外密钥" description="为不同客户端签发独立密钥，精细控制访问权限与使用额度。" eyebrow="Access keys"><Button @click="openCreate"><Plus class="size-4" />新建密钥</Button></PageHeader>
    <ErrorState :message="error" @retry="load" />
    <div class="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground"><span>全部密钥 <strong class="ml-2 font-semibold tabular-nums text-foreground">{{ keys.length }}</strong></span><span class="flex items-center gap-2"><span class="status-dot text-success" />启用中 <strong class="font-semibold tabular-nums text-foreground">{{ enabledCount }}</strong></span><span>已停用 <strong class="ml-2 font-semibold tabular-nums text-foreground">{{ keys.length - enabledCount }}</strong></span></div>
    <Card class="gap-0 overflow-hidden py-0 shadow-none">
      <div class="table-toolbar"><div class="relative w-full sm:max-w-[290px]"><Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" /><Input v-model="query" aria-label="搜索密钥名称" placeholder="搜索名称或密钥标识…" class="pl-9" /></div><Button variant="outline" size="sm" :disabled="loading" @click="load"><RefreshCw class="size-3.5" :class="{ 'animate-spin': loading }" />刷新</Button></div>
      <Table class="min-w-[1000px]"><TableHeader><TableRow class="bg-muted/30 hover:bg-muted/30"><TableHead class="w-[200px] pl-5 text-xs">名称 / 密钥</TableHead><TableHead class="text-xs">启用状态</TableHead><TableHead class="text-xs">RPM 限制</TableHead><TableHead class="text-xs">使用额度</TableHead><TableHead class="text-xs">权限 / 有效期</TableHead><TableHead class="text-right text-xs">累计用量</TableHead><TableHead class="w-14 pr-5"><span class="sr-only">操作</span></TableHead></TableRow></TableHeader>
        <TableBody><TableRow v-for="k in filtered" :key="k.id"><TableCell class="py-4 pl-5"><p class="text-xs font-medium">{{ k.name }}</p><div class="mt-1 flex items-center gap-1"><code class="text-[11px] text-muted-foreground">{{ k.masked }}</code><Button variant="ghost" size="icon" class="size-6 text-muted-foreground" :aria-label="`复制 ${k.name} 的密钥`" @click="copy(k.key, '密钥已复制')"><Copy class="size-3" /></Button></div></TableCell><TableCell><div class="flex items-center gap-2"><Switch :model-value="!!k.enabled" :disabled="busyIds.has(k.id)" :aria-label="`${k.name} 启用状态`" @update:model-value="toggle(k)" /><span class="text-[11px] text-muted-foreground">{{ k.enabled ? '启用' : '停用' }}</span></div></TableCell><TableCell><div class="flex gap-2 font-mono text-[11px] tabular-nums"><span>{{ k.rpm_limits?.text ?? '默认' }}</span><span class="text-muted-foreground/50">/</span><span>{{ k.rpm_limits?.image ?? '默认' }}</span><span class="text-muted-foreground/50">/</span><span>{{ k.rpm_limits?.video ?? '默认' }}</span></div><p class="mt-1 text-[10px] text-muted-foreground">文本 / 图像 / 视频</p></TableCell><TableCell><p class="text-[11px]">{{ k.daily_token_quota != null ? fmtNum(k.daily_token_quota) + ' tokens / 天' : '每日 Token 不限' }}</p><p class="mt-1 text-[10px] text-muted-foreground">{{ k.total_cost_quota != null ? '成本上限 ¥' + k.total_cost_quota : '累计成本不限' }}</p></TableCell><TableCell><span class="block max-w-[200px] truncate text-[11px]" :title="k.allowed_models?.join(', ') || '全部模型'">{{ k.allowed_models?.length ? k.allowed_models.join(', ') : '全部模型' }}</span><p class="mt-1 text-[10px] text-muted-foreground">{{ k.expires_at || '长期有效' }}</p></TableCell><TableCell class="text-right"><p class="text-xs font-medium tabular-nums">{{ fmtCost(k.usage.cost) }}</p><p class="mt-1 text-[10px] text-muted-foreground">{{ fmtNum(k.usage.requests) }} 次 · {{ fmtNum(k.usage.tokens) }} tokens</p></TableCell><TableCell class="pr-4"><DropdownMenu><DropdownMenuTrigger as-child><Button variant="ghost" size="icon" class="size-8" :aria-label="`${k.name} 的操作`"><MoreHorizontal class="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem @select="openEdit(k)"><Pencil class="size-4" />编辑配置</DropdownMenuItem><DropdownMenuItem @select="copy(k.key, '密钥已复制')"><Copy class="size-4" />复制密钥</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem class="text-destructive focus:text-destructive" @select="deleteTarget = k"><Trash2 class="size-4" />删除密钥</DropdownMenuItem></DropdownMenuContent></DropdownMenu></TableCell></TableRow></TableBody>
      </Table>
      <div v-if="loading && !keys.length" class="space-y-4 p-6"><Skeleton v-for="n in 4" :key="n" class="h-10 w-full" /></div><EmptyState v-else-if="!filtered.length" :title="query ? '没有匹配的密钥' : '创建你的第一把密钥'" :description="query ? '试试其他名称或清空搜索条件。' : '对外密钥以 ag- 开头，可用于任何 OpenAI 兼容客户端。'" :icon="KeyRound"><Button v-if="!query" variant="outline" size="sm" @click="openCreate"><Plus class="size-3.5" />新建密钥</Button></EmptyState>
      <div class="table-footer"><span>共 {{ keys.length }} 把密钥<span v-if="query"> · 匹配 {{ filtered.length }} 把</span></span><span class="flex items-center gap-1.5"><ShieldCheck class="size-3.5" />上游密钥不会暴露给客户端</span></div>
    </Card>
    <div class="flex items-start gap-3 rounded-lg border border-dashed px-4 py-4"><KeyRound class="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p class="text-xs font-medium">接入你的应用</p><p class="mt-1 text-xs leading-6 text-muted-foreground">Base URL 使用 <code class="text-foreground">{{ baseUrl }}</code>，API Key 使用此页面签发的 <code>ag-</code> 密钥。</p></div></div>
    <Dialog :open="showEdit" @update:open="!saving && (showEdit = $event)"><DialogContent class="max-h-[90dvh] overflow-y-auto sm:max-w-[560px]" :show-close-button="!saving"><DialogHeader><DialogTitle>{{ editingId ? '编辑密钥配置' : '创建对外密钥' }}</DialogTitle><DialogDescription>为客户端分配独立凭证，设置访问范围与使用额度。</DialogDescription></DialogHeader>
      <form class="space-y-5" @submit.prevent="save">
        <div class="field"><Label for="key-name">密钥名称</Label><Input id="key-name" v-model="form.name" placeholder="例如：Cherry Studio 工作账号" required :disabled="saving" /></div>
        <div><p class="mb-3 text-xs font-medium">每分钟请求上限 <span class="ml-1 font-normal text-muted-foreground">留空使用网关默认值</span></p><div class="grid grid-cols-3 gap-3"><div class="field"><Label for="rpm-text" class="text-xs text-muted-foreground">文本</Label><Input id="rpm-text" v-model="form.rpmText" type="number" min="1" step="1" placeholder="默认" /></div><div class="field"><Label for="rpm-image" class="text-xs text-muted-foreground">图像</Label><Input id="rpm-image" v-model="form.rpmImage" type="number" min="1" step="1" placeholder="默认" /></div><div class="field"><Label for="rpm-video" class="text-xs text-muted-foreground">视频</Label><Input id="rpm-video" v-model="form.rpmVideo" type="number" min="1" step="1" placeholder="默认" /></div></div></div>
        <Separator /><div class="grid gap-4 sm:grid-cols-2"><div class="field"><Label for="daily-quota">每日 Token 配额</Label><Input id="daily-quota" v-model="form.dailyQuota" type="number" min="1" step="1" placeholder="不限制" /></div><div class="field"><Label for="cost-quota">累计成本上限（¥）</Label><Input id="cost-quota" v-model="form.costQuota" type="number" min="0" step="0.01" placeholder="不限制" /></div></div>
        <div class="field"><Label for="key-models">模型白名单</Label><Input id="key-models" v-model="form.models" placeholder="agnes-2.5-flash, agnes-3.0-flash" /><p class="helper">多个模型使用逗号分隔；留空允许全部模型。</p></div><div class="field"><Label for="key-expires">过期时间</Label><Input id="key-expires" v-model="form.expiresAt" type="datetime-local" /><p class="helper">{{ editingId ? '已有配额与过期时间留空时保留原值。' : '留空则长期有效，配额留空则不限制。' }}</p></div>
        <p v-if="editError" role="alert" class="rounded-md bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ editError }}</p><DialogFooter class="border-t pt-4"><Button type="button" variant="outline" :disabled="saving" @click="showEdit = false">取消</Button><Button type="submit" :disabled="saving || !form.name.trim()"><LoaderCircle v-if="saving" class="size-4 animate-spin" />{{ editingId ? '保存更改' : '创建密钥' }}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    <Dialog :open="!!createdKey" @update:open="!$event && (createdKey = '')"><DialogContent><DialogHeader><div class="mb-2 flex size-10 items-center justify-center rounded-full bg-success-soft text-success"><CircleCheck class="size-5" /></div><DialogTitle>新密钥已准备就绪</DialogTitle><DialogDescription>请妥善保存，不要在公开场合分享完整密钥。</DialogDescription></DialogHeader><div class="space-y-3"><div><Label class="mb-2 text-xs text-muted-foreground">API Key</Label><div class="code-block break-all whitespace-normal">{{ createdKey }}</div></div><div><Label class="mb-2 text-xs text-muted-foreground">Base URL</Label><div class="code-block">{{ baseUrl }}</div></div></div><DialogFooter><Button variant="outline" @click="createdKey = ''">完成</Button><Button @click="copy(createdKey, '新密钥已复制')"><Copy class="size-4" />复制密钥</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog :open="!!deleteTarget" :title="`删除「${deleteTarget?.name || ''}」？`" description="此操作无法撤销。使用该密钥的客户端将立即失去访问权限，历史用量记录仍会保留。" :busy="deleting" @update:open="!$event && (deleteTarget = null)" @confirm="remove" />
  </div>
</template>
