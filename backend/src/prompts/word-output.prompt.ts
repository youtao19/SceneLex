// 输出契约是前后端数据协议，调试教学提示词时不要改这里。
export const wordJsonSystemPrompt = 'You are a JSON API. Return only valid JSON. Do not include reasoning, markdown, or explanations.'

export const wordJsonFormat = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    phonetic: { type: 'string' },
    meanings: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        properties: {
          partOfSpeech: { type: 'string' },
          meaning: { type: 'string' },
          sceneTitle: { type: 'string' },
          examples: {
            type: 'array',
            minItems: 2,
            maxItems: 3,
            items: { type: 'string' },
          },
          explanation: { type: 'string' },
          imageQueries: {
            type: 'array',
            minItems: 3,
            maxItems: 4,
            items: { type: 'string' },
          },
          tip: { type: 'string' },
        },
        required: ['partOfSpeech', 'meaning', 'sceneTitle', 'examples', 'explanation', 'imageQueries', 'tip'],
      },
    },
  },
  required: ['word', 'phonetic', 'meanings'],
}

/**
 * 固定输出要求只描述 JSON 契约，方便单独调整上游教学提示词。
 */
export function buildWordOutputRequirement(word: string) {
  return `
# Output Contract
Return one valid JSON object only.
Do not return markdown, code fences, comments, reasoning, or extra text.

# JSON Shape

{
  "word": "${word}",
  "phonetic": "/美式IPA/",
  "meanings": [
    {
      "partOfSpeech": "adv./adj./v./n./prep.",
      "meaning": "极短中文释义，2-8字，不能和其他 meaning 重复",
      "sceneTitle": "2-6字中文场景",
      "imageQueries": ["3-4个短英文关键词", "像搜图用的短语", "不要长句"],
      "examples": ["2-5词英文短语", "必须用原词${word}", "不要完整句子"],
      "explanation": "一句话说明这个短语画面如何体现该义项",
      "tip": "按顺序翻译 examples，用中文分号分隔"
    }
  ]
}

# Hard Requirements
- word 必须是 "${word}"
- phonetic 写美式 IPA；不知道时输出空字符串
- meanings 数量 1-5 个
- examples 输出 2 条；每条 2-5 个英文词，必须包含原词 "${word}"，不要使用变形
- examples 只写能理解意思的短语，不写完整句子，不用 I/she/he/they/please 等句子框架
- imageQueries 输出 3 条；每条不超过 6 个英文单词
- explanation 不超过 30 个中文字符
- tip 只翻译 examples，不写联想、比喻或记忆钩子
`.trim()
}
