<template>
  <div class="popup-header">
    <a-row align="middle" justify="space-between" :wrap="false" :gutter="12">
      <a-col flex="none">
        <a-typography-title :level="5" class="popup-header__title">
          Clipsey
        </a-typography-title>
      </a-col>
      <a-col flex="auto" style="min-width: 0;">
        <a-typography-text
          v-if="displayUrl"
          type="secondary"
          :ellipsis="{ tooltip: tooltipUrl }"
          class="popup-header__url"
        >
          {{ displayUrl }}
        </a-typography-text>
      </a-col>
      <a-col flex="none">
        <a-space :size="4">
          <a-tooltip placement="bottom" trigger="hover">
            <template #title>{{ t('popupRefresh') }}</template>
            <a-button
              size="small"
              type="text"
              @click="$emit('refresh')"
              :loading="loading"
              :aria-label="t('popupRefresh')"
            >
              <template #icon>
                <ReloadOutlined />
              </template>
            </a-button>
          </a-tooltip>
          <a-tooltip placement="bottom" trigger="hover">
            <template #title>{{ t('popupSettings') }}</template>
            <a-button
              size="small"
              type="text"
              @click="$emit('open-settings')"
              :aria-label="t('popupSettings')"
            >
              <template #icon>
                <SettingOutlined />
              </template>
            </a-button>
          </a-tooltip>
        </a-space>
      </a-col>
    </a-row>
  </div>
</template>

<script setup lang="ts">
import { SettingOutlined, ReloadOutlined } from '@ant-design/icons-vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

defineProps<{
  displayUrl: string;
  tooltipUrl: string;
  loading: boolean;
}>();

defineEmits<{
  (e: 'refresh'): void;
  (e: 'open-settings'): void;
}>();
</script>

<style scoped>
.popup-header {
  margin-bottom: 0;
}

.popup-header__title {
  margin-bottom: 0;
}

.popup-header__url {
  font-size: 12px;
  color: #888;
}
</style>
