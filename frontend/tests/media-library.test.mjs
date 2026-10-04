import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createSSRApp, effectScope, h, nextTick, ref, ssrContextKey } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom',
  logLevel: 'silent',
})
after(() => server.close())

async function render(path, props) {
  const component = (await server.ssrLoadModule(path)).default
  return renderToString(createSSRApp(component, props))
}

test('image preview keeps the remote URL and lazy loads it', async () => {
  const html = await render('/src/components/MediaPreview.vue', {
    asset: { id: 7, kind: 'image', url: 'https://cdn.test/image.png?token=abc', prompt: 'Snowfield' },
  })
  assert.match(html, /src="https:\/\/cdn\.test\/image\.png\?token=abc"/)
  assert.match(html, /loading="lazy"/)
  assert.match(html, /referrerpolicy="no-referrer"/)
  assert.match(html, /aria-label="预览图片 #7"/)
})

test('video thumbnail shows a real video frame without autoplay or inline controls', async () => {
  const html = await render('/src/components/MediaPreview.vue', {
    asset: { id: 8, kind: 'video', url: 'https://cdn.test/video.mp4', seconds: 5 },
  })
  assert.match(html, /<video[^>]*src="https:\/\/cdn\.test\/video\.mp4"/)
  assert.match(html, /preload="metadata"/)
  assert.match(html, /muted/)
  assert.doesNotMatch(html, /autoplay|\scontrols(?:=|\s|>)/)
  assert.match(html, /aspect-video/)
  assert.match(html, /aria-label="预览视频 #8"/)
})

test('expanded video viewer uses the saved URL with native controls, without autoplay', async () => {
  const html = await render('/src/components/MediaPreview.vue', {
    expanded: true,
    asset: { id: 8, kind: 'video', url: 'https://cdn.test/video.mp4?token=abc', seconds: 5 },
  })
  assert.match(html, /<video[^>]*src="https:\/\/cdn\.test\/video\.mp4\?token=abc"/)
  assert.match(html, /controls/)
  assert.match(html, /preload="metadata"/)
  assert.doesNotMatch(html, /autoplay/)
})

test('video preview seeks a decoded frame but leaves expanded playback position alone', async () => {
  const component = (await server.ssrLoadModule('/src/components/MediaPreview.vue')).default
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const scope = effectScope()
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup({
      asset: { id: 8, kind: 'video', url: 'https://cdn.test/video.mp4' }, expanded: false,
    }, { expose() {}, emit() {} })))
    const video = { duration: 5, currentTime: 0 }
    state.seekPreview({ target: video })
    assert.equal(video.currentTime, 0.1)
    video.duration = 0.1
    state.seekPreview({ target: video })
    assert.equal(video.currentTime, 0.05)
    const expanded = app.runWithContext(() => scope.run(() => component.setup({
      asset: { id: 8, kind: 'video', url: 'https://cdn.test/video.mp4' }, expanded: true,
    }, { expose() {}, emit() {} })))
    video.currentTime = 0
    expanded.seekPreview({ target: video })
    assert.equal(video.currentTime, 0)
  } finally { scope.stop() }
})

test('an eight-video page has compact four-column previews and a download action for each item', async () => {
  const component = (await server.ssrLoadModule('/src/views/MediaLibrary.vue')).default
  const seeded = {
    ...component,
    setup(props, context) {
      const state = component.setup(props, context)
      state.items.value = Array.from({ length: 8 }, (_, index) => ({
        id: index + 1, kind: 'video', url: `https://cdn.test/video-${index}.mp4`,
        prompt: '海面上的波浪', model: 'agnes-video-2.5-flash', created_at: '2026-10-02 12:00:00',
      }))
      state.total.value = 8
      state.loading.value = false
      return state
    },
  }
  const provider = (await server.ssrLoadModule('/src/components/ui/tooltip/TooltipProvider.vue')).default
  const html = await renderToString(createSSRApp({
    render: () => h(provider, {}, { default: () => h(seeded, { kind: 'video' }) }),
  }))
  assert.equal((html.match(/<video /g) || []).length, 8)
  assert.equal((html.match(/aria-label="下载视频"/g) || []).length, 8)
  assert.match(html, /xl:grid-cols-4/)
  assert.match(html, /第 1–8 条/)
})

for (const [kind, title] of [['image', '图片库'], ['video', '视频库']]) {
  test(`${kind} library has its own title and appropriate accessible filters`, async () => {
    const html = await render('/src/views/MediaLibrary.vue', { kind })
    assert.match(html, new RegExp(`<h1[^>]*>${title}</h1>`))
    if (kind === 'image') assert.match(html, /aria-label="搜索媒体记录"/)
    else {
      assert.match(html, /aria-label="开始日期"/)
      assert.match(html, /aria-label="结束日期"/)
      assert.match(html, /type="date"/)
      assert.doesNotMatch(html, /aria-label="搜索媒体记录"|搜索提示词/)
    }
    assert.match(html, /aria-label="刷新媒体库"/)
    assert.doesNotMatch(html, /<footer/)
  })
}

async function libraryState(t, client) {
  const { useMediaLibrary } = await import('../src/composables/useMediaLibrary.js')
  const kind = ref('image')
  const scope = effectScope()
  t.after(() => scope.stop())
  return { kind, state: scope.run(() => useMediaLibrary(kind, client)) }
}

function pendingClient() {
  const requests = []
  return {
    requests,
    client: {
      get(url) {
        const params = new URL(url, 'http://gateway.test').searchParams
        return new Promise((resolve) => requests.push({ params, resolve }))
      },
    },
  }
}

test('refresh during an outstanding search keeps the newest filter', async (t) => {
  const { client, requests } = pendingClient()
  const { state } = await libraryState(t, client)
  const all = { total: 2, items: [{ id: 1, prompt: 'mountain' }, { id: 2, prompt: 'ocean' }] }
  const ocean = { total: 1, items: [{ id: 2, prompt: 'ocean' }] }
  const first = state.load()
  requests[0].resolve(all)
  await first
  state.query.value = 'ocean'
  const search = state.search()
  const afterDelete = state.load()
  requests[2].resolve(requests[2].params.get('search') === 'ocean' ? ocean : all)
  await afterDelete
  requests[1].resolve(ocean)
  await search
  assert.deepEqual(state.items.value, ocean.items)
  assert.equal(state.searchTerm.value, 'ocean')
  assert.equal(state.query.value, 'ocean')
  assert.equal(state.loading.value, false)
})

test('switching libraries ignores an older in-flight response', async (t) => {
  const { client, requests } = pendingClient()
  const { kind, state } = await libraryState(t, client)
  const imageRequest = state.load()
  kind.value = 'video'
  await nextTick()
  requests[1].resolve({ total: 1, items: [{ id: 8, kind: 'video' }] })
  await Promise.resolve()
  requests[0].resolve({ total: 1, items: [{ id: 7, kind: 'image' }] })
  await imageRequest
  assert.deepEqual(state.items.value, [{ id: 8, kind: 'video' }])
  assert.equal(state.offset.value, 0)
})

test('deleting the only record on the last page returns to a valid page', async (t) => {
  let deleted = false
  const client = {
    async get(url) {
      const offset = Number(new URL(url, 'http://gateway.test').searchParams.get('offset'))
      if (!deleted) return { total: 25, items: [{ id: 25 }] }
      return offset ? { total: 24, items: [] } : { total: 24, items: [{ id: 24 }] }
    },
  }
  const { state } = await libraryState(t, client)
  await state.load(24)
  assert.equal(state.offset.value, 24)
  deleted = true
  await state.load()
  assert.equal(state.offset.value, 0)
  assert.deepEqual(state.items.value, [{ id: 24 }])
  assert.equal(state.loading.value, false)
})

test('video pagination is capped at eight and preserves the submitted dates during refresh', async t => {
  const { client, requests } = pendingClient()
  const { kind, state } = await libraryState(t, client)
  kind.value = 'video'
  await nextTick()
  requests[0].resolve({ total: 9, items: [{ id: 9 }] })
  await Promise.resolve()
  assert.equal(requests[0].params.get('limit'), '8')
  state.startDate.value = '2026-10-01'
  state.endDate.value = '2026-10-02'
  const search = state.search()
  const refresh = state.load()
  for (const request of requests.slice(1)) {
    assert.equal(request.params.get('limit'), '8')
    assert.equal(request.params.get('start_date'), '2026-10-01')
    assert.equal(request.params.get('end_date'), '2026-10-02')
    assert.equal(request.params.has('search'), false)
  }
  requests[2].resolve({ total: 9, items: [{ id: 9 }] })
  await refresh
  requests[1].resolve({ total: 9, items: [{ id: 9 }] })
  await search
  const next = state.load(8)
  assert.equal(requests[3].params.get('offset'), '8')
  assert.equal(requests[3].params.get('start_date'), '2026-10-01')
  requests[3].resolve({ total: 9, items: [{ id: 1 }] })
  await next
  assert.equal(state.offset.value, 8)
  assert.deepEqual(state.items.value, [{ id: 1 }])
  const reset = state.reset()
  assert.equal(state.startDate.value, '')
  assert.equal(state.endDate.value, '')
  assert.equal(requests[4].params.has('start_date'), false)
  assert.equal(requests[4].params.has('end_date'), false)
  requests[4].resolve({ total: 9, items: [] })
  await reset
})
