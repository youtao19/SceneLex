/**
 * 使用浏览器内置语音能力，避免为了简单朗读引入后端音频生成和缓存。
 */
export function speakEnglishText(text: string) {
  const cleanText = text.trim();

  if (!cleanText || !window.speechSynthesis) {
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.lang = 'en-US';
  utterance.rate = 0.85;

  window.speechSynthesis.speak(utterance);
}
