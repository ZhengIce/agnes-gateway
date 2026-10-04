import { isMediaUrl } from './chat-client.js'

const links = value => String(value || '').split(/\r?\n/).map(url => url.trim()).filter(isMediaUrl)

export function referenceItems(kind, options) {
  if (kind === 'text') return []
  if (kind === 'video' && options.videoMode === 'keyframe') {
    return [['firstFrame', '首帧'], ['lastFrame', '尾帧']].flatMap(([field, label]) =>
      links(options[field]).map(url => ({ id: `${field}:${url}`, field, url, label })))
  }
  if (kind === 'video' && options.videoMode !== 'reference') return []
  const field = kind === 'image' ? 'imageRefs' : 'videoRefs'
  return links(options[field]).map((url, index) => ({ id: `${field}:${url}`, field, url, label: `参考图 ${index + 1}` }))
}

export function addReferences(kind, model, options, values, target = 'firstFrame') {
  if (!['image', 'video'].includes(kind)) throw new Error('文本聊天暂不使用参考图片')
  const urls = [...new Set(values.map(value => String(value).trim()))]
  if (!urls.length || urls.some(url => !isMediaUrl(url))) throw new Error('请提供有效的 HTTP(S) 图片链接')
  if (kind === 'video' && options.videoMode === 'keyframe') {
    if (!['firstFrame', 'lastFrame'].includes(target)) throw new Error('请选择首帧或尾帧')
    if (urls.length !== 1) throw new Error('首帧和尾帧每次只能选择一张图片')
    return { ...options, [target]: urls[0] }
  }
  const field = kind === 'image' ? 'imageRefs' : 'videoRefs'
  const combined = [...new Set([...links(options[field]), ...urls])]
  if (kind === 'video' && model === 'agnes-video-2.5-flash' && combined.length > 5) {
    throw new Error('Flash 视频最多支持 5 张参考图，请先移除多余图片')
  }
  return { ...options, [field]: combined.join('\n'), ...(kind === 'video' ? { videoMode: 'reference' } : {}) }
}

export function removeReference(options, item) {
  if (!['imageRefs', 'videoRefs', 'firstFrame', 'lastFrame'].includes(item.field)) return options
  return { ...options, [item.field]: links(options[item.field]).filter(url => url !== item.url).join('\n') }
}
