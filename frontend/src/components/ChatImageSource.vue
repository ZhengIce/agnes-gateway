<script setup>
import { computed, ref, watch } from 'vue'
import { Images, Upload } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

const props = defineProps({ open: { type: Boolean, default: undefined }, disabled: Boolean })
const emit = defineEmits(['update:open', 'select'])
const localOpen = ref(false)
const open = computed({
  get: () => props.open ?? localOpen.value,
  set: value => { localOpen.value = value; emit('update:open', value) },
})
let choosing = false
function choose(source) {
  if (props.disabled || !['upload', 'library'].includes(source)) return
  choosing = true
  open.value = false
  emit('select', source)
}
function closeFocus(event) {
  if (choosing) { event.preventDefault(); choosing = false }
}
watch(() => props.disabled, disabled => { if (disabled) open.value = false })
</script>

<template>
  <Popover v-model:open="open">
    <PopoverTrigger as-child><slot /></PopoverTrigger>
    <PopoverContent side="top" align="start" :side-offset="10" :collision-padding="12"
      aria-label="选择图片来源" class="w-44 rounded-md p-1 shadow-lg" @close-auto-focus="closeFocus">
      <Button type="button" variant="ghost" class="h-9 w-full justify-start px-3 text-xs font-normal" :disabled="disabled" @click="choose('upload')"><Upload class="size-3.5" />上传文件</Button>
      <Button type="button" variant="ghost" class="h-9 w-full justify-start px-3 text-xs font-normal" :disabled="disabled" @click="choose('library')"><Images class="size-3.5" />素材库</Button>
    </PopoverContent>
  </Popover>
</template>
