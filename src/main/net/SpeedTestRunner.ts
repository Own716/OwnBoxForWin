import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface NodeSpeedResult {
  nodeId: string;
  ping: number; // ms
  downloadSpeed?: number; // bits per second
  uploadSpeed?: number; // bits per second
  status: 'pending' | 'testing' | 'success' | 'error';
  errorMessage?: string;
}

export class SpeedTestRunner {
  private static isCancelled: boolean = false;

  public static cancel() {
    this.isCancelled = true;
  }

  public static async testLatency(
    testUrl: string = 'http://cp.cloudflare.com/generate_204',
    timeoutMs: number = 5000,
    proxyPort?: number
  ): Promise<number> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      const urlObj = new URL(testUrl);
      const isHttps = urlObj.protocol === 'https:';

      const options: any = {
        method: 'GET',
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        timeout: timeoutMs,
      };

      // If routing through local mixed proxy
      if (proxyPort) {
        // Via HTTP proxy
        options.host = '127.0.0.1';
        options.port = proxyPort;
        options.path = testUrl;
        options.headers = { Host: urlObj.host };
      }

      const client = isHttps && !proxyPort ? https : http;
      const req = client.request(options, (res) => {
        res.resume();
        const duration = Date.now() - startTime;
        resolve(duration);
      });

      req.on('timeout', () => {
        req.destroy();
        resolve(-1);
      });

      req.on('error', () => {
        resolve(-1);
      });

      req.end();
    });
  }

  public static async testDownload(
    downloadUrl: string = 'http://cachefly.cachefly.net/10mb.test',
    durationSec: number = 5,
    proxyPort?: number,
    onProgress?: (speedBps: number) => void
  ): Promise<number> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(downloadUrl);
        const isHttps = urlObj.protocol === 'https:';

        const options: any = {
          method: 'GET',
          hostname: urlObj.hostname,
          port: urlObj.port || (isHttps ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
        };

        if (proxyPort) {
          options.host = '127.0.0.1';
          options.port = proxyPort;
          options.path = downloadUrl;
          options.headers = { Host: urlObj.host };
        }

        const client = isHttps && !proxyPort ? https : http;
        let totalBytes = 0;
        const startTime = Date.now();

        const req = client.request(options, (res) => {
          res.on('data', (chunk) => {
            totalBytes += chunk.length;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) {
              const currentSpeed = (totalBytes * 8) / elapsed;
              if (onProgress) onProgress(currentSpeed);
            }
            if (elapsed >= durationSec || this.isCancelled) {
              req.destroy();
            }
          });

          res.on('end', () => {
            const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
            resolve((totalBytes * 8) / elapsed);
          });
        });

        req.on('error', () => {
          const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
          resolve(totalBytes > 0 ? (totalBytes * 8) / elapsed : 0);
        });

        req.setTimeout(durationSec * 1000 + 3000, () => {
          req.destroy();
        });

        req.end();
      } catch {
        resolve(0);
      }
    });
  }
}
