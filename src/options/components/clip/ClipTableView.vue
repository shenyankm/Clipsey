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
          <template v-else>无网址</template>
        </template>
        <template v-else-if="column.key === 'createdAt'">
          {{ formatDate(record.createdAt) }}
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-space :size="8" align="center">
            <a-button size="small" @click="openClipDetail(record)">查看</a-button>
            <a-button
              size="small"
              type="primary"
              :disabled="!record.sourceUrl"
              @click="openClipAction(record.id)"
            >
              打开
            </a-button>
            <a-popconfirm title="确认删除该摘抄？此操作不可恢复" @confirm="deleteClip(record.id)">
              <a-button size="small" danger>删除</a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>
  </a-card>
</template>

<script setup lang="ts">
import type { Clip } from '@/types/clip';

defineProps<{
  columns: any[];
  dataSource: Clip[];
  rowKey: (record: Clip) => string;
  getDomainFromUrl: (url?: string) => string;
  formatDate: (iso?: string) => string;
  openClipDetail: (clip: Clip) => void;
  openClipAction: (id: string) => void;
  deleteClip: (id: string) => void;
  onTableChange: (...args: any[]) => void;
}>();
</script>

<style scoped>
.clip-table-card {
  margin-top: 8px;
  border-radius: 12px;
}
</style>
