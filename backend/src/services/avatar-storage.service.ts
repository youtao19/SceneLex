import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

const localAvatarDir = path.join(__dirname, '../../uploads/avatars');

interface R2AvatarConfig {
  publicBaseUrl: string;
  uploadUrl: string;
  uploadToken: string;
}

/**
 * 头像只允许已通过 multer 白名单的图片类型，扩展名由 MIME 推导，避免信任原始文件名。
 */
function getAvatarExtension(mimetype: string) {
  if (mimetype === 'image/jpeg') return '.jpg';
  if (mimetype === 'image/png') return '.png';
  if (mimetype === 'image/webp') return '.webp';
  throw new HttpError(400, '仅支持 JPG, PNG, WEBP 格式的图片');
}

/**
 * R2 配置必须要么完整启用，要么完全缺省回退本地，避免生产半配置后静默丢文件。
 */
function readR2AvatarConfig(): R2AvatarConfig | null {
  const values = [
    env.r2AvatarPublicBaseUrl,
    env.r2AvatarUploadUrl,
    env.r2AvatarUploadToken,
  ];

  if (values.every((value) => !value)) {
    return null;
  }

  if (values.some((value) => !value)) {
    throw new HttpError(500, 'R2 头像存储配置不完整');
  }

  return {
    publicBaseUrl: env.r2AvatarPublicBaseUrl.replace(/\/+$/, ''),
    uploadUrl: env.r2AvatarUploadUrl,
    uploadToken: env.r2AvatarUploadToken,
  };
}

/**
 * 头像对象按用户分目录，后续清理旧头像或排查单个用户文件时更直接。
 */
function buildAvatarObjectKey(userId: number, extension: string) {
  return `avatars/users/${userId}/avatar-${randomUUID()}${extension}`;
}

/**
 * 本地保存仍保留，方便开发环境和 R2 未开通时继续上传头像。
 */
async function saveLocalAvatar(file: Express.Multer.File, extension: string) {
  await mkdir(localAvatarDir, { recursive: true });
  const filename = `avatar-${randomUUID()}${extension}`;
  await writeFile(path.join(localAvatarDir, filename), file.buffer);
  return `/uploads/avatars/${filename}`;
}

/**
 * Node Buffer 的底层内存可能被共享，复制成精确长度的 ArrayBuffer 再交给 fetch。
 */
function copyBufferToArrayBuffer(buffer: Buffer) {
  const body = new ArrayBuffer(buffer.byteLength);
  new Uint8Array(body).set(buffer);
  return body;
}

/**
 * R2 写入由 Worker 持有 bucket binding，后端只需要短口令调用上传入口。
 */
async function saveR2Avatar(
  userId: number,
  file: Express.Multer.File,
  extension: string,
  config: R2AvatarConfig,
) {
  const objectKey = buildAvatarObjectKey(userId, extension);
  const body = copyBufferToArrayBuffer(file.buffer);
  let response: Response;

  try {
    response = await fetch(config.uploadUrl, {
      method: 'POST',
      headers: {
        'content-type': file.mimetype,
        'content-length': String(file.buffer.length),
        'x-scenelex-upload-token': config.uploadToken,
        'x-scenelex-object-key': objectKey,
      },
      body,
    });
  } catch {
    throw new HttpError(502, '头像上传到 R2 失败');
  }

  if (!response.ok) {
    throw new HttpError(502, '头像上传到 R2 失败');
  }

  return `${config.publicBaseUrl}/${objectKey}`;
}

/**
 * 保存头像并返回前端可直接渲染的 URL。
 */
export async function uploadAvatarFile(userId: number, file: Express.Multer.File) {
  const extension = getAvatarExtension(file.mimetype);
  const r2Config = readR2AvatarConfig();

  if (!r2Config) {
    return saveLocalAvatar(file, extension);
  }

  return saveR2Avatar(userId, file, extension, r2Config);
}
