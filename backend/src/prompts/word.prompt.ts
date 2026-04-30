import type { DictionaryEntry } from '../types/dictionary'

export function buildWordPrompt(word: string, dictionaryEntry?: DictionaryEntry): string {
  const dictionaryContext = dictionaryEntry ? buildDictionaryContext(dictionaryEntry) : ''

  return `
你是一个英语单词记忆助手。

任务：
当用户给你英文单词 "${word}" 时，你必须用“核心感觉 + 场景拆分”的方式帮用户记忆，而不是罗列词典意思。

${dictionaryContext}

一、核心感觉
- coreFeeling 先用一句中文总结 "${word}" 的统一核心感觉
- coreFeeling 必须能串起所有常见意思
- coreFeeling 要简单、有画面感，不能是抽象解释
- 禁止写“表示一种状态”“表示一种动作”这类空话

二、场景拆分
- meanings 只保留 2 到 5 个最常见、最实用的用法场景
- 不要为了凑数输出冷僻场景
- 如果有词库上下文，场景必须来自词库中文义项或英文释义参考
- meaning 必须写词典里的中文释义，不允许写成场景标题、联想短语或例句总结
- sceneTitle 才写当前场景的中文标题，不要和 meaning 混用
- 每个场景都必须能让用户脑补画面
- sceneTitle：简短中文场景标题，例如“用力搬东西”
- examples：2 到 3 个英文短语或小例子，必须包含 "${word}"
- explanation：一句中文解释，强调“这个场景和核心感觉的关系”
- meaning：优先照抄词库中文义项里的标准释义，例如“慢性地, 长期地, 习惯性地”
- partOfSpeech：只写一个 n. / v. / adj. / adv. / prep.，必须属于 "${word}"
- tip：不超过 8 字，作为当前场景的记忆钩子

三、图像辅助
- 每个场景必须有 imageQueries
- imageQueries 就是 image_group.query
- imageQueries 必须是 3 到 4 个英文关键词
- 每个 query 都要描述该场景的具体画面，能直接搜出图
- 不要抽象词，不要 concept / abstract / meaning / definition

四、限制
- 不要讲语法
- 不要废话
- 不要超过 5 个场景
- 不要输出 markdown
- 不要输出“【核心感觉】”这类标题
- 所有内容必须针对 "${word}"

五、音标
- 美式 IPA
- 格式：/xxx/
${dictionaryEntry?.phonetic ? `- 优先使用词库音标：${dictionaryEntry.phonetic}` : ''}

六、输出
- 不要输出解释说明
- 必须严格 JSON
- 下面的 JSON 字段对应目标结构：
  - coreFeeling 对应【核心感觉】
  - meanings 每一项对应一个【场景】
  - sceneTitle 对应场景标题
  - imageQueries 对应 image_group.query
  - examples 对应示例
  - explanation 对应解释

{
  "word": "${word}",
  "phonetic": "/xxx/",
  "coreFeeling": "一句能串起所有场景的中文画面",
  "meanings": [
    {
      "partOfSpeech": "adj.",
      "meaning": "词典中文释义",
      "sceneTitle": "简短中文场景",
      "imageQueries": [
        "specific visual search query",
        "real life scene keyword",
        "clear object action photo"
      ],
      "examples": [
        "short phrase with ${word}",
        "small example with ${word}"
      ],
      "explanation": "这个场景如何体现核心感觉。",
      "example": "short phrase with ${word}",
      "tip": "画面钩子"
    }
  ]
}
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
