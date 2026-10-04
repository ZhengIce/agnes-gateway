export const MAX_FILE_BYTES = 10 * 1024 * 1024
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024
export const MAX_IMAGES = 5
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
export const IMAGE_ACCEPT = IMAGE_TYPES.join(',')

export function redactImageInputs(value, inputs = []) {
  let message = String(value || '')
  for (const input of inputs) {
    if (typeof input !== 'string' || !input.startsWith('data:image/')) continue
    for (const bytes of [input, input.slice(input.indexOf(',') + 1)]) {
      if (bytes) message = message.split(bytes).join('[图片内容已省略]')
    }
  }
  return message.replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]*/gi, '[图片内容已省略]')
}

export function validateImageUploads(urls) {
  if (!Array.isArray(urls) || urls.length > MAX_IMAGES) throw new Error('最多上传 5 张图片')
  let total = 0
  for (const url of urls) {
    const match = typeof url === 'string' && /^data:image\/(?:jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(url)
    if (!match || match[1].length % 4) throw new Error('上传图片格式无效')
    const size = match[1].length / 4 * 3 - (match[1].endsWith('==') ? 2 : match[1].endsWith('=') ? 1 : 0)
    if (size > MAX_FILE_BYTES) throw new Error('单张图片不能超过 10 MB')
    total += size
  }
  if (total > MAX_TOTAL_BYTES) throw new Error('上传图片总大小不能超过 20 MB')
  return urls
}

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`无法读取「${file.name}」，请重新选择`))
    reader.onabort = () => reject(new Error('图片读取已取消'))
    reader.onload = () => {
      const image = new Image()
      image.onload = () => resolve(reader.result)
      image.onerror = () => reject(new Error(`「${file.name}」不是可读取的图片`))
      image.src = reader.result
    }
    reader.readAsDataURL(file)
  })
}
