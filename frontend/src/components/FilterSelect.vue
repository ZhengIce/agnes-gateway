<script setup>
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
defineProps({ modelValue: String, options: { type: Array, default: () => [] }, label: String, placeholder: String, disabled: Boolean, class: String })
defineEmits(['update:modelValue'])
</script>

<template>
  <Select :model-value="modelValue" :disabled="disabled" @update:model-value="$emit('update:modelValue', $event)">
    <SelectTrigger :aria-label="label" :class="cn('w-full bg-card', $props.class)"><SelectValue :placeholder="placeholder || label" /></SelectTrigger>
    <SelectContent>
      <SelectItem v-for="item in options" :key="item.value" :value="item.value">{{ item.label }}</SelectItem>
    </SelectContent>
  </Select>
</template>
