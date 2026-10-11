<template>
  <a-space>
    <a-button size="small" :disabled="busy" @click="exportBackup">{{ t('backupExport') }}</a-button>
    <a-button size="small" :disabled="busy" @click="fileInput?.click()">{{ t('backupRestore') }}</a-button>
    <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="readBackup" />
  </a-space>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { useI18n } from 'vue-i18n';
import { sendRuntimeMessage } from '@/utils/chrome';
import { validateClipBackup } from '@/utils/clip/backup';
import type { exportAllData } from '@/background/api';

const { t } = useI18n();
const emit = defineEmits<{ restored: [] }>();
const busy = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

async function exportBackup() {
  busy.value = true;
  try {
    const response = await sendRuntimeMessage<Awaited<ReturnType<typeof exportAllData>>>({ type: 'EXPORT_DATA' });
    if (!response.success || !response.data) throw new Error(response.error);
    const blob = new Blob([JSON.stringify(response.data)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = `clipsey-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      message.success(t('backupExported'));
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  } catch {
    message.error(t('backupExportFailed'));
  } finally {
    busy.value = false;
  }
}

async function readBackup(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  busy.value = true;
  try {
    const data = JSON.parse(await file.text());
    if (!data || typeof data !== 'object') throw new Error('Invalid backup');
    validateClipBackup(data.clips);
    if (data.errorLogs !== undefined && !Array.isArray(data.errorLogs)) throw new Error('Invalid error logs');
    Modal.confirm({
      title: t('backupRestore'),
      content: t('backupRestoreConfirm', { count: data.clips.length }),
      okText: t('backupRestore'),
      cancelText: t('backupCancel'),
      onCancel: () => { busy.value = false; },
      onOk: async () => {
        try {
          const response = await sendRuntimeMessage({ type: 'IMPORT_DATA', payload: data });
          if (!response.success) throw new Error(response.error);
          emit('restored');
          message.success(t('backupRestored'));
        } catch {
          message.error(t('backupRestoreFailed'));
        } finally {
          busy.value = false;
        }
      }
    });
  } catch {
    message.error(t('backupInvalid'));
    busy.value = false;
  }
}
</script>
