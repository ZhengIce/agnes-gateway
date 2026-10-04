<script setup>
import { computed, ref, watch } from 'vue'
import { ArrowUp, Square, MessageSquare, Image, Film, LoaderCircle, Boxes, SlidersHorizontal } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import ComposerSelect from '@/components/ComposerSelect.vue'
import ChatReferencePicker from '@/components/ChatReferencePicker.vue'
import ChatKeyframes from '@/components/ChatKeyframes.vue'
import ChatAttachments from '@/components/ChatAttachments.vue'
import ChatSettingsPanel from '@/components/ChatSettingsPanel.vue'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { useImageUploads } from '@/composables/useImageUploads'
import { IMAGE_ACCEPT, MAX_IMAGES } from '@/lib/image-uploads'
import { isMediaUrl } from '@/lib/chat-client'
import { addReferences, referenceItems, removeReference } from '@/lib/chat-references'

const props = defineProps({
  modelValue: { type: String, default: '' }, kind: { type: String, default: 'text' },
  model: String, models: { type: Array, default: () => [] }, options: { type: Object, required: true },
  contextId: String, inputDisabled: Boolean, modelsLoading: Boolean, busy: Boolean,
  submissionVersion: { type: Number, default: 0 },
  videoCreating: Boolean, canSend: Boolean,
})
const emit = defineEmits(['update:modelValue', 'update:kind', 'update:model', 'update:options', 'submit', 'stop'])
const pickerOpen = ref(false), referenceError = ref('')
const frameTarget = ref('')
const settingsOpen = ref(false), fileInput = ref(null)
const { items: uploads, loading: readingReferences, error: referenceUploadError, add: addUploads, remove: removeUpload, reset: resetUploads } = useImageUploads()
const firstUpload = useImageUploads(), lastUpload = useImageUploads()
const readingImages = computed(() => readingReferences.value || firstUpload.loading.value || lastUpload.loading.value)
const uploadError = computed(() => referenceUploadError.value || firstUpload.error.value || lastUpload.error.value)
let selectionContext = ''
const fileContext = () => JSON.stringify([props.contextId, props.kind, props.kind === 'video' ? props.options.videoMode : ''])
const modes = [{ value: 'text', label: '聊天' }, { value: 'image', label: '生图' }, { value: 'video', label: '生视频' }]
const modeIcons = { text: MessageSquare, image: Image, video: Film }
const videoModes = [{ value: 'text', label: '文生视频' }, { value: 'keyframe', label: '首尾帧' }, { value: 'reference', label: '参考图片' }]
const keyframeMode = computed(() => props.kind === 'video' && props.options.videoMode === 'keyframe')
const modelLabels = {
  'agnes-2.5-flash': 'Agnes 2.5 Flash', 'agnes-3.0-flash': 'Agnes 3.0 Flash', 'agnes-2.5-pro': 'Agnes 2.5 Pro',
  'agnes-image-2.5-flash': 'Agnes Image 2.5 Flash', 'agnes-image-2.1-flash': 'Agnes Image 2.1 Flash', 'agnes-image-2.0-flash': 'Agnes Image 2.0 Flash',
  'agnes-video-2.5-flash': 'Agnes Video 2.5 Flash', 'agnes-video-2.5': 'Agnes Video 2.5',
}
const modelChoices = computed(() => props.models.map(item => ({ ...item, label: modelLabels[item.value] || item.label })))
const canUpload = computed(() => ['text', 'image', 'video'].includes(props.kind))
const canSubmit = computed(() => props.canSend && !props.inputDisabled && !readingImages.value && (!!props.modelValue.trim() || (props.kind === 'text' && uploads.value.length > 0)))
const visibleUploads = computed(() => props.kind !== 'video' || props.options.videoMode === 'reference' ? uploads.value : [])
const refs = computed(() => keyframeMode.value ? [] : [...referenceItems(props.kind, props.options), ...visibleUploads.value])
const frameUploads = computed(() => ({
  ...(firstUpload.items.value[0] ? { firstFrame: firstUpload.items.value[0].url } : {}),
  ...(lastUpload.items.value[0] ? { lastFrame: lastUpload.items.value[0].url } : {}),
}))
const frameOptions = computed(() => ({ ...props.options, ...frameUploads.value }))
const placeholder = computed(() => keyframeMode.value ? '输入文字，描述你想创作的画面内容、运动方式等' : ({ text: '发送消息，或上传图片提问', image: '上传参考素材，输入文字，请描述你想生成的图片', video: '添加参考素材，描述你想生成的视频' })[props.kind])
const ratioLabel = computed(() => props.kind === 'image' ? (props.options.imageRatio === 'auto' ? 'Auto' : props.options.imageRatio) : props.options.videoRatio)
function openReferences(source = 'upload') {
  if (props.busy || props.inputDisabled || readingImages.value) return
  if (source === 'library') { openLibrary(); return }
  referenceError.value = ''
  frameTarget.value = ''
  selectionContext = fileContext()
  if (canUpload.value) fileInput.value?.click()
  else pickerOpen.value = true
}
function openFrame(field, source = 'upload') {
  if (props.busy || props.inputDisabled || readingImages.value || !['firstFrame', 'lastFrame'].includes(field)) return
  if (source === 'library') { openLibrary(field); return }
  frameTarget.value = field
  referenceError.value = ''
  selectionContext = fileContext()
  fileInput.value?.click()
}
function clearFrame(field) {
  if (props.busy || props.inputDisabled || readingImages.value || !['firstFrame', 'lastFrame'].includes(field)) return
  const slot = field === 'firstFrame' ? firstUpload : lastUpload
  slot.reset()
  emit('update:options', { ...props.options, [field]: '' })
}
function swapFrames() {
  if (props.busy || props.inputDisabled || readingImages.value) return
  const first = firstUpload.items.value
  firstUpload.items.value = lastUpload.items.value
  lastUpload.items.value = first
  emit('update:options', { ...props.options, firstFrame: props.options.lastFrame, lastFrame: props.options.firstFrame })
}
function openLibrary(target = '') {
  if (props.busy || props.inputDisabled || readingImages.value) return
  frameTarget.value = target
  selectionContext = fileContext()
  referenceError.value = ''
  pickerOpen.value = true
}
async function chooseFiles(event) {
  const files = Array.from(event.target.files || [])
  event.target.value = ''
  if (!files.length || !canUpload.value || props.busy || props.inputDisabled || readingImages.value || selectionContext !== fileContext()) return
  referenceError.value = ''
  if (keyframeMode.value) {
    const target = frameTarget.value
    if (!['firstFrame', 'lastFrame'].includes(target) || files.length !== 1) {
      referenceError.value = '首帧和尾帧每次只能上传一张图片'
      return
    }
    const slot = target === 'firstFrame' ? firstUpload : lastUpload
    if (await slot.add(files, { replace: true })) emit('update:options', { ...props.options, [target]: '' })
    return
  }
  if (props.kind === 'video' && props.model === 'agnes-video-2.5-flash') {
    const existing = (props.options.videoRefs || '').split(/\r?\n/).filter(value => value.trim()).length
    if (existing + uploads.value.length + files.length > 5) { referenceError.value = 'Flash 视频最多支持 5 张参考图'; return }
  }
  const added = await addUploads(files)
  if (added && props.kind === 'video' && props.options.videoMode === 'text') {
    emit('update:options', { ...props.options, videoMode: 'reference' })
  }
}
function submit() {
  if (!props.busy && canSubmit.value) {
    emit('submit', visibleUploads.value.map(item => item.url), keyframeMode.value ? { ...frameUploads.value } : {})
  }
}
function add({ urls, target }) {
  if (props.busy || props.inputDisabled || readingImages.value) return
  try {
    if (props.kind === 'text') {
      if (!Array.isArray(urls) || !urls.length || urls.some(url => !isMediaUrl(url))) throw new Error('请选择有效的图片库图片')
      const existing = new Set(uploads.value.map(item => item.url))
      const additions = [...new Set(urls)].filter(url => !existing.has(url))
      if (uploads.value.length + additions.length > MAX_IMAGES) throw new Error('最多添加 5 张图片')
      uploads.value = [...uploads.value, ...additions.map(url => ({ id: `library:${url}`, url, local: true, library: true, size: 0 }))]
      pickerOpen.value = false
      referenceError.value = ''
      return
    }
    const options = addReferences(props.kind, props.model, props.options, urls, target)
    if (props.kind === 'video' && options.videoMode === 'reference' && props.model === 'agnes-video-2.5-flash' && options.videoRefs.split('\n').filter(Boolean).length + uploads.value.length > 5) {
      throw new Error('Flash 视频最多支持 5 张参考图')
    }
    if (keyframeMode.value) (target === 'firstFrame' ? firstUpload : lastUpload).reset()
    emit('update:options', options)
    pickerOpen.value = false
    referenceError.value = ''
  } catch (error) { referenceError.value = error.message }
}
function remove(item) {
  if (item.local) removeUpload(item.id)
  else emit('update:options', removeReference(props.options, item))
}
function onKeydown(event) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    submit()
  }
}
watch(() => [props.contextId, props.kind, props.options.videoMode], () => {
  pickerOpen.value = false
  frameTarget.value = ''
  referenceError.value = ''
})
watch(() => [props.contextId, props.kind], () => {
  resetUploads()
  firstUpload.reset()
  lastUpload.reset()
  settingsOpen.value = false
  selectionContext = ''
}, { flush: 'sync' })
watch(() => [props.model, props.busy], () => { settingsOpen.value = false })
watch(() => props.submissionVersion, () => {
  resetUploads()
  firstUpload.reset()
  lastUpload.reset()
  const fields = props.kind === 'image' ? ['imageRefs']
    : props.kind === 'video' ? ['videoRefs', 'firstFrame', 'lastFrame'] : []
  if (fields.length) emit('update:options', { ...props.options, ...Object.fromEntries(fields.map(field => [field, ''])) })
}, { flush: 'sync' })
</script>

<template>
  <form class="chat-composer" aria-label="消息输入区" @submit.prevent="submit">
    <input v-if="canUpload" ref="fileInput" type="file" class="hidden" :accept="IMAGE_ACCEPT" :multiple="!keyframeMode" aria-label="上传参考图片" :disabled="busy || readingImages || inputDisabled" @change="chooseFiles" />
    <div class="composer-entry" :class="{ 'composer-entry--keyframes': keyframeMode }">
      <ChatKeyframes v-if="keyframeMode" :key="contextId" :options="frameOptions" :disabled="busy || inputDisabled || readingImages" @pick="openFrame" @clear="clearFrame" @swap="swapFrames" />
      <ChatAttachments v-else :key="`${contextId}:${kind}:${options.videoMode}`" :items="refs"
        :disabled="busy || readingImages || inputDisabled" :loading="readingImages" @add="openReferences" @remove="remove" />
      <Textarea :model-value="modelValue" aria-label="消息内容" :placeholder="placeholder" rows="3" :disabled="inputDisabled"
        class="composer-textarea min-w-0 resize-none rounded-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
        @update:model-value="$emit('update:modelValue', $event)" @keydown="onKeydown" />
    </div>
    <p v-if="readingImages" role="status" class="sr-only">正在读取图片…</p>
    <p v-if="uploadError" role="alert" class="shrink-0 text-xs text-destructive">{{ uploadError }}</p>
    <p v-if="referenceError && !pickerOpen" role="alert" class="shrink-0 text-xs text-destructive">{{ referenceError }}</p>
    <div data-slot="composer-toolbar" class="composer-toolbar">
      <div class="composer-controls">
        <ComposerSelect :model-value="kind" :options="modes" label="生成类型" :icon="modeIcons[kind]" :disabled="busy" class="shrink-0" @update:model-value="$emit('update:kind', $event)" />
        <ComposerSelect :model-value="model" :options="modelChoices" label="选择模型" :icon="Boxes" :disabled="busy || modelsLoading || inputDisabled"
          class="max-w-[240px]" @update:model-value="$emit('update:model', $event)" />
        <ComposerSelect v-if="kind === 'video'" :model-value="options.videoMode" :options="videoModes" label="视频模式" :icon="Film" :disabled="busy"
          @update:model-value="$emit('update:options', { ...options, videoMode: $event })" />
        <Popover v-if="kind !== 'text'" v-model:open="settingsOpen">
          <PopoverTrigger as-child>
            <Button type="button" variant="ghost" class="h-8 max-w-full gap-2 rounded-md px-2 text-xs font-normal" aria-label="生成参数设置" :disabled="busy">
              <SlidersHorizontal class="size-3.5 shrink-0" />
              <span>{{ ratioLabel }}</span><span class="h-3 border-l" />
              <template v-if="kind === 'video'"><span>{{ options.seconds }}s</span><span class="h-3 border-l" /></template>
              <span>{{ kind === 'image' ? options.imageSize : options.videoSize }}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="center" :side-offset="12" :collision-padding="12" class="settings-popover w-[650px] rounded-3xl border-0 bg-card p-5 shadow-xl">
            <ChatSettingsPanel :kind="kind" :model="model" :options="options" :disabled="busy" @update:options="$emit('update:options', $event)" @close="settingsOpen = false" />
          </PopoverContent>
        </Popover>
      </div>
      <Button v-if="busy" type="button" variant="secondary" size="icon" class="composer-send" :disabled="videoCreating"
        :aria-label="videoCreating ? '正在提交视频任务' : kind === 'video' ? '暂停视频查询' : '停止回复或等待'"
        :title="videoCreating ? '正在等待视频任务编号' : kind === 'video' ? '暂停查询' : '停止等待'" @click="$emit('stop')"><LoaderCircle v-if="videoCreating" class="size-4 motion-safe:animate-spin" /><Square v-else class="size-3.5" /></Button>
      <Button v-else type="submit" size="icon" class="composer-send" aria-label="发送消息" title="发送消息" :disabled="!canSubmit"><ArrowUp class="size-5" /></Button>
    </div>
    <ChatReferencePicker v-if="pickerOpen" :open="pickerOpen" :kind="kind" :video-mode="options.videoMode" :frame-target="frameTarget" :error="referenceError"
      @update:open="pickerOpen = $event" @pick="add" />
  </form>
</template>

<style scoped>
.chat-composer {
  --composer-radius: 28px;
  --composer-inset: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-width: 0;
  padding: var(--composer-inset);
  border: 1px solid var(--border);
  border-radius: var(--composer-radius);
  background: color-mix(in oklab, var(--card) 88%, transparent);
  box-shadow: 0 4px 20px color-mix(in oklab, var(--foreground) 3%, transparent);
  backdrop-filter: blur(12px);
  letter-spacing: 0;
  scrollbar-width: thin;
  transition: border-color 150ms;
}
.chat-composer:focus-within { border-color: var(--ring); }
.settings-popover { max-width: calc(100vw - 24px); max-height: min(80dvh, var(--reka-popover-content-available-height, 80dvh)); overflow-y: auto; }
.composer-entry, .composer-toolbar { flex-shrink: 0; }
.composer-entry { display: flex; min-width: 0; min-height: 120px; gap: 20px; }
.composer-textarea { flex: 1; min-height: 110px; max-height: min(22dvh, 220px); line-height: 1.7; }
.composer-toolbar { display: flex; align-items: flex-end; gap: 12px; min-height: 40px; }
.composer-controls { display: flex; flex: 1; flex-wrap: wrap; align-items: center; gap: 2px 6px; min-width: 0; }
.composer-send { width: 40px; height: 40px; flex-shrink: 0; border-radius: 999px; }
@media (max-width: 639px) {
  .chat-composer { --composer-inset: 14px; --composer-radius: 24px; gap: 10px; }
  .composer-entry { min-height: 94px; gap: 14px; }
  .composer-entry--keyframes { flex-direction: column; gap: 12px; }
  .composer-entry--keyframes .composer-textarea { width: 100%; }
  .composer-textarea { min-height: 84px; }
  .composer-controls { gap: 2px; }
  .composer-toolbar { gap: 6px; }
}
@media (max-height: 650px) {
  .composer-entry { min-height: 68px; }
  .composer-textarea { min-height: 68px; max-height: 100px; }
  .chat-composer { gap: 8px; }
}
</style>
