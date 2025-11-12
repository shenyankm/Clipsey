import { browser } from 'wxt/browser';
import { OPTIONAL_HOST_PERMISSIONS } from '@/constants/hosts';

function toOriginPattern(url: string): string | null {
  try {
    const { origin } = new URL(url);
    return `${origin}/*`;
  } catch {
    return null;
  }
}

/** 管理可选主机权限的服务，封装了查询与申请逻辑。 */
class PermissionsService {
  private readonly optionalHosts = [...OPTIONAL_HOST_PERMISSIONS];

  async hasHostPermissionForUrl(url: string): Promise<boolean> {
    const originPattern = toOriginPattern(url);
    if (!originPattern) {
      return false;
    }
    return browser.permissions?.contains
      ? browser.permissions.contains({ origins: [originPattern] })
      : false;
  }

  async hasAllOptionalHosts(): Promise<boolean> {
    if (!browser.permissions?.contains) {
      return false;
    }
    return browser.permissions.contains({ origins: this.optionalHosts });
  }

  async requestHostPermissionForUrl(url: string): Promise<boolean> {
    if (!browser.permissions?.request) {
      return false;
    }

    const originPattern = toOriginPattern(url);
    if (!originPattern) {
      return false;
    }

    try {
      return await browser.permissions.request({ origins: [originPattern] });
    } catch {
      return false;
    }
  }
}

export const permissionsService = new PermissionsService();
