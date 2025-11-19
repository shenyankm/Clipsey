<template>
  <a-card class="clip-table-card" size="small" bordered>
    <a-table
      :columns="columns"
      :dataSource="dataSource"
      :pagination="false"
      :bordered="false"
      :rowKey="rowKey"
      size="small"
      @change="onTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'sourceUrl'">
          <template v-if="record.sourceUrl">
            <a-tag color="blue">{{ getDomainFromUrl(record.sourceUrl) }}</a-tag>
          </template>
          <template v-else>{{ t('clipNoUrl') }}</template>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDate(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="8" align="center">
            <a-button size="small" @click="openClipDetail(record)">{{ t('clipViewButton') }}</a-button>
            <a-button
              size="small"
              type="primary"
              :disabled="!record.sourceUrl"
              :loading="openingId === record.id"
              @click="openClipAction(record)"
            >
              {{ t('clipOpenButton') }}
            </a-button>
            <a-popconfirm :title="t('clipDeleteConfirm')" @confirm="deleteClip(record.id)">
              <a-button size="small" danger>{{ t('clipDeleteButton') }}</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>
  </a-card>
</template>

<script setup lang="ts">
import { useI18n } from 'vue-i18n';
import type { Clip } from '@/types/clip';

const { t } = useI18n();

defineProps<{
  columns: any[];
  dataSource: Clip[];
  rowKey: (record: Clip) => string;
  getDomainFromUrl: (url?: string) => string;
  formatDate: (iso?: string) => string;
  openClipDetail: (clip: Clip) => void;
  openClipAction: (clip: Clip) => void;
  deleteClip: (id: string) => void;
  onTableChange: (...args: any[]) => void;
  openingId?: string | null;
}>();
</script>

<style scoped>
.clip-table-card {
  margin-top: 8px;
  border-radius: 12px;
}
</style>
