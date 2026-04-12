import { WORD_PROMPT_TEMPLATE } from '../prompts/word.prompt';

export function generateWordPrompt(word: string) {
  return WORD_PROMPT_TEMPLATE.replace('{{word}}', word);
}

