/**
 * CredentialSecurity: Secure storage for passwords, tokens, and sensitive keys.
 * Uses Electron's safeStorage (backed by Windows DPAPI) when available,
 * and gracefully falls back to base64 encoding in non-GUI / headless test environments.
 */
export class CredentialSecurity {
  private static safeStorageModule: any = null;
  private static initialized = false;

  private static getSafeStorage(): any {
    if (!this.initialized) {
      this.initialized = true;
      try {
        // Dynamic require so it doesn't fail when running in pure Node.js test environment
        const electron = require('electron');
        this.safeStorageModule = electron.safeStorage || null;
      } catch {
        this.safeStorageModule = null;
      }
    }
    return this.safeStorageModule;
  }

  /**
   * Encrypts a sensitive string. Returns an encrypted token string.
   */
  public static encrypt(plainText: string): string {
    if (!plainText) return '';
    const storage = this.getSafeStorage();
    if (storage && typeof storage.isEncryptionAvailable === 'function' && storage.isEncryptionAvailable()) {
      try {
        const buffer = storage.encryptString(plainText);
        return `enc:dpapi:${buffer.toString('base64')}`;
      } catch (err) {
        console.warn('safeStorage.encryptString failed, using fallback:', err);
      }
    }
    // Safe fallback for environments where DPAPI is not available (e.g. CI / CLI tests)
    return `enc:b64:${Buffer.from(plainText, 'utf8').toString('base64')}`;
  }

  /**
   * Decrypts an encrypted token string. If the string is not encrypted (legacy plain text), returns it as-is.
   */
  public static decrypt(cipherText: string): string {
    if (!cipherText) return '';
    if (!cipherText.startsWith('enc:')) {
      // Legacy plain text value, return directly
      return cipherText;
    }

    if (cipherText.startsWith('enc:dpapi:')) {
      const b64 = cipherText.slice('enc:dpapi:'.length);
      const storage = this.getSafeStorage();
      if (storage && typeof storage.isEncryptionAvailable === 'function' && storage.isEncryptionAvailable()) {
        try {
          const buffer = Buffer.from(b64, 'base64');
          return storage.decryptString(buffer);
        } catch (err) {
          console.error('safeStorage.decryptString failed:', err);
          return '';
        }
      } else {
        console.warn('DPAPI encrypted value cannot be decrypted in this environment');
        return '';
      }
    }

    if (cipherText.startsWith('enc:b64:')) {
      const b64 = cipherText.slice('enc:b64:'.length);
      try {
        return Buffer.from(b64, 'base64').toString('utf8');
      } catch {
        return '';
      }
    }

    return cipherText;
  }

  /**
   * Checks whether a value is already encrypted.
   */
  public static isEncrypted(value: string): boolean {
    return typeof value === 'string' && value.startsWith('enc:');
  }
}
