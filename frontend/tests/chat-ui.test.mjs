import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { parse as parseComponent } from '@vue/compiler-sfc'
import { parse as parseCss } from 'postcss'
import { createSSRApp, effectScope, nextTick, reactive, ssrContextKey } from 'vue'
import { renderToString } from '@vue/server-renderer'
import { createMemoryHistory, createRouter } from 'vue-router'
import { createServer } from 'vite'

const server = await createServer({
  configFile: fileURLToPath(new URL('../vite.config.js', import.meta.url)),
  server: { middlewareMode: true, hmr: false, watch: null },
  appType: 'custom', logLevel: 'silent',
})
after(() => server.close())
async function render(path, props) {
  const component = (await server.ssrLoadModule(path)).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/chat', component }, { path: '/chat/fullscreen', component }, { path: '/keys', component: { render: () => null } }],
  })
  await router.push('/chat')
  await router.isReady()
  const context = {}
  const html = await renderToString(createSSRApp(component, props).use(router), context)
  return html + Object.values(context.teleports || {}).join('')
}

test('chat message escapes HTML and preserves text rather than injecting markup', async () => {
  const html = await render('/src/components/ChatMessage.vue', {
    message: { id: '1', kind: 'text', role: 'assistant', status: 'completed', content: '<script>alert(1)</script>\nhello', urls: [] },
  })
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(html, /<script>|v-html/)
  assert.match(html, /aria-label="复制回复"/)
})

test('generated image uses the original remote URL and has link actions', async () => {
  const html = await render('/src/components/ChatMessage.vue', {
    message: { id: '2', kind: 'image', role: 'assistant', status: 'completed', content: '', urls: ['https://cdn.test/image.png'] },
  })
  assert.match(html, /src="https:\/\/cdn\.test\/image\.png"/)
  assert.match(html, /aria-label="复制图片链接"/)
  assert.match(html, /href="https:\/\/cdn\.test\/image\.png"/)
  assert.doesNotMatch(html, /download=/)
})

test('paused video exposes resume without falsely claiming upstream cancellation', async () => {
  const html = await render('/src/components/ChatMessage.vue', {
    message: { id: '3', kind: 'video', role: 'assistant', status: 'paused', videoId: 'video_1', progress: 40, urls: [] },
  })
  assert.match(html, /继续查询/)
  assert.match(html, /查询已暂停/)
  assert.doesNotMatch(html, /已取消|<video/)
})

test('completed video plays with native controls but no autoplay', async () => {
  const html = await render('/src/components/ChatMessage.vue', {
    message: { id: '4', kind: 'video', role: 'assistant', status: 'completed', urls: ['https://cdn.test/video.mp4'] },
  })
  assert.match(html, /<video[^>]*src="https:\/\/cdn\.test\/video\.mp4"/)
  assert.match(html, /controls/)
  assert.doesNotMatch(html, /autoplay/)
  assert.match(html, /aria-label="查看视频详情"/)
  assert.match(html, /aria-label="下载视频"/)
  assert.match(html, /border-0 bg-transparent/)
})

test('video details show the submitted request type and identify missing legacy metadata', async () => {
  const message = reactive({
    id: 'video', kind: 'video', role: 'assistant', status: 'completed',
    model: 'agnes-video-2.5-flash', videoId: 'task-123',
    videoRequest: { mode: 'keyframe', firstFrame: true, lastFrame: true, size: '720P', ratio: '16:9', seconds: 8, imageCount: 2, prompt: '慢慢移动' },
  })
  // Dialog portals mount on the client; inspect their reactive content in this SSR harness.
  const component = (await server.ssrLoadModule('/src/components/VideoDetailsDialog.vue')).default
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const state = app.runWithContext(() => component.setup({ open: true, message }, { expose() {} }))
  for (const text of ['图生视频（首尾帧）', 'task-123', '720P', '16:9', '8 秒', '2 张']) {
    assert.ok(state.rows.value.some(([, value]) => value === text), text)
  }
  assert.equal(state.request.value.prompt, '慢慢移动')
  message.videoRequest.lastFrame = false
  assert.equal(state.requestType.value, '图生视频（首帧）')
  message.videoRequest.firstFrame = false
  message.videoRequest.lastFrame = true
  assert.equal(state.requestType.value, '图生视频（尾帧）')
  message.videoRequest.mode = 'reference'
  assert.equal(state.requestType.value, '图生视频（参考图片）')
  message.videoRequest.mode = 'text'
  assert.equal(state.requestType.value, '文生视频')
  message.videoRequest = null
  assert.equal(state.requestType.value, '未记录')
})

test('accepted generation submissions clear attachments while unrelated busy changes retain them', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  for (const kind of ['image', 'video']) {
    const props = reactive({ ...await composerProps(kind), contextId: 'session', submissionVersion: 0 })
    Object.assign(props.options, { imageRefs: 'https://cdn.test/ref.png', videoRefs: 'https://cdn.test/ref.png', firstFrame: 'https://cdn.test/start.png' })
    const scope = effectScope()
    const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
    try {
      const state = app.runWithContext(() => scope.run(() => component.setup(props, {
        expose() {}, emit: (event, value) => { if (event === 'update:options') props.options = value },
      })))
      const image = { id: 'draft', url: 'data:image/png;base64,iVBORw0KGgo=', local: true }
      state.uploads.value = [image]
      state.firstUpload.items.value = [image]
      state.lastUpload.items.value = [image]
      props.busy = true
      await nextTick()
      assert.equal(state.uploads.value.length, 1)
      props.submissionVersion++
      await nextTick()
      assert.equal(state.uploads.value.length, 0)
      assert.equal(state.firstUpload.items.value.length, 0)
      assert.equal(state.lastUpload.items.value.length, 0)
      assert.equal(kind === 'image' ? props.options.imageRefs : props.options.videoRefs, '')
      if (kind === 'video') assert.equal(props.options.firstFrame, '')
    } finally { scope.stop() }
  }
})

test('image and video parameters have mode-specific accessible controls', async () => {
  const image = await render('/src/components/ChatSettingsPanel.vue', await composerProps('image'))
  assert.match(image, /aria-label="图片尺寸"/)
  assert.match(image, /aria-label="图片比例"/)
  const video = await render('/src/components/ChatSettingsPanel.vue', await composerProps('video'))
  const composer = await render('/src/components/ChatComposer.vue', await composerProps('video'))
  assert.match(composer, /aria-label="视频模式"/)
  assert.match(video, /aria-label="视频时长"/)
  const frames = await render('/src/components/ChatReferenceContent.vue', {
    open: true, kind: 'video', videoMode: 'keyframe',
  })
  assert.match(frames, /首帧/)
  assert.match(frames, /尾帧/)
  assert.doesNotMatch(frames, /id="reference-links"/)
})

test('history has selectable conversations and named delete controls', async () => {
  const html = await render('/src/components/ChatHistory.vue', {
    sessions: [{ id: 's1', title: '雪地', kind: 'image', messages: [] }], activeId: 's1',
  })
  assert.match(html, /雪地/)
  assert.match(html, /aria-label="删除会话：雪地"/)
  assert.match(html, /aria-label="新建会话"/)
})

test('conversation navigation has labeled anchors, a current location and an empty state', async () => {
  const html = await render('/src/components/ChatNavigation.vue', {
    entries: [
      { id: 'first', number: 1, title: '开始', preview: '第一轮回复' },
      { id: 'second', number: 2, title: '<script>第二轮</script>', preview: '第二轮回复' },
    ],
    activeId: 'second',
  })
  assert.match(html, /aria-label="对话快速导航"/)
  assert.match(html, /aria-label="跳转到第 1 轮：开始"/)
  assert.match(html, /aria-current="location"[^>]*aria-label="跳转到第 2 轮/)
  assert.match(html, /aria-controls="chat-message-second"/)
  assert.doesNotMatch(html, /<script>/)
  assert.doesNotMatch(await render('/src/components/ChatNavigation.vue', { entries: [] }), /<nav/)
})

test('navigation selection closes its preview and emits the stable message ID', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatNavigation.vue')).default
  const props = reactive({ entries: [{ id: 'first', number: 1, title: '开始', preview: '回复' }], activeId: 'first' })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: (...args) => events.push(args) })))
    state.changePreview('first', true)
    assert.equal(state.previewId.value, 'first')
    state.select('first')
    assert.equal(state.previewId.value, '')
    assert.deepEqual(events, [['select', 'first']])
  } finally { scope.stop() }
})

test('jumping to history prevents streaming auto-scroll until manual scrolling resumes', async () => {
  const component = (await server.ssrLoadModule('/src/views/ChatWorkspace.vue')).default
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const scrolls = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup({}, { expose() {} })))
    state.current.value.messages = [
      { id: 'first', role: 'user', content: '开始', reasoning: '', status: 'completed', urls: [] },
      { id: 'reply', role: 'assistant', content: '回复中', reasoning: '', status: 'streaming', urls: [] },
    ]
    await nextTick()
    await nextTick()
    const area = {
      scrollTop: 980, scrollHeight: 1400, clientHeight: 400,
      getBoundingClientRect: () => ({ top: 0 }),
      querySelectorAll: () => [{
        dataset: { chatMessageId: 'first' }, getBoundingClientRect: () => ({ top: 24 - area.scrollTop }), focus() {},
      }],
      scrollTo: options => scrolls.push(options),
    }
    state.messageArea.value = area
    await nextTick()
    state.jumpToMessage('first')
    state.onScroll()
    assert.equal(state.nearBottom.value, false, 'smooth scroll can start near the bottom without restoring auto-follow')
    state.current.value.messages[1].content += '新的内容'
    await nextTick()
    assert.equal(area.scrollTop, 980)
    assert.equal(scrolls.length, 1)
    state.onManualScroll({ type: 'wheel' })
    assert.equal(state.nearBottom.value, true)
  } finally { scope.stop() }
})

test('workspace keeps key selection above the composer without duplicating model controls', async () => {
  const html = await render('/src/views/ChatWorkspace.vue')
  assert.match(html, /aria-label="生成类型"/)
  assert.match(html, /aria-label="消息内容"/)
  assert.match(html, /aria-label="发送消息"/)
  assert.match(html, /aria-label="选择模型"/)
  assert.match(html, /aria-label="选择对外密钥"/)
  assert.equal((html.match(/aria-label="选择模型"/g) || []).length, 1)
  assert.ok(html.indexOf('aria-label="选择对外密钥"') < html.indexOf('data-slot="composer-toolbar"'))
  assert.ok(html.indexOf('aria-label="选择模型"') > html.indexOf('data-slot="composer-toolbar"'))
  assert.doesNotMatch(html, /<footer/)
})

test('fullscreen chat retains conversation history and the message composer', async () => {
  const html = await render('/src/views/ChatWorkspace.vue', { fullscreen: true })
  assert.match(html, /<aside/)
  assert.match(html, /aria-label="会话列表"/)
  assert.match(html, /aria-label="打开会话历史"/)
  assert.match(html, /aria-label="消息输入区"/)
  assert.match(html, /aria-label="返回聊天工作区"/)
  const normal = await render('/src/views/ChatWorkspace.vue', {})
  assert.match(normal, /aria-label="全屏聊天（新窗口）"/)
  assert.match(normal, /href="#?\/chat\/fullscreen\?session=[^"]+"/)
  assert.match(normal, /target="_blank"/)
  assert.match(normal, /rel="noopener noreferrer"/)
})

test('fullscreen route renders only the chat surface without the admin shell', async () => {
  const component = (await server.ssrLoadModule('/src/App.vue')).default
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/chat/fullscreen', component: { render: () => null }, meta: { auth: true, chatOnly: true } }],
  })
  await router.push('/chat/fullscreen')
  await router.isReady()
  const html = await renderToString(createSSRApp(component).use(router))
  assert.match(html, /aria-label="独立聊天窗口"/)
  assert.match(html, /h-dvh/)
  assert.doesNotMatch(html, /<aside|<header|导航菜单|控制台|OpenAI compatible/)
})

async function composerProps(kind, overrides = {}) {
  const { defaultOptions } = await import('../src/composables/useChatWorkspace.js')
  const models = { text: 'agnes-2.5-flash', image: 'agnes-image-2.5-flash', video: 'agnes-video-2.5-flash' }
  return {
    modelValue: '', kind, model: models[kind], options: defaultOptions(),
    models: [{ value: models[kind], label: models[kind] }], canSend: true, ...overrides,
  }
}

for (const [kind, label] of [['text', '聊天'], ['image', '生图'], ['video', '生视频']]) {
  test(`${kind} composer puts controls below the input with a circular send action`, async () => {
    const html = await render('/src/components/ChatComposer.vue', await composerProps(kind))
    assert.ok(html.includes(label))
    assert.match(html, /class="[^"]*chat-composer/)
    assert.match(html, /aria-label="选择图片"/)
    assert.match(html, /aria-label="发送消息"[^>]*title="发送消息"/)
    assert.ok(html.indexOf('aria-label="消息内容"') < html.indexOf('data-slot="composer-toolbar"'))
    assert.ok(html.indexOf('aria-label="选择模型"') > html.indexOf('data-slot="composer-toolbar"'))
    assert.doesNotMatch(html, /点数|全能模式/)
    assert.match(html, /type="file"[^>]*accept="image\/jpeg,image\/png,image\/webp,image\/gif"[^>]*multiple/)
  })
}

test('video composer exposes compact controls and preserves protected task creation', async () => {
  const props = await composerProps('video', { busy: true, videoCreating: true })
  const html = await render('/src/components/ChatComposer.vue', props)
  assert.match(html, /aria-label="生成参数设置"/)
  assert.doesNotMatch(html, /aria-label="视频比例"|aria-label="视频时长"/)
  assert.match(html, /disabled[^>]*aria-label="正在提交视频任务"|aria-label="正在提交视频任务"[^>]*disabled/)
  assert.doesNotMatch(html, /aria-label="暂停视频查询"/)
})

test('chat upload control is enabled and sent images are visible in the message', async () => {
  const html = await render('/src/components/ChatComposer.vue', await composerProps('text'))
  const button = html.match(/<button[^>]*aria-label="选择图片"[^>]*>/)?.[0]
  assert.ok(button)
  assert.doesNotMatch(button, /\sdisabled(?:[=\s>])/)
  const message = { id: 'photo', role: 'user', kind: 'text', content: '', imageCount: 1 }
  const sent = await render('/src/components/ChatMessage.vue', {
    message: { ...message, inputImages: ['data:image/png;base64,iVBORw0KGgo='] },
  })
  assert.match(sent, /src="data:image\/png;base64,iVBORw0KGgo="/)
  const restored = await render('/src/components/ChatMessage.vue', { message })
  assert.match(restored, /重新上传/)
})

test('chat readiness alone cannot send an empty draft and disabled credentials block uploads', async () => {
  const empty = await render('/src/components/ChatComposer.vue', await composerProps('text'))
  assert.match(empty.match(/<button[^>]*aria-label="发送消息"[^>]*>/)?.[0] || '', /\sdisabled(?:[=\s>])/)
  const filled = await render('/src/components/ChatComposer.vue', await composerProps('text', { modelValue: '看一下这张图' }))
  assert.doesNotMatch(filled.match(/<button[^>]*aria-label="发送消息"[^>]*>/)?.[0] || '', /\sdisabled(?:[=\s>])/)
  const disabled = await render('/src/components/ChatComposer.vue', await composerProps('text', { inputDisabled: true }))
  assert.match(disabled.match(/<button[^>]*aria-label="选择图片"[^>]*>/)?.[0] || '', /\sdisabled(?:[=\s>])/)
})

test('resuming an older task keeps draft images until this composer submission is accepted', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  const props = reactive({ ...await composerProps('text'), contextId: 'session', submissionVersion: 0 })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit() {} })))
    state.uploads.value = [{ id: 'draft', url: 'data:image/png;base64,iVBORw0KGgo=', label: 'draft.png', size: 8 }]
    props.busy = true
    await nextTick()
    assert.equal(state.uploads.value.length, 1, 'unrelated video polling must preserve draft images')
    props.busy = false
    props.submissionVersion++
    await nextTick()
    assert.equal(state.uploads.value.length, 0)
  } finally { scope.stop() }
})

test('image settings use exclusive radio groups and a compact toolbar summary', async () => {
  const props = await composerProps('image')
  const panel = await render('/src/components/ChatSettingsPanel.vue', props)
  assert.match(panel, /type="radio"[^>]*value="auto"[^>]*checked/)
  for (const ratio of ['9:16', '2:3', '3:4', '1:1', '4:3', '3:2', '16:9', '21:9']) {
    assert.ok(panel.includes(`aria-label="比例 ${ratio}"`))
  }
  for (const size of ['1K', '2K', '3K', '4K']) assert.ok(panel.includes(`aria-label="分辨率 ${size}"`))
  const html = await render('/src/components/ChatComposer.vue', props)
  assert.match(html, /aria-label="生成参数设置"/)
  assert.match(html, /Auto/)
  assert.doesNotMatch(html, /aria-label="图片比例"|aria-label="图片尺寸"/)
})

test('Flash video settings exclude unsupported resolutions and Auto ratio', async () => {
  const html = await render('/src/components/ChatSettingsPanel.vue', await composerProps('video', { disabled: true }))
  assert.match(html, /aria-label="视频分辨率"[^>]*disabled/)
  assert.match(html, /aria-label="分辨率 720P"/)
  assert.doesNotMatch(html, /分辨率 1080P|分辨率 2K|value="auto"/)
})

test('composer thumbnails stack existing links above the toolbar beside the text input', async () => {
  const props = await composerProps('image')
  props.options.imageRefs = 'https://cdn.test/a.png\nhttps://cdn.test/b.png'
  const html = await render('/src/components/ChatComposer.vue', props)
  assert.match(html, /src="https:\/\/cdn\.test\/a\.png"/)
  assert.match(html, /aria-label="预览已添加的 2 张图片"/)
  assert.ok(html.indexOf('aria-label="已添加参考素材"') < html.indexOf('aria-label="消息内容"'))
  assert.doesNotMatch(html, /composer-references/)
})

test('attachment stack hides filenames and limits the visible fan to three pictures', async () => {
  const html = await render('/src/components/ChatAttachments.vue', {
    items: Array.from({ length: 5 }, (_, index) => ({
      id: `local-${index}`, url: `https://cdn.test/${index}.png`, label: `private-filename-${index}.png`, local: true,
    })),
  })
  assert.match(html, /aria-label="预览已添加的 5 张图片"/)
  assert.match(html, /aria-label="添加图片"/)
  assert.equal((html.match(/class="stack-photo"/g) || []).length, 3)
  assert.doesNotMatch(html, /private-filename/)
})

test('attachment preview removes the selected image and closes when the last item is removed', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatAttachments.vue')).default
  const props = reactive({
    items: [{ id: 'a', url: 'https://cdn.test/a.png' }, { id: 'b', url: 'https://cdn.test/b.png' }], disabled: false,
  })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: (...args) => events.push(args) })))
    assert.equal(state.active.value.id, 'b')
    state.activeId.value = 'a'
    state.removeActive()
    assert.deepEqual(events[0], ['remove', props.items[0]])
    props.disabled = true
    state.removeActive()
    state.add()
    assert.equal(events.length, 1)
    state.open.value = true
    props.items = []
    await nextTick()
    assert.equal(state.open.value, false)
    assert.equal(state.active.value, undefined)
  } finally { scope.stop() }
})

test('keyframes render as two inline cards with swap, replacement and removal controls', async () => {
  const props = await composerProps('video')
  props.options.videoMode = 'keyframe'
  let html = await render('/src/components/ChatComposer.vue', props)
  for (const label of ['选择首帧', '选择尾帧', '交换首尾帧', '视频模式']) assert.ok(html.includes(`aria-label="${label}"`))
  assert.doesNotMatch(html, /aria-label="添加参考素材"/)
  props.options.firstFrame = 'https://cdn.test/first.png'
  props.options.lastFrame = 'https://cdn.test/last.png'
  html = await render('/src/components/ChatComposer.vue', props)
  for (const label of ['替换首帧', '替换尾帧', '移除首帧', '移除尾帧']) assert.ok(html.includes(`aria-label="${label}"`))
  assert.equal((html.match(/src="https:\/\/cdn\.test\/first\.png"/g) || []).length, 1)
  assert.doesNotMatch(html, /aria-label="已添加参考素材"/)
})

test('tail card picker targets the tail frame on first mount and keeps that target when reopened', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatReferenceContent.vue')).default
  const props = reactive({ open: true, kind: 'video', videoMode: 'keyframe', frameTarget: 'lastFrame' })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: (...args) => events.push(args) })))
    state.toggle('https://cdn.test/tail.png')
    state.pick()
    assert.equal(events[0][1].target, 'lastFrame')
    props.open = false
    await nextTick()
    props.frameTarget = 'firstFrame'
    props.open = true
    await nextTick()
    assert.deepEqual(state.selected.value, [])
    state.toggle('https://cdn.test/start.png')
    state.pick()
    assert.equal(events[1][1].target, 'firstFrame')
  } finally { scope.stop() }
})

test('frame actions swap or clear only the chosen slots and cannot modify a running request', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  const props = reactive(await composerProps('video'))
  Object.assign(props.options, { videoMode: 'keyframe', firstFrame: 'https://cdn.test/start.png', lastFrame: 'https://cdn.test/end.png' })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: (...args) => events.push(args) })))
    state.swapFrames()
    assert.deepEqual(events[0], ['update:options', { ...props.options, firstFrame: props.options.lastFrame, lastFrame: props.options.firstFrame }])
    state.clearFrame('lastFrame')
    assert.deepEqual(events[1], ['update:options', { ...props.options, lastFrame: '' }])
    state.openFrame('lastFrame')
    assert.equal(state.frameTarget.value, 'lastFrame')
    props.busy = true
    state.swapFrames()
    state.clearFrame('firstFrame')
    assert.equal(events.length, 2)
  } finally { scope.stop() }
})

test('reference picker selects from the image library without link-entry or upload fields', async () => {
  const html = await render('/src/components/ChatReferenceContent.vue', { open: true, kind: 'image' })
  assert.match(html, /图片库/)
  assert.match(html, /aria-label="搜索参考图片"/)
  assert.doesNotMatch(html, /图片链接|id="reference-links"/)
  assert.doesNotMatch(html, /type="file"/)
})

test('image source selection closes its menu and blocks choices while disabled', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatImageSource.vue')).default
  const props = reactive({ open: undefined, disabled: false })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: (...args) => events.push(args) })))
    for (const source of ['upload', 'library']) {
      state.open.value = true
      events.length = 0
      state.choose(source)
      assert.equal(state.open.value, false)
      assert.deepEqual(events, [['update:open', false], ['select', source]])
      let prevented = false
      state.closeFocus({ preventDefault() { prevented = true } })
      assert.equal(prevented, true)
    }
    state.open.value = true
    props.disabled = true
    await nextTick()
    assert.equal(state.open.value, false)
    events.length = 0
    state.choose('upload')
    state.choose('library')
    assert.deepEqual(events, [])
  } finally { scope.stop() }
})

test('opening the reference picker immediately loads existing image library entries', async t => {
  const { api } = await server.ssrLoadModule('/src/api.js')
  const requests = []
  const asset = { id: 7, kind: 'image', url: 'https://cdn.test/library.png', prompt: '雪地' }
  t.mock.method(api, 'get', async url => {
    requests.push(url)
    return { items: [asset], total: 1 }
  })
  const component = (await server.ssrLoadModule('/src/components/ChatReferenceContent.vue')).default
  const props = reactive({ open: true, kind: 'video', videoMode: 'reference' })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit() {} })))
    await nextTick()
    assert.equal(requests.length, 1)
    const request = new URL(requests[0], 'http://localhost')
    assert.equal(request.pathname, '/admin/api/media')
    assert.equal(request.searchParams.get('kind'), 'image')
    assert.equal(request.searchParams.get('offset'), '0')
    assert.deepEqual(state.items.value, [asset])
    assert.equal(state.total.value, 1)
    assert.equal(state.loading.value, false)
  } finally { scope.stop() }
})

test('uploaded keyframes preview safely and use a single-file chooser', async () => {
  const props = await composerProps('video')
  props.options.videoMode = 'keyframe'
  const html = await render('/src/components/ChatComposer.vue', props)
  assert.match(html, /type="file"/)
  assert.doesNotMatch(html.match(/<input[^>]*type="file"[^>]*>/)?.[0] || '', /\smultiple/)
  assert.doesNotMatch(html, /aria-label="从图片库或链接选择素材"/)
  const frames = await render('/src/components/ChatKeyframes.vue', {
    options: { firstFrame: 'data:image/png;base64,iVBORw0KGgo=', lastFrame: 'data:image/svg+xml;base64,PHN2Zz4=' },
  })
  assert.match(frames, /src="data:image\/png;base64,iVBORw0KGgo="/)
  assert.doesNotMatch(frames, /src="data:image\/svg/)
})

test('frame source choices open the image library or upload chooser for the requested slot', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  const props = reactive(await composerProps('video', { contextId: 'one' }))
  props.options.videoMode = 'keyframe'
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  let uploadsOpened = 0
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit() {} })))
    state.fileInput.value = { click() { uploadsOpened++ } }
    state.openFrame('lastFrame', 'library')
    assert.equal(state.pickerOpen.value, true)
    assert.equal(state.frameTarget.value, 'lastFrame')
    assert.equal(uploadsOpened, 0)
    state.pickerOpen.value = false
    state.openFrame('firstFrame', 'upload')
    assert.equal(state.frameTarget.value, 'firstFrame')
    assert.equal(uploadsOpened, 1)
    props.busy = true
    state.openFrame('lastFrame', 'library')
    assert.equal(state.pickerOpen.value, false)
  } finally { scope.stop() }
})

test('chat can select library images through the shared image entry and submit them with uploads', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  const props = reactive(await composerProps('text', { contextId: 'one', modelValue: '看这两张图' }))
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, { expose() {}, emit: (...args) => events.push(args) })))
    const local = { id: 'local', url: 'data:image/png;base64,iVBORw0KGgo=', local: true, size: 8 }
    state.uploads.value = [local]
    state.openReferences('library')
    assert.equal(state.pickerOpen.value, true)
    state.add({ urls: ['https://cdn.test/library.png'] })
    assert.equal(state.pickerOpen.value, false)
    assert.equal(state.referenceError.value, '')
    state.submit()
    assert.deepEqual(events.at(-1), ['submit', [local.url, 'https://cdn.test/library.png'], {}])
    state.remove(state.uploads.value[1])
    assert.deepEqual(state.uploads.value, [local])
  } finally { scope.stop() }
})

test('video local frames swap with remote frames, submit by mode and reset on session changes', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  const props = reactive(await composerProps('video', { contextId: 'one', modelValue: '缓慢移动' }))
  Object.assign(props.options, { videoMode: 'keyframe', lastFrame: 'https://cdn.test/end.png' })
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = []
  const image = { id: 'local', url: 'data:image/png;base64,iVBORw0KGgo=', local: true, size: 8 }
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, {
      expose() {}, emit: (...args) => {
        events.push(args)
        if (args[0] === 'update:options') props.options = args[1]
      },
    })))
    state.firstUpload.items.value = [image]
    state.swapFrames()
    assert.equal(state.frameOptions.value.firstFrame, 'https://cdn.test/end.png')
    assert.equal(state.frameOptions.value.lastFrame, image.url)
    state.submit()
    assert.deepEqual(events.at(-1), ['submit', [], { lastFrame: image.url }])
    state.add({ urls: ['https://cdn.test/replacement.png'], target: 'lastFrame' })
    assert.equal(state.lastUpload.items.value.length, 0)
    assert.equal(state.frameOptions.value.lastFrame, 'https://cdn.test/replacement.png')
    state.firstUpload.items.value = [image]
    state.clearFrame('firstFrame')
    assert.equal(state.frameOptions.value.firstFrame, '')
    state.lastUpload.items.value = [image]
    state.uploads.value = [image]
    props.options.videoMode = 'reference'
    state.submit()
    assert.deepEqual(events.at(-1), ['submit', [image.url], {}])
    props.options.videoMode = 'text'
    state.submit()
    assert.deepEqual(events.at(-1), ['submit', [], {}])
    props.contextId = 'two'
    assert.equal(state.uploads.value.length, 0)
    assert.equal(state.firstUpload.items.value.length, 0)
    assert.equal(state.lastUpload.items.value.length, 0)
  } finally { scope.stop() }
})

test('frame file selections use their target and stale selections cannot enter another session', async () => {
  const component = (await server.ssrLoadModule('/src/components/ChatComposer.vue')).default
  const props = reactive(await composerProps('video', { contextId: 'one' }))
  props.options.videoMode = 'keyframe'
  const scope = effectScope()
  const app = createSSRApp({ render: () => null }).provide(ssrContextKey, {})
  const events = [], calls = []
  try {
    const state = app.runWithContext(() => scope.run(() => component.setup(props, {
      expose() {}, emit: (...args) => events.push(args),
    })))
    state.lastUpload.add = async (...args) => { calls.push(args); return true }
    const file = { name: 'tail.png', size: 8, type: 'image/png' }
    const input = () => ({ target: { files: [file], value: 'tail.png' } })
    state.openFrame('lastFrame')
    await state.chooseFiles(input())
    assert.deepEqual(calls, [[[file], { replace: true }]])
    assert.deepEqual(events.at(-1), ['update:options', { ...props.options, lastFrame: '' }])
    state.openFrame('lastFrame')
    props.contextId = 'two'
    await state.chooseFiles(input())
    assert.equal(calls.length, 1)
    state.openFrame('lastFrame')
    await state.chooseFiles({ target: { files: [file, file], value: '' } })
    assert.match(state.referenceError.value, /只能上传一张/)
    assert.equal(calls.length, 1)
  } finally { scope.stop() }
})

test('height-capped composer preserves input and wrapped toolbar row heights', async () => {
  const source = await readFile(new URL('../src/components/ChatComposer.vue', import.meta.url), 'utf8')
  const { descriptor } = parseComponent(source)
  const css = parseCss(descriptor.styles[0].content)
  for (const selector of ['.composer-entry', '.composer-toolbar']) {
    let shrink
    css.walkRules(rule => {
      if (!rule.selector.split(',').map(value => value.trim()).includes(selector)) return
      rule.walkDecls('flex-shrink', declaration => { shrink = declaration.value })
    })
    assert.equal(shrink, '0', `${selector} must not collapse inside the scrollable composer`)
  }
})
