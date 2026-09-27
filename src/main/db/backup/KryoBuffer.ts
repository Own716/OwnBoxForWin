/**
 * KryoBuffer.ts
 * Pure TypeScript implementation of Kryo 5.2.1 ByteBufferOutput and ByteBufferInput.
 * Exact binary compatibility with com.esotericsoftware.kryo.io.ByteBufferOutput / ByteBufferInput.
 */

export class KryoBuffer {
  private buffer: Buffer;
  private position: number;

  constructor(initialCapacity = 256) {
    this.buffer = Buffer.alloc(initialCapacity);
    this.position = 0;
  }

  public static fromBuffer(buf: Buffer): KryoBuffer {
    const k = new KryoBuffer(buf.length);
    k.buffer = Buffer.from(buf);
    k.position = 0;
    return k;
  }

  public toBuffer(): Buffer {
    return this.buffer.subarray(0, this.position);
  }

  public getPosition(): number {
    return this.position;
  }

  public setPosition(pos: number): void {
    if (pos < 0 || pos > this.buffer.length) {
      throw new Error(`Invalid Kryo position: ${pos}`);
    }
    this.position = pos;
  }

  public hasRemaining(): boolean {
    return this.position < this.buffer.length;
  }

  public remaining(): number {
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

  public writeByte(val: number): void {
    this.ensureCapacity(1);
    this.buffer[this.position++] = val & 0xff;
  }

  public readByte(): number {
    if (this.position >= this.buffer.length) {
      throw new Error('Kryo buffer underflow reading byte');
    }
    return this.buffer[this.position++];
  }

  public writeBoolean(val: boolean): void {
    this.writeByte(val ? 1 : 0);
  }

  public readBoolean(): boolean {
    return this.readByte() === 1;
  }

  public writeInt(val: number): void {
    this.ensureCapacity(4);
    this.buffer.writeInt32LE(val, this.position);
    this.position += 4;
  }

  public readInt(): number {
    if (this.position + 4 > this.buffer.length) {
      throw new Error('Kryo buffer underflow reading int');
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
      throw new Error('Kryo buffer underflow reading long');
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
      throw new Error('Kryo buffer underflow reading float');
    }
    const val = this.buffer.readFloatLE(this.position);
    this.position += 4;
    return val;
  }

  /**
   * Writes a 1-5 byte VarInt (Kryo 5 Output.writeVarInt)
   */
  public writeVarInt(value: number, optimizePositive: boolean): number {
    if (!optimizePositive) {
      value = (value << 1) ^ (value >> 31);
    }
    let uval = value >>> 0;
    if (uval >>> 7 === 0) {
      this.writeByte(uval);
      return 1;
    }
    if (uval >>> 14 === 0) {
      this.writeByte((uval & 0x7f) | 0x80);
      this.writeByte(uval >>> 7);
      return 2;
    }
    if (uval >>> 21 === 0) {
      this.writeByte((uval & 0x7f) | 0x80);
      this.writeByte((uval >>> 7) | 0x80);
      this.writeByte(uval >>> 14);
      return 3;
    }
    if (uval >>> 28 === 0) {
      this.writeByte((uval & 0x7f) | 0x80);
      this.writeByte((uval >>> 7) | 0x80);
      this.writeByte((uval >>> 14) | 0x80);
      this.writeByte(uval >>> 21);
      return 4;
    }
    this.writeByte((uval & 0x7f) | 0x80);
    this.writeByte((uval >>> 7) | 0x80);
    this.writeByte((uval >>> 14) | 0x80);
    this.writeByte((uval >>> 21) | 0x80);
    this.writeByte(uval >>> 28);
    return 5;
  }

  /**
   * Reads a 1-5 byte VarInt (Kryo 5 Input.readVarInt)
   */
  public readVarInt(optimizePositive: boolean): number {
    let b = this.readByte();
    let result = b & 0x7f;
    if ((b & 0x80) !== 0) {
      b = this.readByte();
      result |= (b & 0x7f) << 7;
      if ((b & 0x80) !== 0) {
        b = this.readByte();
        result |= (b & 0x7f) << 14;
        if ((b & 0x80) !== 0) {
          b = this.readByte();
          result |= (b & 0x7f) << 21;
          if ((b & 0x80) !== 0) {
            b = this.readByte();
            result |= (b & 0x7f) << 28;
          }
        }
      }
    }
    return optimizePositive ? (result >>> 0) : ((result >>> 1) ^ -(result & 1));
  }

  /**
   * Writes a 1-5 byte VarInt flag (Kryo 5 Output.writeVarIntFlag)
   */
  public writeVarIntFlag(flag: boolean, value: number, optimizePositive: boolean): number {
    if (!optimizePositive) {
      value = (value << 1) ^ (value >> 31);
    }
    let uval = value >>> 0;
    const first = (uval & 0x3f) | (flag ? 0x80 : 0);
    if (uval >>> 6 === 0) {
      this.writeByte(first);
      return 1;
    }
    if (uval >>> 13 === 0) {
      this.writeByte(first | 0x40);
      this.writeByte(uval >>> 6);
      return 2;
    }
    if (uval >>> 20 === 0) {
      this.writeByte(first | 0x40);
      this.writeByte(((uval >>> 6) & 0x7f) | 0x80);
      this.writeByte(uval >>> 13);
      return 3;
    }
    if (uval >>> 27 === 0) {
      this.writeByte(first | 0x40);
      this.writeByte(((uval >>> 6) & 0x7f) | 0x80);
      this.writeByte(((uval >>> 13) & 0x7f) | 0x80);
      this.writeByte(uval >>> 20);
      return 4;
    }
    this.writeByte(first | 0x40);
    this.writeByte(((uval >>> 6) & 0x7f) | 0x80);
    this.writeByte(((uval >>> 13) & 0x7f) | 0x80);
    this.writeByte(((uval >>> 20) & 0x7f) | 0x80);
    this.writeByte(uval >>> 27);
    return 5;
  }

  /**
   * Reads boolean flag part without advancing position (Kryo 5 Input.readVarIntFlag())
   */
  public readVarIntFlag(): boolean {
    if (this.position >= this.buffer.length) {
      throw new Error('Kryo buffer underflow checking varint flag');
    }
    return (this.buffer[this.position] & 0x80) !== 0;
  }

  /**
   * Reads the value part of a VarInt flag (Kryo 5 Input.readVarIntFlag(boolean))
   */
  public readVarIntValue(optimizePositive: boolean): number {
    let b = this.readByte();
    let result = b & 0x3f;
    if ((b & 0x40) !== 0) {
      b = this.readByte();
      result |= (b & 0x7f) << 6;
      if ((b & 0x80) !== 0) {
        b = this.readByte();
        result |= (b & 0x7f) << 13;
        if ((b & 0x80) !== 0) {
          b = this.readByte();
          result |= (b & 0x7f) << 20;
          if ((b & 0x80) !== 0) {
            b = this.readByte();
            result |= (b & 0x7f) << 27;
          }
        }
      }
    }
    return optimizePositive ? (result >>> 0) : ((result >>> 1) ^ -(result & 1));
  }

  /**
   * Writes Kryo 5 string (Kryo 5 Output.writeString)
   */
  public writeString(value: string | null): void {
    if (value === null || value === undefined) {
      this.writeByte(0x80);
      return;
    }
    const charCount = value.length;
    if (charCount === 0) {
      this.writeByte(1 | 0x80); // 0x81
      return;
    }

    // Detect ASCII strings of length 2..32
    let isAscii = true;
    if (charCount > 1 && charCount <= 32) {
      for (let i = 0; i < charCount; i++) {
        if (value.charCodeAt(i) > 127) {
          isAscii = false;
          break;
        }
      }
      if (isAscii) {
        // Write ASCII characters, last char has bit 7 set
        for (let i = 0; i < charCount - 1; i++) {
          this.writeByte(value.charCodeAt(i));
        }
        this.writeByte(value.charCodeAt(charCount - 1) | 0x80);
        return;
      }
    }

    // Write UTF-8 string with flag matching Kryo 5.2.1 CESU-8/Modified UTF-8
    this.writeVarIntFlag(true, charCount + 1, true);
    for (let i = 0; i < charCount; i++) {
      const c = value.charCodeAt(i);
      if (c <= 0x7f) {
        this.writeByte(c);
      } else if (c > 0x7ff) {
        this.writeByte(0xe0 | ((c >> 12) & 0x0f));
        this.writeByte(0x80 | ((c >> 6) & 0x3f));
        this.writeByte(0x80 | (c & 0x3f));
      } else {
        this.writeByte(0xc0 | ((c >> 6) & 0x1f));
        this.writeByte(0x80 | (c & 0x3f));
      }
    }
  }

  /**
   * Reads Kryo 5 string (Kryo 5 Input.readString)
   */
  public readString(): string | null {
    if (!this.readVarIntFlag()) {
      // ASCII string: characters with bit 7 == 0, ending with character where (b & 0x80) != 0
      const chars: number[] = [];
      while (this.position < this.buffer.length) {
        const b = this.readByte();
        if ((b & 0x80) !== 0) {
          chars.push(b & 0x7f);
          return String.fromCharCode(...chars);
        }
        chars.push(b);
      }
      return String.fromCharCode(...chars);
    }

    // UTF-8 or null/empty
    const charCount = this.readVarIntValue(true);
    if (charCount === 0) return null;
    if (charCount === 1) return '';

    const numChars = charCount - 1;
    const chars: number[] = new Array(numChars);
    for (let i = 0; i < numChars; i++) {
      const b = this.readByte();
      if ((b & 0x80) === 0) {
        chars[i] = b;
      } else if ((b >> 4) === 12 || (b >> 4) === 13) {
        const b2 = this.readByte();
        chars[i] = ((b & 0x1f) << 6) | (b2 & 0x3f);
      } else if ((b >> 4) === 14) {
        const b2 = this.readByte();
        const b3 = this.readByte();
        chars[i] = ((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f);
      } else {
        chars[i] = b;
      }
    }

    return String.fromCharCode(...chars);
  }

  public writeBytes(bytes: Buffer | Uint8Array): void {
    const len = bytes.length;
    this.ensureCapacity(len);
    const bufToCopy = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
    bufToCopy.copy(this.buffer, this.position, 0, len);
    this.position += len;
  }

  public readBytes(length: number): Buffer {
    if (this.position + length > this.buffer.length) {
      throw new Error(`Kryo buffer underflow reading ${length} bytes`);
    }
    const result = Buffer.alloc(length);
    this.buffer.copy(result, 0, this.position, this.position + length);
    this.position += length;
    return result;
  }

  public writeStringList(list: string[]): void {
    this.writeInt(list.length);
    for (const str of list) {
      this.writeString(str);
    }
  }

  public readStringList(): string[] {
    const count = this.readInt();
    const list: string[] = [];
    for (let i = 0; i < count; i++) {
      const s = this.readString();
      if (s !== null) list.push(s);
    }
    return list;
  }
}
