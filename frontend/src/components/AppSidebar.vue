<script setup>
import { useRoute, useRouter } from 'vue-router'
import { LayoutDashboard, MessageSquare, Boxes, KeyRound, Layers3, ScrollText, Images, Film, Settings2, ArrowUpRight, LogOut, ChevronDown, Waypoints } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { setToken } from '@/api'

defineProps({ collapsed: Boolean })
const emit = defineEmits(['navigate'])
const route = useRoute()
const router = useRouter()
const navigation = [
  { to: '/dashboard', label: '总览', icon: LayoutDashboard },
  { to: '/chat', label: '聊天', icon: MessageSquare },
  { to: '/models', label: '模型列表', icon: Boxes },
  { to: '/keys', label: '对外密钥', icon: KeyRound },
  { to: '/pool', label: '上游密钥池', icon: Layers3 },
  { to: '/logs', label: '请求日志', icon: ScrollText },
  { to: '/images', label: '图片库', icon: Images },
  { to: '/videos', label: '视频库', icon: Film },
  { to: '/settings', label: '设置', icon: Settings2 },
]
function logout() {
  setToken('')
  router.push('/login')
  emit('navigate')
}
</script>

<template>
  <div class="flex h-full flex-col bg-sidebar">
    <router-link to="/dashboard" class="flex h-16 shrink-0 items-center gap-2.5 px-5" aria-label="Agnes Gateway 首页" @click="emit('navigate')">
      <div class="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"><Waypoints class="size-[19px]" :stroke-width="1.7" /></div>
      <div v-if="!collapsed" class="min-w-0"><p class="text-[15px] font-semibold tracking-tight">Agnes <span class="font-normal text-muted-foreground">Gateway</span></p></div>
    </router-link>
    <div v-if="!collapsed" class="mx-3 mt-3 flex items-center gap-3 rounded-lg border bg-card px-3 py-3">
      <div class="flex size-8 items-center justify-center rounded-md border bg-muted/50 text-xs font-semibold">AG</div>
      <div class="flex-1"><p class="text-xs font-medium">默认工作区</p><p class="mt-0.5 text-[11px] text-muted-foreground">API 管理控制台</p></div>
      <span class="rounded border px-1 text-[9px] text-muted-foreground">LOCAL</span>
    </div>
    <nav class="mt-7 min-h-0 flex-1 space-y-1 overflow-y-auto px-3" aria-label="主导航">
      <p v-if="!collapsed" class="section-eyebrow mb-3 px-3">Workspace</p>
      <template v-for="item in navigation" :key="item.to">
        <Separator v-if="item.to === '/images' || item.to === '/settings'" class="my-4" />
        <Tooltip>
          <TooltipTrigger as-child>
            <router-link :to="item.to" :aria-label="collapsed ? item.label : undefined" :aria-current="route.path === item.to ? 'page' : undefined"
              class="group flex h-10 items-center gap-3 rounded-md px-3 text-[13px] transition-colors focus-visible:outline-2 focus-visible:outline-ring"
              :class="route.path === item.to ? 'bg-card font-medium text-foreground shadow-xs ring-1 ring-border/70' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground'"
              @click="emit('navigate')">
              <component :is="item.icon" class="size-[17px] shrink-0" :stroke-width="1.7" />
              <span v-if="!collapsed" class="flex-1">{{ item.label }}</span>
              <span v-if="!collapsed && route.path === item.to" class="size-1.5 rounded-full bg-foreground/70" />
            </router-link>
          </TooltipTrigger>
          <TooltipContent v-if="collapsed" side="right">{{ item.label }}</TooltipContent>
        </Tooltip>
      </template>
    </nav>
    <div class="space-y-4 px-3 pb-3">
      <div v-if="!collapsed" class="rounded-lg border border-dashed px-3.5 py-4">
        <p class="text-xs font-medium">一个入口，连接所有能力。</p>
        <p class="mt-1.5 text-[11px] leading-5 text-muted-foreground">文本、图像与视频，统一接入。</p>
        <a href="https://wiki.agnes-ai.cn/zh-Hans/docs/" target="_blank" rel="noopener noreferrer" class="mt-3 inline-flex items-center gap-1 text-xs font-medium hover:underline">开发文档<ArrowUpRight class="size-3" /></a>
      </div>
      <Separator />
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" class="h-auto w-full justify-start gap-2.5 px-2 py-2">
            <div class="flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-xs">A</div>
            <div v-if="!collapsed" class="flex-1 text-left"><p class="text-xs font-medium">管理员</p><p class="mt-0.5 text-[11px] font-normal text-muted-foreground">本地管理令牌</p></div>
            <ChevronDown v-if="!collapsed" class="size-3.5 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" class="w-52">
          <DropdownMenuLabel>Agnes Gateway <span class="font-normal text-muted-foreground">v0.1.0</span></DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="router.push('/settings'); emit('navigate')"><Settings2 class="size-4" />网关设置</DropdownMenuItem>
          <DropdownMenuItem @select="logout"><LogOut class="size-4" />退出登录</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </div>
</template>

