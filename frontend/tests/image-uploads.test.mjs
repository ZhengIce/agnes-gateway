import assert from 'node:assert/strict'
import { test } from 'node:test'
import { effectScope } from 'vue'
import { useImageUploads, MAX_FILE_BYTES } from '../src/composables/useImageUploads.js'

const file = (name = 'cat.png', size = 8, type = 'image/png') => ({ name, size, type })
const dataUrl = 'data:image/png;base64,iVBORw0KGgo='
function setup(t, reader = async () => dataUrl) {
  const scope = effectScope()
  t.after(() => scope.stop())
  return scope.run(() => useImageUploads(reader))
}
test('uploads append previews, remove individually and reject unsupported or oversized files atomically', async t => {
  const state = setup(t)
  await state.add([file()])
  assert.equal(state.items.value[0].url, dataUrl)
  await state.add([file('bad.svg', 20, 'image/svg+xml')])
  assert.match(state.error.value, /格式/)
  assert.equal(state.items.value.length, 1)
  await state.add([file('large.png', MAX_FILE_BYTES + 1)])
  assert.match(state.error.value, /10 MB/)
  assert.equal(state.items.value.length, 1)
  state.remove(state.items.value[0].id)
  assert.equal(state.items.value.length, 0)
})
test('reset ignores late file reads so attachments cannot cross into another session', async t => {
  let finish
  const state = setup(t, () => new Promise(resolve => { finish = resolve }))
  const pending = state.add([file()])
  assert.equal(state.loading.value, true)
  state.reset()
  finish(dataUrl)
  await pending
  assert.equal(state.items.value.length, 0)
  assert.equal(state.loading.value, false)
})
test('failed reads preserve earlier attachments and allow retry', async t => {
  let rejectRead = false
  const state = setup(t, async () => {
    if (rejectRead) throw new Error('图片读取失败')
    return dataUrl
  })
  await state.add([file()])
  rejectRead = true
  await state.add([file('new.png')])
  assert.equal(state.items.value.length, 1)
  assert.match(state.error.value, /读取失败/)
  assert.equal(state.loading.value, false)
})

test('file count and combined size are checked before any file is read', async t => {
  let reads = 0
  const state = setup(t, async () => { reads++; return dataUrl })
  await state.add(Array.from({ length: 6 }, (_, i) => file(`${i}.png`)))
  assert.match(state.error.value, /5 张/)
  await state.add([file('a.png', MAX_FILE_BYTES), file('b.png', MAX_FILE_BYTES), file('c.png')])
  assert.match(state.error.value, /20 MB/)
  assert.equal(reads, 0)
  assert.equal(state.items.value.length, 0)
})

test('unmounting drops pending reads without repopulating attachments', async () => {
  let finish
  const scope = effectScope()
  const state = scope.run(() => useImageUploads(() => new Promise(resolve => { finish = resolve })))
  const pending = state.add([file()])
  scope.stop()
  finish(dataUrl)
  await pending
  assert.equal(state.items.value.length, 0)
  assert.equal(state.loading.value, false)
})

test('replacing a frame commits only after a successful read and preserves it on failure', async t => {
  let fail = false
  const state = setup(t, async () => {
    if (fail) throw new Error('读取失败')
    return dataUrl
  })
  await state.add([file('first.png')])
  assert.equal(await state.add([file('second.png')], { replace: true }), true)
  assert.equal(state.items.value.length, 1)
  assert.equal(state.items.value[0].label, 'second.png')
  fail = true
  assert.equal(await state.add([file('broken.png')], { replace: true }), false)
  assert.equal(state.items.value[0].label, 'second.png')
})
