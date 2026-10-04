import { computed, onScopeDispose, ref, watch } from 'vue'

const excerpt = (value, limit) => String(value || '').replace(/\s+/g, ' ').trim().slice(0, limit)
const statusText = {
  streaming: '正在回复…', generating: '正在生成…', queued: '排队中…',
  in_progress: '正在生成…', paused: '查询已暂停', stopped: '已停止等待', error: '请求失败',
}

export function conversationEntries(messages) {
  const entries = []
  for (const message of messages) {
    if (message.role === 'user') {
      const count = message.imageCount || message.inputImages?.length || 0
      entries.push({
        id: message.id, title: excerpt(message.content, 80) || (count ? `已发送 ${count} 张图片` : '发送的消息'),
        preview: '等待回复…', number: entries.length + 1,
      })
    } else if (entries.length) {
      const entry = entries.at(-1)
      entry.preview = excerpt(message.content || message.error, 180) || statusText[message.status]
        || (message.urls?.length ? (message.kind === 'video' ? '视频已生成' : '图片已生成') : '暂无回复内容')
    }
  }
  return entries
}

export function useChatNavigation(messages, viewport, content) {
  const entries = computed(() => conversationEntries(messages.value))
  const activeEntryId = ref('')
  let observer, frame = null
  function anchors() {
    const ids = new Set(entries.value.map(entry => entry.id))
    return Array.from(viewport.value?.querySelectorAll('[data-chat-message-id]') || [])
      .filter(element => ids.has(element.dataset.chatMessageId))
  }
  function update() {
    const elements = anchors()
    if (!elements.length) { activeEntryId.value = ''; return }
    const area = viewport.value
    if (area.scrollTop > 0 && area.scrollHeight - area.scrollTop - area.clientHeight <= 2) {
      activeEntryId.value = elements.at(-1).dataset.chatMessageId
      return
    }
    const top = area.getBoundingClientRect().top + 48
    let active = elements[0]
    for (const element of elements) {
      if (element.getBoundingClientRect().top > top) break
      active = element
    }
    activeEntryId.value = active.dataset.chatMessageId
  }
  function scheduleUpdate() {
    if (typeof requestAnimationFrame !== 'function') { update(); return }
    if (frame !== null) return
    frame = requestAnimationFrame(() => { frame = null; update() })
  }
  function jump(id) {
    const area = viewport.value
    const target = anchors().find(element => element.dataset.chatMessageId === id)
    if (!area || !target) return false
    const top = target.getBoundingClientRect().top - area.getBoundingClientRect().top + area.scrollTop - 24
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    area.scrollTo({ top: Math.max(0, Math.min(top, area.scrollHeight - area.clientHeight)), behavior: reduced ? 'instant' : 'smooth' })
    target.focus({ preventScroll: true })
    activeEntryId.value = id
    return true
  }
  watch([viewport, content], () => {
    observer?.disconnect()
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(scheduleUpdate)
      if (viewport.value) observer.observe(viewport.value)
      if (content.value) observer.observe(content.value)
    }
    scheduleUpdate()
  }, { flush: 'post', immediate: true })
  watch(entries, scheduleUpdate, { flush: 'post' })
  onScopeDispose(() => {
    observer?.disconnect()
    if (frame !== null) cancelAnimationFrame(frame)
  })
  return { entries, activeEntryId, update, scheduleUpdate, jump }
}
