import assert from 'node:assert/strict'
import { test } from 'node:test'
import { availableModels, createChatClient, generationPayload } from '../src/lib/chat-client.js'

const encoder = new TextEncoder()
function streamResponse(text, split = 1) {
  const bytes = encoder.encode(text)
  return new Response(new ReadableStream({
    start(controller) {
      for (let i = 0; i < bytes.length; i += split) controller.enqueue(bytes.slice(i, i + split))
      controller.close()
    },
  }), { headers: { 'Content-Type': 'text/event-stream' } })
}
const jsonResponse = (data, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json' },
})

test('image payload requests links and supports multiple reference links', () => {
  assert.deepEqual(generationPayload('image', 'agnes-image-2.5-flash', ' snow ', {
    imageSize: '2K', imageRatio: '16:9', imageRefs: 'https://cdn.test/a.png\nhttps://cdn.test/b.png',
  }), {
    model: 'agnes-image-2.5-flash', prompt: 'snow', size: '2K', ratio: '16:9',
    extra_body: { response_format: 'url', image: ['https://cdn.test/a.png', 'https://cdn.test/b.png'] },
  })
})

test('local images are sent only as image inputs and Auto omits the unsupported ratio literal', () => {
  const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
  const payload = generationPayload('image', 'agnes-image-2.5-flash', 'snow', { imageRatio: 'auto' }, [dataUrl])
  assert.equal(Object.hasOwn(payload, 'ratio'), false)
  assert.deepEqual(payload.extra_body.image, [dataUrl])
  assert.equal(payload.extra_body.response_format, 'url')
  for (const invalid of ['data:text/html;base64,AAAA', 'data:image/svg+xml;base64,AAAA', 'data:image/png;base64,???']) {
    assert.throws(() => generationPayload('image', 'image', 'snow', {}, [invalid]), /图片/)
  }
  assert.throws(() => generationPayload('video', 'video', 'snow', {}, [dataUrl]), /视频/)
})

test('generation rejects non-network reference URLs and invalid video parameters', () => {
  for (const imageRefs of ['data:image/png;base64,ABC', 'file:///image.png', 'javascript:alert(1)']) {
    assert.throws(() => generationPayload('image', 'image', 'snow', { imageRefs }), /HTTP|链接/)
  }
  assert.throws(() => generationPayload('video', 'agnes-video-2.5-flash', 'snow', { seconds: 3 }), /时长/)
  assert.throws(() => generationPayload('video', 'agnes-video-2.5-flash', 'snow', { videoSize: '1080P' }), /720P/)
  assert.throws(() => generationPayload('video', 'video', 'snow', { videoMode: 'keyframe' }), /首帧|尾帧/)
  assert.throws(() => generationPayload('image', 'image', '  '), /内容/)
})

test('video reference payload uses top-level fields and string seconds', () => {
  const payload = generationPayload('video', 'agnes-video-2.5-flash', 'snow', {
    videoMode: 'reference', videoRefs: 'https://cdn.test/a.png', seconds: 6, videoRatio: '9:16',
  })
  assert.deepEqual(payload, {
    model: 'agnes-video-2.5-flash', prompt: 'snow', mode: 'reference', size: '720P',
    seconds: '6', aspect_ratio: '9:16', images: ['https://cdn.test/a.png'],
  })
})

test('video uploads fill reference images and individual frame fields without changing saved options', () => {
  const image = 'data:image/png;base64,iVBORw0KGgo='
  const options = { videoMode: 'keyframe', firstFrame: 'https://cdn.test/start.png', lastFrame: '' }
  const frames = generationPayload('video', 'agnes-video-2.5-flash', 'move', options, [], { lastFrame: image })
  assert.equal(frames.first_frame, options.firstFrame)
  assert.equal(frames.last_frame, image)
  assert.equal(options.lastFrame, '')
  const refs = generationPayload('video', 'agnes-video-2.5-flash', 'move', {
    videoMode: 'reference', videoRefs: 'https://cdn.test/a.png',
  }, [image])
  assert.deepEqual(refs.images, ['https://cdn.test/a.png', image])
  assert.throws(() => generationPayload('video', 'agnes-video-2.5-flash', 'move', { videoMode: 'reference' }, Array(6).fill(image)), /5/)
  assert.throws(() => generationPayload('video', 'video', 'move', { videoMode: 'keyframe' }, [], { firstFrame: 'data:text/html;base64,AAAA' }), /图片/)
})

test('model options categorize discovered models and enforce key permissions', () => {
  const catalog = [{ id: 'agnes-3.0-flash' }, { id: 'agnes-image-2.5-flash' }, { id: 'agnes-video-2.5-flash' }]
  assert.deepEqual(availableModels(catalog, 'video', []), ['agnes-video-2.5-flash'])
  assert.deepEqual(availableModels(catalog, 'text', ['agnes-3.0-flash', 'custom-chat']), ['agnes-3.0-flash', 'custom-chat'])
  assert.deepEqual(availableModels(catalog, 'image', ['agnes-3.0-flash']), [])
})

test('SSE decoding handles split UTF-8 bytes, CRLF, reasoning and usage-only chunks', async () => {
  const text = ': keepalive\r\n\r\ndata: {"choices":[{"delta":{"reasoning_content":"思考"}}]}\r\n\r\n'
    + 'data: {"choices":[{"delta":{"content":"你好"}}]}\r\n\r\n'
    + 'data: {"choices":[],"usage":{"total_tokens":7}}\r\n\r\ndata: [DONE]\r\n\r\n'
  const updates = []
  let request
  const client = createChatClient(async (url, options) => {
    request = { url, options }
    return streamResponse(text)
  })
  const result = await client.chat('ag-private', { model: 'text', messages: [] }, {
    onDelta: delta => updates.push(delta),
  })
  assert.equal(result.content, '你好')
  assert.equal(result.reasoning, '思考')
  assert.equal(request.url, '/v1/chat/completions')
  assert.equal(request.options.headers.Authorization, 'Bearer ag-private')
  assert.equal(JSON.parse(request.options.body).stream, true)
  assert.equal(updates.at(-1).content, '你好')
})

test('SSE errors and truncated streams do not become successful assistant messages', async () => {
  for (const [text, pattern] of [
    ['data: {"error":{"message":"quota exceeded"}}\n\n', /quota exceeded/],
    ['data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', /中断|不完整/],
    ['data: {broken}\n\n', /格式|解析/],
  ]) {
    const client = createChatClient(async () => streamResponse(text))
    await assert.rejects(client.chat('key', {}), pattern)
  }
})

test('chat accepts a JSON fallback and gateway 401 does not change admin login', async () => {
  const client = createChatClient(async () => jsonResponse({ choices: [{ message: { content: 'answer' } }] }))
  assert.equal((await client.chat('key', {})).content, 'answer')
  const invalid = createChatClient(async () => jsonResponse({ error: { message: 'invalid gateway key' } }, 401))
  await assert.rejects(invalid.chat('key', {}), /invalid gateway key/)
})

test('polling retries rate limits, reports progress and never recreates a video', async () => {
  const urls = [], waits = [], progress = []
  const responses = [
    jsonResponse({ error: { message: 'too frequent' } }, 429),
    jsonResponse({ status: 'in_progress', progress: 40 }),
    jsonResponse({ status: 'completed', url: 'https://cdn.test/video.mp4' }),
  ]
  const client = createChatClient(async url => { urls.push(url); return responses.shift() }, {
    wait: async milliseconds => waits.push(milliseconds),
  })
  const result = await client.pollVideo('key', 'video/id', 'agnes-video-2.5-flash', {
    onProgress: data => progress.push(data.progress),
  })
  assert.equal(result.url, 'https://cdn.test/video.mp4')
  assert.equal(urls.length, 3)
  assert.ok(urls.every(url => url.startsWith('/v1/videos/video%2Fid?model_name=')))
  assert.ok(waits[0] >= 10000)
  assert.ok(progress.includes(40))
})

test('failed video tasks and unsafe result URLs are rejected', async () => {
  for (const data of [
    { status: 'failed', error: { message: 'render failed' } },
    { status: 'completed', url: 'javascript:alert(1)' },
  ]) {
    const client = createChatClient(async () => jsonResponse(data))
    await assert.rejects(client.pollVideo('key', 'id', 'model'), /failed|链接/)
  }
})

test('video polling has a bound and cancellation prevents further requests', async () => {
  let calls = 0
  const client = createChatClient(async () => { calls++; return jsonResponse({ status: 'queued' }) }, {
    wait: async () => {}, maxPolls: 2,
  })
  await assert.rejects(client.pollVideo('key', 'id', 'model'), /超时|暂停/)
  assert.equal(calls, 2)
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(client.pollVideo('key', 'id', 'model', { signal: controller.signal }), { name: 'AbortError' })
  assert.equal(calls, 2)
})

test('SSE DONE ends a reply even when the remote connection remains open', async () => {
  let cancelled = false
  const client = createChatClient(async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"done"}}]}\n\ndata: [DONE]\n\n'))
    },
    cancel() { cancelled = true },
  }), { headers: { 'Content-Type': 'text/event-stream' } }))
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100)
  try {
    assert.equal((await client.chat('key', {}, { signal: controller.signal })).content, 'done')
    assert.equal(cancelled, true)
  } finally { clearTimeout(timer) }
})

test('a hanging status request cannot exceed the overall polling deadline', async () => {
  let cancelled = false
  const client = createChatClient(async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => { cancelled = true; reject(new DOMException('timeout', 'AbortError')) }, { once: true })
  }), { pollTimeout: 20, requestTimeout: 10, wait: async () => {}, maxPolls: 2 })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100)
  try {
    await assert.rejects(client.pollVideo('key', 'id', 'model', { signal: controller.signal }), /超时|暂停/)
    assert.equal(cancelled, true)
  } finally { clearTimeout(timer) }
})

test('JSON fallback applies the same truncation checks as a streaming reply', async () => {
  for (const finish_reason of ['length', 'content_filter']) {
    const client = createChatClient(async () => jsonResponse({
      choices: [{ message: { content: 'partial' }, finish_reason }],
    }))
    await assert.rejects(client.chat('key', {}), /不完整|审核/)
  }
})

test('model discovery times out so the UI can use its fallback catalog', async () => {
  const client = createChatClient(async (_, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('abort', 'AbortError')), { once: true })
  }), { modelTimeout: 10 })
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 100)
  try { await assert.rejects(client.models('key', { signal: controller.signal }), /超时/) }
  finally { clearTimeout(timer) }
})
