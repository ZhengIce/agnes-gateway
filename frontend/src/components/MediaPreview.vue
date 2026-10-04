<script setup>
import { ref, watch } from 'vue'
import { ImageOff, LoaderCircle, Play } from '@lucide/vue'

const props = defineProps({ asset: { type: Object, required: true }, expanded: Boolean })
const emit = defineEmits(['preview'])
const failed = ref(false)
const pending = ref(true)
watch(() => props.asset.url, () => { failed.value = false; pending.value = true })
function seekPreview(event) {
  if (props.expanded) return
  const video = event.target
  // Seek just past the opening frame to decode a real thumbnail without playback.
  video.currentTime = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(0.1, video.duration / 2) : 0.1
}
</script>

<template>
  <component :is="expanded ? 'div' : 'button'" :type="expanded ? undefined : 'button'"
    class="relative flex w-full items-center justify-center overflow-hidden bg-muted/40 outline-ring focus-visible:outline-2"
    :class="expanded ? 'h-[50dvh] min-h-[200px]' : [asset.kind === 'video' ? 'aspect-video' : 'aspect-[4/3]', 'border-b transition-colors hover:bg-muted/70']"
    :aria-label="`预览${asset.kind === 'image' ? '图片' : '视频'} #${asset.id}`"
    @click="!expanded && emit('preview')">
    <video v-if="asset.kind === 'video' && !failed" :src="asset.url"
      class="h-full w-full object-contain" :class="expanded ? '' : 'pointer-events-none'"
      :controls="expanded" :muted="!expanded" playsinline preload="metadata" controlslist="nodownload"
      @loadedmetadata="seekPreview" @loadeddata="pending = false" @seeked="pending = false" @error="failed = true" />
    <img v-else-if="!failed" :src="asset.url" :alt="asset.prompt || `图片 #${asset.id}`"
      class="h-full w-full object-contain" :loading="expanded ? 'eager' : 'lazy'"
      decoding="async" referrerpolicy="no-referrer" @load="pending = false" @error="failed = true" />
    <div v-else class="flex flex-col items-center gap-2 text-muted-foreground">
      <ImageOff class="size-7" :stroke-width="1.4" /><span class="text-xs">预览不可用</span>
    </div>
    <span v-if="asset.kind === 'video' && !expanded && !pending && !failed" class="pointer-events-none absolute flex size-10 items-center justify-center rounded-full bg-black/55 text-white">
      <Play class="size-4" />
    </span>
    <LoaderCircle v-if="pending && !failed"
      class="pointer-events-none absolute size-5 text-muted-foreground motion-safe:animate-spin" />
  </component>
</template>
