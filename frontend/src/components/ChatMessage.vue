<script setup>
import { computed, ref } from 'vue'
import { Copy, ExternalLink, LoaderCircle, RotateCw, Bot, UserRound, Film, Image, Info, Download } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import MediaPreview from '@/components/MediaPreview.vue'
import VideoDetailsDialog from '@/components/VideoDetailsDialog.vue'
import { useClipboard } from '@/composables/useClipboard'
import { isMediaUrl } from '@/lib/chat-client'
import { downloadVideo } from '@/lib/media-download'

const props = defineProps({ message: { type: Object, required: true }, busy: Boolean })
defineEmits(['resume', 'preview'])
const { copy } = useClipboard()
const detailsOpen = ref(false), downloading = ref(false), downloadError = ref('')
const urls = computed(() => (props.message.urls || []).filter(isMediaUrl))
const pending = computed(() => ['streaming', 'generating', 'queued', 'in_progress'].includes(props.message.status))
const labels = {
  streaming: '正在回复', generating: '正在生成', queued: '排队中',
  in_progress: '正在生成', paused: '查询已暂停', stopped: '已停止等待', error: '请求失败',
}
const isUser = computed(() => props.message.role === 'user')
const asset = url => ({ id: props.message.id, url, kind: props.message.kind, prompt: props.message.content })
async function download(url) {
  if (downloading.value) return
  downloading.value = true
  downloadError.value = ''
  try { await downloadVideo(url, props.message.videoId || props.message.id) }
  catch { downloadError.value = '直接下载失败，可能是资源限制了跨域访问。请点击“打开原始链接”，在视频页面另存为。' }
  finally { downloading.value = false }
}
</script>

<template>
  <article class="flex min-w-0 gap-3" :class="isUser ? 'flex-row-reverse' : ''" :aria-label="isUser ? '用户消息' : '模型回复'">
    <div class="mt-1 flex size-7 shrink-0 items-center justify-center rounded-md" :class="isUser ? 'bg-muted text-muted-foreground' : 'border text-foreground'">
      <UserRound v-if="isUser" class="size-3.5" /><Image v-else-if="message.kind === 'image'" class="size-3.5" /><Film v-else-if="message.kind === 'video'" class="size-3.5" /><Bot v-else class="size-3.5" />
    </div>
    <div class="min-w-0" :class="isUser ? 'max-w-[85%] px-4 py-3' : 'flex-1 py-1'">
      <div v-if="!isUser && message.model" class="mb-2 break-all text-[10px] text-muted-foreground">{{ message.model }}</div>
      <div v-if="isUser && message.inputImages?.length" class="mb-2 flex flex-wrap gap-2" aria-label="发送的图片">
        <img v-for="(url, index) in message.inputImages" :key="index" :src="url" :alt="`上传图片 ${index + 1}`" class="max-h-48 max-w-full rounded-md object-contain" decoding="async" />
      </div>
      <p v-else-if="isUser && message.imageCount" class="mb-2 text-xs text-muted-foreground">
        此消息包含 {{ message.imageCount }} 张图片，图片未保留；继续看图请重新上传。
      </p>
      <details v-if="!isUser && message.reasoning" class="mb-3 text-xs text-muted-foreground">
        <summary class="cursor-pointer rounded-sm py-1 focus-visible:outline-2 focus-visible:outline-ring">思考过程</summary>
        <p class="mt-2 whitespace-pre-wrap break-words border-l pl-3 leading-6">{{ message.reasoning }}</p>
      </details>
      <p v-if="message.content" class="whitespace-pre-wrap break-words text-sm leading-7 [overflow-wrap:anywhere]">{{ message.content }}</p>
      <div v-if="urls.length" class="space-y-4">
        <div v-for="url in urls" :key="url" class="max-w-[540px]" :class="message.kind === 'video' ? '' : 'overflow-hidden rounded-md border'">
          <MediaPreview :asset="asset(url)" :expanded="message.kind === 'video'" :class="message.kind === 'video' ? '!h-auto !min-h-0 aspect-video overflow-hidden rounded-md' : ''" @preview="$emit('preview', asset(url))" />
          <div class="flex items-center justify-end gap-1 border-0 bg-transparent px-2 py-1">
            <Button v-if="message.kind === 'video'" variant="ghost" size="icon" class="size-8" aria-label="查看视频详情" title="视频详情" @click="detailsOpen = true"><Info class="size-3.5" /></Button>
            <Button v-if="message.kind === 'video'" variant="ghost" size="icon" class="size-8" :disabled="downloading" :aria-label="downloading ? '正在下载视频' : '下载视频'" title="下载视频" @click="download(url)"><LoaderCircle v-if="downloading" class="size-3.5 motion-safe:animate-spin" /><Download v-else class="size-3.5" /></Button>
            <Button variant="ghost" size="icon" class="size-8" :aria-label="`复制${message.kind === 'image' ? '图片' : '视频'}链接`" title="复制链接" @click="copy(url, '链接已复制')"><Copy class="size-3.5" /></Button>
            <Button variant="ghost" size="icon" class="size-8" as-child><a :href="url" target="_blank" rel="noopener noreferrer" aria-label="打开原始链接" title="打开原始链接"><ExternalLink class="size-3.5" /></a></Button>
          </div>
        </div>
      </div>
      <p v-if="downloadError" role="alert" class="mt-2 text-xs leading-5 text-destructive">{{ downloadError }}</p>
      <div v-if="!isUser && (pending || labels[message.status])" class="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground" role="status">
        <LoaderCircle v-if="pending" class="size-3.5 motion-safe:animate-spin" />
        <span>{{ message.status === 'stopped' && message.kind !== 'text' ? '已停止等待，上游可能仍在生成' : labels[message.status] || '正在生成' }}</span>
        <span v-if="message.kind === 'video' && message.progress && pending" class="tabular-nums">{{ message.progress }}%</span>
        <Button v-if="message.kind === 'video' && message.videoId && message.status === 'paused'" variant="outline" size="sm" class="ml-1 h-7 text-xs" :disabled="busy" @click="$emit('resume', message)"><RotateCw class="size-3" />继续查询</Button>
      </div>
      <p v-if="message.error" role="alert" class="mt-2 whitespace-pre-wrap break-words text-xs leading-5 text-destructive">{{ message.error }}</p>
      <Button v-if="!isUser && message.kind === 'video' && !urls.length" variant="ghost" size="icon" class="mt-1 size-8" aria-label="查看视频详情" title="视频详情" @click="detailsOpen = true"><Info class="size-3.5" /></Button>
      <div v-if="message.content && !pending" class="mt-1">
        <Button variant="ghost" size="icon" class="size-7 text-muted-foreground" :aria-label="isUser ? '复制消息' : '复制回复'" title="复制内容" @click="copy(message.content)"><Copy class="size-3.5" /></Button>
      </div>
    </div>
    <VideoDetailsDialog v-if="!isUser && message.kind === 'video'" v-model:open="detailsOpen" :message="message" />
  </article>
</template>
