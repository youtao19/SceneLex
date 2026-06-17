import { randomUUID } from 'crypto';
import path from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import { HttpError } from '../utils/http-error';

const localAvatarDir = path.join(__dirname, '../../uploads/avatars');

interface R2AvatarConfig {
  accountId: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
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
    env.r2AccountId,
    env.r2AvatarBucket,
    env.r2AccessKeyId,
    env.r2SecretAccessKey,
    env.r2AvatarPublicBaseUrl,
  ];

  if (values.every((value) => !value)) {
    return null;
  }

  if (values.some((value) => !value)) {
    throw new HttpError(500, 'R2 头像存储配置不完整');
  }

  return {
    accountId: env.r2AccountId,
    bucket: env.r2AvatarBucket,
    accessKeyId: env.r2AccessKeyId,
    secretAccessKey: env.r2SecretAccessKey,
    publicBaseUrl: env.r2AvatarPublicBaseUrl.replace(/\/+$/, ''),
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
 * R2 使用 S3-compatible API，服务端上传能避免把写入密钥暴露给浏览器。
 */
async function saveR2Avatar(
  userId: number,
  file: Express.Multer.File,
  extension: string,
  config: R2AvatarConfig,
) {
  const objectKey = buildAvatarObjectKey(userId, extension);
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });

  await client.send(new PutObjectCommand({
    Bucket: config.bucket,
    Key: objectKey,
    Body: file.buffer,
    ContentType: file.mimetype,
    CacheControl: 'public, max-age=31536000, immutable',
  }));

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
