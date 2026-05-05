import type { DictionaryEntry } from '../types/dictionary'
import type { WordRequiredMeaning } from '../types/word'
import { buildWordOutputRequirement } from './word-output.prompt'

/**
 * 单词生成 prompt 由可调教学提示词和固定输出契约组成，避免调文案时误改 JSON 协议。
 */
export function buildWordPrompt(
  word: string,
  dictionaryEntry?: DictionaryEntry,
  requiredMeanings: WordRequiredMeaning[] = [],
): string {
  return [
    buildWordInstructionPrompt(word, dictionaryEntry, requiredMeanings),
    buildWordOutputRequirement(word),
  ].join('\n\n')
}

/**
 * 教学提示词只管内容质量和生成策略，不直接描述 JSON 字段结构。
 */
function buildWordInstructionPrompt(
  word: string,
  dictionaryEntry?: DictionaryEntry,
  requiredMeanings: WordRequiredMeaning[] = [],
): string {
  const dictionaryContext = dictionaryEntry ? buildDictionaryContext(dictionaryEntry) : ''
  const requiredContext = requiredMeanings.length > 0
    ? buildRequiredMeaningContext(requiredMeanings)
    : ''

  return `
你是一个英语单词记忆助手。

当用户给出 ${word}，请生成适合记忆的单词卡内容。

${dictionaryContext}

${requiredContext}

规则：

如果有考试要求义项，必须只围绕这些义项生成 meanings，并保持同样顺序；不要补充考试范围外的主要义项

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
`.trim()
}

/**
 * 考试词书传入的义项是硬约束，模型只能围绕这些义项写场景。
 */
function buildRequiredMeaningContext(requiredMeanings: WordRequiredMeaning[]) {
  const meanings = requiredMeanings
    .map((item) => `${item.priority}. ${item.partOfSpeech} ${item.meaning}`)
    .join('\n')

  return `
考试要求义项：
${meanings}
`.trim()
}

/**
 * 词库上下文给模型事实边界，减少它另造义项。
 */
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
