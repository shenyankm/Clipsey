<template>
  <div class="clip-manager">
    <content-sidebar v-model="activeSidebar" class="clip-manager__sidebar" />
    <div class="clip-manager__main">
      <n-space vertical size="large">
        <div class="clip-manager__filters">
          <n-select
            v-model:value="searchType"
            :options="searchTypeOptions"
            size="small"
            class="clip-manager__filters-select"
          />
          <n-input
            v-model:value="searchQuery"
            placeholder="搜索摘抄..."
            clearable
            class="clip-manager__filters-input"
          />
          <n-button tertiary size="small" @click="refreshClips">
            刷新
          </n-button>
        </div>

        <template v-if="activeSidebar === 'custom'">
          <n-card size="small" class="clip-manager__empty-card">
            <n-empty description="暂未创建自定义分组">
              <template #extra>
                <n-button size="small" type="primary" disabled>敬请期待</n-button>
              </template>
            </n-empty>
          </n-card>
        </template>

        <template v-else>
          <n-card v-if="filteredClips.length === 0" size="small" class="clip-manager__empty-card">
            <n-empty description="暂无摘抄记录">
              <template #extra>
                <n-button size="small" @click="refreshClips">
                  刷新
                </n-button>
              </template>
            </n-empty>
          </n-card>

          <div v-else class="clip-grid">
            <n-card
              v-for="clip in paginatedClips"
              :key="clip.id"
              size="small"
              class="clip-card"
              bordered
            >
              <n-thing :title="clip.title || '无标题'">
                <template #description>
                  <n-tag v-if="clip.sourceUrl" type="info" size="small">
                    {{ clip.sourceUrl }}
                  </n-tag>
                </template>
                <div
                  v-if="clipHasRichContent(clip)"
                  class="clip-content"
                  v-html="resolveClipHtml(clip)"
                />
                <div v-else class="clip-content clip-content--empty">
                  暂无内容
                </div>
                <template #action>
                  <n-button quaternary type="error" size="small" @click="deleteClip(clip.id)">
                    删除
                  </n-button>
                </template>
              </n-thing>
            </n-card>
          </div>

          <n-space v-if="pageCount > 1" justify="end">
            <n-pagination
              v-model:page="currentPage"
              :page-count="pageCount"
              :page-size="pageSize"
              size="small"
            />
          </n-space>
        </template>
      </n-space>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import {
  NSpace,
  NInput,
  NCard,
  NEmpty,
  NButton,
  NThing,
  NTag,
  NSelect,
  NPagination,
  useMessage
} from 'naive-ui';
import ContentSidebar from './ContentSidebar.vue';
import { getClips, deleteClipById } from '@/background/api';
import type { Clip } from '@/types/clip';
import { getClipHtmlContent, hasClipRichContent } from '@/utils/rich-text';

type SearchType = 'all' | 'title' | 'url' | 'content';
type SidebarType = 'all' | 'custom';

const PAGE_SIZE = 20;

const message = useMessage();
const searchQuery = ref('');
const searchType = ref<SearchType>('all');
const activeSidebar = ref<SidebarType>('all');
const currentPage = ref(1);
const clips = ref<Clip[]>([]);

const searchTypeOptions = [
  { label: '全部', value: 'all' as const },
  { label: '标题', value: 'title' as const },
  { label: '网址', value: 'url' as const },
  { label: '内容', value: 'content' as const },
];

function resolveClipHtml(clip: Clip): string {
  return getClipHtmlContent(clip);
}

function clipHasRichContent(clip: Clip): boolean {
  return hasClipRichContent(clip);
}


const filteredClips = computed(() => {
  if (activeSidebar.value !== 'all') {
    return [];
  }

  const query = searchQuery.value.trim().toLowerCase();

  if (!query) {
    return clips.value;
  }

  return clips.value.filter(clip => {
    const title = (clip.title ?? '').toLowerCase();
    const content = clip.textContent.toLowerCase();
    const url = (clip.sourceUrl ?? '').toLowerCase();

    switch (searchType.value) {
      case 'title':
        return title.includes(query);
      case 'url':
        return url.includes(query);
      case 'content':
        return content.includes(query);
      default:
        return (
          title.includes(query) ||
          url.includes(query) ||
          content.includes(query)
        );
    }
  });
});

const paginatedClips = computed(() => {
  const start = (currentPage.value - 1) * PAGE_SIZE;
  return filteredClips.value.slice(start, start + PAGE_SIZE);
});

const pageCount = computed(() => {
  if (filteredClips.value.length === 0) {
    return 1;
  }
  return Math.ceil(filteredClips.value.length / PAGE_SIZE);
});

const pageSize = PAGE_SIZE;

watch([searchQuery, searchType, activeSidebar], () => {
  currentPage.value = 1;
});

watch(filteredClips, clipsList => {
  const maxPage = Math.max(1, Math.ceil(clipsList.length / PAGE_SIZE));
  if (currentPage.value > maxPage) {
    currentPage.value = maxPage;
  }
});

async function fetchClips() {
  try {
    const fetchedClips = await getClips();
    clips.value = fetchedClips;
  } catch (error) {
    message.error(`加载摘抄列表失败: ${(error as Error).message}`);
  }
}

async function deleteClip(id: string) {
  try {
    await deleteClipById(id);
    message.success('摘抄已删除');
    await fetchClips();
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
.clip-manager {
  display: grid;
  grid-template-columns: 220px 1fr;
  gap: 24px;
}

.clip-manager__main {
  min-width: 0;
}

.clip-manager__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.clip-manager__filters-select {
  width: 120px;
}

.clip-manager__filters-input {
  flex: 1;
  min-width: 220px;
}

.clip-manager__empty-card {
  text-align: center;
}

.clip-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.clip-card {
  height: 100%;
}

.clip-content {
  line-height: 1.6;
  word-break: break-word;
  max-height: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 8px;
  color: var(--n-text-color);
}

.clip-content--empty {
  color: var(--n-text-color-3);
}

.clip-content :deep(.clipsey-inline-highlight) {
  background-color: rgba(251, 191, 36, 0.45);
  border-radius: 3px;
  padding: 0 2px;
}

@media (max-width: 960px) {
  .clip-manager {
    grid-template-columns: 1fr;
  }

  .clip-manager__sidebar {
    position: static;
  }
}

@media (max-width: 640px) {
  .clip-grid {
    grid-template-columns: 1fr;
  }

  .clip-manager__filters-input {
    width: 100%;
  }
}
</style>



