import assert from 'node:assert/strict'
import { test } from 'node:test'
import { addReferences, referenceItems, removeReference } from '../src/lib/chat-references.js'
import { defaultOptions } from '../src/composables/useChatWorkspace.js'
import { generationPayload } from '../src/lib/chat-client.js'

test('image library references append link-only inputs and deduplicate', () => {
  const original = { ...defaultOptions(), imageRefs: 'https://cdn.test/a.png' }
  const next = addReferences('image', 'agnes-image-2.5-flash', original, [
    'https://cdn.test/a.png', 'https://cdn.test/b.png',
  ])
  assert.equal(original.imageRefs, 'https://cdn.test/a.png')
  assert.equal(next.imageRefs, 'https://cdn.test/a.png\nhttps://cdn.test/b.png')
  assert.deepEqual(generationPayload('image', 'agnes-image-2.5-flash', 'snow', next).extra_body.image, [
    'https://cdn.test/a.png', 'https://cdn.test/b.png',
  ])
})

test('adding a video reference activates the existing reference workflow', () => {
  const next = addReferences('video', 'agnes-video-2.5-flash', defaultOptions(), ['https://cdn.test/a.png'])
  assert.equal(next.videoMode, 'reference')
  assert.deepEqual(generationPayload('video', 'agnes-video-2.5-flash', 'snow', next).images, ['https://cdn.test/a.png'])
})

test('keyframe selection fills only the chosen frame and can replace it', () => {
  const original = { ...defaultOptions(), videoMode: 'keyframe', firstFrame: 'https://cdn.test/first.png' }
  const last = addReferences('video', 'agnes-video-2.5-flash', original, ['https://cdn.test/last.png'], 'lastFrame')
  assert.equal(last.firstFrame, original.firstFrame)
  assert.equal(last.lastFrame, 'https://cdn.test/last.png')
  const replaced = addReferences('video', 'agnes-video-2.5-flash', last, ['https://cdn.test/new.png'], 'firstFrame')
  assert.equal(replaced.firstFrame, 'https://cdn.test/new.png')
  assert.equal(replaced.lastFrame, last.lastFrame)
  assert.throws(() => addReferences('video', 'agnes-video-2.5-flash', original, [
    'https://cdn.test/a.png', 'https://cdn.test/b.png',
  ], 'firstFrame'), /一张|一个/)
})

test('unsafe inputs and unsupported text attachments are rejected without modifying options', () => {
  const original = defaultOptions()
  for (const url of ['data:image/png;base64,ABC', 'file:///local.png', 'javascript:alert(1)', 'https://user:secret@cdn.test/a.png']) {
    assert.throws(() => addReferences('image', 'image', original, [url]), /HTTP|链接/)
  }
  assert.throws(() => addReferences('text', 'text', original, ['https://cdn.test/a.png']), /文本|参考/)
  assert.equal(original.imageRefs, '')
})

test('Flash reference limit is checked atomically, without dropping earlier selections', () => {
  const links = Array.from({ length: 6 }, (_, i) => `https://cdn.test/${i}.png`)
  const original = { ...defaultOptions(), videoMode: 'reference', videoRefs: links.slice(0, 4).join('\n') }
  assert.throws(() => addReferences('video', 'agnes-video-2.5-flash', original, links.slice(4)), /5/)
  assert.equal(original.videoRefs, links.slice(0, 4).join('\n'))
})

test('reference thumbnail removal changes only the active mode field', () => {
  const options = { ...defaultOptions(), imageRefs: 'https://cdn.test/a.png\nhttps://cdn.test/b.png', videoRefs: 'https://cdn.test/video-ref.png' }
  const items = referenceItems('image', options)
  assert.deepEqual(items.map(item => item.url), ['https://cdn.test/a.png', 'https://cdn.test/b.png'])
  const next = removeReference(options, items[0])
  assert.equal(next.imageRefs, 'https://cdn.test/b.png')
  assert.equal(next.videoRefs, options.videoRefs)
})

test('frame thumbnails use distinct identities even when they share the same URL', () => {
  const options = { ...defaultOptions(), videoMode: 'keyframe', firstFrame: 'https://cdn.test/a.png', lastFrame: 'https://cdn.test/a.png' }
  const items = referenceItems('video', options)
  assert.equal(items.length, 2)
  assert.notEqual(items[0].id, items[1].id)
  const next = removeReference(options, items[0])
  assert.equal(next.firstFrame, '')
  assert.equal(next.lastFrame, options.lastFrame)
})
