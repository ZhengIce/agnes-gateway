import { MAX_IMAGES, validateImageUploads } from './image-uploads.js'

export const DEFAULT_MODELS = {
  text: ['agnes-2.5-flash', 'agnes-3.0-flash', 'agnes-2.5-pro'],
  image: ['agnes-image-2.5-flash', 'agnes-image-2.1-flash', 'agnes-image-2.0-flash'],
  video: ['agnes-video-2.5-flash', 'agnes-video-2.5'],
}
export const IMAGE_RATIOS = ['1:1', '3:4', '4:3', '16:9', '9:16', '2:3', '3:2', '21:9']
export const VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9']

export function isMediaUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
  } catch { return false }
}

export function chatMessageContent(text, images = []) {
  if (!Array.isArray(images) || images.length > MAX_IMAGES) throw new Error('最多添加 5 张图片')
  validateImageUploads(images.filter(url => !isMediaUrl(url)))
  const inputs = images
  if (!inputs.length) return text
  return [
    ...(text ? [{ type: 'text', text }] : []),
    ...inputs.map(url => ({ type: 'image_url', image_url: { url } })),
  ]
}

function referenceLinks(value) {
  const links = String(value || '').split(/\r?\n/).map(link => link.trim()).filter(Boolean)
  if (links.some(link => !isMediaUrl(link))) throw new Error('参考素材必须是有效的 HTTP(S) 链接')
  return [...new Set(links)]
}

export function availableModels(catalog, kind, allowed = []) {
  const category = item => item.kind || (/image/i.test(item.id) ? 'image' : /video/i.test(item.id) ? 'video' : 'text')
  const entries = Array.isArray(catalog) ? catalog.filter(item => typeof item?.id === 'string') : []
  const ids = entries.length ? entries.filter(item => category(item) === kind).map(item => item.id) : DEFAULT_MODELS[kind] || []
  if (!allowed?.length) return [...new Set(ids)]
  // Unlisted permitted IDs may be aliases; known media names retain their category.
  const permitted = allowed.filter(id => typeof id === 'string' && category(entries.find(item => item.id === id) || { id }) === kind)
  return [...new Set([...ids.filter(id => allowed.includes(id)), ...permitted])]
}

export function generationPayload(kind, model, prompt, options = {}, uploads = [], frameUploads = {}) {
  if (!String(prompt || '').trim()) throw new Error('请输入内容')
  if (!String(model || '').trim()) throw new Error('请选择模型')
  const base = { model: model.trim(), prompt: prompt.trim() }
  if (kind === 'image') {
    const size = options.imageSize || '1K', ratio = options.imageRatio || '1:1'
    if (!['1K', '2K', '3K', '4K'].includes(size)) throw new Error('图片尺寸必须为 1K-4K')
    if (ratio !== 'auto' && !IMAGE_RATIOS.includes(ratio)) throw new Error('图片比例不受支持')
    const refs = [...referenceLinks(options.imageRefs), ...validateImageUploads(uploads)]
    return { ...base, size, ...(ratio === 'auto' ? {} : { ratio }), extra_body: { response_format: 'url', ...(refs.length ? { image: refs } : {}) } }
  }
  if (kind !== 'video') throw new Error('生成类型不受支持')
  const seconds = Number(options.seconds ?? 5)
  const size = options.videoSize || '720P', ratio = options.videoRatio || '16:9'
  const mode = options.videoMode || 'text'
  const uploadedRefs = validateImageUploads(uploads)
  const uploadedFrames = [frameUploads.firstFrame, frameUploads.lastFrame].filter(Boolean)
  validateImageUploads([...uploadedRefs, ...uploadedFrames])
  if (mode === 'text' && (uploadedRefs.length || uploadedFrames.length)) throw new Error('文生视频不能携带图片，请选择首尾帧或参考图片模式')
  if (mode === 'keyframe' && uploadedRefs.length) throw new Error('请将上传图片放入首帧或尾帧')
  if (mode === 'reference' && uploadedFrames.length) throw new Error('参考图片模式不能携带首尾帧图片')
  if (!Number.isInteger(seconds) || seconds < 4 || seconds > 12) throw new Error('视频时长必须为 4-12 秒')
  if (!['720P', '1080P', '1K', '2K'].includes(size)) throw new Error('视频分辨率不受支持')
  if (model === 'agnes-video-2.5-flash' && size !== '720P') throw new Error('Flash 视频仅支持 720P')
  if (!VIDEO_RATIOS.includes(ratio)) throw new Error('视频比例不受支持')
  const result = { ...base, mode, size, seconds: String(seconds), aspect_ratio: ratio }
  if (mode === 'keyframe') {
    const first = frameUploads.firstFrame ? [frameUploads.firstFrame] : referenceLinks(options.firstFrame)
    const last = frameUploads.lastFrame ? [frameUploads.lastFrame] : referenceLinks(options.lastFrame)
    if (!first.length && !last.length) throw new Error('请至少添加首帧或尾帧图片')
    if (first.length > 1 || last.length > 1) throw new Error('首帧和尾帧各只允许一个链接')
    if (first.length) result.first_frame = first[0]
    if (last.length) result.last_frame = last[0]
  } else if (mode === 'reference') {
    const refs = [...referenceLinks(options.videoRefs), ...uploadedRefs]
    if (!refs.length) throw new Error('请添加参考图片')
    if (model === 'agnes-video-2.5-flash' && refs.length > 5) throw new Error('Flash 视频最多支持 5 张参考图')
    result.images = refs
  } else if (mode !== 'text') throw new Error('视频模式不受支持')
  return result
}

function messageFrom(data, fallback) {
  const message = data?.error?.message || data?.detail || data?.message
  return typeof message === 'string' ? message : message ? JSON.stringify(message) : fallback
}

function abortCheck(signal) {
  if (signal?.aborted) throw new DOMException('操作已停止', 'AbortError')
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    abortCheck(signal)
    const timer = setTimeout(() => { cleanup(); resolve() }, milliseconds)
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(new DOMException('操作已停止', 'AbortError')) }
    const cleanup = () => signal?.removeEventListener('abort', onAbort)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function textContent(content) {
  if (typeof content === 'string') return content
  return Array.isArray(content) ? content.map(part => typeof part?.text === 'string' ? part.text : '').join('') : ''
}

function validateFinishReason(reason) {
  if (reason === 'length') throw new Error('回复达到长度上限，内容不完整')
  if (reason === 'content_filter') throw new Error('回复被内容审核中断')
}

export function createChatClient(fetcher = (...args) => fetch(...args), config = {}) {
  const sleep = config.wait || wait
  async function request(key, path, { body, signal } = {}) {
    abortCheck(signal)
    const response = await fetcher(path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${key}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body), signal,
    })
    if (!response.ok) {
      let data
      try { data = await response.json() } catch { /* Non-JSON upstream error. */ }
      const error = new Error(messageFrom(data, `请求失败（HTTP ${response.status}）`))
      error.status = response.status
      throw error
    }
    return response
  }
  async function json(key, path, options) {
    const response = await request(key, path, options)
    try { return await response.json() } catch { throw new Error('上游响应不是有效的 JSON') }
  }
  async function timedJson(key, path, signal, timeout) {
    abortCheck(signal)
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    const timer = setTimeout(onAbort, timeout)
    try { return await json(key, path, { signal: controller.signal }) }
    catch (error) {
      if (controller.signal.aborted && !signal?.aborted) throw new Error('请求超时，请稍后重试')
      throw error
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
    }
  }

  async function chat(key, payload, { signal, onDelta } = {}) {
    const response = await request(key, '/v1/chat/completions', {
      body: { ...payload, stream: true }, signal,
    })
    if (!response.headers.get('content-type')?.includes('text/event-stream')) {
      const data = await response.json()
      if (data?.error) throw new Error(messageFrom(data, '聊天请求失败'))
      const result = {
        content: textContent(data?.choices?.[0]?.message?.content),
        reasoning: textContent(data?.choices?.[0]?.message?.reasoning_content),
      }
      if (!result.content && !result.reasoning) throw new Error('模型未返回文本内容')
      onDelta?.(result)
      validateFinishReason(data?.choices?.[0]?.finish_reason)
      return result
    }
    if (!response.body) throw new Error('聊天响应流不可用')
    const reader = response.body.getReader(), decoder = new TextDecoder()
    let buffer = '', lines = [], completed = false, ended = false
    const result = { content: '', reasoning: '' }
    function dispatch() {
      if (!lines.length) return
      const data = lines.join('\n')
      lines = []
      if (data === '[DONE]') { completed = true; ended = true; return }
      let event
      try { event = JSON.parse(data) } catch { throw new Error('聊天响应流格式错误，无法解析') }
      if (event?.error) throw new Error(messageFrom(event, '聊天请求失败'))
      const choice = event?.choices?.[0]
      if (!choice) return
      const delta = choice.delta || choice.message || {}
      result.content += textContent(delta.content)
      result.reasoning += textContent(delta.reasoning_content || delta.reasoning)
      onDelta?.({ ...result })
      if (choice.finish_reason) {
        validateFinishReason(choice.finish_reason)
        completed = true
      }
    }
    function feed(final = false) {
      if (ended) return
      let index
      while (!ended && (index = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, index).replace(/\r$/, '')
        buffer = buffer.slice(index + 1)
        if (!line) dispatch()
        else if (line.startsWith('data:')) lines.push(line.slice(5).replace(/^ /, ''))
      }
      if (final) {
        if (buffer.startsWith('data:')) lines.push(buffer.slice(5).trim())
        buffer = ''
        dispatch()
      }
    }
    const cancel = () => { reader.cancel().catch(() => {}) }
    signal?.addEventListener('abort', cancel, { once: true })
    try {
      while (true) {
        abortCheck(signal)
        const { done, value } = await reader.read()
        abortCheck(signal)
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        feed()
        if (ended) break
      }
      buffer += decoder.decode()
      feed(true)
      if (!completed) throw new Error('回复连接已中断，内容不完整')
      if (!result.content && !result.reasoning) throw new Error('模型未返回文本内容')
      return result
    } finally {
      signal?.removeEventListener('abort', cancel)
      await reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }

  async function pollVideo(key, id, model, { signal, onProgress } = {}) {
    const path = `/v1/videos/${encodeURIComponent(id)}?model_name=${encodeURIComponent(model)}`
    const deadline = Date.now() + (config.pollTimeout ?? 600000)
    let backoff = 10000
    for (let attempt = 0; attempt < (config.maxPolls ?? 60) && Date.now() < deadline; attempt++) {
      abortCheck(signal)
      try {
        const data = await timedJson(key, path, signal, Math.min(config.requestTimeout ?? 30000, Math.max(1, deadline - Date.now())))
        abortCheck(signal)
        onProgress?.(data)
        if (data?.status === 'failed') {
          const error = new Error(messageFrom(data, '视频生成失败'))
          error.terminal = true
          throw error
        }
        if (data?.status === 'completed') {
          if (!isMediaUrl(data.url)) {
            const error = new Error('视频已完成，但未返回有效的 HTTP(S) 链接')
            error.terminal = true
            throw error
          }
          return data
        }
        backoff = 10000
      } catch (error) {
        if (signal?.aborted || error.terminal) throw error
        if (error.status && error.status !== 429 && error.status < 500) throw error
        backoff = Math.min(backoff * 2, 30000)
      }
      if (attempt + 1 < (config.maxPolls ?? 60) && Date.now() + backoff < deadline) await sleep(backoff, signal)
      else break
    }
    throw new Error('视频查询已超时，已暂停；可以稍后继续查询此任务')
  }

  return {
    chat,
    models: async (key, { signal } = {}) => (await timedJson(key, '/v1/models', signal, config.modelTimeout ?? 15000))?.data || [],
    image: (key, payload, options) => json(key, '/v1/images/generations', { ...options, body: payload }),
    createVideo: (key, payload, options) => json(key, '/v1/videos', { ...options, body: payload }),
    pollVideo,
  }
}
