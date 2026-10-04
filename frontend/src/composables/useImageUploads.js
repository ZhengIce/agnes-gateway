import { onScopeDispose, ref } from 'vue'
import { IMAGE_TYPES, MAX_FILE_BYTES, MAX_TOTAL_BYTES, MAX_IMAGES, readImageFile, validateImageUploads } from '../lib/image-uploads.js'

export { MAX_FILE_BYTES } from '../lib/image-uploads.js'

export function useImageUploads(reader = readImageFile) {
  const items = ref([]), loading = ref(false), error = ref('')
  let version = 0
  function reset() { version++; items.value = []; loading.value = false; error.value = '' }
  function remove(id) {
    if (loading.value) return
    items.value = items.value.filter(item => item.id !== id)
    error.value = ''
  }
  async function add(input, { replace = false } = {}) {
    if (loading.value) return false
    const files = Array.from(input || [])
    if (!files.length) return false
    const previous = replace ? [] : items.value
    const current = ++version
    error.value = ''
    try {
      if (previous.length + files.length > MAX_IMAGES) throw new Error('最多上传 5 张图片')
      for (const file of files) {
        if (!IMAGE_TYPES.includes(file.type)) throw new Error('图片格式仅支持 JPG、PNG、WebP 和 GIF')
        if (!file.size) throw new Error('不能上传空图片')
        if (file.size > MAX_FILE_BYTES) throw new Error('单张图片不能超过 10 MB')
      }
      const total = [...previous, ...files].reduce((sum, item) => sum + item.size, 0)
      if (total > MAX_TOTAL_BYTES) throw new Error('上传图片总大小不能超过 20 MB')
      loading.value = true
      const results = await Promise.all(files.map(async (file, index) => ({
        id: `upload-${current}-${index}`, label: file.name, size: file.size, local: true, url: await reader(file),
      })))
      if (current !== version) return false
      validateImageUploads(results.map(item => item.url))
      items.value = [...previous, ...results]
      return true
    } catch (failure) {
      if (current === version) error.value = failure.message || '图片读取失败，请重试'
      return false
    } finally {
      if (current === version) loading.value = false
    }
  }
  onScopeDispose(reset)
  return { items, loading, error, add, remove, reset }
}
