<script setup>
import { computed } from 'vue'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const props = defineProps({ open: Boolean, message: { type: Object, required: true } })
defineEmits(['update:open'])
const request = computed(() => props.message.videoRequest)
const requestType = computed(() => {
  if (!request.value) return '未记录'
  if (request.value.mode === 'text') return '文生视频'
  if (request.value.mode === 'reference') return '图生视频（参考图片）'
  if (request.value.firstFrame && request.value.lastFrame) return '图生视频（首尾帧）'
  return request.value.firstFrame ? '图生视频（首帧）' : '图生视频（尾帧）'
})
const rows = computed(() => [
  ['请求类型', requestType.value],
  ['模型', props.message.model || '未记录'],
  ['分辨率', request.value?.size || '未记录'],
  ['画面比例', request.value?.ratio || '未记录'],
  ['请求时长', request.value?.seconds ? `${request.value.seconds} 秒` : '未记录'],
  ['输入图片', request.value ? `${request.value.imageCount} 张` : '未记录'],
  ['任务状态', ({ completed: '已完成', generating: '生成中', queued: '排队中', in_progress: '生成中', paused: '查询已暂停', stopped: '已停止等待', error: '请求失败' })[props.message.status] || '未知'],
  ['任务编号', props.message.videoId || '未取得'],
  ['提交时间', props.message.createdAt && !Number.isNaN(Date.parse(props.message.createdAt)) ? new Date(props.message.createdAt).toLocaleString('zh-CN', { hour12: false }) : '未记录'],
])
</script>

<template>
  <Dialog :open="open" @update:open="$emit('update:open', $event)">
    <DialogContent class="max-h-[85dvh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>视频详情</DialogTitle>
        <DialogDescription>本次视频任务提交时的参数与当前状态。</DialogDescription>
      </DialogHeader>
      <p v-if="!request" class="text-xs text-muted-foreground">此历史消息未记录生成参数，无法确定当时的请求类型。</p>
      <dl class="grid grid-cols-[5rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
        <template v-for="[label, value] in rows" :key="label">
          <dt class="text-muted-foreground">{{ label }}</dt>
          <dd class="break-words [overflow-wrap:anywhere]">{{ value }}</dd>
        </template>
      </dl>
      <div v-if="request" class="space-y-2 border-t pt-4">
        <p class="text-xs text-muted-foreground">提示词</p>
        <p class="whitespace-pre-wrap break-words text-sm leading-6 [overflow-wrap:anywhere]">{{ request.prompt || '未记录' }}</p>
      </div>
    </DialogContent>
  </Dialog>
</template>
