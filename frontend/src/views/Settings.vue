<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowRight, Copy, FileCode2, Info, LoaderCircle, RefreshCw, Server, ShieldCheck, Terminal } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import PageHeader from '@/components/PageHeader.vue'
import ErrorState from '@/components/ErrorState.vue'
import StatusBadge from '@/components/StatusBadge.vue'
import { useClipboard } from '@/composables/useClipboard'
import { api } from '@/api'

const { copy } = useClipboard()
const path = ref(''), config = ref(null), loading = ref(true), reloading = ref(false), error = ref('')
const activeTab = ref('connection')
const origin = location.origin
const configText = computed(() => JSON.stringify(config.value, null, 2))
const categories = [{ key: 'text', label: '文本' }, { key: 'image', label: '图像' }, { key: 'video', label: '视频' }]
async function load() {
  loading.value = true; error.value = ''
  try { const d = await api.get('/admin/api/config'); path.value = d.path; config.value = d.config }
  catch (e) { error.value = e.message }
  finally { loading.value = false }
}
async function reload() {
  if (reloading.value) return
  reloading.value = true
  try { await api.post('/admin/api/config/reload'); await load(); toast.success('配置已重载') }
  catch (e) { toast.error(e.message) }
  finally { reloading.value = false }
}
onMounted(load)
</script>

<template>
  <div class="page-stack">
    <PageHeader title="网关设置" description="查看连接参数、限流策略与计价配置，管理客户端接入。" eyebrow="Configuration"><Button :disabled="reloading || loading" @click="reload"><LoaderCircle v-if="reloading" class="size-4 animate-spin" /><RefreshCw v-else class="size-4" />{{ reloading ? '正在重载' : '重载配置' }}</Button></PageHeader>
    <ErrorState :message="error" @retry="load" />
    <div class="flex items-start gap-3 rounded-lg border bg-muted/30 px-4 py-3.5"><Info class="mt-0.5 size-4 shrink-0 text-muted-foreground" /><div><p class="text-xs font-medium">配置由服务端文件管理</p><p class="mt-1 text-xs leading-6 text-muted-foreground">修改 <code class="text-foreground">config.yaml</code> 后点击「重载配置」。监听地址与端口变更需要重启服务。</p></div></div>
    <div class="grid gap-6 xl:grid-cols-[1.65fr_1fr]">
      <div class="min-w-0 space-y-5">
        <Tabs v-model="activeTab"><TabsList class="mb-5"><TabsTrigger value="connection" class="text-xs">连接与限流</TabsTrigger><TabsTrigger value="models" class="text-xs">模型与计价</TabsTrigger><TabsTrigger value="raw" class="text-xs">完整配置</TabsTrigger></TabsList>
          <div v-if="loading" class="space-y-4"><Skeleton class="h-44 w-full" /><Skeleton class="h-56 w-full" /></div>
          <template v-else-if="config"><TabsContent value="connection" class="space-y-5">
            <Card class="shadow-none"><CardHeader><CardTitle class="flex items-center gap-2 text-sm"><Server class="size-4 text-muted-foreground" />连接参数</CardTitle></CardHeader><CardContent><dl class="space-y-4 text-xs"><div class="flex flex-wrap items-center justify-between gap-2"><dt class="text-muted-foreground">上游服务地址</dt><dd class="break-all font-mono text-[11px]">{{ config.base_url }}</dd></div><div class="flex justify-between border-t pt-4"><dt class="text-muted-foreground">监听地址</dt><dd class="font-mono">{{ config.host }}:{{ config.port }}</dd></div><div class="grid grid-cols-3 gap-3 border-t pt-4"><div v-for="cat in categories" :key="cat.key"><dt class="text-muted-foreground">{{ cat.label }}超时</dt><dd class="mt-2 text-lg font-semibold tabular-nums">{{ config.timeouts?.[cat.key] ?? '—' }}<span class="ml-1 text-xs font-normal text-muted-foreground">s</span></dd></div></div><div class="flex flex-wrap justify-between gap-3 border-t pt-4"><dt class="text-muted-foreground">重试策略</dt><dd>{{ config.max_retries }} 次尝试 <span class="mx-1 text-muted-foreground">·</span> 退避 {{ config.retry_backoff }}s <span class="mx-1 text-muted-foreground">·</span> 冷却 {{ config.cooldown_seconds }}s</dd></div></dl></CardContent></Card>
            <Card class="gap-0 overflow-hidden py-0 shadow-none"><div class="px-6 py-5"><h2 class="text-sm font-semibold">速率限制</h2><p class="mt-1 text-xs text-muted-foreground">上游统一按 Free 档位调度。对外密钥的每分钟请求数（RPM）仍可单独设置。</p></div><Table><TableHeader><TableRow class="bg-muted/30"><TableHead class="pl-6 text-xs">类别</TableHead><TableHead class="text-right text-xs">上游默认（Free）</TableHead><TableHead class="pr-6 text-right text-xs">对外默认</TableHead></TableRow></TableHeader><TableBody><TableRow v-for="cat in categories" :key="cat.key"><TableCell class="py-4 pl-6 text-xs">{{ cat.label }}</TableCell><TableCell class="text-right text-xs tabular-nums">{{ config.upstream_rpm_limits?.[cat.key]?.free ?? '—' }}</TableCell><TableCell class="pr-6 text-right text-xs font-medium tabular-nums">{{ config.gateway_default_rpm?.[cat.key] ?? '—' }}</TableCell></TableRow></TableBody></Table></Card>
          </TabsContent>
          <TabsContent value="models" class="space-y-5"><Card class="shadow-none"><CardHeader><CardTitle class="text-sm">模型路由</CardTitle><CardDescription class="text-xs">客户端模型别名与故障转移顺序。</CardDescription></CardHeader><CardContent class="space-y-5"><div><p class="mb-3 text-xs font-medium">模型别名</p><div v-if="Object.keys(config.model_aliases || {}).length" class="space-y-2"><div v-for="(value, key) in config.model_aliases" :key="key" class="flex flex-wrap items-center gap-2 text-xs"><code>{{ key }}</code><ArrowRight class="size-3 text-muted-foreground" /><code>{{ value }}</code></div></div><p v-else class="text-xs text-muted-foreground">未配置别名，请求模型名称将直接传递给上游。</p></div><div class="border-t pt-5"><p class="mb-3 text-xs font-medium">故障转移</p><div v-if="Object.keys(config.failover || {}).length" class="space-y-3"><div v-for="(models, key) in config.failover" :key="key" class="flex flex-wrap items-center gap-2 text-xs"><StatusBadge :dot="false">{{ key }}</StatusBadge><template v-for="model in models" :key="model"><ArrowRight class="size-3 text-muted-foreground" /><span>{{ model }}</span></template></div></div><p v-else class="text-xs text-muted-foreground">未配置备用模型。</p></div></CardContent></Card><Card class="shadow-none"><CardHeader><CardTitle class="text-sm">模型计价</CardTitle><CardDescription class="text-xs">价格单位为人民币。文本按百万 Token、图像按张、视频按秒计量。</CardDescription></CardHeader><CardContent><pre class="code-block max-h-[440px] overflow-auto">{{ JSON.stringify(config.pricing, null, 2) }}</pre></CardContent></Card></TabsContent>
          <TabsContent value="raw"><Card class="shadow-none"><CardHeader class="flex flex-row items-start justify-between gap-3"><div><CardTitle class="text-sm">当前配置快照</CardTitle><CardDescription class="mt-1 text-xs">只读视图，不包含管理令牌。</CardDescription></div><Button variant="outline" size="sm" @click="copy(configText, '配置已复制')"><Copy class="size-3.5" />复制</Button></CardHeader><CardContent><pre class="code-block max-h-[600px] overflow-auto">{{ configText }}</pre></CardContent></Card></TabsContent></template>
        </Tabs>
        <div v-if="path" class="flex items-start gap-2 text-[10px] leading-5 text-muted-foreground"><FileCode2 class="mt-0.5 size-3.5 shrink-0" /><span class="break-all">{{ path }}</span></div>
      </div>
      <div class="space-y-5 xl:pt-[56px]">
        <Card class="shadow-none"><CardHeader><CardTitle class="flex items-center gap-2 text-sm"><Terminal class="size-4 text-muted-foreground" />客户端接入</CardTitle><CardDescription class="text-xs">一把网关密钥，兼容两种协议。</CardDescription></CardHeader><CardContent class="space-y-6"><div><p class="text-xs font-medium">OpenAI 兼容协议</p><p class="mt-1 text-[11px] leading-5 text-muted-foreground">Cherry Studio / OpenAI SDK 等</p><div class="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/30 py-2 pl-3 pr-1"><code class="min-w-0 break-all text-[11px]">{{ origin }}/v1</code><Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="复制 OpenAI 接入地址" @click="copy(`${origin}/v1`)"><Copy class="size-3.5" /></Button></div></div><div class="border-t pt-5"><p class="text-xs font-medium">Anthropic 兼容协议</p><p class="mt-1 text-[11px] leading-5 text-muted-foreground">Claude CLI / Claude Desktop 等</p><div class="mt-3 flex items-center justify-between gap-2 rounded-lg border bg-muted/30 py-2 pl-3 pr-1"><code class="min-w-0 break-all text-[11px]">{{ origin }}</code><Button variant="ghost" size="icon" class="size-7 shrink-0" aria-label="复制 Anthropic 接入地址" @click="copy(origin)"><Copy class="size-3.5" /></Button></div></div><div class="border-t pt-5"><p class="mb-2 text-xs font-medium">鉴权请求头</p><code class="block break-all font-mono text-[10px] leading-6 text-muted-foreground">Authorization: Bearer ag-xxxx</code><Button variant="outline" size="sm" class="mt-4 w-full" as-child><router-link to="/keys">管理对外密钥<ArrowRight class="size-3.5" /></router-link></Button></div></CardContent></Card>
        <div class="flex items-start gap-2.5 px-1 text-[11px] leading-6 text-muted-foreground"><ShieldCheck class="mt-1 size-4 shrink-0" /><p>客户端仅使用 <code>ag-</code> 密钥。上游 <code>sk-</code> 密钥与管理令牌仅供服务端及管理员使用。</p></div>
      </div>
    </div>
  </div>
</template>
