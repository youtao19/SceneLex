import type { DictionaryEntry } from '../types/dictionary'

/**
 * 让模型优先输出“义项 + 典型短语化场景”，而不是松散的完整例句。
 */
export function buildWordPrompt(word: string, dictionaryEntry?: DictionaryEntry): string {
  if (dictionaryEntry) {
    return buildDictionaryWordPrompt(word, dictionaryEntry)
  }

  return `
你是一个英语单词记忆助手。

任务：
围绕单词 "${word}"，按英语六级里常见、常考的意思生成记忆材料。

要求：
1. 先判断单词 "${word}" 在英语六级中的高频常用义项，再决定输出几组内容
2. 只输出 "${word}" 的高频、常用、容易混淆或值得记的义项，不要硬编冷僻义项
4. 每组都必须包含：
   - partOfSpeech：词性，使用标准缩写，例如 n., v., adj., adv.
   - meaning：该义项的标准中文释义，要像词典里的常见义项，短、准、规范
   - example：必须包含单词 "${word}" 的典型、好记的英文短语或短场景
   - tip：与 example 对应的中文联想短语，帮助用户立刻形成画面感或动作感
5. partOfSpeech 必须符合这些要求：
   - 只写最贴切的一个词性
   - 使用标准英语词性缩写，例如 n., v., adj., adv., prep.
   - 词性必须属于单词 "${word}" 本身，不能因为 example 里出现动作词就把 "${word}" 标成动词
   - 例如 "give instruction" 里的动词是 give，instruction 仍然是 n.
6. meaning 必须符合这些要求：
   - 尽量用标准义项表达，不要写成解释句或长描述
   - 控制在 2 到 8 个字，不要啰嗦
7. example 尽量写包含 "${word}" 的短语化表达（如动宾搭配、主谓搭配、简短场景等），而不是冗长的完整句子。
8. example 要短、准、常见，一眼就能看出 "${word}" 在真实场景里怎么用；不要堆砌生词。
9. tip 不要只是翻译 example；要变成脑中能看到的画面、动作、人物或场景。
10. tip 必须非常短，像联想标签，不要写完整句，最好控制在 4 到 12 个字。
11. phonetic 必须输出美式 IPA 音标，包含前后斜杠，例如 /rɪˈzɪliənt/；如果是短语，只输出核心单词的音标。
12. 不要输出任何解释说明，不要输出多余文字。
13. 必须严格按照下面的 JSON 格式返回，并且所有内容必须完全针对单词 "${word}"！
14. 不要出现重复义项；如果有多个义项，必须保证它们之间的意思不重复。

返回格式样例：
{
  "word": "${word}",
  "phonetic": "/${word} 的美式 IPA 音标/",
  "meanings": [
    {
      "partOfSpeech": "n.",
      "meaning": "${word}的具体中文意思",
      "example": "包含 ${word} 的简短英文场景",
      "tip": "简短的中文画面感联想"
    }
  ]
}
`.trim()
}

/**
 * 词库已经给出事实字段，模型只负责补充场景，避免词性和释义再次漂移。
 */
function buildDictionaryWordPrompt(word: string, dictionaryEntry: DictionaryEntry): string {
  const meanings = dictionaryEntry.meanings
    .map((item, index) => `${index + 1}. ${item.partOfSpeech} ${item.meaning}`)
    .join('\n')

  return `
你是一个英语单词记忆助手。

任务：
根据下面词库给出的单词、音标、词性和中文释义，为每个义项生成好记的英文短场景和中文画面联想。

单词：${word}
音标：${dictionaryEntry.phonetic || '词库未提供'}
词库义项：
${meanings}

要求：
1. 你不能新增、删除、合并或改写词库义项
2. partOfSpeech 必须逐条照抄词库义项里的词性
3. meaning 必须逐条照抄词库义项里的中文释义
4. meanings 数量和顺序必须与词库义项完全一致
5. example 必须包含单词 "${word}"，写成短语或很短的真实场景，不要冗长
6. tip 要对应 example 的画面、动作或人物，不要只是翻译 meaning
7. tip 必须非常短，最好控制在 4 到 12 个字
8. phonetic 使用词库音标；如果词库未提供，再输出美式 IPA 音标
9. 不要输出解释说明，不要输出多余文字
10. 必须严格按照下面的 JSON 格式返回

返回格式样例：
{
  "word": "${word}",
  "phonetic": "${dictionaryEntry.phonetic || `/${word} 的美式 IPA 音标/`}",
  "meanings": [
    {
      "partOfSpeech": "${dictionaryEntry.meanings[0]?.partOfSpeech ?? 'n.'}",
      "meaning": "${dictionaryEntry.meanings[0]?.meaning ?? '中文释义'}",
      "example": "包含 ${word} 的简短英文场景",
      "tip": "简短的中文画面感联想"
    }
  ]
}
`.trim()
}
