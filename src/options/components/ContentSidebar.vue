<template>
  <div class="content-sidebar">
    <n-card size="small" class="sidebar-card" :bordered="false">
      <template #header>
        <n-text strong>侧边栏</n-text>
      </template>
      <n-radio-group v-model:value="localValue" class="sidebar-options" name="content-sidebar">
        <n-space vertical size="small">
          <n-radio v-for="option in options" :key="option.value" :value="option.value">
            {{ option.label }}
          </n-radio>
        </n-space>
      </n-radio-group>
    </n-card>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { NCard, NRadioGroup, NRadio, NSpace, NText } from 'naive-ui';

const props = defineProps<{
  modelValue: 'all' | 'custom';
}>();

const emit = defineEmits<{
  (event: 'update:modelValue', value: 'all' | 'custom'): void;
}>();

const options = [
  { label: '全部', value: 'all' as const },
  { label: '自定义分组', value: 'custom' as const },
] as const;

const localValue = computed({
  get() {
    return props.modelValue;
  },
  set(value) {
    emit('update:modelValue', value);
  },
});
</script>

<style scoped>
.content-sidebar {
  position: sticky;
  top: 16px;
  width: 100%;
}

.sidebar-card :deep(.n-card__content) {
  padding-top: 0;
}

.sidebar-options {
  width: 100%;
}

@media (max-width: 960px) {
  .content-sidebar {
    position: static;
  }
}
</style>
