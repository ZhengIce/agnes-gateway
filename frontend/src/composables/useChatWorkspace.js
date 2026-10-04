import { computed, onScopeDispose, ref, watch } from 'vue'
import { chatMessageContent, createChatClient, DEFAULT_MODELS, generationPayload, isMediaUrl } from '../lib/chat-client.js'
import { redactImageInputs } from '../lib/image-uploads.js'

export const HISTORY_KEY = 'agnes_chat_history_v1'
const kinds = ['text', 'image', 'video']
const activeStatuses = ['streaming', 'generating', 'queued', 'in_progress']
const id = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
const string = value => typeof value === 'string' ? value : ''
export const defaultOptions = () => ({
  imageSize: '1K', imageRatio: 'auto', imageRefs: '', videoSize: '720P', videoRatio: '16:9',
  videoMode: 'text', seconds: 5, videoRefs: '', firstFrame: '', lastFrame: '',
})

function cleanOptions(options = {}) {
  const result = Object.fromEntries(Object.entries(defaultOptions()).map(([key, fallback]) => [
    key, key === 'seconds' ? Number(options[key] ?? fallback) : string(options[key]) || fallback,
  ]))
  for (const field of ['imageRefs', 'videoRefs', 'firstFrame', 'lastFrame']) {
    result[field] = result[field].split(/\r?\n/).map(link => link.trim()).filter(isMediaUrl).join('\n')
  }
  return result
}

function cleanMessage(message, restoring = false, inputs = []) {
  const kind = kinds.includes(message.kind) ? message.kind : 'text'
  let status = string(message.status) || 'completed'
  if (restoring && activeStatuses.includes(status)) status = kind === 'video' && message.videoId ? 'paused' : 'stopped'
  return {
    id: string(message.id) || id(), role: message.role === 'user' ? 'user' : 'assistant',
    kind, status, content: redactImageInputs(string(message.content), inputs), reasoning: redactImageInputs(string(message.reasoning), inputs),
    error: redactImageInputs(string(message.error), inputs), model: string(message.model), keyId: Number(message.keyId) || null,
    imageCount: message.role === 'user' ? Math.max(0, Math.floor(Number(message.imageCount) || 0)) : 0,
    urls: Array.isArray(message.urls) ? message.urls.filter(isMediaUrl) : [],
    videoId: string(message.videoId), progress: Math.min(100, Math.max(0, Number(message.progress) || 0)),
    createdAt: string(message.createdAt), replyTo: string(message.replyTo),
    videoRequest: kind === 'video' ? cleanVideoRequest(message.videoRequest, inputs) : null,
  }
}

function cleanVideoRequest(request, inputs = []) {
  if (!request || !['text', 'reference', 'keyframe'].includes(request.mode)) return null
  return {
    mode: request.mode,
    prompt: redactImageInputs(string(request.prompt), inputs),
    size: ['720P', '1080P', '1K', '2K'].includes(request.size) ? request.size : '',
    ratio: ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].includes(request.ratio) ? request.ratio : '',
    seconds: Number(request.seconds) >= 4 && Number(request.seconds) <= 12 ? Number(request.seconds) : null,
    imageCount: Math.max(0, Math.floor(Number(request.imageCount) || 0)),
    firstFrame: request.firstFrame === true, lastFrame: request.lastFrame === true,
  }
}

function cleanSession(session, restoring = false) {
  const kind = kinds.includes(session.kind) ? session.kind : 'text'
  const messages = Array.isArray(session.messages) ? session.messages.filter(message => message && typeof message === 'object') : []
  const inputs = messages.flatMap(message => Array.isArray(message.inputImages) ? message.inputImages : [])
  return {
    id: string(session.id) || id(), title: string(session.title) || '新会话', kind,
    model: string(session.model) || DEFAULT_MODELS[kind][0], keyId: Number(session.keyId) || null,
    options: cleanOptions(session.options), createdAt: string(session.createdAt) || new Date().toISOString(),
    messages: messages.map(message => cleanMessage(message, restoring, inputs)),
  }
}

export function useChatWorkspace({ client = createChatClient(), storage, sessionId } = {}) {
  const storageError = ref('')
  if (storage === undefined) {
    try { storage = globalThis.localStorage } catch { storageError.value = '浏览器存储不可用，会话暂时无法保存' }
  }
  const sessions = ref([]), activeId = ref(''), keys = ref([]), busy = ref(false), error = ref('')
  let operation = null, saveTimer = null, storedSnapshot = null
  try {
    const saved = storage?.getItem(HISTORY_KEY)
    storedSnapshot = saved || null
    if (saved) {
      const data = JSON.parse(saved)
      if (!Array.isArray(data.sessions)) throw new Error('invalid history')
      sessions.value = data.sessions.filter(session => session && typeof session === 'object').map(session => cleanSession(session, true))
      activeId.value = string(data.activeId)
    }
  } catch { storageError.value = '无法读取会话历史，原有存储未覆盖；请检查浏览器存储' }
  const preserveUnreadable = !!storageError.value
  const current = computed(() => sessions.value.find(session => session.id === activeId.value) || sessions.value[0])

  function persist() {
    clearTimeout(saveTimer)
    saveTimer = null
    if (preserveUnreadable) return
    try {
      if (!storage) throw new Error('storage unavailable')
      const nextSnapshot = JSON.stringify({
        activeId: activeId.value, sessions: sessions.value.map(session => cleanSession(session)),
      })
      const latest = storage.getItem(HISTORY_KEY) || null
      if (latest !== storedSnapshot && latest !== nextSnapshot) {
        storageError.value = '其他页面已更新会话历史，本页已暂停保存以避免覆盖；本页内容仍保留'
        return
      }
      storage.setItem(HISTORY_KEY, nextSnapshot)
      storedSnapshot = nextSnapshot
      storageError.value = ''
    } catch { storageError.value = '会话无法保存到浏览器存储，当前内容仍保留在页面中' }
  }
  function schedulePersist() {
    if (!saveTimer) saveTimer = setTimeout(persist, 500)
  }
  function stop() {
    if (!operation) return
    const running = operation
    operation = null
    running.controller.abort()
    running.message.status = running.message.kind === 'video' && running.message.videoId ? 'paused' : 'stopped'
    if (running.message.kind === 'video' && !running.message.videoId) {
      running.message.error = '尚未取得任务编号，无法恢复查询；上游可能仍在生成，请勿重复提交'
    }
    busy.value = false
    persist()
  }
  function createSession() {
    stop()
    const session = cleanSession({ id: id() })
    session.keyId = current.value?.keyId || keys.value.find(key => key.enabled)?.id || null
    sessions.value.unshift(session)
    activeId.value = session.id
    error.value = ''
    persist()
    return session
  }
  function selectSession(sessionId) {
    if (!sessions.value.some(session => session.id === sessionId)) return
    if (activeId.value !== sessionId) stop()
    activeId.value = sessionId
    error.value = ''
    persist()
  }
  function deleteSession(sessionId) {
    if (current.value?.id === sessionId) stop()
    sessions.value = sessions.value.filter(session => session.id !== sessionId)
    if (!sessions.value.length) createSession()
    else if (!sessions.value.some(session => session.id === activeId.value)) activeId.value = sessions.value[0].id
    persist()
  }
  if (!sessions.value.length) {
    const session = cleanSession({ id: id() })
    sessions.value = [session]
    activeId.value = session.id
  } else if (!sessions.value.some(session => session.id === activeId.value)) activeId.value = sessions.value[0].id
  if (sessionId && sessions.value.some(session => session.id === sessionId)) activeId.value = sessionId

  function selectedKey(keyId) {
    const key = keys.value.find(key => key.id === Number(keyId))
    if (!key?.enabled || !key.key) throw new Error('请选择已启用的对外密钥')
    return key
  }
  function begin(message) {
    const running = { controller: new AbortController(), message }
    operation = running
    busy.value = true
    return running
  }
  function finish(running) {
    if (operation === running) { operation = null; busy.value = false }
    persist()
  }
  async function poll(message, key, running) {
    const result = await client.pollVideo(key.key, message.videoId, message.model, {
      signal: running.controller.signal,
      onProgress: data => {
        if (operation !== running) return
        message.progress = Math.min(100, Math.max(0, Number(data.progress) || 0))
        message.status = data.status === 'queued' ? 'queued' : 'generating'
        schedulePersist()
      },
    })
    if (operation !== running) return
    message.urls = [result.url].filter(isMediaUrl)
    message.status = 'completed'
    message.progress = 100
    message.error = ''
  }
  function fail(message, running, failure, uploads = []) {
    if (operation !== running) return
    message.error = redactImageInputs(failure.message || '请求失败，请稍后重试', uploads)
    message.status = message.kind === 'video' && message.videoId && !failure.terminal ? 'paused' : 'error'
  }

  async function send(prompt, uploads = [], frameUploads = {}) {
    prompt = String(prompt || '').trim()
    if (busy.value || (!prompt && !(current.value.kind === 'text' && Array.isArray(uploads) && uploads.length))) return false
    error.value = ''
    const session = current.value
    let key, payload, inputContent
    let errorImages = [...uploads, ...[frameUploads.firstFrame, frameUploads.lastFrame].filter(Boolean)]
    try {
      key = selectedKey(session.keyId)
      if (!session.model.trim()) throw new Error('请选择模型')
      if (key.allowed_models?.length && !key.allowed_models.includes(session.model)) throw new Error('当前密钥没有此模型的访问权限，请重新选择模型')
      if (session.kind === 'text') inputContent = chatMessageContent(prompt, uploads)
      else payload = generationPayload(session.kind, session.model, prompt, session.options, uploads, frameUploads)
    } catch (failure) { error.value = failure.message; return false }

    // Use only the images actually submitted, including library links and frame slots.
    const inputImages = session.kind === 'text' ? [...uploads]
      : session.kind === 'image' ? [...(payload.extra_body.image || [])]
        : payload.mode === 'keyframe' ? [payload.first_frame, payload.last_frame].filter(Boolean)
          : [...(payload.images || [])]
    const user = cleanMessage({
      id: id(), role: 'user', kind: session.kind, content: prompt.trim(),
      model: session.model, keyId: key.id, createdAt: new Date().toISOString(),
      imageCount: inputImages.length,
    })
    // Raw input images remain on live messages only; cleanSession omits them from storage.
    if (inputImages.length) user.inputImages = inputImages
    const assistant = cleanMessage({
      id: id(), role: 'assistant', kind: session.kind,
      status: session.kind === 'text' ? 'streaming' : 'generating',
      model: session.model, keyId: key.id, replyTo: user.id, createdAt: new Date().toISOString(),
      videoRequest: session.kind === 'video' ? {
        mode: payload.mode, prompt: payload.prompt, size: payload.size, ratio: payload.aspect_ratio,
        seconds: payload.seconds, imageCount: inputImages.length,
        firstFrame: !!payload.first_frame, lastFrame: !!payload.last_frame,
      } : null,
    }, false, inputImages)
    session.messages.push(user, assistant)
    // Mutate the reactive array entry so incremental replies trigger Vue updates.
    const message = session.messages.at(-1)
    if (session.title === '新会话') session.title = prompt.slice(0, 32) || '图片对话'
    const running = begin(message)
    persist()
    try {
      if (session.kind === 'text') {
        const messages = []
        errorImages = session.messages.flatMap(item => item.inputImages || [])
        for (const reply of session.messages) {
          if (reply.role !== 'assistant' || reply.kind !== 'text' || reply.status !== 'completed' || !reply.content) continue
          const question = session.messages.find(item => item.id === reply.replyTo && item.role === 'user' && item.kind === 'text')
          // Restored turns have an image count but no image bytes. Do not silently
          // reuse an incomplete visual question as text-only context.
          if (question && (!question.imageCount || question.inputImages?.length === question.imageCount)) {
            messages.push({ role: 'user', content: chatMessageContent(question.content, question.inputImages) }, { role: 'assistant', content: reply.content })
          }
        }
        messages.push({ role: 'user', content: inputContent })
        const result = await client.chat(key.key, { model: session.model, messages }, {
          signal: running.controller.signal,
          onDelta: delta => {
            if (operation !== running) return
            message.content = delta.content || ''
            message.reasoning = delta.reasoning || ''
            schedulePersist()
          },
        })
        if (operation !== running) return true
        message.content = result.content || ''
        message.reasoning = result.reasoning || ''
        message.status = 'completed'
      } else if (session.kind === 'image') {
        const result = await client.image(key.key, payload, { signal: running.controller.signal })
        if (operation !== running) return true
        message.urls = (Array.isArray(result?.data) ? result.data : []).map(item => item?.url).filter(isMediaUrl)
        if (!message.urls.length) throw new Error('未返回有效的图片链接，未保存 Base64 内容')
        message.status = 'completed'
      } else {
        const result = await client.createVideo(key.key, payload, { signal: running.controller.signal })
        message.videoId = typeof result?.video_id === 'string' ? result.video_id : ''
        if (operation !== running) {
          if (message.videoId) { message.status = 'paused'; message.error = '' }
          return true
        }
        if (!message.videoId) throw new Error('上游未返回 video_id，无法查询任务；请勿盲目重复创建')
        persist()
        await poll(message, key, running)
      }
    } catch (failure) { fail(message, running, failure, errorImages) }
    finally { finish(running) }
    return true
  }

  async function resumeVideo(message) {
    if (busy.value || message.kind !== 'video' || !message.videoId || !current.value.messages.some(item => item.id === message.id)) return
    let key
    error.value = ''
    try { key = selectedKey(message.keyId) } catch (failure) { error.value = `无法继续查询：${failure.message}`; return }
    message.status = 'generating'
    message.error = ''
    const running = begin(message)
    try { await poll(message, key, running) }
    catch (failure) { fail(message, running, failure) }
    finally { finish(running) }
  }

  watch(() => [current.value?.kind, current.value?.model, current.value?.keyId, current.value?.options], persist, { deep: true })
  onScopeDispose(() => { stop(); clearTimeout(saveTimer) })
  return {
    sessions, current, activeId, keys, busy, error, storageError,
    createSession, selectSession, deleteSession, send, stop, resumeVideo, persist,
  }
}
