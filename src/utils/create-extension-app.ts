import { createApp, type Component, type Plugin } from 'vue';
import i18n from '@/utils/i18n';

type BootstrapOptions = {
  plugins?: Plugin[];
  components?: Record<string, Component>;
};

export function createExtensionApp(rootComponent: Component, options: BootstrapOptions = {}) {
  const app = createApp(rootComponent);

  app.use(i18n);

  options.plugins?.forEach(plugin => {
    app.use(plugin);
  });

  if (options.components) {
    Object.entries(options.components).forEach(([name, component]) => {
      app.component(name, component);
      app.component(toKebabCase(name), component);
    });
  }

  return app;
}

const kebabCache = new Map<string, string>();

function toKebabCase(name: string): string {
  if (kebabCache.has(name)) {
    return kebabCache.get(name)!;
  }

  const normalized = name
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();

  kebabCache.set(name, normalized);
  return normalized;
}
