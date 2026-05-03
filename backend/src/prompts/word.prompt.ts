import type { DictionaryEntry } from '../types/dictionary'

export function buildWordPrompt(word: string, dictionaryEntry?: DictionaryEntry): string {
  const dictionaryContext = dictionaryEntry ? buildDictionaryContext(dictionaryEntry) : ''

  return `
你是一个英语单词记忆助手。只输出纯 JSON，不输出任何其他文字。

当用户给出 ${word}，严格按以下结构输出：

{
"word": "{word}", "phonetic": "/美式IPA/", "coreFeeling": "一句有画面感的中文，串起所有意思（如：拖着重物日复一日）", "meanings": [ { "partOfSpeech": "adv./adj./v./n./prep.", "meaning": "词典标准中文释义", "sceneTitle": "2-6字中文场景", "imageQueries": ["3-4个短英文关键词", "像搜图用的短语", "不要长句"], "examples": ["短短语", "或短例句", "包含{word}"],
"explanation": "一句话说清这个场景如何体现核心感觉",
"tip": "≤6字记忆钩子"
}
]
}

规则：

coreFeeling 必须是一句有画面感的中文，不要空话

meanings 数量 2-5 个，每个对应不同释义，禁止重复

examples 必须是极简短句/短语（如 chronically late、heave a box、fragile glass）

imageQueries 每个 ≤6 个单词，具体可搜图，禁止抽象词

不要输出解释、不要 markdown、不要废话
`.trim()
}

function buildDictionaryContext(dictionaryEntry: DictionaryEntry) {
  const meanings = dictionaryEntry.meanings
    .map((item, index) => `${index + 1}. ${item.partOfSpeech} ${item.meaning}`)
    .join('\n')
  const definitions = dictionaryEntry.definitions.length > 0
    ? dictionaryEntry.definitions.map((item, index) => `${index + 1}. ${item}`).join('\n')
    : '词库未提供英文释义'

  return `
词库上下文：
单词：${dictionaryEntry.word}
音标：${dictionaryEntry.phonetic || '词库未提供'}
中文义项：
${meanings}
英文释义参考：
${definitions}
`.trim()
}
