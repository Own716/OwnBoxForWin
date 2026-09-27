/**
 * AndroidParcel.ts
 * Pure TypeScript implementation of Android OS Parcel binary serialization and deserialization.
 * Supports:
 * - Little-endian 32-bit and 64-bit integers, floats
 * - 4-byte aligned ByteArrays with zero padding
 * - UTF-16 Strings with null terminators and 4-byte alignment
 * - URL-safe unpadded Base64 encoding/decoding compatible with Android Base64.URL_SAFE | Base64.NO_PADDING
 */

export class AndroidParcel {
  private buffer: Buffer;
  private position: number;

  constructor(initialCapacity = 256) {
    this.buffer = Buffer.alloc(initialCapacity);
    this.position = 0;
  }

  public static fromBuffer(buf: Buffer): AndroidParcel {
    const parcel = new AndroidParcel(buf.length);
    parcel.buffer = Buffer.from(buf);
    parcel.position = 0;
    return parcel;
  }

  public static fromBase64UrlSafe(base64Str: string): AndroidParcel {
    // Normalise base64url to standard base64 if needed, or use Node's base64url encoding
    const buf = Buffer.from(base64Str.trim(), 'base64url');
    return AndroidParcel.fromBuffer(buf);
  }

  public toBuffer(): Buffer {
    return this.buffer.subarray(0, this.position);
  }

  public toBase64UrlSafe(): string {
    return this.toBuffer().toString('base64url');
  }

  public dataPosition(): number {
    return this.position;
  }

  public setDataPosition(pos: number): void {
    if (pos < 0 || pos > this.buffer.length) {
      throw new Error(`Invalid Parcel dataPosition: ${pos}`);
    }
    this.position = pos;
  }

  public dataAvail(): number {
    return this.buffer.length - this.position;
  }

  private ensureCapacity(bytesNeeded: number): void {
    const minCap = this.position + bytesNeeded;
    if (minCap > this.buffer.length) {
      let newCap = Math.max(this.buffer.length * 2, 256);
      while (newCap < minCap) {
        newCap *= 2;
      }
      const newBuf = Buffer.alloc(newCap);
      this.buffer.copy(newBuf, 0, 0, this.position);
      this.buffer = newBuf;
    }
  }

  public writeInt(val: number): void {
    this.ensureCapacity(4);
    this.buffer.writeInt32LE(val, this.position);
    this.position += 4;
  }

  public readInt(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new Error('Parcel buffer underflow on readInt');
    }
    const val = this.buffer.readInt32LE(this.position);
    this.position += 4;
    return val;
  }

  public writeLong(val: bigint | number): void {
    this.ensureCapacity(8);
    const bigVal = typeof val === 'bigint' ? val : BigInt(Math.floor(val));
    this.buffer.writeBigInt64LE(bigVal, this.position);
    this.position += 8;
  }

  public readLong(): bigint {
    if (this.position + 8 > this.buffer.length) {
      throw new Error('Parcel buffer underflow on readLong');
    }
    const val = this.buffer.readBigInt64LE(this.position);
    this.position += 8;
    return val;
  }

  public writeFloat(val: number): void {
    this.ensureCapacity(4);
    this.buffer.writeFloatLE(val, this.position);
    this.position += 4;
  }

  public readFloat(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new Error('Parcel buffer underflow on readFloat');
    }
    const val = this.buffer.readFloatLE(this.position);
    this.position += 4;
    return val;
  }

  public writeBoolean(val: boolean): void {
    this.writeInt(val ? 1 : 0);
  }

  public readBoolean(): boolean {
    return this.readInt() !== 0;
  }

  /**
   * Android Parcel.writeByteArray(byte[] b):
   * Writes int32 length (-1 if null).
   * If length > 0, writes bytes, then pads with 0s to 4-byte boundary.
   */
  public writeByteArray(bytes: Buffer | Uint8Array | null): void {
    if (bytes === null || bytes === undefined) {
      this.writeInt(-1);
      return;
    }
    const len = bytes.length;
    this.writeInt(len);
    if (len === 0) return;

    const pad = (4 - (len % 4)) % 4;
    this.ensureCapacity(len + pad);

    const bufToCopy = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    bufToCopy.copy(this.buffer, this.position, 0, len);
    this.position += len;

    if (pad > 0) {
      this.buffer.fill(0, this.position, this.position + pad);
      this.position += pad;
    }
  }

  /**
   * Android Parcel.createByteArray():
   * Reads int32 length (-1 if null).
   * If length >= 0, reads bytes and skips padding to 4-byte boundary.
   */
  public createByteArray(): Buffer | null {
    const len = this.readInt();
    if (len < 0) return null;
    if (len === 0) return Buffer.alloc(0);

    if (this.position + len > this.buffer.length) {
      throw new Error(`Parcel underflow reading byte array of length ${len}`);
    }

    const result = Buffer.alloc(len);
    this.buffer.copy(result, 0, this.position, this.position + len);
    this.position += len;

    // Skip alignment padding
    const pad = (4 - (len % 4)) % 4;
    this.position += pad;
    return result;
  }

  /**
   * Android Parcel.writeString(String val):
   * Writes int32 length of characters (-1 if null).
   * Followed by UTF-16LE code units, a 2-byte null terminator (0x0000),
   * and padded to a 4-byte boundary.
   */
  public writeString(val: string | null): void {
    if (val === null || val === undefined) {
      this.writeInt(-1);
      return;
    }

    const charCount = val.length;
    this.writeInt(charCount);

    const byteLen = charCount * 2;
    // Android string in parcel has a null terminator character (2 bytes)
    const totalBytes = byteLen + 2;
    const pad = (4 - (totalBytes % 4)) % 4;

    this.ensureCapacity(totalBytes + pad);

    // Write UTF-16LE characters
    for (let i = 0; i < charCount; i++) {
      this.buffer.writeUInt16LE(val.charCodeAt(i), this.position);
      this.position += 2;
    }

    // Write null terminator
    this.buffer.writeUInt16LE(0, this.position);
    this.position += 2;

    // Write padding
    if (pad > 0) {
      this.buffer.fill(0, this.position, this.position + pad);
      this.position += pad;
    }
  }

  /**
   * Android Parcel.readString():
   * Reads int32 length of characters (-1 if null).
   * Reads UTF-16LE code units, skips 2-byte null terminator and alignment padding.
   */
  public readString(): string | null {
    const charCount = this.readInt();
    if (charCount < 0) return null;
    if (charCount === 0) {
      // 0 chars: still has 2-byte null terminator (2 bytes), padded by 2 bytes to 4 bytes
      this.position += 4;
      return '';
    }

    const byteLen = charCount * 2;
    const totalBytes = byteLen + 2;
    const pad = (4 - (totalBytes % 4)) % 4;

    if (this.position + totalBytes > this.buffer.length) {
      throw new Error(`Parcel underflow reading string of length ${charCount}`);
    }

    const chars: number[] = new Array(charCount);
    for (let i = 0; i < charCount; i++) {
      chars[i] = this.buffer.readUInt16LE(this.position);
      this.position += 2;
    }

    // Skip null terminator (2 bytes) + pad
    this.position += 2 + pad;

    return String.fromCharCode(...chars);
  }
}
