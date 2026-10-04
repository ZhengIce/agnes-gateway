<script setup>
import { Badge } from '@/components/ui/badge'
defineProps({ tone: { type: String, default: 'neutral' }, dot: { type: Boolean, default: true } })
const tones = {
  success: 'border-success/15 bg-success-soft text-success',
  warning: 'border-warning/15 bg-warning-soft text-warning',
  danger: 'border-destructive/15 bg-destructive/5 text-destructive',
  neutral: 'border-border bg-muted/50 text-muted-foreground',
}
</script>

<template>
  <Badge variant="outline" class="gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-normal" :class="tones[tone] || tones.neutral">
    <span v-if="dot" class="status-dot" /><slot />
  </Badge>
</template>
