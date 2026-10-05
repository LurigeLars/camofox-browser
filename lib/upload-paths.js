import fs from 'node:fs/promises';
import path from 'node:path';

function uploadPathError(message, code) {
  return Object.assign(new Error(message), { statusCode: 400, code });
}

export async function resolveUploadPaths({ uploadsDir, filePaths }) {
  const absoluteUploadsDir = path.resolve(uploadsDir);

  let realUploadsDir;
  try {
    realUploadsDir = await fs.realpath(absoluteUploadsDir);
  } catch (err) {
    if (err?.code === 'ENOENT') {
      throw uploadPathError('Upload directory is not available', 'uploads_dir_not_found');
    }
    throw err;
  }

  return Promise.all(filePaths.map(async (filePath) => {
    if (typeof filePath !== 'string' || !filePath) {
      throw uploadPathError('path entries must be non-empty strings', 'invalid_upload_path');
    }
    if (!path.isAbsolute(filePath)) {
      throw uploadPathError('path entries must be absolute paths within the upload directory', 'invalid_upload_path');
    }

    const normalizedFilePath = path.resolve(filePath);
    const relativeFilePath = path.relative(absoluteUploadsDir, normalizedFilePath);
    if (
      relativeFilePath === ''
      || relativeFilePath === '..'
      || relativeFilePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(relativeFilePath)
    ) {
      throw uploadPathError('path resolves outside the upload directory', 'upload_path_outside_root');
    }

    // Reconstruct the filesystem path from the trusted root after containment
    // validation instead of passing the request-provided absolute path directly
    // into filesystem APIs.
    const rootedFilePath = path.resolve(absoluteUploadsDir, relativeFilePath);

    let realFilePath;
    try {
      realFilePath = await fs.realpath(rootedFilePath);
    } catch (err) {
      if (err?.code === 'ENOENT') {
        throw uploadPathError(`file not found in upload directory: ${filePath}`, 'file_not_found');
      }
      throw err;
    }

    const realRelativeFilePath = path.relative(realUploadsDir, realFilePath);
    if (
      realRelativeFilePath === ''
      || realRelativeFilePath === '..'
      || realRelativeFilePath.startsWith(`..${path.sep}`)
      || path.isAbsolute(realRelativeFilePath)
    ) {
      throw uploadPathError('path resolves outside the upload directory', 'upload_path_outside_root');
    }

    const stat = await fs.stat(realFilePath);
    if (!stat.isFile()) {
      throw uploadPathError('path must identify a file', 'invalid_upload_path');
    }
    return realFilePath;
  }));
}
