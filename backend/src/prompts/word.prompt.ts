import type { DictionaryEntry } from '../types/dictionary'

export function buildWordPrompt(word: string, dictionaryEntry?: DictionaryEntry): string {
  const dictionaryContext = dictionaryEntry ? buildDictionaryContext(dictionaryEntry) : ''

  return `
你是一个英语单词记忆助手。只输出纯 JSON，不输出任何其他文字。

当用户给出 ${word}，严格按以下结构输出：

{
"word": "${word}", "phonetic": "/美式IPA/", "coreFeeling": "一句有画面感的中文，串起所有意思（如：拖着重物日复一日）", "meanings": [ { "partOfSpeech": "adv./adj./v./n./prep.", "meaning": "极短中文释义，2-8字，不能和其他 meaning 重复", "sceneTitle": "2-6字中文场景", "imageQueries": ["3-4个短英文关键词", "像搜图用的短语", "不要长句"], "examples": ["极简场景短语", "3-7个英文词", "必须包含${word}"],
"explanation": "一句话说明这个短语画面如何体现该义项",
"tip": "8-14字中文画面钩子"
}
]
}

${dictionaryContext}

规则：

如果有词库上下文，必须优先按词库的中文义项和英文释义生成场景；不要自己另造主要义项

coreFeeling 必须是一句有画面感的中文，不要空话

meanings 数量按常用义项决定，1-5 个；每个对应不同词性或不同使用场景，禁止重复同一个中文释义

如果词库只给了一个宽泛义项，那么只需要一个场景；不要把同一句中文释义复制多次

meaning 只写词典式短释义，不写“体现……”“用于……”这类描述性句子

examples 必须是自然的极短场景短语，不写解释，不要为了套模板造语法怪短语

不同词性按这些模板写 examples：
- 动词：${word} the door、${word} into the room
- 形容词：a ${word} cup、the ${word} road
- 副词：arrive ${word}、speak ${word}
- 名词：a ${word} on the desk、the ${word} in rain

examples 输出 2 条；每条 3-7 个英文词，必须包含 ${word}

imageQueries 输出 3 条；每个 ≤6 个单词，具体可搜图，禁止抽象词

explanation 只写一句短中文，不超过 30 字

tip 写成短中文画面，不要只写抽象同义词

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
