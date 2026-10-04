import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope, nextTick } from 'vue'
import { useChatWorkspace, HISTORY_KEY } from '../src/composables/useChatWorkspace.js'

function memoryStorage(seed) {
  let value = seed || null
  return { getItem: () => value, setItem: (_, next) => { value = next }, value: () => value }
}
function workspace(t, client, storage = memoryStorage()) {
  const scope = effectScope()
  t.after(() => scope.stop())
  const state = scope.run(() => useChatWorkspace({ client, storage }))
  state.keys.value = [{ id: 1, name: 'workspace', key: 'ag-secret', enabled: 1 }]
  state.current.value.keyId = 1
  return { state, storage }
}
const completeChat = async (_, payload, { onDelta }) => {
  onDelta?.({ content: 'answer', reasoning: '' })
  return { content: 'answer', reasoning: '' }
}

test('chat sends uploaded images as multimodal content and retains them for follow-up questions only in memory', async t => {
  const requests = []
  const { state, storage } = workspace(t, {
    chat: async (key, payload, options) => { requests.push(payload); return completeChat(key, payload, options) },
  })
  const uploads = ['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/2Q==']
  await state.send('比较两张图片', uploads)
  const content = [{ type: 'text', text: '比较两张图片' }, ...uploads.map(url => ({ type: 'image_url', image_url: { url } }))]
  assert.deepEqual(requests[0].messages, [{ role: 'user', content }])
  assert.deepEqual(state.current.value.messages[0].inputImages, uploads)
  await state.send('第二张里有什么？')
  assert.deepEqual(requests[1].messages[0], { role: 'user', content })
  assert.deepEqual(requests[1].messages.at(-1), { role: 'user', content: '第二张里有什么？' })
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
  assert.ok(!storage.value().includes('/9j/2Q=='))
  assert.equal(JSON.parse(storage.value()).sessions[0].messages[0].imageCount, 2)
  state.createSession()
  await state.send('新问题')
  assert.deepEqual(requests[2].messages, [{ role: 'user', content: '新问题' }])
})

test('chat accepts image-only messages but rejects invalid attachments before starting a request', async t => {
  const requests = []
  const { state } = workspace(t, {
    chat: async (key, payload, options) => { requests.push(payload); return completeChat(key, payload, options) },
  })
  const image = 'data:image/png;base64,iVBORw0KGgo='
  assert.equal(await state.send('', [image]), true)
  assert.deepEqual(requests[0].messages[0].content, [{ type: 'image_url', image_url: { url: image } }])
  assert.equal(await state.send('bad', ['data:text/html;base64,AAAA']), false)
  assert.match(state.error.value, /图片/)
  assert.equal(requests.length, 1)
  assert.equal(await state.send(''), false)
})

test('chat library images are sent as remote image URLs alongside local uploads', async t => {
  let submitted
  const { state, storage } = workspace(t, {
    chat: async (key, payload, options) => { submitted = payload; return completeChat(key, payload, options) },
  })
  const images = ['https://cdn.test/library.png', 'data:image/png;base64,iVBORw0KGgo=']
  assert.equal(await state.send('比较两张图', images), true)
  assert.deepEqual(submitted.messages[0].content.slice(1), images.map(url => ({ type: 'image_url', image_url: { url } })))
  assert.deepEqual(state.current.value.messages[0].inputImages, images)
  assert.equal(state.current.value.messages[0].imageCount, 2)
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
})

test('restored image turns require re-upload and are not silently reused without their images', async t => {
  const { state, storage } = workspace(t, { chat: completeChat })
  await state.send('这是什么？', ['data:image/png;base64,iVBORw0KGgo='])
  const requests = []
  const restored = workspace(t, {
    chat: async (key, payload, options) => { requests.push(payload); return completeChat(key, payload, options) },
  }, memoryStorage(storage.value())).state
  assert.equal(restored.current.value.messages[0].imageCount, 1)
  assert.equal(restored.current.value.messages[0].inputImages, undefined)
  await restored.send('新的问题')
  assert.deepEqual(requests[0].messages, [{ role: 'user', content: '新的问题' }])
})

test('follow-up errors redact images from previous chat turns too', async t => {
  const image = 'data:image/png;base64,iVBORw0KGgo='
  let calls = 0
  const { state, storage } = workspace(t, {
    chat: async (key, payload, options) => {
      if (++calls === 1) return completeChat(key, payload, options)
      throw new Error(`invalid input: ${image.split(',')[1]}`)
    },
  })
  await state.send('图片', [image])
  await state.send('继续分析')
  assert.ok(!state.current.value.messages.at(-1).error.includes('iVBORw0KGgo='))
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
})

test('model echoing image bytes in its response cannot write those bytes into history', async t => {
  const image = 'data:image/png;base64,iVBORw0KGgo='
  const { state, storage } = workspace(t, {
    chat: async () => ({ content: `Image: ${image}`, reasoning: image.split(',')[1] }),
  })
  await state.send('分析图片', [image])
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
  assert.ok(storage.value().includes('图片内容已省略'))
})

test('multi-turn chat includes completed text turns but not generated media', async t => {
  const requests = []
  const { state } = workspace(t, {
    chat: async (key, payload, options) => { requests.push(payload); return completeChat(key, payload, options) },
    image: async () => ({ data: [{ url: 'https://cdn.test/image.png' }] }),
  })
  await state.send('first question')
  state.current.value.kind = 'image'
  state.current.value.model = 'agnes-image-2.5-flash'
  await state.send('a picture')
  state.current.value.kind = 'text'
  state.current.value.model = 'agnes-2.5-flash'
  await state.send('second question')
  assert.deepEqual(requests[1].messages, [
    { role: 'user', content: 'first question' }, { role: 'assistant', content: 'answer' },
    { role: 'user', content: 'second question' },
  ])
})

test('history stores links and key IDs, never credentials or media bytes', async t => {
  const { state, storage } = workspace(t, {
    image: async () => ({ data: [{ url: 'https://cdn.test/image.png' }, { b64_json: 'SECRET_BYTES' }] }),
  })
  state.current.value.kind = 'image'
  state.current.value.model = 'agnes-image-2.5-flash'
  state.current.value.key = 'injected-credential'
  await state.send('snow')
  state.persist()
  assert.ok(storage.value().includes('https://cdn.test/image.png'))
  assert.ok(storage.value().includes('"keyId":1'))
  assert.ok(!storage.value().includes('ag-secret'))
  assert.ok(!storage.value().includes('injected-credential'))
  assert.ok(!storage.value().includes('SECRET_BYTES'))
})

test('uploaded image bytes reach generation but are excluded from browser history', async t => {
  let received
  const { state, storage } = workspace(t, {
    image: async (_, payload) => { received = payload; return { data: [{ url: 'https://cdn.test/result.png' }] } },
  })
  state.current.value.kind = 'image'
  state.current.value.model = 'agnes-image-2.5-flash'
  const upload = 'data:image/png;base64,iVBORw0KGgo='
  await state.send('edit uploaded image', [upload])
  assert.deepEqual(received.extra_body.image, [upload])
  assert.deepEqual(state.current.value.messages[0].inputImages, [upload])
  assert.equal(state.current.value.messages[0].imageCount, 1)
  assert.ok(!storage.value().includes(upload))
  assert.ok(storage.value().includes('https://cdn.test/result.png'))
})

test('video creation sends uploaded frames but history and resumed polling never retain their bytes', async t => {
  let submitted, polls = 0
  const image = 'data:image/png;base64,iVBORw0KGgo='
  const { state, storage } = workspace(t, {
    createVideo: async (_, payload) => { submitted = payload; return { video_id: 'upload-video' } },
    pollVideo: async () => {
      if (++polls === 1) throw new Error('temporarily unavailable')
      return { url: 'https://cdn.test/video.mp4' }
    },
  })
  state.current.value.kind = 'video'
  state.current.value.model = 'agnes-video-2.5-flash'
  state.current.value.options.videoMode = 'keyframe'
  await state.send('animate', [], { firstFrame: image })
  assert.equal(submitted.first_frame, image)
  assert.deepEqual(state.current.value.messages[0].inputImages, [image])
  assert.equal(state.current.value.messages[0].imageCount, 1)
  assert.equal(state.current.value.messages.at(-1).status, 'paused')
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
  await state.resumeVideo(state.current.value.messages.at(-1))
  assert.equal(state.current.value.messages.at(-1).status, 'completed')
  assert.equal(polls, 2)
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
})

test('video details snapshot actual submitted modes and inputs without persisting image bytes', async t => {
  const image = 'data:image/png;base64,iVBORw0KGgo='
  const remote = 'https://cdn.test/reference.png'
  for (const mode of ['text', 'reference', 'first', 'last', 'both']) {
    const { state, storage } = workspace(t, {
      createVideo: async () => ({ video_id: `task-${mode}` }),
      pollVideo: async () => ({ url: 'https://cdn.test/video.mp4' }),
    })
    state.current.value.kind = 'video'
    state.current.value.model = 'agnes-video-2.5-flash'
    Object.assign(state.current.value.options, {
      videoMode: ['text', 'reference'].includes(mode) ? mode : 'keyframe',
      videoRefs: remote, firstFrame: remote, lastFrame: remote, seconds: 8,
    })
    if (mode === 'first') state.current.value.options.lastFrame = ''
    if (mode === 'last') state.current.value.options.firstFrame = ''
    const frames = mode === 'first' || mode === 'both' ? { firstFrame: image } : {}
    await state.send('move slowly', mode === 'reference' ? [image] : [], frames)
    const [user, reply] = state.current.value.messages
    const expected = mode === 'text' ? [] : mode === 'reference' ? [remote, image]
      : mode === 'first' ? [image] : mode === 'last' ? [remote] : [image, remote]
    assert.deepEqual(user.inputImages || [], expected)
    const snapshot = JSON.parse(JSON.stringify(reply.videoRequest))
    assert.equal(snapshot.imageCount, expected.length)
    assert.equal(snapshot.firstFrame, ['first', 'both'].includes(mode))
    assert.equal(snapshot.lastFrame, ['last', 'both'].includes(mode))
    Object.assign(state.current.value.options, { videoMode: 'text', seconds: 4, firstFrame: '', lastFrame: '', videoRefs: '' })
    state.persist()
    const restored = workspace(t, {}, memoryStorage(storage.value())).state
    assert.deepEqual(restored.current.value.messages[1].videoRequest, snapshot)
    assert.equal(restored.current.value.messages[0].imageCount, expected.length)
    assert.equal(restored.current.value.messages[0].inputImages, undefined)
    assert.ok(!storage.value().includes('iVBORw0KGgo='))
  }
})

test('upstream validation errors cannot echo uploaded image bytes into history', async t => {
  const upload = 'data:image/png;base64,iVBORw0KGgo='
  const { state, storage } = workspace(t, {
    image: async () => { throw new Error(JSON.stringify({ detail: [{ msg: 'Invalid image', input: upload, data: upload.split(',')[1] }] })) },
  })
  state.current.value.kind = 'image'
  state.current.value.model = 'agnes-image-2.5-flash'
  await state.send('edit image', [upload])
  const error = state.current.value.messages.at(-1).error
  assert.match(error, /Invalid image/)
  assert.ok(!error.includes('iVBORw0KGgo='))
  assert.ok(!storage.value().includes('iVBORw0KGgo='))
})

test('failed chat turns are not silently included in later context', async t => {
  const requests = []
  const { state } = workspace(t, {
    chat: async (_, payload) => {
      requests.push(payload)
      if (requests.length === 1) throw new Error('upstream unavailable')
      return { content: 'ok' }
    },
  })
  await state.send('failed question')
  await state.send('new question')
  assert.deepEqual(requests[1].messages, [{ role: 'user', content: 'new question' }])
  assert.equal(state.current.value.messages[1].status, 'error')
})

test('restoring history pauses unfinished videos and interrupts text without auto-calls', t => {
  const storage = memoryStorage(JSON.stringify({ activeId: 'session', sessions: [{
    id: 'session', title: 'Saved', kind: 'video', model: 'agnes-video-2.5-flash', keyId: 1,
    messages: [
      { id: 'text', role: 'assistant', kind: 'text', status: 'streaming', content: 'partial' },
      { id: 'video', role: 'assistant', kind: 'video', status: 'generating', videoId: 'video_1', model: 'agnes-video-2.5-flash', keyId: 1 },
    ],
  }] }))
  const { state } = workspace(t, {}, storage)
  assert.equal(state.current.value.messages[0].status, 'stopped')
  assert.equal(state.current.value.messages[1].status, 'paused')
  assert.equal(state.busy.value, false)
})

test('standalone chat selects the linked session while preserving the rest of the saved history', t => {
  const saved = JSON.stringify({
    activeId: 'first',
    sessions: [
      { id: 'first', title: '第一段会话', messages: [] },
      { id: 'linked', title: '独立窗口会话', messages: [{ id: 'question', role: 'user', content: '已有问题', status: 'completed' }] },
    ],
  })
  const scope = effectScope()
  t.after(() => scope.stop())
  const state = scope.run(() => useChatWorkspace({ client: {}, storage: memoryStorage(saved), sessionId: 'linked' }))
  assert.equal(state.current.value.id, 'linked')
  assert.equal(state.current.value.messages[0].content, '已有问题')
  assert.equal(state.sessions.value.length, 2)
  const fallback = scope.run(() => useChatWorkspace({ client: {}, storage: memoryStorage(saved), sessionId: 'missing' }))
  assert.equal(fallback.current.value.id, 'first')
})

test('switching sessions stops old callbacks without overwriting a new operation', async t => {
  const pending = []
  const { state } = workspace(t, {
    chat: (_, payload, options) => new Promise(resolve => pending.push({ resolve, options })),
  })
  const oldSession = state.current.value
  const oldSend = state.send('old')
  state.createSession()
  state.current.value.keyId = 1
  const newSend = state.send('new')
  pending[0].options.onDelta({ content: 'stale' })
  pending[0].resolve({ content: 'stale' })
  await oldSend
  assert.equal(state.busy.value, true)
  assert.equal(state.current.value.messages[1].content, '')
  assert.equal(oldSession.messages[1].status, 'stopped')
  pending[1].resolve({ content: 'fresh' })
  await newSend
  assert.equal(state.current.value.messages[1].content, 'fresh')
  assert.equal(state.busy.value, false)
})

test('video resume reuses the original task and original key ID', async t => {
  let creates = 0
  const polls = []
  const { state } = workspace(t, {
    createVideo: async () => { creates++; return { video_id: 'video_1', status: 'queued' } },
    pollVideo: async (key, id, model) => {
      polls.push({ key, id, model })
      if (polls.length === 1) throw new Error('poll timeout')
      return { status: 'completed', url: 'https://cdn.test/video.mp4' }
    },
  })
  state.current.value.kind = 'video'
  state.current.value.model = 'agnes-video-2.5-flash'
  await state.send('snow')
  const message = state.current.value.messages[1]
  assert.equal(message.status, 'paused')
  state.keys.value.push({ id: 2, key: 'ag-other', enabled: 1 })
  state.current.value.keyId = 2
  await state.resumeVideo(message)
  assert.equal(creates, 1)
  assert.equal(polls[1].key, 'ag-secret')
  assert.equal(message.status, 'completed')
  assert.deepEqual(message.urls, ['https://cdn.test/video.mp4'])
})

test('storage failure is visible without discarding current conversation', async t => {
  const { state } = workspace(t, { chat: completeChat }, {
    getItem: () => null, setItem: () => { throw new Error('quota') },
  })
  await state.send('keep this')
  assert.match(state.storageError.value, /保存|存储/)
  assert.equal(state.current.value.messages[1].content, 'answer')
})

test('disabled keys and empty prompts do not send upstream requests', async t => {
  let calls = 0
  const { state } = workspace(t, { chat: async () => { calls++ } })
  state.keys.value[0].enabled = 0
  await state.send('blocked')
  assert.equal(calls, 0)
  assert.match(state.error.value, /密钥/)
  state.keys.value[0].enabled = 1
  await state.send('  ')
  assert.equal(calls, 0)
})

test('partial streaming replies are periodically persisted before completion', async t => {
  let finish, update
  const { state, storage } = workspace(t, {
    chat: (_, __, options) => new Promise(resolve => { finish = resolve; update = options.onDelta }),
  })
  const request = state.send('question')
  await nextTick()
  update({ content: 'partial reply', reasoning: '' })
  await new Promise(resolve => setTimeout(resolve, 550))
  const saved = JSON.parse(storage.value())
  assert.equal(saved.sessions[0].messages[1].content, 'partial reply')
  state.stop()
  finish({ content: 'late reply' })
  await request
})

test('reference fields cannot persist Base64 or local files, even before sending', async t => {
  const { state, storage } = workspace(t, {})
  state.current.value.options.imageRefs = 'data:image/png;base64,MEDIA_BYTES'
  state.current.value.options.firstFrame = 'file:///private/image.png'
  state.current.value.options.videoRefs = 'https://cdn.test/valid.png'
  await nextTick()
  state.persist()
  assert.ok(!storage.value().includes('MEDIA_BYTES'))
  assert.ok(!storage.value().includes('file:///'))
  assert.ok(storage.value().includes('https://cdn.test/valid.png'))
})

test('another tab updating history is detected before a stale snapshot overwrites it', async t => {
  const shared = memoryStorage()
  const first = workspace(t, { chat: completeChat }, shared).state
  await first.send('original')
  const second = workspace(t, { chat: completeChat }, shared).state
  await nextTick()
  await first.send('saved in first tab')
  await second.send('second tab')
  assert.ok(shared.value().includes('saved in first tab'))
  assert.match(second.storageError.value, /其他|页面|覆盖/)
  assert.equal(second.current.value.messages.at(-1).content, 'answer')
})

test('model permissions are rechecked before sending with a different key', async t => {
  let calls = 0
  const { state } = workspace(t, { chat: async () => { calls++; return { content: 'answer' } } })
  state.keys.value[0].allowed_models = ['agnes-3.0-flash']
  state.current.value.model = 'agnes-2.5-flash'
  await state.send('not permitted')
  assert.equal(calls, 0)
  assert.match(state.error.value, /模型|权限/)
})

test('interrupting creation explicitly warns that its unknown video task cannot be resumed', async t => {
  let rejectCreation
  const { state } = workspace(t, {
    createVideo: (_, __, { signal }) => new Promise((_, reject) => {
      rejectCreation = reject
      signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')), { once: true })
    }),
  })
  state.current.value.kind = 'video'
  state.current.value.model = 'agnes-video-2.5-flash'
  const request = state.send('creating')
  state.stop()
  assert.match(state.current.value.messages[1].error, /任务编号|重复提交/)
  rejectCreation(new DOMException('abort', 'AbortError'))
  await request
  assert.equal(state.current.value.messages[1].status, 'stopped')
})
