/**
 * BackupIdMapper.ts
 * Manages deterministic bi-directional mapping between Android 64-bit Long IDs and Windows UUID strings.
 */

export class BackupIdMapper {
  private longToUuidMap: Map<string, string> = new Map();
  private uuidToLongMap: Map<string, bigint> = new Map();
  private nextLongId: bigint = 1000n;

  public getOrCreateUuid(longId: bigint | number, prefix = 'node'): string {
    const key = String(longId);
    const existing = this.longToUuidMap.get(key);
    if (existing) return existing;

    const newUuid = `${prefix}-${key}-${Math.random().toString(36).substring(2, 9)}`;
    this.longToUuidMap.set(key, newUuid);
    this.uuidToLongMap.set(newUuid, BigInt(longId));
    return newUuid;
  }

  public getOrCreateLong(uuid: string): bigint {
    const existing = this.uuidToLongMap.get(uuid);
    if (existing !== undefined) return existing;

    // Check if UUID has an embedded numeric ID (e.g. from previous mapping)
    const match = uuid.match(/-(\d+)-/);
    let chosenId: bigint;
    if (match && match[1]) {
      try {
        chosenId = BigInt(match[1]);
      } catch {
        chosenId = this.nextLongId++;
      }
    } else {
      chosenId = this.nextLongId++;
    }

    this.uuidToLongMap.set(uuid, chosenId);
    this.longToUuidMap.set(String(chosenId), uuid);
    return chosenId;
  }
}
