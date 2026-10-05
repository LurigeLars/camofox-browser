import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

function getUserPersistencePaths(profileDir, userId) {
  const rootDir = path.resolve(profileDir);
  const userKey = crypto
    .createHash('sha256')
    .update(String(userId))
    .digest('hex')
    .slice(0, 32);
  if (!/^[a-f0-9]{32}$/.test(userKey)) {
    throw new Error('invalid persistence user key');
  }
  const safeUserDir = path.basename(userKey);
  const userDir = path.resolve(rootDir, safeUserDir);
  if (path.dirname(userDir) !== rootDir) {
    throw new Error('persistence path escaped configured root');
  }
  return {
    rootDir,
    userDir,
    storageStatePath: path.join(userDir, 'storage-state.json'),
    // Legacy path retained only so reset can remove metadata written by older versions.
    metaPath: path.join(userDir, 'meta.json'),
  };
}

async function loadPersistedStorageState(profileDir, userId, logger = console) {
  if (!profileDir) return undefined;

  const { storageStatePath } = getUserPersistencePaths(profileDir, userId);

  try {
    const raw = await fs.readFile(storageStatePath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (!Array.isArray(parsed.cookies)) return undefined;
    if (parsed.origins !== undefined && !Array.isArray(parsed.origins)) return undefined;
    return storageStatePath;
  } catch (err) {
    if (err?.code === 'ENOENT') return undefined;
    logger?.warn?.('failed to load persisted storage state', {
      userId: String(userId),
      storageStatePath,
      error: err?.message || String(err),
    });
    return undefined;
  }
}

async function persistStorageState({
  profileDir,
  userId,
  context,
  storageState,
  logger = console,
  indexedDB = false,
}) {
  if (!profileDir || (!context && !storageState)) {
    return { persisted: false, reason: 'disabled' };
  }

  const { userDir, storageStatePath } = getUserPersistencePaths(profileDir, userId);
  const suffix = `.tmp-${process.pid}-${Date.now()}`;
  const tmpStoragePath = `${storageStatePath}${suffix}`;

  try {
    await fs.mkdir(userDir, { recursive: true });
    if (storageState) {
      await fs.writeFile(tmpStoragePath, JSON.stringify(storageState, null, 2));
    } else {
      await context.storageState(indexedDB ? { path: tmpStoragePath, indexedDB: true } : { path: tmpStoragePath });
    }
    await fs.rename(tmpStoragePath, storageStatePath);
    return { persisted: true, userDir, storageStatePath };
  } catch (err) {
    await fs.unlink(tmpStoragePath).catch(() => {});
    logger?.warn?.('failed to persist storage state', {
      userId: String(userId),
      storageStatePath,
      error: err?.message || String(err),
    });
    return { persisted: false, reason: 'error', error: err };
  }
}

export {
  getUserPersistencePaths,
  loadPersistedStorageState,
  persistStorageState,
};
