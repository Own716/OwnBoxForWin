import http from 'http';
import https from 'https';
import tls from 'tls';
import net from 'net';
import { URL } from 'url';
import { TcpPing } from './TcpPing';

export interface NodeSpeedResult {
  nodeId: string;
  ping: number; // ms (-1 on failure)
  downloadSpeed?: number; // bits per second
  uploadSpeed?: number; // bits per second
  status: 'pending' | 'testing' | 'success' | 'error';
  errorMessage?: string;
}

export class SpeedTestRunner {
  // Map of active test task AbortControllers keyed by taskId or nodeId
  private static activeTasks: Map<string, AbortController> = new Map();

  /**
   * Cancel specific test task or all active tests
   */
  public static cancel(nodeId?: string) {
    if (nodeId) {
      const ctrl = this.activeTasks.get(nodeId);
      if (ctrl) {
        ctrl.abort();
        this.activeTasks.delete(nodeId);
      }
    } else {
      for (const ctrl of this.activeTasks.values()) {
        ctrl.abort();
      }
      this.activeTasks.clear();
    }
  }

  /**
   * Test node latency without touching user's active proxy selector.
   * Uses Sing-box Clash API node outbound probe directly, or fallback TCP ping.
   */
  public static async testLatency(
    testUrl: string = 'http://cp.cloudflare.com/generate_204',
    timeoutMs: number = 5000,
    proxyPort?: number,
    nodeId?: string,
    clashPort: number = 9090,
    nodeServer?: string,
    nodePort?: number
  ): Promise<number> {
    const taskId = nodeId || `latency-${Date.now()}-${Math.random()}`;
    const abortCtrl = new AbortController();
    this.activeTasks.set(taskId, abortCtrl);

    try {
      // 1. If nodeId is specified, test via Sing-box Clash API outbound delay probe
      if (nodeId) {
        try {
          const clashDelay = await this.testViaClashApi(nodeId, testUrl, timeoutMs, clashPort, abortCtrl.signal);
          if (clashDelay > 0) return clashDelay;
        } catch {
          // If Clash API probe fails (e.g. core is stopped), fallback to direct TCP ping if server info provided
          if (nodeServer && nodePort) {
            try {
              const tcpRes = await TcpPing.ping(nodeServer, nodePort, timeoutMs);
              return tcpRes.time;
            } catch {
              return -1;
            }
          }
          return -1;
        }
      }

      // 2. Test via current active proxyPort if specified
      if (proxyPort) {
        try {
          const proxyDelay = await this.testViaHttp(testUrl, timeoutMs, proxyPort, abortCtrl.signal);
          if (proxyDelay > 0) return proxyDelay;
        } catch {
          // Fall through to direct
        }
      }

      // 3. Fallback direct test
      return await this.testViaHttp(testUrl, timeoutMs, undefined, abortCtrl.signal);
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Test download speed using isolated speedtest-selector without touching user's 'proxy' selector.
   */
  public static async testDownload(
    downloadUrl: string = 'http://speed.cloudflare.com/__down?bytes=5000000',
    durationSec: number = 4,
    proxyPort?: number,
    nodeId?: string,
    clashPort: number = 9090,
    onProgress?: (speedBps: number) => void
  ): Promise<number> {
    const taskId = nodeId || `dl-${Date.now()}-${Math.random()}`;
    const abortCtrl = new AbortController();
    this.activeTasks.set(taskId, abortCtrl);

    // Speedtest uses dedicated loopback port (mixedPort + 1, e.g. 2081)
    const speedtestPort = proxyPort ? proxyPort + 1 : undefined;

    try {
      if (nodeId && speedtestPort) {
        // Set isolated speedtest-selector in Clash API (NEVER touches 'proxy' selector)
        await this.setSpeedtestSelector(nodeId, clashPort);

        try {
          const speed = await this.doDownload(
            downloadUrl,
            durationSec,
            speedtestPort,
            abortCtrl.signal,
            onProgress
          );
          return speed;
        } finally {
          // Reset speedtest-selector to 'direct'
          this.resetSpeedtestSelector(clashPort).catch(() => {});
        }
      }

      // If no nodeId, download via active proxyPort or direct
      return await this.doDownload(
        downloadUrl,
        durationSec,
        proxyPort,
        abortCtrl.signal,
        onProgress
      );
    } finally {
      this.activeTasks.delete(taskId);
    }
  }

  /**
   * Query delay for specific node outbound via Clash API
   */
  private static testViaClashApi(
    nodeId: string,
    testUrl: string,
    timeoutMs: number,
    clashPort: number,
    signal: AbortSignal
  ): Promise<number> {
    return new Promise((resolve, reject) => {
      if (signal.aborted) {
        return reject(new Error('Aborted'));
      }

      const tag = `node-${nodeId}`;
      const url = `http://127.0.0.1:${clashPort}/proxies/${encodeURIComponent(tag)}/delay?timeout=${timeoutMs}&url=${encodeURIComponent(testUrl)}`;

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

      const onAbort = () => {
        req.destroy();
        reject(new Error('Aborted'));
      };
      signal.addEventListener('abort', onAbort, { once: true });

      req.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        reject(err);
      });

      req.on('timeout', () => {
        signal.removeEventListener('abort', onAbort);
        req.destroy();
        reject(new Error('Clash API timeout'));
      });
    });
  }

  /**
   * Switch the dedicated speedtest-selector in Clash API
   */
  private static setSpeedtestSelector(nodeId: string, clashPort: number): Promise<boolean> {
    return new Promise((resolve) => {
      const payload = JSON.stringify({ name: `node-${nodeId}` });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: clashPort,
          path: '/proxies/speedtest-selector',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(payload)),
          },
          timeout: 2000,
        },
        (res) => resolve(res.statusCode === 204 || res.statusCode === 200)
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write(payload);
      req.end();
    });
  }

  /**
   * Reset the dedicated speedtest-selector back to 'direct'
   */
  private static resetSpeedtestSelector(clashPort: number): Promise<boolean> {
    return new Promise((resolve) => {
      const payload = JSON.stringify({ name: 'direct' });
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port: clashPort,
          path: '/proxies/speedtest-selector',
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': String(Buffer.byteLength(payload)),
          },
          timeout: 1000,
        },
        (res) => resolve(res.statusCode === 204 || res.statusCode === 200)
      );
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.write(payload);
      req.end();
    });
  }

  /**
   * HTTP/HTTPS latency test with full CONNECT tunneling support
   */
  private static testViaHttp(
    testUrl: string,
    timeoutMs: number,
    proxyPort?: number,
    signal?: AbortSignal
  ): Promise<number> {
    const startTime = Date.now();
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve(-1);

      try {
        const urlObj = new URL(testUrl);
        const isHttps = urlObj.protocol === 'https:';

        if (proxyPort && isHttps) {
          // HTTPS over HTTP proxy requires HTTP CONNECT tunnel
          this.createConnectTunnel('127.0.0.1', proxyPort, urlObj.hostname, 443, timeoutMs)
            .then((socket) => {
              if (signal?.aborted) {
                socket.destroy();
                return resolve(-1);
              }

              const tlsSocket = tls.connect({
                socket,
                servername: urlObj.hostname,
                rejectUnauthorized: false,
              });

              const req = https.request(
                {
                  createConnection: () => tlsSocket,
                  method: 'GET',
                  path: urlObj.pathname + urlObj.search,
                  headers: {
                    Host: urlObj.host,
                    'User-Agent': 'OwnBox/1.0.4',
                  },
                  timeout: timeoutMs,
                },
                (res) => {
                  res.resume();
                  const duration = Date.now() - startTime;
                  resolve(duration > 0 ? duration : 1);
                }
              );

              signal?.addEventListener('abort', () => {
                req.destroy();
                resolve(-1);
              }, { once: true });

              req.on('error', () => resolve(-1));
              req.on('timeout', () => {
                req.destroy();
                resolve(-1);
              });
              req.end();
            })
            .catch(() => resolve(-1));
          return;
        }

        // Plain HTTP or Direct HTTPS
        let options: any;
        if (proxyPort) {
          options = {
            method: 'GET',
            host: '127.0.0.1',
            port: proxyPort,
            path: testUrl,
            headers: {
              Host: urlObj.host,
              'User-Agent': 'OwnBox/1.0.3',
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
              'User-Agent': 'OwnBox/1.0.3',
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

        signal?.addEventListener('abort', () => {
          req.destroy();
          resolve(-1);
        }, { once: true });

        req.on('timeout', () => {
          req.destroy();
          resolve(-1);
        });

        req.on('error', () => resolve(-1));
        req.end();
      } catch {
        resolve(-1);
      }
    });
  }

  /**
   * HTTP download speed measurement with progress reporting
   */
  private static doDownload(
    downloadUrl: string,
    durationSec: number,
    proxyPort?: number,
    signal?: AbortSignal,
    onProgress?: (speedBps: number) => void
  ): Promise<number> {
    return new Promise((resolve) => {
      if (signal?.aborted) return resolve(0);

      try {
        const urlObj = new URL(downloadUrl);
        const isHttps = urlObj.protocol === 'https:';

        let options: any;
        if (proxyPort && !isHttps) {
          options = {
            method: 'GET',
            host: '127.0.0.1',
            port: proxyPort,
            path: downloadUrl,
            headers: {
              Host: urlObj.host,
              'User-Agent': 'OwnBox/1.0.4 SpeedTest',
            },
            timeout: (durationSec + 4) * 1000,
          };
        } else {
          options = {
            method: 'GET',
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: urlObj.pathname + urlObj.search,
            headers: {
              Host: urlObj.host,
              'User-Agent': 'OwnBox/1.0.4 SpeedTest',
            },
            timeout: (durationSec + 4) * 1000,
          };
        }

        const client = (proxyPort && !isHttps) ? http : (isHttps ? https : http);
        let totalBytes = 0;
        const startTime = Date.now();

        const req = client.request(options, (res) => {
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.doDownload(res.headers.location, durationSec, proxyPort, signal, onProgress).then(resolve);
            return;
          }

          res.on('data', (chunk) => {
            totalBytes += chunk.length;
            const elapsed = (Date.now() - startTime) / 1000;
            if (elapsed > 0) {
              const currentSpeed = (totalBytes * 8) / elapsed;
              if (onProgress) onProgress(currentSpeed);
            }
            if (elapsed >= durationSec || signal?.aborted) {
              req.destroy();
            }
          });

          res.on('end', () => {
            const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
            resolve((totalBytes * 8) / elapsed);
          });
        });

        signal?.addEventListener('abort', () => {
          req.destroy();
          resolve(0);
        }, { once: true });

        req.on('error', () => {
          const elapsed = Math.max((Date.now() - startTime) / 1000, 0.1);
          resolve(totalBytes > 0 ? (totalBytes * 8) / elapsed : 0);
        });

        req.setTimeout((durationSec + 4) * 1000, () => {
          req.destroy();
        });

        req.end();
      } catch {
        resolve(0);
      }
    });
  }

  /**
   * Establishes a raw TCP tunnel via HTTP CONNECT to an upstream proxy
   */
  private static createConnectTunnel(
    proxyHost: string,
    proxyPort: number,
    targetHost: string,
    targetPort: number,
    timeoutMs: number
  ): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const req = http.request({
        host: proxyHost,
        port: proxyPort,
        method: 'CONNECT',
        path: `${targetHost}:${targetPort}`,
        headers: {
          Host: `${targetHost}:${targetPort}`,
        },
        timeout: timeoutMs,
      });

      req.on('connect', (res, socket) => {
        if (res.statusCode === 200) {
          resolve(socket);
        } else {
          socket.destroy();
          reject(new Error(`CONNECT failed with status ${res.statusCode}`));
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('CONNECT timeout'));
      });

      req.on('error', reject);
      req.end();
    });
  }
}
