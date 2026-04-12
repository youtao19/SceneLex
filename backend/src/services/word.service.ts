/**
 * 文件作用：
 * 单词业务逻辑层。
 * 目前先返回假数据，后面再接本地模型。
 */

export interface WordGenerateResult {
  word: string
  examples: string[]
  tips: string[]
}

/**
 * 单词业务服务。
 */
export const wordService = {
  /**
   * 根据单词生成记忆内容。
   *
   * @param word 用户输入的单词
   * @returns 结构化的例句与提示
   *
   * 注意：
   * 这里先用假数据跑通全流程，等前后端联调成功后再替换成 LLM 调用。
   */
  async generateWordContent(word: string): Promise<WordGenerateResult> {
    /**
     * 这里先做一个简单的“按输入返回示例”的版本。
     * 这样能快速验证页面和接口是否正常联通。
     */
    if (word.toLowerCase() === 'heave') {
      return {
        word,
        examples: [
          'He heaved the box onto the truck.',
          'Her chest heaved after the run.',
          'The sea heaved in the storm.'
        ],
        tips: [
          'heave box：用力抬起箱子',
          'chest heave：胸口上下起伏',
          'sea heave：海面翻涌起伏'
        ]
      }
    }

    if (word.toLowerCase() === 'optical') {
      return {
        word,
        examples: [
          'This is an optical device.',
          'The lens has an optical defect.',
          'We tested the optical system.'
        ],
        tips: [
          'optical device：光学设备',
          'optical defect：光学缺陷',
          'optical system：光学系统'
        ]
      }
    }

    /**
     * 默认返回：
     * 先保证任意单词都能看到结果，方便前端联调。
     */
    return {
      word,
      examples: [
        `This is a simple example with ${word}.`,
        `I am learning the word ${word} today.`,
        `${word} can appear in many sentences.`
      ],
      tips: [
        `${word}：先建立一个基础印象`,
        `把 ${word} 放进短句里记`,
        `多看几次 ${word} 的使用场景`
      ]
    }
  }
}