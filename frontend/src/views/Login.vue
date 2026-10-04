<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Waypoints, ArrowRight, ShieldCheck, LoaderCircle, Eye, EyeOff, KeyRound, ArrowUpRight } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api, setToken } from '@/api'

const router = useRouter()
const token = ref('')
const loading = ref(false)
const error = ref('')
const visible = ref(false)
async function submit() {
  if (!token.value.trim() || loading.value) return
  loading.value = true
  error.value = ''
  try {
    await api.post('/admin/api/login', { token: token.value.trim() })
    setToken(token.value.trim())
    router.push('/dashboard')
  } catch (e) { error.value = e.message }
  finally { loading.value = false }
}
</script>

<template>
  <div class="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
    <section class="relative hidden flex-col overflow-hidden border-r bg-sidebar px-12 py-10 lg:flex xl:px-16">
      <div class="flex items-center gap-2.5 text-lg font-semibold tracking-tight"><Waypoints class="size-6" :stroke-width="1.6" />Agnes <span class="font-normal text-muted-foreground">Gateway</span></div>
      <div class="my-auto py-14">
        <p class="section-eyebrow mb-5">One gateway. Every possibility.</p>
        <h1 class="text-[42px] leading-[1.3] font-semibold tracking-tight xl:text-5xl">让每一次调用，<br /><span class="text-muted-foreground">井然有序。</span></h1>
        <p class="mt-6 max-w-sm text-sm leading-7 text-muted-foreground">连接文本、图像与视频能力。<br />在一个清晰的工作区，管理密钥、用量和成本。</p>
        <div class="mt-12 max-w-sm rounded-xl border bg-card p-5 shadow-xs">
          <div class="mb-5 flex items-center justify-between"><span class="section-eyebrow">Request flow</span><span class="rounded border bg-muted/50 px-1.5 py-0.5 text-[10px] text-muted-foreground">统一接入</span></div>
          <div class="flex items-center justify-between text-xs"><span class="flex items-center gap-2"><KeyRound class="size-4 text-muted-foreground" />客户端</span><span class="mx-3 h-px flex-1 bg-border" /><Waypoints class="size-5" /><span class="mx-3 h-px flex-1 bg-border" /><span>Agnes AI</span></div>
          <div class="mt-5 border-t pt-4 text-[11px] text-muted-foreground">密钥鉴权 <span class="mx-2">/</span> 智能调度 <span class="mx-2">/</span> 用量计量</div>
        </div>
      </div>
      <span class="text-xs text-muted-foreground">Agnes Gateway · API 管理控制台</span>
    </section>
    <section class="flex min-h-screen flex-col px-6 py-8 sm:px-12">
      <div class="flex justify-between lg:justify-end"><span class="flex items-center gap-2 text-sm font-semibold lg:hidden"><Waypoints class="size-5" />Agnes Gateway</span><a href="https://wiki.agnes-ai.cn/zh-Hans/docs/" target="_blank" rel="noopener noreferrer" class="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">开发文档<ArrowUpRight class="size-3" /></a></div>
      <div class="mx-auto my-auto w-full max-w-[350px] py-16">
        <p class="section-eyebrow mb-3">Welcome back</p><h2 class="text-2xl font-semibold tracking-tight">登录控制台</h2>
        <p class="mt-2 text-sm leading-6 text-muted-foreground">使用管理令牌，进入你的网关工作区。</p>
        <form class="mt-8 space-y-5" @submit.prevent="submit">
          <div class="field"><Label for="admin-token">管理令牌</Label><div class="relative"><Input id="admin-token" v-model="token" :type="visible ? 'text' : 'password'" placeholder="请输入 admin_token" autocomplete="current-password" class="h-11 bg-card pr-10" :aria-invalid="!!error" required /><Button type="button" variant="ghost" size="icon" class="absolute top-1 right-1 size-9 text-muted-foreground" :aria-label="visible ? '隐藏令牌' : '显示令牌'" @click="visible = !visible"><component :is="visible ? EyeOff : Eye" class="size-4" /></Button></div><p class="helper">令牌位于服务端 config.yaml 的 admin_token 字段。</p></div>
          <p v-if="error" role="alert" class="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">{{ error }}</p>
          <Button type="submit" class="h-11 w-full" :disabled="loading || !token.trim()"><LoaderCircle v-if="loading" class="size-4 animate-spin" />{{ loading ? '正在登录' : '进入控制台' }}<ArrowRight v-if="!loading" class="ml-auto size-4" /></Button>
        </form>
        <div class="mt-7 flex items-start gap-2 border-t pt-5 text-xs leading-5 text-muted-foreground"><ShieldCheck class="mt-0.5 size-4 shrink-0" /><p>管理令牌拥有完整操作权限，请勿分享给外部客户端。</p></div>
      </div>
      <p class="text-center text-[11px] text-muted-foreground">仅限授权管理员访问 <span class="mx-1.5">·</span> v0.1.0</p>
    </section>
  </div>
</template>
