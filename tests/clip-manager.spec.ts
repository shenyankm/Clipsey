import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClipManager from '@/options/components/ClipManager.vue';
import { useClipSearch } from '@/options/composables/useClipSearch';

vi.mock('@/options/composables/useClipSearch', () => ({ useClipSearch: vi.fn() }));
vi.mock('@/options/composables/useClipCRUD', () => ({ useClipCRUD: () => ({ openingId: ref(null) }) }));
vi.mock('@/composables/useBroadcastSync', () => ({ useBroadcastSync: vi.fn() }));
vi.mock('@/options/components/clip/BackupControls.vue', () => ({ default: { template: '<button data-backup>backup</button>' } }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key === 'languageZhCN' ? '简体中文' : key }) }));
vi.mock('ant-design-vue', () => ({ message: { success: vi.fn() } }));

let app: App;
let container: HTMLDivElement;
const performSearch = vi.fn().mockResolvedValue(undefined);

beforeEach(async () => {
  vi.clearAllMocks();
  vi.mocked(useClipSearch).mockReturnValue({ searchQuery: ref(''), searchResults: ref([{
    id: 'clip', textContent: 'Quote', sourceUrl: 'https://example.com', createdAt: new Date(2026, 9, 11, 1).toISOString()
  }]), searchTotal: ref(40), isSearching: ref(false), performSearch, clearSearch: vi.fn() });
  container = document.createElement('div');
  document.body.appendChild(container);
  app = createApp(ClipManager);
  for (const name of ['space', 'card', 'typography-title', 'typography-text', 'divider', 'tooltip', 'tag', 'button',
    'radio-button', 'empty', 'modal', 'popconfirm']) {
    app.component(`a-${name}`, (_, { slots }) => h('div', slots.default?.()));
  }
  app.component('a-input-search', { props: ['value'], emits: ['update:value'], template: '<input />' });
  app.component('a-radio-group', { emits: ['update:value'], template: '<button data-timeline @click="$emit(\'update:value\', \'timeline\')">timeline</button>' });
  app.component('a-pagination', { emits: ['update:current'], template: '<button data-next @click="$emit(\'update:current\', 2)">next</button>' });
  app.component('a-table', {
    props: ['columns'], emits: ['change'],
    setup(props, { emit }) {
      return () => h('div', props.columns.map((column: any) => h('button', {
        'data-sort': column.key, 'data-order': column.sortOrder, disabled: !column.sorter,
        onClick: () => emit('change', null, null, { columnKey: column.key, order: column.sortOrder === 'ascend' ? null : 'ascend' })
      }, column.title)));
    }
  });
  app.mount(container);
  await nextTick();
});
afterEach(() => { app.unmount(); container.remove(); });

it('exposes all supported sort columns and resets pagination when sorting changes', async () => {
  expect(container.querySelector('[data-backup]')).not.toBeNull();
  expect(container.querySelector<HTMLButtonElement>('[data-sort="actions"]')!.disabled).toBe(true);
  for (const key of ['title', 'sourceUrl', 'textContent', 'createdAt']) {
    expect(container.querySelector<HTMLButtonElement>(`[data-sort="${key}"]`)!.disabled).toBe(false);
  }
  (container.querySelector('[data-next]') as HTMLElement).click();
  await nextTick();
  expect(performSearch).toHaveBeenLastCalledWith(2, 20, { sortBy: 'createdAt', sortOrder: 'desc' });
  (container.querySelector('[data-sort="title"]') as HTMLElement).click();
  await nextTick();
  expect(performSearch).toHaveBeenLastCalledWith(1, 20, { sortBy: 'title', sortOrder: 'asc' });
  (container.querySelector('[data-sort="title"]') as HTMLElement).click();
  await nextTick();
  expect(performSearch).toHaveBeenLastCalledWith(1, 20, { sortBy: 'createdAt', sortOrder: 'desc' });
});

it('renders the local date label for timeline groups', async () => {
  (container.querySelector('[data-timeline]') as HTMLElement).click();
  await nextTick();
  const expected = new Date(2026, 9, 11).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' });
  expect(container.querySelector('.timeline-date-label')!.textContent).toBe(expected);
});
