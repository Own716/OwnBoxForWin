import { net } from 'electron';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface SubscriptionFetchResult {
  content: string;
  userInfo?: {
    upload?: number;
    download?: number;
    total?: number;
    expire?: number;
  };
}

export class SubscriptionFetcher {
  private static readonly USER_AGENTS = [
    'sing-box/1.15.0-alpha.6',
    'ClashMeta/1.18.0',
    'v2rayN/6.23',
  ].join(' ');

  /**
   * Fetches subscription content with redirect following, standard headers, and fallback mechanisms
   */
  public static async fetch(url: string, mixedPort: number = 2080): Promise<SubscriptionFetchResult> {
    const trimmedUrl = url.trim();

    // 1. Try Electron net.fetch (Chromium network stack with automatic redirect following & system proxy)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const res = await net.fetch(trimmedUrl, {
        headers: {
          'User-Agent': this.USER_AGENTS,
          'Accept': '*/*',
        },
        redirect: 'follow',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (res.ok) {
        const content = await res.text();
        const userInfoHeader = res.headers.get('subscription-userinfo');
        const userInfo = this.parseUserInfo(userInfoHeader);
        if (content && content.length > 5) {
          return { content, userInfo };
        }
      }
    } catch (e) {
      console.warn('net.fetch failed, attempting curl fallback...', e);
    }

    // 2. Try native Windows curl.exe (direct connection with -L to follow redirects and -k for SSL)
    try {
      const curlCmd = `curl.exe -s -L -k -A "${this.USER_AGENTS}" --max-time 15 -i "${trimmedUrl}"`;
      const { stdout } = await execAsync(curlCmd, { maxBuffer: 10 * 1024 * 1024 });
      const parsed = this.parseCurlOutput(stdout);
      if (parsed.content && parsed.content.length > 5) {
        return parsed;
      }
    } catch (e) {
      console.warn('Direct curl failed, attempting proxy curl...', e);
    }

    // 3. Fallback: Try curl with local proxy (mixed port or socks)
    const proxyList = [
      `http://127.0.0.1:${mixedPort}`,
      `socks5://127.0.0.1:${mixedPort}`,
      'socks5://127.0.0.1:10808',
      'http://127.0.0.1:10809',
    ];

    for (const proxy of proxyList) {
      try {
        const curlProxyCmd = `curl.exe -s -L -k -x "${proxy}" -A "${this.USER_AGENTS}" --max-time 10 -i "${trimmedUrl}"`;
        const { stdout } = await execAsync(curlProxyCmd, { maxBuffer: 10 * 1024 * 1024 });
        const parsed = this.parseCurlOutput(stdout);
        if (parsed.content && parsed.content.length > 5) {
          return parsed;
        }
      } catch {}
    }

    throw new Error('无法连接到订阅服务器，请检查链接有效性或代理设置');
  }

  private static parseCurlOutput(output: string): SubscriptionFetchResult {
    // Curl with -i separates headers and body with double newline \r\n\r\n
    // If there were redirects, there will be multiple header sections
    const sections = output.split(/\r?\n\r?\n/);
    const body = sections[sections.length - 1] || '';

    let userInfoHeader: string | undefined;
    for (let i = 0; i < sections.length - 1; i++) {
      const lines = sections[i].split(/\r?\n/);
      for (const line of lines) {
        if (/^subscription-userinfo\s*:/i.test(line)) {
          userInfoHeader = line.replace(/^subscription-userinfo\s*:/i, '').trim();
        }
      }
    }

    return {
      content: body.trim(),
      userInfo: this.parseUserInfo(userInfoHeader),
    };
  }

  private static parseUserInfo(header?: string | null): SubscriptionFetchResult['userInfo'] {
    if (!header) return undefined;
    const info: SubscriptionFetchResult['userInfo'] = {};
    const parts = header.split(';');
    for (const part of parts) {
      const [k, v] = part.trim().split('=');
      if (k && v) {
        const num = Number(v);
        if (!isNaN(num)) {
          if (k.toLowerCase() === 'upload') info.upload = num;
          if (k.toLowerCase() === 'download') info.download = num;
          if (k.toLowerCase() === 'total') info.total = num;
          if (k.toLowerCase() === 'expire') info.expire = num;
        }
      }
    }
    return info;
  }
}
