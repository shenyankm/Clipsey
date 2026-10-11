import { createApp, h, nextTick, ref, type App } from 'vue';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import ClipManager from '@/options/components/ClipManager.vue';
import { useClipSearch } from '@/options/composables/useClipSearch';
import { useBroadcastSync } from '@/composables/useBroadcastSync';

vi.mock('@/options/composables/useClipSearch', () => ({ useClipSearch: vi.fn() }));
vi.mock('@/options/composables/useClipCRUD', () => ({ useClipCRUD: () => ({ openingId: ref(null) }) }));
vi.mock('@/composables/useBroadcastSync', () => ({ useBroadcastSync: vi.fn() }));
vi.mock('@/options/components/clip/BackupControls.vue', () => ({ default: { template: '<button data-backup>backup</button>' } }));
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key === 'languageZhCN' ? '简体中文' : key }) }));
vi.mock('ant-design-vue', async () => {
  const { h } = await import('vue');
  const passthrough = { template: '<div><slot /></div>' };
  return {
    message: { success: vi.fn() },
    InputSearch: { props: ['value'], emits: ['update:value', 'search'], template: '<input @keyup.enter="$emit(\'search\', value)" />' },
    RadioGroup: { emits: ['update:value'], template: '<button data-timeline @click="$emit(\'update:value\', \'timeline\')">timeline</button>' },
    RadioButton: passthrough, Popconfirm: passthrough, Tag: passthrough, Modal: passthrough, Tooltip: passthrough,
    Pagination: { emits: ['update:current'], template: '<button data-next @click="$emit(\'update:current\', 2)">next</button>' },
    Table: {
      props: ['columns'], emits: ['change'],
      setup(props: any, { emit }: any) {
        return () => h('div', props.columns.map((column: any) => h('button', {
          'data-sort': column.key, 'data-order': column.sortOrder, disabled: !column.sorter,
          onClick: () => emit('change', null, null, { columnKey: column.key, order: column.sortOrder === 'ascend' ? null : 'ascend' })
        }, column.title)));
      }
    }
  };
});

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
  app.mount(container);
  await nextTick();
});
afterEach(() => { app.unmount(); container.remove(); vi.useRealTimers(); });

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

it.each([1, undefined])('resets to page one for addition or replacement and searches only once: %s', async countDelta => {
  (container.querySelector('[data-next]') as HTMLElement).click();
  await nextTick();
  performSearch.mockClear();
  vi.mocked(useBroadcastSync).mock.calls[0][1]({ type: 'CLIPS_CHANGED', timestamp: 1, countDelta });
  await nextTick();
  expect(performSearch).toHaveBeenCalledExactlyOnceWith(1, 20, { sortBy: 'createdAt', sortOrder: 'desc' });
});

it('debounces rapid input but keeps explicit sorting immediate', async () => {
  vi.useFakeTimers();
  performSearch.mockClear();
  const query = vi.mocked(useClipSearch).mock.results[0].value.searchQuery;
  for (const value of ['q', 'qu', 'quo', 'quot', 'quote']) {
    query.value = value;
    await nextTick();
    await vi.advanceTimersByTimeAsync(40);
  }
  expect(performSearch).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(180);
  expect(performSearch).toHaveBeenCalledTimes(1);
  query.value = 'another';
  await nextTick();
  (container.querySelector('[data-sort="title"]') as HTMLElement).click();
  await nextTick();
  expect(performSearch).toHaveBeenCalledTimes(2);
  await vi.runAllTimersAsync();
  expect(performSearch).toHaveBeenCalledTimes(2);
});

it('discards a scheduled input search when the manager unmounts', async () => {
  vi.useFakeTimers();
  performSearch.mockClear();
  vi.mocked(useClipSearch).mock.results[0].value.searchQuery.value = 'pending';
  await nextTick();
  app.unmount();
  await vi.runAllTimersAsync();
  expect(performSearch).not.toHaveBeenCalled();
});

it('runs an explicit enter search immediately and cancels its pending debounce', async () => {
  vi.useFakeTimers();
  performSearch.mockClear();
  vi.mocked(useClipSearch).mock.results[0].value.searchQuery.value = 'pending';
  await nextTick();
  container.querySelector('input')!.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter' }));
  await nextTick();
  expect(performSearch).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  expect(performSearch).toHaveBeenCalledTimes(1);
});
