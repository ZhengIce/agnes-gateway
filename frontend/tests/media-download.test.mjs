import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadVideo } from '../src/lib/media-download.js'

test('video download saves a fetched blob and releases its object URL', async t => {
  const calls = []
  const link = { click() { calls.push('click') }, remove() { calls.push('remove') } }
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://cdn.test/video.mp4')
    assert.equal(options.credentials, 'omit')
    return new Response(new Blob(['video-data'], { type: 'video/mp4' }))
  })
  t.mock.method(URL, 'createObjectURL', () => 'blob:download')
  t.mock.method(URL, 'revokeObjectURL', value => calls.push(value))
  t.mock.method(globalThis, 'setTimeout', fn => { fn(); return 1 })
  const previous = globalThis.document
  globalThis.document = { createElement: () => link, body: { appendChild: () => calls.push('append') } }
  t.after(() => { if (previous === undefined) delete globalThis.document; else globalThis.document = previous })
  await downloadVideo('https://cdn.test/video.mp4', 'task-1')
  assert.equal(link.href, 'blob:download')
  assert.equal(link.download, 'agnes-video-task-1.mp4')
  assert.deepEqual(calls, ['append', 'click', 'remove', 'blob:download'])
})

test('video download surfaces blocked or non-video responses instead of saving an error page', async t => {
  await assert.rejects(downloadVideo('javascript:alert(1)', 'task'), /链接无效/)
  t.mock.method(globalThis, 'fetch', async () => { throw new TypeError('CORS blocked') })
  await assert.rejects(downloadVideo('https://cdn.test/video.mp4', 'task'), /CORS/)
  globalThis.fetch.mock.mockImplementation(async () => new Response('<html>expired</html>', { headers: { 'Content-Type': 'text/html' } }))
  await assert.rejects(downloadVideo('https://cdn.test/video.mp4', 'task'), /有效的视频/)
})
