import { randomUUID } from 'node:crypto';
import multer from 'multer';
import { OCR_LIMITS } from '../utils/ocr-rules';
import { ensureOcrTempDirs, getOcrIncomingDir } from '../services/ocr-storage.service';

export const uploadAvatarMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 限制 2MB
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG, PNG, WEBP 格式的图片'));
    }
  },
});

export const uploadOcrImageMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('仅支持 JPG, PNG, WEBP 格式的图片'));
    }
  },
});

/**
 * 多页 OCR 逐页上传：直接落到后端私有临时目录，避免 20 MB 原图在内存里再多存一份。
 * 这里只限大小，真实类型由服务端读文件头判断（客户端 MIME 不算安全依据）。
 */
export const uploadOcrPageMiddleware = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureOcrTempDirs()
        .then(() => cb(null, getOcrIncomingDir()))
        .catch((error) => cb(error as Error, getOcrIncomingDir()));
    },
    filename: (_req, _file, cb) => cb(null, `upload-${randomUUID()}`),
  }),
  limits: {
    fileSize: OCR_LIMITS.maxPageBytes,
    files: 1,
  },
});
