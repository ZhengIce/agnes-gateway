<script setup>
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { PanelLeft, ChevronRight, Terminal, ArrowUpRight } from '@lucide/vue'
import AppSidebar from '@/components/AppSidebar.vue'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'

const route = useRoute()
const collapsed = ref(false)
const mobileOpen = ref(false)
const isLogin = computed(() => route.path === '/login')
const isStandaloneChat = computed(() => route.meta.chatOnly === true)
const isChat = computed(() => route.path === '/chat')
const isPool = computed(() => route.path === '/pool')
const titles = { '/dashboard': '总览', '/chat': '聊天', '/models': '模型列表', '/keys': '对外密钥', '/pool': '上游密钥池', '/logs': '请求日志', '/images': '图片库', '/videos': '视频库', '/settings': '设置' }
</script>

<template>
  <TooltipProvider :delay-duration="150">
    <router-view v-if="isLogin" />
    <main v-else-if="isStandaloneChat" class="flex h-dvh min-h-0 min-w-0 overflow-hidden px-3 py-4 sm:px-6" aria-label="独立聊天窗口">
      <router-view />
    </main>
    <div v-else class="min-h-screen">
      <aside class="fixed inset-y-0 left-0 z-30 hidden border-r lg:block" :class="collapsed ? 'w-[72px]' : 'w-[232px]'">
        <AppSidebar :collapsed="collapsed" />
      </aside>
      <Sheet v-model:open="mobileOpen">
        <SheetContent side="left" class="w-[270px] gap-0 p-0">
          <SheetTitle class="sr-only">导航菜单</SheetTitle><SheetDescription class="sr-only">访问网关总览、密钥、日志和设置。</SheetDescription>
          <AppSidebar @navigate="mobileOpen = false" />
        </SheetContent>
      </Sheet>
      <div class="flex min-w-0 flex-col" :class="[collapsed ? 'lg:pl-[72px]' : 'lg:pl-[232px]', isChat || isPool ? 'h-dvh overflow-hidden' : 'min-h-dvh']">
        <header class="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur-sm sm:px-7">
          <div class="flex min-w-0 items-center gap-3">
            <Button variant="ghost" size="icon" class="hidden size-8 lg:inline-flex" aria-label="折叠或展开侧边栏" @click="collapsed = !collapsed"><PanelLeft class="size-4" /></Button>
            <Button variant="ghost" size="icon" class="size-8 lg:hidden" aria-label="打开导航菜单" @click="mobileOpen = true"><PanelLeft class="size-4" /></Button>
            <Separator orientation="vertical" class="!h-4" />
            <span class="hidden text-xs text-muted-foreground sm:block">控制台</span><ChevronRight class="hidden size-3 text-muted-foreground/60 sm:block" />
            <span class="truncate text-xs font-medium">{{ titles[route.path] || 'Agnes Gateway' }}</span>
          </div>
          <div class="flex items-center gap-4">
            <span class="hidden items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-[10px] text-muted-foreground sm:inline-flex"><Terminal class="size-3" />OpenAI compatible</span>
            <a href="https://wiki.agnes-ai.cn/zh-Hans/docs/" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">文档<ArrowUpRight class="size-3" /></a>
          </div>
        </header>
        <main class="min-w-0 w-full flex-1" :class="isChat ? 'flex min-h-0 overflow-hidden px-3 py-4 sm:px-4' : isPool ? 'mx-auto flex min-h-0 max-w-[1600px] overflow-hidden px-4 py-4 sm:px-7 sm:py-6 xl:px-9' : 'mx-auto max-w-[1600px] px-4 py-7 sm:px-7 sm:py-8 xl:px-9'"><router-view /></main>
      </div>
    </div>
    <Toaster position="bottom-right" :rich-colors="true" :close-button="true" />
  </TooltipProvider>
</template>
