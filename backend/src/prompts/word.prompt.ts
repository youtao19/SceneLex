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
  const contextSections = [
    dictionaryEntry ? buildDictionaryContext(dictionaryEntry) : '',
    requiredMeanings.length > 0 ? buildRequiredMeaningContext(requiredMeanings) : '',
  ].filter(Boolean)

  return `
# Role
You are an English vocabulary card writer for Chinese learners.

# Task
Create a memorable word card for "${word}".

# Context
${contextSections.length > 0 ? contextSections.join('\n\n') : 'No external dictionary context was provided.'}

# Meaning Selection
- If "考试要求义项" is provided, generate meanings only for those meanings and keep the same order.
- Otherwise, use common learner-relevant meanings, preferably grounded in "词库上下文" when it exists.
- Generate 1-5 meanings. Each meaning must represent a distinct part of speech or usage scene.
- Do not repeat the same Chinese meaning with small wording changes.

# Content Rules
- meaning: short dictionary-style Chinese gloss, 2-8 characters when possible.
- sceneTitle: short Chinese scene label, 2-6 characters.
- examples: exactly 2 understandable phrase fragments; each has 2-5 English words and uses the exact word "${word}" without inflection.
- explanation: one short Chinese sentence, no more than 30 Chinese characters.
- imageQueries: exactly 3 concrete English image-search phrases; each has no more than 6 words.
- tip: translate the English example phrases into Chinese in the same order, separated by "；". Do not write metaphors, analogies, or memory hooks.

# Example Style
- Verb: "${word} the data", "${word} a map"
- Adjective: "a ${word} cup", "the ${word} road"
- Adverb: "move ${word}", "speak ${word}"
- Noun: "a ${word} at home", "the ${word} in rain"

# Quality Bar
- Use simple, common words. Prefer concrete nouns such as data, map, road, cup, room, book, food, rain, work.
- Use phrase fragments, not complete sentences. Avoid subjects such as I, she, he, they, people.
- Avoid polite or classroom sentence frames such as "please", "I need to", "can you", and "every sentence".
- Avoid grammar-broken phrases just to force the target word into an example.
- Avoid filler such as "体现..." or "用于..." in meaning.
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
