<script setup>
import { computed, onMounted, ref, toRef, watch } from 'vue'
import { ChevronLeft, ChevronRight, Copy, Download, ExternalLink, Film, Images, LoaderCircle, RefreshCw, Search, Trash2, X } from '@lucide/vue'
import { toast } from 'vue-sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import PageHeader from '@/components/PageHeader.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorState from '@/components/ErrorState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import MediaPreview from '@/components/MediaPreview.vue'
import { useClipboard } from '@/composables/useClipboard'
import { useMediaLibrary } from '@/composables/useMediaLibrary'
import { downloadVideo } from '@/lib/media-download'
import { api, fmtNum, fmtTime } from '@/api'

const props = defineProps({ kind: { type: String, required: true } })
const { copy } = useClipboard()
const { items, total, offset, query, startDate, endDate, filtered, hasFilters, loading, error, pageSize, load, search, reset } = useMediaLibrary(toRef(props, 'kind'))
const detail = ref(null), deleteTarget = ref(null), deleting = ref(false)
const downloading = ref(new Set())
const isImage = computed(() => props.kind === 'image')
const title = computed(() => isImage.value ? '图片库' : '视频库')
const icon = computed(() => isImage.value ? Images : Film)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize.value)))
const gridColumns = computed(() => isImage.value ? 'sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4' : 'sm:grid-cols-2 xl:grid-cols-4')
function metadata(asset) {
  return [asset.size, asset.ratio, asset.seconds != null ? `${asset.seconds}s` : null].filter(Boolean).join(' / ')
}
async function remove() {
  if (!deleteTarget.value || deleting.value) return
  const id = deleteTarget.value.id
  deleting.value = true
  try {
    await api.del(`/admin/api/media/${id}`)
    deleteTarget.value = null
    if (detail.value?.id === id) detail.value = null
    toast.success('记录已删除')
    await load()
  } catch (e) { toast.error(e.message) }
  finally { deleting.value = false }
}
async function download(asset) {
  if (downloading.value.has(asset.id)) return
  downloading.value.add(asset.id)
  try { await downloadVideo(asset.url, asset.video_id || asset.id) }
  catch { toast.error('直接下载失败，请打开原始链接，在视频页面另存为。') }
  finally { downloading.value.delete(asset.id) }
}
watch(() => props.kind, () => {
  detail.value = null
  deleteTarget.value = null
})
onMounted(() => load(0))
</script>

<template>
  <div class="page-stack">
    <PageHeader :title="title" :eyebrow="isImage ? 'Image library' : 'Video library'">
      <Button variant="outline" size="icon" :disabled="loading" aria-label="刷新媒体库" @click="load()">
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
      </Button>
    </PageHeader>
    <ErrorState :message="error" @retry="load()" />
    <form class="flex flex-wrap items-center gap-2" @submit.prevent="search">
      <div v-if="isImage" class="relative w-full sm:max-w-[330px]">
        <Search class="absolute top-2.5 left-3 size-4 text-muted-foreground" />
        <Input v-model="query" aria-label="搜索媒体记录" placeholder="搜索提示词、模型或链接" class="pl-9" />
      </div>
      <template v-else>
        <Label for="video-start-date" class="text-xs text-muted-foreground">日期</Label>
        <Input id="video-start-date" v-model="startDate" type="date" aria-label="开始日期" :max="endDate || undefined" class="w-[165px] min-w-0" />
        <span class="text-xs text-muted-foreground">至</span>
        <Input id="video-end-date" v-model="endDate" type="date" aria-label="结束日期" :min="startDate || undefined" class="w-[165px] min-w-0" />
      </template>
      <Button type="submit" variant="secondary" :disabled="loading">查询</Button>
      <Button v-if="hasFilters" type="button" variant="ghost" size="sm" :disabled="loading" @click="reset">
        <X class="size-3.5" />重置
      </Button>
      <span class="ml-auto text-xs text-muted-foreground">共 {{ fmtNum(total) }} {{ isImage ? '张图片' : '个视频' }}</span>
    </form>

    <div v-if="loading && !items.length" class="grid grid-cols-1 gap-4" :class="gridColumns">
      <div v-for="n in 8" :key="n" class="overflow-hidden rounded-md border">
        <Skeleton class="w-full rounded-none" :class="isImage ? 'aspect-[4/3]' : 'aspect-video'" /><div class="space-y-3 p-3"><Skeleton class="h-4 w-4/5" /><Skeleton class="h-3 w-1/2" /></div>
      </div>
    </div>
    <EmptyState v-else-if="!items.length && !error" :title="filtered ? (isImage ? '没有匹配的记录' : '此日期范围内没有视频') : `暂无${isImage ? '图片' : '视频'}`" :icon="icon" />
    <div v-else-if="items.length" class="grid grid-cols-1 items-start gap-4" :class="gridColumns">
      <Card v-for="asset in items" :key="asset.id" class="min-w-0 gap-0 overflow-hidden rounded-md py-0 shadow-none">
        <MediaPreview :asset="asset" @preview="detail = asset" />
        <div :class="isImage ? 'space-y-3 p-4' : 'space-y-2 p-3'">
          <p class="line-clamp-2 min-h-10 break-words text-xs leading-5" :title="asset.prompt || ''">{{ asset.prompt || `${isImage ? '图片' : '视频'} #${asset.id}` }}</p>
          <div class="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[10px] text-muted-foreground">
            <span class="min-w-0 truncate" :title="asset.model || ''">{{ asset.model || '未指定模型' }}</span>
            <span class="shrink-0 tabular-nums">{{ metadata(asset) }}</span>
          </div>
          <div class="flex items-center justify-between gap-2 border-t pt-3">
            <time class="min-w-0 truncate text-[10px] text-muted-foreground tabular-nums" :datetime="asset.created_at.replace(' ', 'T')" :title="asset.created_at">{{ fmtTime(asset.created_at) }}</time>
            <div class="flex shrink-0 items-center gap-1">
              <Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" class="size-7" aria-label="复制链接" @click="copy(asset.url, '链接已复制')"><Copy class="size-3.5" /></Button></TooltipTrigger><TooltipContent>复制链接</TooltipContent></Tooltip>
              <Tooltip v-if="!isImage"><TooltipTrigger as-child><Button variant="ghost" size="icon" class="size-7" :disabled="downloading.has(asset.id)" aria-label="下载视频" @click="download(asset)"><LoaderCircle v-if="downloading.has(asset.id)" class="size-3.5 motion-safe:animate-spin" /><Download v-else class="size-3.5" /></Button></TooltipTrigger><TooltipContent>下载视频</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" class="size-7" as-child><a :href="asset.url" target="_blank" rel="noopener noreferrer" aria-label="打开原始链接"><ExternalLink class="size-3.5" /></a></Button></TooltipTrigger><TooltipContent>打开原始链接</TooltipContent></Tooltip>
              <Tooltip><TooltipTrigger as-child><Button variant="ghost" size="icon" class="size-7 text-muted-foreground hover:text-destructive" aria-label="删除记录" :disabled="loading || deleting" @click="deleteTarget = asset"><Trash2 class="size-3.5" /></Button></TooltipTrigger><TooltipContent>删除记录</TooltipContent></Tooltip>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <div v-if="total" class="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-xs text-muted-foreground">
      <span>第 {{ offset + 1 }}–{{ Math.min(offset + pageSize, total) }} 条</span>
      <div class="flex items-center gap-3">
        <span class="tabular-nums">{{ Math.floor(offset / pageSize) + 1 }} / {{ pageCount }}</span>
        <Button variant="outline" size="icon" class="size-8" aria-label="上一页" :disabled="loading || offset === 0" @click="load(offset - pageSize)"><ChevronLeft class="size-4" /></Button>
        <Button variant="outline" size="icon" class="size-8" aria-label="下一页" :disabled="loading || offset + pageSize >= total" @click="load(offset + pageSize)"><ChevronRight class="size-4" /></Button>
      </div>
    </div>

    <Dialog :open="!!detail" @update:open="!$event && (detail = null)">
      <DialogContent class="max-h-[92dvh] overflow-y-auto sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>{{ isImage ? '图片' : '视频' }} #{{ detail?.id }}</DialogTitle>
          <DialogDescription>{{ detail?.model || '未指定模型' }} · {{ detail?.created_at }}</DialogDescription>
        </DialogHeader>
        <template v-if="detail">
          <MediaPreview :key="detail.id" :asset="detail" expanded />
          <p v-if="detail.prompt" class="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs leading-6">{{ detail.prompt }}</p>
          <dl class="flex flex-wrap gap-x-6 gap-y-2 text-xs">
            <div v-if="metadata(detail)" class="flex gap-2"><dt class="text-muted-foreground">规格</dt><dd>{{ metadata(detail) }}</dd></div>
            <div class="flex gap-2"><dt class="text-muted-foreground">来源密钥</dt><dd>{{ detail.api_key_name || '已删除或未关联' }}</dd></div>
            <div v-if="detail.video_id" class="flex min-w-0 gap-2"><dt class="shrink-0 text-muted-foreground">任务</dt><dd class="break-all font-mono text-[10px]">{{ detail.video_id }}</dd></div>
          </dl>
          <div class="field"><Label for="media-url">链接</Label><Input id="media-url" :model-value="detail.url" readonly class="font-mono text-xs" /></div>
          <div class="flex flex-wrap justify-end gap-2">
            <Button v-if="!isImage" variant="outline" size="icon" :disabled="downloading.has(detail.id)" aria-label="下载视频" title="下载视频" @click="download(detail)"><LoaderCircle v-if="downloading.has(detail.id)" class="size-3.5 motion-safe:animate-spin" /><Download v-else class="size-3.5" /></Button>
            <Button variant="outline" @click="copy(detail.url, '链接已复制')"><Copy class="size-3.5" />复制链接</Button>
            <Button variant="outline" as-child><a :href="detail.url" target="_blank" rel="noopener noreferrer"><ExternalLink class="size-3.5" />打开链接</a></Button>
          </div>
        </template>
      </DialogContent>
    </Dialog>
    <ConfirmDialog :open="!!deleteTarget" :title="`删除${isImage ? '图片' : '视频'} #${deleteTarget?.id || ''}？`"
      description="仅删除这条库记录，不影响上游媒体文件。" :busy="deleting"
      @update:open="!$event && (deleteTarget = null)" @confirm="remove" />
  </div>
</template>
