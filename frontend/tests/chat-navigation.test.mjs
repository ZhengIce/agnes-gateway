import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computed, effectScope, nextTick, ref } from 'vue'
import { conversationEntries, useChatNavigation } from '../src/composables/useChatNavigation.js'

test('navigation groups each prompt with its reply, including image-only and pending turns', () => {
  const messages = [
    { id: 'a', role: 'user', content: '开始\n第一幕' },
    { id: 'b', role: 'assistant', content: '这是第一幕。', status: 'completed' },
    { id: 'c', role: 'user', content: '', imageCount: 2 },
    { id: 'd', role: 'assistant', content: '', status: 'streaming' },
    { id: 'e', role: 'user', content: '生成视频', kind: 'video' },
    { id: 'f', role: 'assistant', content: '', status: 'completed', kind: 'video', urls: ['https://cdn.test/v.mp4'] },
  ]
  const entries = conversationEntries(messages)
  assert.deepEqual(entries.map(entry => entry.id), ['a', 'c', 'e'])
  assert.equal(entries[0].title, '开始 第一幕')
  assert.equal(entries[0].preview, '这是第一幕。')
  assert.equal(entries[1].title, '已发送 2 张图片')
  assert.equal(entries[1].preview, '正在回复…')
  assert.equal(entries[2].preview, '视频已生成')
  assert.deepEqual(conversationEntries([]), [])
})

test('navigation scrolls only the message viewport, tracks position and forgets removed anchors', async () => {
  const scope = effectScope()
  const messages = ref([{ id: 'first', role: 'user', content: '一' }, { id: 'second', role: 'user', content: '二' }])
  const calls = [], focused = []
  const offsets = { first: 24, second: 624 }
  const viewport = {
    scrollTop: 0, scrollHeight: 1600, clientHeight: 400,
    getBoundingClientRect: () => ({ top: 100 }),
    querySelectorAll: () => messages.value.map(message => ({
      dataset: { chatMessageId: message.id },
      getBoundingClientRect: () => ({ top: 100 + offsets[message.id] - viewport.scrollTop }),
      focus: options => focused.push([message.id, options]),
    })),
    scrollTo: options => { calls.push(options); viewport.scrollTop = options.top },
  }
  try {
    const state = scope.run(() => useChatNavigation(computed(() => messages.value), ref(viewport), ref(null)))
    state.update()
    assert.equal(state.activeEntryId.value, 'first')
    assert.equal(state.jump('second'), true)
    assert.equal(calls[0].top, 600)
    assert.deepEqual(focused[0], ['second', { preventScroll: true }])
    state.update()
    assert.equal(state.activeEntryId.value, 'second')
    viewport.scrollTop = 0
    state.update()
    assert.equal(state.activeEntryId.value, 'first')
    messages.value = []
    await nextTick()
    assert.equal(state.activeEntryId.value, '')
    assert.equal(state.jump('second'), false)
    assert.equal(calls.length, 1)
  } finally { scope.stop() }
})
