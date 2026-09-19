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

  public static async selectNode(nodeId: string, clashPort: number = 9090): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const tag = `node-${nodeId}`;
        const payload = JSON.stringify({ name: tag });
        const req = http.request(
          {
            hostname: '127.0.0.1',
            port: clashPort,
            path: '/proxies/proxy',
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload),
            },
            timeout: 2000,
          },
          (res) => {
            resolve(res.statusCode === 204 || res.statusCode === 200);
          }
        );
        req.on('error', () => resolve(false));
        req.on('timeout', () => {
          req.destroy();
          resolve(false);
        });
        req.write(payload);
        req.end();
      } catch {
        resolve(false);
      }
    });
  }

  public static async testLatency(
    testUrl: string = 'http://cp.cloudflare.com/generate_204',
    timeoutMs: number = 5000,
    proxyPort?: number,
    nodeId?: string
  ): Promise<number> {
    // 1. If nodeId is specified, test via Sing-box Clash API (measures exact proxy outbound delay)
    if (nodeId) {
      try {
        const clashDelay = await this.testViaClashApi(nodeId, testUrl, timeoutMs);
        if (clashDelay > 0) return clashDelay;
      } catch {
        // Specifically testing this node; if Clash API probe failed, return -1 (timeout)
        return -1;
      }
      return -1;
    }

    // 2. Test via local mixed proxy if port is specified
    if (proxyPort) {
      try {
        const proxyDelay = await this.testViaHttp(testUrl, timeoutMs, proxyPort);
        if (proxyDelay > 0) return proxyDelay;
      } catch {
        // Fall through to direct
      }
    }

    // 3. Fallback direct test
    return this.testViaHttp(testUrl, timeoutMs);
  }

  private static testViaClashApi(nodeId: string, testUrl: string, timeoutMs: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const tag = `node-${nodeId}`;
      const url = `http://127.0.0.1:9090/proxies/${encodeURIComponent(tag)}/delay?timeout=${timeoutMs}&url=${encodeURIComponent(testUrl)}`;
      const req = http.get(url, { timeout: timeoutMs }, (res) => {
        let raw = '';
        res.on('data', (c) => (raw += c));
        res.on('end', () => {
          try {
            const data = JSON.parse(raw);
            if (typeof data.delay === 'number' && data.delay > 0) {
              resolve(data.delay);
            } else {
              reject(new Error(data.message || 'No delay data'));
            }
          } catch (e) {
            reject(e);
          }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Clash API timeout'));
      });
    });
  }

  private static testViaHttp(testUrl: string, timeoutMs: number, proxyPort?: number): Promise<number> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(testUrl);
        const isHttps = urlObj.protocol === 'https:';

        let options: any;
        if (proxyPort) {
          options = {
            method: 'GET',
            host: '127.0.0.1',
            port: proxyPort,
            path: testUrl,
            headers: {
              Host: urlObj.host,
              'User-Agent': 'OwnBox/1.0.1',
            },
            timeout: timeoutMs,
          };
        } else {
          options = {
            method: 'GET',
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
              'User-Agent': 'OwnBox/1.0.1',
            },
            timeout: timeoutMs,
          };
        }

        const client = proxyPort ? http : (isHttps ? https : http);
        const req = client.request(options, (res) => {
          res.resume();
          const duration = Date.now() - startTime;
          resolve(duration > 0 ? duration : 1);
        });

        req.on('timeout', () => {
          req.destroy();
          resolve(-1);
        });

        req.on('error', () => {
          resolve(-1);
        });

        req.end();
      } catch {
        resolve(-1);
      }
    });
  }

  public static async testDownload(
    downloadUrl: string = 'http://speed.cloudflare.com/__down?bytes=5000000',
    durationSec: number = 5,
    proxyPort?: number,
    nodeId?: string,
    clashPort: number = 9090,
    onProgress?: (speedBps: number) => void
  ): Promise<number> {
    this.isCancelled = false;
    if (nodeId) {
      try {
        await this.selectNode(nodeId, clashPort);
      } catch {
        // ignore
      }
    }

    // 1. Try download via proxyPort if specified
    if (proxyPort) {
      try {
        const speed = await this.doDownload(downloadUrl, durationSec, proxyPort, onProgress);
        if (speed > 0) return speed;
      } catch {
        // Fall back
      }
    }

    // 2. Direct fallback (only if nodeId was not specified)
    if (!nodeId) {
      return this.doDownload(downloadUrl, durationSec, undefined, onProgress);
    }
    return 0;
  }

  private static doDownload(
    downloadUrl: string,
    durationSec: number,
    proxyPort?: number,
    onProgress?: (speedBps: number) => void
  ): Promise<number> {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(downloadUrl);
        const isHttps = urlObj.protocol === 'https:';

        let options: any;
        if (proxyPort) {
          options = {
            method: 'GET',
            host: '127.0.0.1',
            port: proxyPort,
            path: downloadUrl,
            headers: {
              Host: urlObj.host,
              'User-Agent': 'OwnBox/1.0.1 SpeedTest',
            },
            timeout: (durationSec + 3) * 1000,
          };
        } else {
          options = {
            method: 'GET',
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
              Host: urlObj.host,
              'User-Agent': 'OwnBox/1.0.1 SpeedTest',
            },
            timeout: (durationSec + 3) * 1000,
          };
        }

        const client = proxyPort ? http : (isHttps ? https : http);
        let totalBytes = 0;
        const startTime = Date.now();

        const req = client.request(options, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.doDownload(res.headers.location, durationSec, proxyPort, onProgress).then(resolve);
            return;
          }

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

        req.setTimeout((durationSec + 3) * 1000, () => {
          req.destroy();
        });

        req.end();
      } catch {
        resolve(0);
      }
    });
  }
}
