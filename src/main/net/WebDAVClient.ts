import http from 'http';
import https from 'https';
import { URL } from 'url';

export class WebDAVClient {
  private serverUrl: string;
  private authHeader: string;

  constructor(serverUrl: string, username?: string, password?: string) {
    this.serverUrl = serverUrl.replace(/\/+$/, '');
    if (username && password) {
      const token = Buffer.from(`${username}:${password}`).toString('base64');
      this.authHeader = `Basic ${token}`;
    } else {
      this.authHeader = '';
    }
  }

  private request(
    method: string,
    subPath: string,
    body?: string | Buffer,
    extraHeaders?: Record<string, string>
  ): Promise<{ statusCode: number; data: Buffer; headers: http.IncomingHttpHeaders }> {
    return new Promise((resolve, reject) => {
      const fullUrl = `${this.serverUrl}/${subPath.replace(/^\/+/, '')}`;
      const urlObj = new URL(fullUrl);
      const isHttps = urlObj.protocol === 'https:';

      const headers: Record<string, any> = {
        ...extraHeaders,
      };

      if (this.authHeader) {
        headers['Authorization'] = this.authHeader;
      }

      if (body) {
        headers['Content-Length'] = Buffer.byteLength(body);
      }

      const options = {
        method,
        hostname: urlObj.hostname,
        port: urlObj.port || (isHttps ? 443 : 80),
        path: urlObj.pathname + urlObj.search,
        headers,
      };

      const client = isHttps ? https : http;
      const req = client.request(options, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            data: Buffer.concat(chunks),
            headers: res.headers,
          });
        });
      });

      req.on('error', (err) => reject(err));

      if (body) {
        req.write(body);
      }

      req.end();
    });
  }

  public async checkDir(dirPath: string): Promise<boolean> {
    try {
      const res = await this.request('PROPFIND', dirPath, undefined, { Depth: '0' });
      return res.statusCode === 207 || res.statusCode === 200;
    } catch {
      return false;
    }
  }

  public async createDir(dirPath: string): Promise<boolean> {
    try {
      const res = await this.request('MKCOL', dirPath);
      return res.statusCode === 201 || res.statusCode === 405; // 405 means already exists
    } catch {
      return false;
    }
  }

  public async upload(filePath: string, content: string | Buffer): Promise<boolean> {
    try {
      const res = await this.request('PUT', filePath, content, {
        'Content-Type': 'application/json',
      });
      return res.statusCode >= 200 && res.statusCode < 300;
    } catch {
      return false;
    }
  }

  public async download(filePath: string): Promise<string> {
    const res = await this.request('GET', filePath);
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return res.data.toString('utf8');
    }
    throw new Error(`Download failed with status: ${res.statusCode}`);
  }

  public async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const res = await this.request('PROPFIND', '', undefined, { Depth: '0' });
      if (res.statusCode === 207 || res.statusCode === 200 || res.statusCode === 405) {
        return { success: true, message: 'WebDAV connection successful' };
      }
      return { success: false, message: `Server returned status code: ${res.statusCode}` };
    } catch (e: any) {
      return { success: false, message: e.message };
    }
  }
}
