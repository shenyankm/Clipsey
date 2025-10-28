<template>
  <n-space vertical>
    <n-input v-model:value="searchQuery" placeholder="搜索摘抄内容..." clearable />
    <n-card v-if="filteredClips.length === 0" size="small">
      <n-empty description="暂无摘抄内容">
        <template #extra>
          <n-button size="small" @click="refreshClips">
            刷新
          </n-button>
        </template>
      </n-empty>
    </n-card>
    <n-list v-else bordered>
      <n-list-item v-for="clip in filteredClips" :key="clip.id">
          <n-thing :title="clip.title || '无标题'">
            <template #description>
              <n-tag type="info" size="small">{{ clip.sourceUrl }}</n-tag>
            </template>
            <div class="clip-content">{{ clip.textContent }}</div>
            <template #action>
              <n-button quaternary type="error" size="small" @click="deleteClip(clip.id)">删除</n-button>
            </template>
          </n-thing>
        </n-list-item>
    </n-list>
  </n-space>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import {
  NSpace,
  NInput,
  NCard,
  NEmpty,
  NButton,
  NList,
  NListItem,
  NThing,
  NTag,
  useMessage
} from 'naive-ui';
import { getClips, deleteClipById } from '@/background/api'; // 假设存在获取和删除clip的API
import type { Clip } from '@/types/clip'; // 假设存在Clip类型定义

const message = useMessage();
const searchQuery = ref('');
const clips = ref<Clip[]>([]);

const filteredClips = computed(() => {
  if (!searchQuery.value) {
    return clips.value;
  }
  const query = searchQuery.value.toLowerCase();
  return clips.value.filter(
    clip =>
        clip.title?.toLowerCase().includes(query) ||
        clip.textContent.toLowerCase().includes(query) ||
        clip.sourceUrl.toLowerCase().includes(query)
  );
});

async function fetchClips() {
  try {
    const fetchedClips = await getClips();
    clips.value = fetchedClips;
  } catch (error) {
    message.error(`加载摘抄内容失败: ${(error as Error).message}`);
  }
}

async function deleteClip(id: string) {
  try {
    await deleteClipById(id);
    message.success('摘抄已删除');
    await fetchClips(); // 重新加载列表
  } catch (error) {
    message.error(`删除摘抄失败: ${(error as Error).message}`);
  }
}

function refreshClips() {
  fetchClips();
}

onMounted(() => {
  fetchClips();
});
</script>

<style scoped>
.clip-content {
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>