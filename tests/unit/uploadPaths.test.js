import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, test } from '@jest/globals';
import { resolveUploadPaths } from '../../lib/upload-paths.js';

describe('resolveUploadPaths', () => {
  test('allows files and symlinks that resolve inside the upload directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-uploads-'));
    try {
      const nested = path.join(root, 'nested');
      const file = path.join(nested, 'file.txt');
      await fs.mkdir(nested);
      await fs.writeFile(file, 'ok');
      await fs.symlink(file, path.join(root, 'link.txt'));
      const realFile = await fs.realpath(file);
      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [file, path.join(root, 'link.txt')] }))
        .resolves.toEqual([realFile, realFile]);
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('rejects traversal and symlinks outside the upload directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-uploads-'));
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-outside-'));
    try {
      const outsideFile = path.join(outside, 'secret.txt');
      await fs.writeFile(outsideFile, 'secret');
      await fs.symlink(outsideFile, path.join(root, 'escape.txt'));
      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [outsideFile] }))
        .rejects.toMatchObject({ code: 'upload_path_outside_root' });
      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [path.join(outside, 'missing.txt')] }))
        .rejects.toMatchObject({ code: 'upload_path_outside_root' });
      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [path.join(root, 'escape.txt')] }))
        .rejects.toMatchObject({ code: 'upload_path_outside_root' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(outside, { recursive: true, force: true });
    }
  });
  test('rejects absolute paths that only share the upload-directory prefix', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-uploads-'));
    const sibling = `${root}-outside`;
    try {
      await fs.mkdir(sibling);
      const siblingFile = path.join(sibling, 'secret.txt');
      await fs.writeFile(siblingFile, 'secret');

      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [siblingFile] }))
        .rejects.toMatchObject({ code: 'upload_path_outside_root' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(sibling, { recursive: true, force: true });
    }
  });

  test('rejects empty, relative, and non-regular file paths', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'camofox-uploads-'));
    try {
      const directory = path.join(root, 'directory');
      await fs.mkdir(directory);

      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [''] }))
        .rejects.toMatchObject({ code: 'invalid_upload_path' });
      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: ['relative.txt'] }))
        .rejects.toMatchObject({ code: 'invalid_upload_path' });
      await expect(resolveUploadPaths({ uploadsDir: root, filePaths: [directory] }))
        .rejects.toMatchObject({ code: 'invalid_upload_path' });
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });

  test('rejects an unavailable upload directory', async () => {
    await expect(resolveUploadPaths({
      uploadsDir: path.join(os.tmpdir(), 'camofox-missing-uploads-directory'),
      filePaths: [],
    })).rejects.toMatchObject({ code: 'uploads_dir_not_found' });
  });
});
