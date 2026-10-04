<script setup>
import { MessageSquare, Image, Film, Plus, Trash2 } from '@lucide/vue'
import { Button } from '@/components/ui/button'

defineProps({ sessions: { type: Array, required: true }, activeId: String })
defineEmits(['create', 'select', 'delete'])
const icons = { text: MessageSquare, image: Image, video: Film }
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="flex h-14 shrink-0 items-center justify-between gap-2 px-3">
      <h2 class="text-xs font-medium text-muted-foreground">会话</h2>
      <Button variant="ghost" size="icon" class="size-8" aria-label="新建会话" title="新建会话" @click="$emit('create')"><Plus class="size-4" /></Button>
    </div>
    <nav class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-3" aria-label="会话列表">
      <div v-for="session in sessions" :key="session.id" class="group flex min-w-0 items-center rounded-md"
        :class="session.id === activeId ? 'bg-muted' : 'hover:bg-muted/60'">
        <button type="button" class="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-3 py-3 text-left text-xs focus-visible:outline-2 focus-visible:outline-ring"
          :aria-current="session.id === activeId ? 'true' : undefined" :title="session.title" @click="$emit('select', session.id)">
          <component :is="icons[session.kind] || MessageSquare" class="size-3.5 shrink-0 text-muted-foreground" />
          <span class="truncate">{{ session.title }}</span>
        </button>
        <Button variant="ghost" size="icon" class="mr-1 size-7 shrink-0 text-muted-foreground hover:text-destructive"
          :aria-label="`删除会话：${session.title}`" title="删除会话" @click="$emit('delete', session)"><Trash2 class="size-3.5" /></Button>
      </div>
    </nav>
  </div>
</template>
