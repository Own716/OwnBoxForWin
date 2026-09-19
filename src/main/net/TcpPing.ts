import net from 'net';

export interface PingResult {
  host: string;
  port: number;
  time: number; // ms, or -1 for failure
  status: 'success' | 'timeout' | 'refused' | 'dns_error' | 'error';
  error?: string;
}

export class TcpPing {
  public static async ping(host: string, port: number, timeoutMs: number = 3000): Promise<PingResult> {
    return new Promise((resolve) => {
      const startTime = process.hrtime.bigint();
      const socket = new net.Socket();
      let resolved = false;

      const finish = (status: PingResult['status'], err?: string) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        const endTime = process.hrtime.bigint();
        const time = status === 'success' ? Number((endTime - startTime) / 1000000n) : -1;
        resolve({
          host,
          port,
          time,
          status,
          error: err,
        });
      };

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        finish('success');
      });

      socket.on('timeout', () => {
        finish('timeout', 'Connection timed out');
      });

      socket.on('error', (err: any) => {
        if (err.code === 'ECONNREFUSED') {
          finish('refused', 'Connection refused');
        } else if (err.code === 'ENOTFOUND') {
          finish('dns_error', 'DNS lookup failed');
        } else {
          finish('error', err.message);
        }
      });

      try {
        socket.connect(port, host);
      } catch (e: any) {
        finish('error', e.message);
      }
    });
  }

  /**
   * Batch ping with concurrency limit
   */
  public static async batchPing(
    items: { id: string; host: string; port: number }[],
    concurrency: number = 10,
    timeoutMs: number = 3000,
    onProgress?: (id: string, result: PingResult) => void
  ): Promise<Map<string, PingResult>> {
    const results = new Map<string, PingResult>();
    const queue = [...items];

    const worker = async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (!item) break;
        const res = await this.ping(item.host, item.port, timeoutMs);
        results.set(item.id, res);
        if (onProgress) onProgress(item.id, res);
      }
    };

    const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
    await Promise.all(workers);
    return results;
  }
}
