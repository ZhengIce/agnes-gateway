<script setup>
import { computed } from 'vue'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const props = defineProps({
  modelValue: String, options: { type: Array, default: () => [] },
  label: String, icon: [Object, Function], disabled: Boolean, class: String,
})
defineEmits(['update:modelValue'])
const selectedLabel = computed(() => props.options.find(option => option.value === props.modelValue)?.label || props.label)
</script>

<template>
  <Select :model-value="modelValue" :disabled="disabled" @update:model-value="$emit('update:modelValue', $event)">
    <SelectTrigger :aria-label="label" :title="label" :class="cn('h-8 max-w-full min-w-0 gap-2 rounded-md border-0 bg-transparent px-2 py-1 text-xs font-normal shadow-none hover:bg-accent/60 focus-visible:ring-1 [&>span]:min-w-0 [&>span]:truncate [&>svg:last-child]:size-3', $props.class)">
      <component :is="icon" v-if="icon" class="size-3.5 shrink-0" />
      <SelectValue :placeholder="label">{{ selectedLabel }}</SelectValue>
    </SelectTrigger>
    <SelectContent>
      <SelectItem v-for="option in options" :key="option.value" :value="option.value" class="text-xs">{{ option.label }}</SelectItem>
    </SelectContent>
  </Select>
</template>
