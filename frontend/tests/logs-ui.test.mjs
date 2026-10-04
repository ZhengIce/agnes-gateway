import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { createSSRApp, ssrContextKey } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createServer } from 'vite'

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'silent',
})
after(() => server.close())

test('request logs expose accessible model and request-type selectors', async () => {
  const component = (await server.ssrLoadModule('/src/views/Logs.vue')).default
  const html = await renderToString(createSSRApp(component))
  assert.match(html, /aria-label="按模型筛选日志"/)
  assert.match(html, /aria-label="按请求类型筛选"/)
  assert.doesNotMatch(html, /placeholder="搜索模型名称/)
})

test('model and video-generation filters use exact matching and reset pagination', async t => {
  const component = (await server.ssrLoadModule('/src/views/Logs.vue')).default
  const { api } = await server.ssrLoadModule('/src/api.js')
  const original = api.get
  const paths = []
  api.get = async path => {
    paths.push(path)
    return { total: 1, logs: [{ id: 1, endpoint: 'v1/videos', category: 'video', request_type: 'video_create' }], models: ['agnes-video-2.5', 'agnes-video-2.5-flash'] }
  }
  t.after(() => { api.get = original })
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const state = app.runWithContext(() => component.setup({}, { expose() {} }))
  state.offset.value = 50
  state.modelFilter.value = 'agnes-video-2.5'
  state.typeFilter.value = 'video_create'
  state.search()
  await Promise.resolve()
  const params = new URL(paths[0], 'http://local.test').searchParams
  assert.equal(params.get('offset'), '0')
  assert.equal(params.get('model'), 'agnes-video-2.5')
  assert.equal(params.get('model_exact'), 'true')
  assert.equal(params.get('request_type'), 'video_create')
  assert.equal(state.modelOptions.value.length, 3)
  assert.equal(state.requestLabel(state.logs.value[0]), '视频生成')
  assert.equal(state.requestLabel({ endpoint: 'agnesapi', category: 'video' }), '视频查询')
  state.reset()
  await Promise.resolve()
  const resetParams = new URL(paths.at(-1), 'http://local.test').searchParams
  assert.equal(resetParams.has('model'), false)
  assert.equal(resetParams.has('request_type'), false)
})
