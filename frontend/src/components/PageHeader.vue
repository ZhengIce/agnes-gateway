<script setup>
defineProps({ title: String, description: String, eyebrow: String })
</script>

<template>
  <div class="page-heading">
    <div>
      <p v-if="eyebrow" class="section-eyebrow mb-2">{{ eyebrow }}</p>
      <h1 class="page-title">{{ title }}</h1>
      <p v-if="description" class="page-description">{{ description }}</p>
    </div>
    <div v-if="$slots.default" class="flex flex-wrap items-center gap-2">
      <slot />
    </div>
  </div>
</template>
