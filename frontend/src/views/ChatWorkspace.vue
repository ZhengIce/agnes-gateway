<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { History, Plus, RefreshCw, ArrowDown, LoaderCircle, Maximize2, Minimize2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetDescription } from '@/components/ui/sheet'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import FilterSelect from '@/components/FilterSelect.vue'
import ChatHistory from '@/components/ChatHistory.vue'
import ChatMessage from '@/components/ChatMessage.vue'
import ChatNavigation from '@/components/ChatNavigation.vue'
import ChatComposer from '@/components/ChatComposer.vue'
import MediaPreview from '@/components/MediaPreview.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { api } from '@/api'
import { useChatWorkspace } from '@/composables/useChatWorkspace'
import { useChatNavigation } from '@/composables/useChatNavigation'
import { availableModels, createChatClient } from '@/lib/chat-client'

const props = defineProps({ fullscreen: Boolean, sessionId: { type: String, default: '' } })
const client = createChatClient()
const { sessions, current, activeId, keys, busy, error, storageError, createSession, selectSession, deleteSession, send, stop, resumeVideo, persist } = useChatWorkspace({ client, sessionId: props.sessionId })
const draft = ref(''), drafts = new Map(), messageArea = ref(null), nearBottom = ref(true)
const browsingEarlier = ref(false)
const messageContent = ref(null)
const navigation = useChatNavigation(computed(() => current.value.messages), messageArea, messageContent)
const submissionVersion = ref(0)
const historyOpen = ref(false), deleteTarget = ref(null), preview = ref(null)
const keysLoading = ref(true), modelsLoading = ref(false), catalog = ref([]), discoveryError = ref('')
let discovery = null, discoveryVersion = 0, disposed = false
const selectedKey = computed(() => keys.value.find(key => key.id === current.value.keyId))
const keyOptions = computed(() => keys.value.filter(key => key.enabled).map(key => ({ value: String(key.id), label: key.name })))
const keyValue = computed({ get: () => current.value.keyId ? String(current.value.keyId) : '', set: value => { current.value.keyId = Number(value) } })
const modelOptions = computed(() => availableModels(catalog.value, current.value.kind, selectedKey.value?.allowed_models).map(value => ({ value, label: value })))
const canSend = computed(() => !keysLoading.value && !modelsLoading.value && !!selectedKey.value?.enabled && modelOptions.value.some(option => option.value === current.value.model))
const videoCreating = computed(() => busy.value && current.value.messages.at(-1)?.kind === 'video' && !current.value.messages.at(-1)?.videoId)

async function discoverModels() {
  if (disposed) return
  discovery?.abort()
  const version = ++discoveryVersion
  const key = selectedKey.value
  catalog.value = []
  discoveryError.value = ''
  if (!key?.enabled) { modelsLoading.value = false; return }
  const controller = new AbortController()
  discovery = controller
  modelsLoading.value = true
  try {
    const models = await client.models(key.key, { signal: controller.signal })
    if (disposed || version !== discoveryVersion) return
    catalog.value = models
    if (!models.length) discoveryError.value = '模型列表为空，暂用内置模型'
  } catch (failure) {
    if (disposed || version !== discoveryVersion || controller.signal.aborted) return
    discoveryError.value = `模型列表未更新：${failure.message}。暂用内置模型`
  } finally {
    if (!disposed && version === discoveryVersion) modelsLoading.value = false
  }
}
async function loadKeys() {
  keysLoading.value = true
  error.value = ''
  try {
    const result = await api.get('/admin/api/keys')
    if (disposed) return
    keys.value = result.keys || []
    if (!selectedKey.value?.enabled) current.value.keyId = keys.value.find(key => key.enabled)?.id || null
    await discoverModels()
  } catch (failure) { error.value = failure.message }
  finally { keysLoading.value = false }
}
function changeKind(kind) {
  if (busy.value) return
  current.value.kind = kind
  current.value.model = availableModels(catalog.value, kind, selectedKey.value?.allowed_models)[0] || ''
}
function newSession() { createSession(); historyOpen.value = false }
function chooseSession(sessionId) { selectSession(sessionId); historyOpen.value = false }
function removeSession() {
  if (!deleteTarget.value) return
  drafts.delete(deleteTarget.value.id)
  deleteSession(deleteTarget.value.id)
  deleteTarget.value = null
}
async function scrollBottom() {
  browsingEarlier.value = false
  await nextTick()
  if (browsingEarlier.value) return
  if (messageArea.value) messageArea.value.scrollTop = messageArea.value.scrollHeight
  nearBottom.value = true
  navigation.scheduleUpdate()
}
function onScroll() {
  const el = messageArea.value
  if (el) nearBottom.value = !browsingEarlier.value && el.scrollHeight - el.scrollTop - el.clientHeight < 100
  navigation.scheduleUpdate()
}
function jumpToMessage(id) {
  browsingEarlier.value = true
  nearBottom.value = false
  navigation.jump(id)
}
function onManualScroll(event) {
  if (event.type === 'keydown' && !['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)) return
  browsingEarlier.value = false
  onScroll()
}
async function submit(uploads = [], frameUploads = {}) {
  if (busy.value || !canSend.value) return
  const prompt = draft.value
  // Preserve the prompt when validation fails, but clear it once a request starts.
  const request = send(prompt, uploads, frameUploads)
  if (busy.value) { submissionVersion.value++; draft.value = ''; drafts.delete(current.value.id); scrollBottom() }
  await request
}
function saveOnExit() { stop(); persist() }
watch(() => props.sessionId, sessionId => { if (sessionId) selectSession(sessionId) })
watch(activeId, (next, previous) => {
  if (previous) drafts.set(previous, draft.value)
  draft.value = drafts.get(next) || ''
  preview.value = null
  nextTick(scrollBottom)
})
watch(() => current.value.keyId, () => { if (!keysLoading.value) discoverModels() })
watch(modelOptions, options => {
  if (!modelsLoading.value && !options.some(option => option.value === current.value.model)) current.value.model = options[0]?.value || ''
})
watch(modelsLoading, loading => {
  if (!loading && !modelOptions.value.some(option => option.value === current.value.model)) current.value.model = modelOptions.value[0]?.value || ''
})
watch(() => current.value.model, model => {
  if (model === 'agnes-video-2.5-flash') current.value.options.videoSize = '720P'
})
watch(() => current.value.messages.map(message => `${message.content.length}:${message.reasoning.length}:${message.status}:${message.urls.length}`).join('|'), () => {
  if (nearBottom.value) scrollBottom()
})
onMounted(() => { window.addEventListener('pagehide', saveOnExit); loadKeys() })
onBeforeUnmount(() => {
  disposed = true
  discovery?.abort()
  window.removeEventListener('pagehide', saveOnExit)
  saveOnExit()
})
</script>

<template>
  <div class="flex h-full min-h-0 min-w-0 flex-1">
    <aside class="hidden w-[210px] shrink-0 border-r pr-3 xl:block">
      <ChatHistory :sessions="sessions" :active-id="activeId" @create="newSession" @select="chooseSession" @delete="deleteTarget = $event" />
    </aside>
    <Sheet v-model:open="historyOpen">
      <SheetContent side="left" class="w-[280px] gap-0 p-0">
        <SheetTitle class="sr-only">会话历史</SheetTitle><SheetDescription class="sr-only">已保存的会话</SheetDescription>
        <ChatHistory :sessions="sessions" :active-id="activeId" @create="newSession" @select="chooseSession" @delete="deleteTarget = $event; historyOpen = false" />
      </SheetContent>
    </Sheet>
    <section class="flex min-h-0 min-w-0 flex-1 flex-col xl:pl-6" aria-label="聊天工作区">
      <div class="flex shrink-0 flex-wrap items-center gap-2 border-b pb-3">
        <Button variant="ghost" size="icon" class="size-8 xl:hidden" aria-label="打开会话历史" title="会话历史" @click="historyOpen = true"><History class="size-4" /></Button>
        <span class="min-w-0 flex-1 truncate text-xs text-muted-foreground">{{ current.title }}</span>
        <div class="ml-auto flex items-center gap-1 xl:hidden">
          <Button variant="ghost" size="icon" class="size-8" aria-label="新建会话" title="新建会话" @click="newSession"><Plus class="size-4" /></Button>
        </div>
        <div class="ml-auto flex min-w-0 items-center gap-1">
          <FilterSelect v-model="keyValue" :options="keyOptions" label="选择对外密钥" placeholder="选择对外密钥" :disabled="busy || keysLoading" class="h-9 w-full min-w-0 sm:w-[150px] [&>span]:truncate" />
          <Button variant="ghost" size="icon" class="size-8 shrink-0" :disabled="busy || keysLoading || modelsLoading" aria-label="刷新密钥和模型" title="刷新密钥和模型" @click="loadKeys"><RefreshCw class="size-3.5" :class="{ 'motion-safe:animate-spin': keysLoading || modelsLoading }" /></Button>
          <Button v-if="fullscreen" variant="ghost" size="icon" class="size-8 shrink-0" as-child>
            <router-link :to="{ path: '/chat', query: { session: activeId } }" aria-label="返回聊天工作区" title="返回聊天工作区" @click="persist"><Minimize2 class="size-3.5" /></router-link>
          </Button>
          <Button v-else-if="!busy" variant="ghost" size="icon" class="size-8 shrink-0" as-child>
            <router-link :to="{ path: '/chat/fullscreen', query: { session: activeId } }" target="_blank" rel="noopener noreferrer" aria-label="全屏聊天（新窗口）" title="全屏聊天（新窗口）" @click="persist"><Maximize2 class="size-3.5" /></router-link>
          </Button>
          <Button v-else variant="ghost" size="icon" class="size-8 shrink-0" disabled aria-label="全屏聊天（新窗口）" title="当前请求完成后可在新窗口打开"><Maximize2 class="size-3.5" /></Button>
        </div>
      </div>
      <p v-if="storageError" role="alert" class="shrink-0 border-b py-2 text-xs leading-5 text-warning">{{ storageError }}</p>
      <p v-if="discoveryError" role="status" class="shrink-0 py-2 text-xs leading-5 text-muted-foreground">{{ discoveryError }}</p>
      <p v-if="selectedKey && !modelsLoading && !modelOptions.length" role="status" class="shrink-0 py-2 text-xs text-warning">当前密钥没有可用的{{ current.kind === 'text' ? '文本' : current.kind === 'image' ? '图片' : '视频' }}模型</p>
      <div v-if="keysLoading && !keys.length" class="flex min-h-0 flex-1 items-center justify-center"><LoaderCircle class="size-5 text-muted-foreground motion-safe:animate-spin" aria-label="正在加载密钥" /></div>
      <div v-else-if="!keyOptions.length" class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3">
        <p class="text-sm text-muted-foreground">暂无可用的对外密钥</p>
        <Button variant="outline" as-child><router-link to="/keys">创建密钥</router-link></Button>
      </div>
      <div v-else class="relative flex min-h-0 flex-1">
        <ChatNavigation :key="activeId" :entries="navigation.entries.value" :active-id="navigation.activeEntryId.value"
          class="absolute inset-y-6 left-0 z-20" @select="jumpToMessage" />
        <div ref="messageArea" class="min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain py-6"
          :class="current.messages.length ? 'pl-10 pr-1 sm:px-12' : ''" aria-label="会话消息" @scroll="onScroll"
          @wheel.passive="onManualScroll" @touchstart.passive="onManualScroll" @pointerdown="onManualScroll" @keydown="onManualScroll">
          <div v-if="!current.messages.length" class="flex h-full min-h-24 items-center justify-center">
            <h1 class="text-xl font-medium">{{ current.kind === 'text' ? '新对话' : current.kind === 'image' ? '生成图片' : '生成视频' }}</h1>
          </div>
          <div v-else ref="messageContent" class="mx-auto max-w-[1120px] space-y-7 px-1 sm:px-3">
            <ChatMessage v-for="message in current.messages" :id="`chat-message-${message.id}`" :key="message.id"
              :data-chat-message-id="message.id" tabindex="-1" class="focus-visible:outline-2 focus-visible:outline-ring"
              :message="message" :busy="busy" @resume="resumeVideo" @preview="preview = $event" />
          </div>
        </div>
      </div>
      <div class="relative mx-auto flex max-h-[65%] min-h-0 w-full max-w-[1120px] shrink-0 flex-col pt-2">
        <Button v-if="!nearBottom && current.messages.length" variant="outline" size="icon" class="absolute -top-10 left-1/2 size-8 -translate-x-1/2 bg-background" aria-label="滚动到最新消息" title="最新消息" @click="scrollBottom"><ArrowDown class="size-4" /></Button>
        <p v-if="error" role="alert" class="mb-2 max-h-20 shrink-0 overflow-y-auto whitespace-pre-wrap break-words text-xs leading-5 text-destructive">{{ error }}</p>
        <ChatComposer v-model="draft" v-model:model="current.model" v-model:options="current.options"
          class="min-h-0 overflow-y-auto"
          :context-id="activeId" :submission-version="submissionVersion" :kind="current.kind" :models="modelOptions" :can-send="canSend" :busy="busy"
          :video-creating="videoCreating" :models-loading="modelsLoading" :input-disabled="keysLoading || !selectedKey?.enabled"
          @update:kind="changeKind" @submit="submit" @stop="stop" />
      </div>
    </section>
    <ConfirmDialog :open="!!deleteTarget" :title="`删除「${deleteTarget?.title || ''}」？`" description="删除当前浏览器中的会话记录，不影响媒体库或上游生成任务。" @update:open="!$event && (deleteTarget = null)" @confirm="removeSession" />
    <Dialog :open="!!preview" @update:open="!$event && (preview = null)">
      <DialogContent class="sm:max-w-[900px]">
        <DialogHeader><DialogTitle>图片预览</DialogTitle><DialogDescription class="sr-only">生成的图片</DialogDescription></DialogHeader>
        <MediaPreview v-if="preview" :asset="preview" expanded />
      </DialogContent>
    </Dialog>
  </div>
</template>
