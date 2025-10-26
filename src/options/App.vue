<template>
  <n-config-provider>
    <n-message-provider>
      <div class="options">
        <h1>Page Clipper Settings</h1>
        <n-form :model="form" label-width="140">
          <n-form-item label="Enable cloud sync">
            <n-switch v-model:value="form.enableSync" />
          </n-form-item>
          <n-form-item label="Sync endpoint">
            <n-input
              v-model:value="form.endpoint"
              placeholder="https://api.example.com/clips"
              :disabled="!form.enableSync"
            />
          </n-form-item>
          <n-form-item label="Shortcut">
            <n-input v-model:value="form.hotkey" placeholder="Ctrl+Shift+Y" />
          </n-form-item>
        </n-form>
        <n-space justify="end">
          <n-button type="primary" :loading="saving" @click="handleSave">Save</n-button>
        </n-space>
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import {
  NButton,
  NConfigProvider,
  NForm,
  NFormItem,
  NInput,
  NMessageProvider,
  NSpace,
  NSwitch,
  useMessage
} from 'naive-ui';

interface OptionsForm {
  enableSync: boolean;
  endpoint: string;
  hotkey: string;
}

const STORAGE_KEY = 'page-clipper-options';

const form = reactive<OptionsForm>({
  enableSync: false,
  endpoint: '',
  hotkey: ''
});

const saving = ref(false);
const message = useMessage();

onMounted(async () => {
  const stored = await getSettings();
  Object.assign(form, stored);
});

async function handleSave() {
  saving.value = true;
  try {
    await chrome.storage.sync.set({ [STORAGE_KEY]: { ...form } });
    message.success('Settings saved');
  } catch (error) {
    message.error((error as Error).message);
  } finally {
    saving.value = false;
  }
}

async function getSettings(): Promise<OptionsForm> {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.sync.get({ [STORAGE_KEY]: form }, result => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
          return;
        }
        resolve(result[STORAGE_KEY] as OptionsForm);
      });
    } catch (error) {
      reject(error);
    }
  });
}
</script>

<style scoped>
.options {
  min-width: 480px;
  padding: 24px;
  background: #fff;
}

h1 {
  margin: 0 0 24px;
  font-size: 20px;
}
</style>
