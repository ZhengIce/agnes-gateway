import { isMediaUrl } from './chat-client.js'

// Download only on an explicit click. Library/history storage continues to keep URLs only.
export async function downloadVideo(url, id) {
  if (!isMediaUrl(url)) throw new Error('视频链接无效')
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' })
  if (!response.ok) throw new Error(`下载失败（HTTP ${response.status}）`)
  const blob = await response.blob()
  if (!blob.size || /^(text\/|application\/(?:json|xml))/i.test(blob.type)) throw new Error('未返回有效的视频文件')
  const objectUrl = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const extension = blob.type.includes('webm') ? 'webm' : blob.type.includes('quicktime') ? 'mov' : 'mp4'
  link.href = objectUrl
  link.download = `agnes-video-${String(id || 'generated').replace(/[^a-z0-9_-]/gi, '_')}.${extension}`
  document.body.appendChild(link)
  try { link.click() }
  finally {
    link.remove()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000)
  }
}
