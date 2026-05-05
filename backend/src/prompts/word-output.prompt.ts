// 输出契约是前后端数据协议，调试教学提示词时不要改这里。
export const wordJsonSystemPrompt = 'You are a JSON API. Return only valid JSON. Do not include reasoning, markdown, or explanations.'

export const wordJsonFormat = {
  type: 'object',
  properties: {
    word: { type: 'string' },
    phonetic: { type: 'string' },
    coreFeeling: { type: 'string' },
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
  required: ['word', 'phonetic', 'coreFeeling', 'meanings'],
}

/**
 * 固定输出要求只描述 JSON 契约，方便单独调整上游教学提示词。
 */
export function buildWordOutputRequirement(word: string) {
  return `
输出要求（固定）：
只输出一个纯 JSON object，不输出解释、markdown、代码块或多余文字。

JSON 必须符合以下结构：

{
  "word": "${word}",
  "phonetic": "/美式IPA/",
  "coreFeeling": "一句有画面感的中文，串起所有意思",
  "meanings": [
    {
      "partOfSpeech": "adv./adj./v./n./prep.",
      "meaning": "极短中文释义，2-8字，不能和其他 meaning 重复",
      "sceneTitle": "2-6字中文场景",
      "imageQueries": ["3-4个短英文关键词", "像搜图用的短语", "不要长句"],
      "examples": ["极简场景短语", "3-7个英文词", "必须包含${word}"],
      "explanation": "一句话说明这个短语画面如何体现该义项",
      "tip": "8-14字中文画面钩子"
    }
  ]
}

字段硬性要求：
- word 必须是 "${word}"
- phonetic 写美式 IPA；不知道时输出空字符串
- meanings 数量 1-5 个
- examples 输出 2 条；每条 3-7 个英文词，必须包含 "${word}"
- imageQueries 输出 3 条；每条不超过 6 个英文单词
- explanation 不超过 30 个中文字符
`.trim()
}
