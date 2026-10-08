import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { extractTextFromImage } from './llm.service'
import { HttpError } from '../utils/http-error'
import type { AiEndpoint } from '../types/endpoint'

const execFileAsync = promisify(execFile)
const DEFAULT_VISION_OCR_TIMEOUT = 180_000

export type OcrMethod = 'tesseract' | 'paddle' | 'vision'

interface PaddleOcrResponse {
  text?: string
}

const extensionByMimeType: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp'
}

function cleanExtractedText(text: string) {
  return text
    .trim()
    .replace(/^```(?:text)?/i, '')
    .replace(/```$/i, '')
    .trim()
}

function hasReadableEnglish(text: string) {
  return /[A-Za-z]{3,}/.test(text)
}

function getUploadExtension(file: Express.Multer.File) {
  return extensionByMimeType[file.mimetype] ?? (path.extname(file.originalname) || '.png')
}

function buildArticleOcrPrompt() {
  return `Extract all English article text from this image exactly as it appears.

Rules:
- Output only the extracted English text.
- Preserve paragraph breaks when visible.
- Do not translate.
- Do not summarize.
- Do not add explanations.
- If there is no readable English text, output an empty string.`
}

/**
 * 视觉 OCR 比普通生词生成慢，独立超时避免被模型默认超时误伤。
 */
function readVisionOcrTimeout() {
  return Number(process.env.OCR_TIMEOUT ?? DEFAULT_VISION_OCR_TIMEOUT)
}

/**
 * PaddleOCR 是独立 HTTP 服务，超时单独配置方便和本地模型区分。
 */
function readPaddleOcrTimeout() {
  return Number(process.env.PADDLE_OCR_TIMEOUT ?? 60_000)
}

/**
 * Node fetch 的超时错误名随运行时有差异，这里统一成用户能看懂的 OCR 错误。
 */
function isTimeoutError(error: unknown) {
  return error instanceof Error
    && (error.name === 'TimeoutError'
      || error.name === 'AbortError'
      || error.message.toLowerCase().includes('timeout'))
}

/**
 * multipart 里的字段可能被浏览器或调试工具传成异常值，这里收敛成后端支持的识别方式。
 */
function parseOcrMethod(value: unknown): OcrMethod {
  if (value === 'tesseract' || value === 'paddle' || value === 'vision') {
    return value
  }

  return 'tesseract'
}

/**
 * Tesseract 对清晰英文文章截图更快，先用它避免本地多模态模型长时间阻塞。
 */
async function extractWithTesseract(file: Express.Multer.File) {
  const tempPath = path.join(os.tmpdir(), `scenelex-ocr-${randomUUID()}${getUploadExtension(file)}`)

  try {
    await fs.writeFile(tempPath, file.buffer)

    const { stdout } = await execFileAsync(
      'tesseract',
      [tempPath, 'stdout', '-l', 'eng', '--psm', '6'],
      {
        timeout: Number(process.env.TESSERACT_OCR_TIMEOUT ?? 30_000),
        maxBuffer: 1024 * 1024 * 2
      },
    )

    return cleanExtractedText(stdout)
  } finally {
    await fs.rm(tempPath, { force: true })
  }
}

/**
 * 多模态识别走用户自己的端点，图片用 base64 发送。
 * 以前这里按 OCR_VISION_PROVIDER 分 ollama / kimi 两条路，现在只剩一条。
 */
async function extractWithVisionEndpoint(file: Express.Multer.File, endpoint: AiEndpoint | null) {
  if (!endpoint) {
    throw new HttpError(400, '没有可用于 OCR 的端点，请给某个端点填写视觉模型')
  }

  const timeout = readVisionOcrTimeout()

  try {
    return await extractTextFromImage(
      endpoint,
      buildArticleOcrPrompt(),
      file.buffer.toString('base64'),
      file.mimetype,
    )
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new HttpError(
        504,
        `多模态 OCR 超时（${Math.round(timeout / 1000)} 秒）。可以调大 OCR_TIMEOUT 或换更小的视觉模型。`,
      )
    }

    throw error
  }
}

/**
 * PaddleOCR 服务独立运行，Node 只转发图片，避免业务后端直接加载 Python 模型。
 */
async function extractWithPaddleOcr(file: Express.Multer.File) {
  const serviceUrl = process.env.OCR_SERVICE_URL ?? 'http://127.0.0.1:8001/ocr'
  const timeout = readPaddleOcrTimeout()
  const form = new FormData()
  const imageBytes = new Uint8Array(file.buffer.length)

  imageBytes.set(file.buffer)
  form.append('file', new Blob([imageBytes], { type: file.mimetype }), file.originalname || 'image.png')

  let response: Response

  try {
    response = await fetch(serviceUrl, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(timeout)
    })
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new HttpError(504, `PaddleOCR 服务超时（${Math.round(timeout / 1000)} 秒）。请确认 ocr-service 已启动，或调大 PADDLE_OCR_TIMEOUT。`)
    }

    throw error
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`PaddleOCR 服务调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as PaddleOcrResponse

  return cleanExtractedText(data.text ?? '')
}

/**
 * 阅读页按用户选择调用单一识别引擎，失败原因能更直接地反馈给用户。
 */
export async function extractArticleTextFromImage(
  file: Express.Multer.File | undefined,
  methodValue: unknown,
  visionEndpoint: AiEndpoint | null,
) {
  if (!file) {
    throw new HttpError(400, '请上传需要识别的图片')
  }

  const method = parseOcrMethod(methodValue)

  if (method === 'vision') {
    return extractWithVisionEndpoint(file, visionEndpoint)
  }

  if (method === 'paddle') {
    return extractWithPaddleOcr(file)
  }

  return extractWithTesseract(file)
}
