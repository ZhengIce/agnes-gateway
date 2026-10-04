<script setup>
import { LoaderCircle } from '@lucide/vue'
import { Button } from '@/components/ui/button'
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
defineProps({ open: Boolean, title: String, description: String, busy: Boolean, destructive: { type: Boolean, default: true }, action: { type: String, default: '确认删除' } })
defineEmits(['update:open', 'confirm'])
</script>

<template>
  <AlertDialog :open="open" @update:open="!busy && $emit('update:open', $event)">
    <AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>{{ title }}</AlertDialogTitle><AlertDialogDescription class="leading-6">{{ description }}</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter>
        <Button variant="outline" :disabled="busy" @click="$emit('update:open', false)">取消</Button>
        <Button :variant="destructive ? 'destructive' : 'default'" :disabled="busy" @click="$emit('confirm')"><LoaderCircle v-if="busy" class="size-4 animate-spin" />{{ action }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>

