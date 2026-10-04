import { toast } from 'vue-sonner'

export function useClipboard() {
  async function copy(text, message = '已复制到剪贴板') {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const input = document.createElement('textarea')
        input.value = text
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
        document.body.appendChild(input)
        try {
          input.select()
          if (!document.execCommand('copy')) throw new Error('copy failed')
        } finally {
          input.remove()
        }
      }
      toast.success(message)
    } catch {
      toast.error('复制失败，请选中文本手动复制')
    }
  }
  return { copy }
}
