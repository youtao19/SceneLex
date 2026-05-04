import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { aiConfig } from '../config/ai'
import { HttpError } from '../utils/http-error'

const execFileAsync = promisify(execFile)
const DEFAULT_VISION_OCR_TIMEOUT = 180_000

interface OllamaVisionResponse {
  response?: string
  thinking?: string
}

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
 * 视觉 OCR 比普通生词生成慢，独立超时避免被 OLLAMA_TIMEOUT 误伤。
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
 * 多模态模型适合复杂截图，但比 Tesseract 慢，所以只在用户主动选择时调用。
 */
async function extractWithOllamaVision(file: Express.Multer.File) {
  const model = process.env.OCR_MODEL || 'gemma4:e4b'
  const timeout = readVisionOcrTimeout()
  let response: Response

  try {
    response = await fetch(`${aiConfig.ollama.baseURL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model,
        prompt: buildArticleOcrPrompt(),
        images: [file.buffer.toString('base64')],
        stream: false,
        keep_alive: '10m',
        options: {
          temperature: 0,
          num_predict: 1400
        }
      }),
      signal: AbortSignal.timeout(timeout)
    })
  } catch (error) {
    if (isTimeoutError(error)) {
      throw new HttpError(504, `多模态 OCR 超时（${Math.round(timeout / 1000)} 秒）。模型仍可能可用，请调大 OCR_TIMEOUT 或换更小的 OCR_MODEL。`)
    }

    throw error
  }

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`OCR 模型调用失败：${response.status} ${errorText}`)
  }

  const data = (await response.json()) as OllamaVisionResponse
  const text = data.response || data.thinking || ''

  return cleanExtractedText(text)
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
export async function extractArticleTextFromImage(file?: Express.Multer.File, methodValue?: unknown) {
  if (!file) {
    throw new HttpError(400, '请上传需要识别的图片')
  }

  const method = parseOcrMethod(methodValue)
  const text = await (async () => {
    if (method === 'vision') {
      return extractWithOllamaVision(file)
    }

    if (method === 'paddle') {
      return extractWithPaddleOcr(file)
    }

    return extractWithTesseract(file)
  })()

  if (!hasReadableEnglish(text)) {
    return text
  }

  return text
}
