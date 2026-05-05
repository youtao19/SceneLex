<template>
  <div class="reading-page">
    <main class="reading-shell">
      <section v-if="mode === 'input'" class="reader-input-card surface-card">
        <div class="reader-input-head">
          <p class="card-label">Reading Lab</p>
          <h2>粘贴英语文章</h2>
          <span>逐词查义、逐句翻译，适合短文精读。</span>
        </div>

        <textarea
          v-model="sourceText"
          class="article-input"
          placeholder="在这里粘贴你要阅读的英文文章..."
          @keydown.meta.enter.prevent="startReading"
          @keydown.ctrl.enter.prevent="startReading"
        ></textarea>

        <p v-if="errorMessage" class="reader-error" role="alert">{{ errorMessage }}</p>

        <div class="reader-input-actions">
          <span>{{ sourceText.trim().length }} characters</span>
          <div class="reader-action-buttons">
            <div class="ocr-method-toggle" aria-label="图片识别方式">
              <button
                v-for="method in ocrMethods"
                :key="method.value"
                type="button"
                :class="{ 'is-active': ocrMethod === method.value }"
                :disabled="ocrLoading"
                @click="ocrMethod = method.value"
              >
                {{ method.label }}
              </button>
            </div>
            <input
              ref="imageInputRef"
              class="image-input"
              type="file"
              accept="image/png,image/jpeg,image/webp"
              @change="handleImageUpload"
            />
            <button
              class="peach-button-secondary"
              type="button"
              :disabled="ocrLoading"
              @click="openImagePicker"
            >
              {{ ocrLoading ? '识别中...' : '上传图片识别' }}
            </button>
            <button class="peach-button" type="button" :disabled="ocrLoading || saveLoading" @click="startReading">
              {{ saveLoading ? '保存中...' : '开始阅读' }}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>

        <section class="reading-history">
          <div class="history-head">
            <div>
              <p class="card-label">History</p>
              <h3>最近阅读</h3>
            </div>
            <button class="history-refresh" type="button" :disabled="historyLoading" @click="loadReadingHistory">
              {{ historyLoading ? '读取中' : '刷新' }}
            </button>
          </div>

          <div v-if="historyLoading && historyArticles.length === 0" class="history-state">
            正在读取历史文章...
          </div>
          <div v-else-if="historyArticles.length === 0" class="history-state">
            还没有阅读历史。
          </div>
          <div v-else class="history-list">
            <div
              v-for="article in historyArticles"
              :key="article.id"
              class="history-item"
              :class="{ 'is-editing': editingArticleId === article.id }"
            >
              <template v-if="editingArticleId === article.id">
                <input
                  v-focus
                  v-model="editingTitle"
                  class="history-title-input"
                  type="text"
                  placeholder="文章标题..."
                  :disabled="savingTitleId === article.id"
                  @keydown.enter="saveTitle(article)"
                  @keydown.esc="cancelEditTitle"
                />
                <div class="history-edit-actions">
                  <button
                    class="history-save-btn"
                    type="button"
                    :disabled="savingTitleId === article.id"
                    @click="saveTitle(article)"
                  >
                    {{ savingTitleId === article.id ? '保存中' : '保存' }}
                  </button>
                  <button
                    class="history-cancel-btn"
                    type="button"
                    :disabled="savingTitleId === article.id"
                    @click="cancelEditTitle"
                  >
                    取消
                  </button>
                </div>
              </template>
              <template v-else>
                <button class="history-open" type="button" @click="openHistoryArticle(article)">
                  <strong>{{ article.title }}</strong>
                  <span>{{ article.charCount }} characters · {{ formatHistoryTime(article.updatedAt) }}</span>
                </button>
                <div class="history-item-actions">
                  <button
                    class="history-edit-trigger"
                    type="button"
                    title="修改标题"
                    @click.stop="startEditTitle(article)"
                  >
                    ✎
                  </button>
                  <button
                    class="history-delete"
                    type="button"
                    :disabled="deletingArticleId === article.id"
                    aria-label="删除阅读历史"
                    title="删除"
                    @click.stop="deleteHistoryArticle(article)"
                  >
                    {{ deletingArticleId === article.id ? '…' : '×' }}
                  </button>
                </div>
              </template>
            </div>
          </div>
        </section>
      </section>

      <section v-else class="reader-stage">
        <header class="reader-toolbar surface-card">
          <div>
            <p class="card-label">Reading</p>
            <h2>阅读助手</h2>
          </div>
          <button class="peach-button-ghost" type="button" @click="backToInput">
            返回重写
          </button>
        </header>

        <article
          ref="readingContentRef"
          class="reading-content surface-card"
          @click="handleArticleClick"
          @mouseup="updateSelectedTextFromSelection"
          @touchend="scheduleSelectionRead"
        >
          <div
            v-for="paragraph in paragraphs"
            :key="paragraph.id"
            class="reading-paragraph"
          >
            <span
              v-for="sentence in paragraph.sentences"
              :key="sentence.id"
              class="sentence-block"
              :data-sentence-text="sentence.text"
            >
              <span class="sentence-content">
                <button
                  v-for="token in sentence.tokens"
                  :key="token.id"
                  :class="[
                    token.type === 'word' ? 'word-token' : 'text-token',
                    { 'is-active': activeTokenId === token.id }
                  ]"
                  :disabled="token.type !== 'word'"
                  type="button"
                  @click.stop="handleWordClick(token, sentence.text)"
                >
                  {{ token.value }}
                </button>
              </span>
              <button
                class="sentence-translate-btn"
                :disabled="sentence.loading"
                type="button"
                title="翻译整句"
                @click.stop="handleSentenceClick(sentence)"
              >
                {{ sentence.loading ? '…' : '译' }}
              </button>
              <button
                class="sentence-ask-btn"
                type="button"
                title="发送这句话给助手"
                @click.stop="askAboutSentence(sentence.text)"
              >
                问
              </button>
              <div
                v-if="sentence.translation || sentence.loading || sentence.error"
                class="sentence-translation"
                :class="{ 'is-error': sentence.error }"
              >
                <span v-if="sentence.loading">正在翻译句子...</span>
                <span v-else>{{ sentence.error || sentence.translation }}</span>
              </div>
            </span>
          </div>
        </article>

        <button
          class="assistant-trigger"
          :class="{ 'is-active': assistantOpen }"
          type="button"
          title="问问助手"
          @click="toggleAssistant"
        >
          <span class="assistant-icon">✨</span>
          <span class="assistant-label">助手</span>
        </button>
        <button
          v-if="selectedText"
          class="selection-send"
          type="button"
          :style="selectionActionStyle"
          @click="sendSelectedTextToAssistant"
        >
          发送给助手
        </button>
      </section>
    </main>

    <aside class="assistant-panel" :class="{ 'is-open': assistantOpen }">
      <div class="assistant-head">
        <div>
          <h3>阅读助手</h3>
          <span>{{ activeAssistantChat ? activeAssistantChat.title : '新聊天' }}</span>
        </div>
        <button class="assistant-new-chat" type="button" :disabled="assistantChatLoading" @click="startNewAssistantChat">
          新聊天
        </button>
        <button class="assistant-close" type="button" @click="assistantOpen = false">×</button>
      </div>
      <div v-if="assistantChats.length > 0" class="assistant-history">
        <button
          v-for="chat in assistantChats"
          :key="chat.id"
          class="assistant-history-item"
          :class="{ 'is-active': activeAssistantChatId === chat.id }"
          type="button"
          :disabled="assistantChatLoading"
          @click="openAssistantChat(chat)"
        >
          {{ chat.title }}
        </button>
      </div>
      <div class="assistant-body" ref="chatBodyRef">
        <div v-if="assistantChatLoading" class="assistant-welcome">
          <span class="mini-loader"></span>
          <p>正在读取聊天...</p>
        </div>
        <div v-else-if="chatMessages.length === 0" class="assistant-welcome">
          <p>我是你的 AI 阅读助手，你可以问我关于这篇文章的任何问题。</p>
          <div class="suggested-questions">
            <button
              v-for="q in suggestedQuestions"
              :key="q"
              type="button"
              class="suggestion-chip"
              @click="askQuestion(q)"
            >
              {{ q }}
            </button>
          </div>
        </div>
        <div
          v-for="(msg, index) in chatMessages"
          :key="index"
          class="chat-message"
          :class="msg.role"
        >
          <div class="message-bubble">{{ msg.content }}</div>
        </div>
        <div v-if="assistantLoading" class="chat-message assistant">
          <div class="message-bubble loading">
            <span class="mini-loader"></span>
            思考中...
          </div>
        </div>
      </div>
      <div class="assistant-footer">
        <textarea
          v-model="userQuestion"
          class="assistant-input"
          placeholder="问问助手..."
          @keydown.enter.prevent="askQuestion()"
        ></textarea>
        <button
          class="assistant-send"
          type="button"
          :disabled="assistantLoading || !userQuestion.trim()"
          @click="askQuestion()"
        >
          发送
        </button>
      </div>
    </aside>

    <aside class="word-panel" :class="{ 'is-open': wordPanel.open }" @click.stop>
      <button class="panel-close" type="button" aria-label="关闭释义" @click="closeWordPanel">×</button>
      <div class="panel-inner">
        <h3>{{ wordPanel.word }}</h3>
        <div v-if="wordPanel.loading" class="panel-loading">
          <span class="mini-loader"></span>
          <span>正在查询释义...</span>
        </div>
        <p v-else-if="wordPanel.error" class="panel-error">{{ wordPanel.error }}</p>
        <p v-else>{{ wordPanel.meaning }}</p>

        <section v-if="wordPanel.word" class="panel-save-area" aria-label="添加到单词本">
          <div class="panel-book-head">
            <div>
              <strong>添加到单词本</strong>
              <span>{{ selectedBookSummary }}</span>
            </div>
            <button type="button" class="panel-book-toggle" @click="showBookOptions = !showBookOptions">
              {{ showBookOptions ? '收起' : '选择' }}
            </button>
          </div>

          <div v-if="showBookOptions" class="panel-book-options">
            <div v-if="bookLoading" class="panel-book-state">正在读取单词本...</div>
            <div v-else-if="wordBooks.length === 0" class="panel-book-state">暂无单词本，将保存到默认单词本。</div>
            <label v-else v-for="book in wordBooks" :key="book.id" class="panel-book-option">
              <input v-model="selectedBookIds" type="checkbox" :value="book.id" />
              <span>
                <strong>{{ book.name }}</strong>
                <small>{{ book.wordCount }} 个单词</small>
              </span>
            </label>
          </div>

          <p v-if="wordPanel.saveMessage" class="panel-save-message">{{ wordPanel.saveMessage }}</p>
          <button
            type="button"
            class="panel-save-button"
            :disabled="wordPanel.loading || wordPanel.saving"
            @click="handleSaveReadingWord"
          >
            {{ wordPanel.saving ? '保存中...' : '加入单词本' }}
          </button>
        </section>
      </div>
    </aside>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import {
  createAssistantChat,
  deleteReadingArticle,
  fetchAssistantChats,
  fetchAssistantMessages,
  fetchReadingArticles,
  lookupReadingWord,
  saveReadingArticle,
  sendAssistantMessage,
  translateReadingSentence,
  updateReadingArticleTitle
} from '../services/reading.service'
import { recognizeArticleFromImage, type OcrMethod } from '../services/ocr.service'
import type { ReadingArticle, ReadingAssistantChat, ReadingAssistantMessage } from '../types/reading'
import { fetchWordBooks } from '../services/word-book.service'
import { addWord, generateWord } from '../services/word.service'
import type { WordBook } from '../types/word-book'

interface ReadingToken {
  id: string
  type: 'word' | 'text'
  value: string
}

interface ReadingSentence {
  id: string
  text: string
  tokens: ReadingToken[]
  translation: string
  loading: boolean
  error: string
}

interface ReadingParagraph {
  id: string
  sentences: ReadingSentence[]
}

const sourceText = ref('')
const mode = ref<'input' | 'reading'>('input')
const articleText = ref('')
const paragraphs = ref<ReadingParagraph[]>([])
const imageInputRef = ref<HTMLInputElement | null>(null)
const chatBodyRef = ref<HTMLElement | null>(null)
const readingContentRef = ref<HTMLElement | null>(null)
const errorMessage = ref('')
const activeTokenId = ref('')
const ocrMethod = ref<OcrMethod>('tesseract')
const ocrLoading = ref(false)
const saveLoading = ref(false)
const historyLoading = ref(false)
const assistantLoading = ref(false)
const assistantOpen = ref(false)
const userQuestion = ref('')
const selectedText = ref('')
const selectionActionStyle = ref<Record<string, string>>({})
const chatMessages = ref<ReadingAssistantMessage[]>([])
const assistantChats = ref<ReadingAssistantChat[]>([])
const activeAssistantChatId = ref<number | null>(null)
const assistantChatLoading = ref(false)
const bookLoading = ref(false)
const deletingArticleId = ref<number | null>(null)
const editingArticleId = ref<number | null>(null)
const savingTitleId = ref<number | null>(null)
const editingTitle = ref('')
const historyArticles = ref<ReadingArticle[]>([])
const wordBooks = ref<WordBook[]>([])
const selectedBookIds = ref<number[]>([])
const showBookOptions = ref(false)
const wordCache = ref(new Map<string, string>())
const sentenceCache = ref(new Map<string, string>())

const suggestedQuestions = [
  '总结文章大意',
  '解释文中的长难句',
  '列出文中的核心词汇'
]
const wordPanel = reactive({
  open: false,
  word: '',
  meaning: '',
  loading: false,
  saving: false,
  saveMessage: '',
  error: ''
})

const vFocus = {
  mounted: (el: HTMLInputElement) => el.focus()
}

const ocrMethods: Array<{ value: OcrMethod; label: string }> = [
  { value: 'tesseract', label: 'Tesseract' },
  { value: 'paddle', label: 'PaddleOCR' },
  { value: 'vision', label: '多模态大模型' }
]

const selectedBookSummary = computed(() => {
  if (bookLoading.value) return '正在读取单词本...'
  if (wordBooks.value.length === 0) return '默认单词本'
  if (selectedBookIds.value.length === 0) return '未选择单词本'

  const selectedNames: string[] = []

  for (const book of wordBooks.value) {
    if (selectedBookIds.value.includes(book.id)) {
      selectedNames.push(book.name)
    }
  }

  return selectedNames.length > 0 ? selectedNames.join('、') : '未选择单词本'
})
const activeAssistantChat = computed(() => {
  return assistantChats.value.find((chat) => chat.id === activeAssistantChatId.value) ?? null
})

function selectDefaultBook() {
  const defaultBook = wordBooks.value.find((book) => book.isDefault)

  selectedBookIds.value = defaultBook ? [defaultBook.id] : []
}

/**
 * 按英文句末标点切句，保留短文阅读需要的自然停顿。
 */
function splitSentences(text: string) {
  return text.match(/[^.!?]+(?:[.!?]+["']?|$)/g)?.map((item) => item.trim()).filter(Boolean) ?? [text]
}

/**
 * 分词时保留空格和标点，阅读区才能和原文排版保持一致。
 */
function tokenizeSentence(sentence: string, sentenceId: string): ReadingToken[] {
  const tokens: ReadingToken[] = []
  const wordPattern = /[A-Za-z]+(?:[-'][A-Za-z]+)*/g
  let lastIndex = 0
  let tokenIndex = 0

  for (const match of sentence.matchAll(wordPattern)) {
    const index = match.index ?? 0

    if (index > lastIndex) {
      tokens.push({
        id: `${sentenceId}-text-${tokenIndex}`,
        type: 'text',
        value: sentence.slice(lastIndex, index)
      })
      tokenIndex += 1
    }

    tokens.push({
      id: `${sentenceId}-word-${tokenIndex}`,
      type: 'word',
      value: match[0]
    })
    tokenIndex += 1
    lastIndex = index + match[0].length
  }

  if (lastIndex < sentence.length) {
    tokens.push({
      id: `${sentenceId}-text-${tokenIndex}`,
      type: 'text',
      value: sentence.slice(lastIndex)
    })
  }

  return tokens
}

/**
 * 页面状态从原文推导，返回重写后不会残留旧译文和选中态。
 */
function buildParagraphs(text: string): ReadingParagraph[] {
  return text
    .split(/\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph, paragraphIndex) => {
      const sentences = splitSentences(paragraph).map((sentence, sentenceIndex) => {
        const id = `sentence-${paragraphIndex}-${sentenceIndex}`

        return {
          id,
          text: sentence,
          tokens: tokenizeSentence(sentence, id),
          translation: sentenceCache.value.get(sentence) ?? '',
          loading: false,
          error: ''
        }
      })

      return {
        id: `paragraph-${paragraphIndex}`,
        sentences
      }
    })
}

/**
 * 入口只接受英文文本，避免把空白内容切成无意义阅读块。
 */
async function startReading() {
  const text = sourceText.value.trim()

  if (!text) {
    errorMessage.value = '请先粘贴一段英文文章。'
    return
  }

  errorMessage.value = ''
  saveLoading.value = true

  try {
    const response = await saveReadingArticle(text)
    historyArticles.value = [
      response.data,
      ...historyArticles.value.filter((article) => article.id !== response.data.id)
    ].slice(0, 20)
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '文章历史保存失败。'
  } finally {
    saveLoading.value = false
  }

  articleText.value = text
  paragraphs.value = buildParagraphs(text)
  closeWordPanel()
  mode.value = 'reading'
  void nextTick(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

/**
 * 进入阅读页时拉取历史，历史失败不影响粘贴文章的主流程。
 */
async function loadReadingHistory() {
  historyLoading.value = true

  try {
    const response = await fetchReadingArticles()
    historyArticles.value = response.data
  } catch (error) {
    console.error(error)
  } finally {
    historyLoading.value = false
  }
}

async function loadWordBooks() {
  bookLoading.value = true

  try {
    const response = await fetchWordBooks()
    const previousBookIds = selectedBookIds.value

    wordBooks.value = response.data
    selectedBookIds.value = previousBookIds.filter((bookId) =>
      wordBooks.value.some((book) => book.id === bookId)
    )

    if (selectedBookIds.value.length === 0) {
      selectDefaultBook()
    }
  } catch (error) {
    console.error(error)
  } finally {
    bookLoading.value = false
  }
}

/**
 * 历史文章恢复到输入区，让用户可以先编辑再开始阅读。
 */
function openHistoryArticle(article: ReadingArticle) {
  sourceText.value = article.content
  errorMessage.value = ''
}

function startEditTitle(article: ReadingArticle) {
  editingArticleId.value = article.id
  editingTitle.value = article.title
}

function cancelEditTitle() {
  editingArticleId.value = null
  editingTitle.value = ''
}

async function saveTitle(article: ReadingArticle) {
  const title = editingTitle.value.trim()
  if (!title) {
    errorMessage.value = '标题不能为空'
    return
  }

  if (savingTitleId.value !== null) {
    return
  }

  savingTitleId.value = article.id
  errorMessage.value = ''

  try {
    await updateReadingArticleTitle(article.id, title)
    const updatedAt = new Date().toISOString()
    historyArticles.value = historyArticles.value.map((item) => {
      if (item.id !== article.id) {
        return item
      }

      return {
        ...item,
        title,
        updatedAt,
      }
    })
    cancelEditTitle()
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '更新标题失败'
  } finally {
    savingTitleId.value = null
  }
}

/**
 * 删除历史只更新历史列表，不清空输入区，避免误删时连当前编辑内容也丢掉。
 */
async function deleteHistoryArticle(article: ReadingArticle) {
  if (deletingArticleId.value !== null) return

  deletingArticleId.value = article.id
  errorMessage.value = ''

  try {
    await deleteReadingArticle(article.id)
    historyArticles.value = historyArticles.value.filter((item) => item.id !== article.id)
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '删除阅读历史失败，请重试。'
  } finally {
    deletingArticleId.value = null
  }
}

function formatHistoryTime(value: string) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

/**
 * 文件选择框隐藏在按钮后面，页面保留现有胶囊按钮风格。
 */
function openImagePicker() {
  if (ocrLoading.value) return

  imageInputRef.value?.click()
}

/**
 * OCR 结果直接替换输入区文本，方便用户先检查再进入阅读。
 */
async function handleImageUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return

  ocrLoading.value = true
  errorMessage.value = ''

  try {
    const response = await recognizeArticleFromImage(file, ocrMethod.value)
    sourceText.value = response.data.text
  } catch (error) {
    console.error(error)
    errorMessage.value = error instanceof Error && error.message
      ? error.message
      : '图片文字识别失败，请换一张清晰图片重试。'
  } finally {
    ocrLoading.value = false
    input.value = ''
  }
}

/**
 * 返回输入页时保留原文，方便用户改一两句后继续阅读。
 */
function backToInput() {
  mode.value = 'input'
  articleText.value = ''
  paragraphs.value = []
  activeTokenId.value = ''
  assistantOpen.value = false
  closeWordPanel()
}

function toggleAssistant() {
  assistantOpen.value = !assistantOpen.value
  if (assistantOpen.value) {
    wordPanel.open = false
  }
}

async function scrollToBottom() {
  await nextTick()
  if (chatBodyRef.value) {
    chatBodyRef.value.scrollTop = chatBodyRef.value.scrollHeight
  }
}

/**
 * 读取助手历史列表，失败不阻塞阅读主流程。
 */
async function loadAssistantChats() {
  try {
    const response = await fetchAssistantChats()
    assistantChats.value = response.data
  } catch (error) {
    console.error(error)
  }
}

/**
 * 新聊天只清空当前消息，不清空文章；下一次发送时会用当前文章创建会话。
 */
function startNewAssistantChat() {
  activeAssistantChatId.value = null
  chatMessages.value = []
  userQuestion.value = ''
  assistantOpen.value = true
}

/**
 * 打开历史聊天时恢复对应文章上下文，后续追问仍围绕这篇文章。
 */
async function openAssistantChat(chat: ReadingAssistantChat) {
  assistantChatLoading.value = true
  assistantOpen.value = true
  wordPanel.open = false

  try {
    activeAssistantChatId.value = chat.id
    articleText.value = chat.articleContent
    sourceText.value = chat.articleContent
    paragraphs.value = buildParagraphs(chat.articleContent)
    mode.value = 'reading'
    const response = await fetchAssistantMessages(chat.id)
    chatMessages.value = response.data
    await scrollToBottom()
  } catch (error) {
    console.error(error)
  } finally {
    assistantChatLoading.value = false
  }
}

/**
 * 没有当前聊天时自动创建一个，保持“直接提问”体验。
 */
async function ensureAssistantChat() {
  if (activeAssistantChatId.value) {
    return activeAssistantChatId.value
  }

  const response = await createAssistantChat(articleText.value)
  activeAssistantChatId.value = response.data.id
  assistantChats.value = [
    response.data,
    ...assistantChats.value.filter((chat) => chat.id !== response.data.id),
  ]

  return response.data.id
}

async function askQuestion(question?: string) {
  const text = (question || userQuestion.value).trim()
  if (!text || assistantLoading.value) return

  const chatId = await ensureAssistantChat()
  userQuestion.value = ''
  assistantLoading.value = true

  try {
    const response = await sendAssistantMessage(chatId, text)
    chatMessages.value = [
      ...chatMessages.value,
      response.data.userMessage,
      response.data.assistantMessage,
    ]
    await loadAssistantChats()
  } catch (error) {
    console.error(error)
    const now = new Date().toISOString()
    chatMessages.value.push({
      id: Date.now(),
      role: 'assistant',
      content: '抱歉，助手暂时无法回答，请重试。',
      createdAt: now,
    })
  } finally {
    assistantLoading.value = false
    scrollToBottom()
  }
}

/**
 * 发送选中文本时带上明确任务，助手不会只收到一句孤立原文。
 */
function buildSelectedTextQuestion(text: string) {
  return `请解释这句话，并指出重点表达：\n${text}`
}

/**
 * 桌面和手机的文本选择事件触发时机不同，touchend 后稍等浏览器完成选区计算。
 */
function scheduleSelectionRead() {
  window.setTimeout(updateSelectedTextFromSelection, 80)
}

/**
 * 只接受阅读正文里的选区，避免误把助手输入框或页面其它文字发出去。
 */
function updateSelectedTextFromSelection() {
  const selection = window.getSelection()
  const text = selection?.toString().trim() ?? ''

  if (!selection || !text || !readingContentRef.value || selection.rangeCount === 0) {
    selectedText.value = ''
    return
  }

  const range = selection.getRangeAt(0)
  const container = range.commonAncestorContainer
  const selectedNode = container.nodeType === Node.TEXT_NODE
    ? container.parentElement
    : container

  if (!(selectedNode instanceof Node) || !readingContentRef.value.contains(selectedNode)) {
    selectedText.value = ''
    return
  }

  const rect = range.getBoundingClientRect()
  const buttonWidth = 116
  const left = Math.min(
    window.innerWidth - buttonWidth - 12,
    Math.max(12, rect.left + rect.width / 2 - buttonWidth / 2),
  )
  const top = rect.top > 58 ? rect.top - 48 : rect.bottom + 10

  const sentenceBlock = selectedNode instanceof Element
    ? selectedNode.closest<HTMLElement>('.sentence-block')
    : selectedNode.parentElement?.closest<HTMLElement>('.sentence-block')
  const sentenceText = sentenceBlock?.dataset.sentenceText?.trim()
  const textForAssistant = sentenceText && !text.includes(' ')
    ? sentenceText
    : text

  selectedText.value = textForAssistant.slice(0, 800)
  selectionActionStyle.value = {
    left: `${left}px`,
    top: `${Math.max(72, top)}px`,
  }
}

/**
 * 选中的句子直接进入助手对话，并打开手机半屏助手。
 */
async function sendSelectedTextToAssistant() {
  const text = selectedText.value.trim()

  if (!text) {
    return
  }

  selectedText.value = ''
  window.getSelection()?.removeAllRanges()
  assistantOpen.value = true
  wordPanel.open = false
  await askQuestion(buildSelectedTextQuestion(text))
}

/**
 * 每句旁边的快捷入口，解决手机长按选择不稳定的问题。
 */
async function askAboutSentence(sentence: string) {
  assistantOpen.value = true
  wordPanel.open = false
  selectedText.value = ''
  window.getSelection()?.removeAllRanges()
  await askQuestion(buildSelectedTextQuestion(sentence))
}

/**
 * 点击正文空白处关闭底部释义面板，减少遮挡阅读内容。
 */
function handleArticleClick() {
  closeWordPanel()
}

/**
 * 单词释义按 word + sentence 缓存，同一个词在不同上下文里仍能查出不同义项。
 */
async function handleWordClick(token: ReadingToken, sentence: string) {
  if (token.type !== 'word') return

  const cacheKey = `${token.value.toLowerCase()}::${sentence}`
  activeTokenId.value = token.id
  wordPanel.open = true
  wordPanel.word = token.value
  wordPanel.meaning = wordCache.value.get(cacheKey) ?? ''
  wordPanel.error = ''
  wordPanel.saveMessage = ''

  if (wordPanel.meaning) {
    wordPanel.loading = false
    return
  }

  wordPanel.loading = true

  try {
    const response = await lookupReadingWord(token.value, sentence)
    const nextCache = new Map(wordCache.value)

    nextCache.set(cacheKey, response.data.text)
    wordCache.value = nextCache
    wordPanel.meaning = response.data.text
  } catch (error) {
    console.error(error)
    wordPanel.error = error instanceof Error && error.message
      ? error.message
      : '查询失败，请重试。'
  } finally {
    wordPanel.loading = false
  }
}

/**
 * 阅读查词只拿到短释义，保存时复用完整词卡生成接口，避免入库半张卡片。
 */
async function handleSaveReadingWord() {
  const targetWord = wordPanel.word.trim()

  if (!targetWord || wordPanel.saving) return

  wordPanel.saving = true
  wordPanel.saveMessage = ''

  try {
    const currentBookIds = [...selectedBookIds.value]
    const previewResponse = await generateWord(targetWord)
    const preview = previewResponse.data

    await addWord(
      preview.word,
      preview.phonetic,
      preview.coreFeeling,
      preview.meanings,
      currentBookIds
    )
    await loadWordBooks()

    if (wordPanel.word.trim().toLowerCase() === targetWord.toLowerCase()) {
      wordPanel.saveMessage = '已加入单词本'
    }
  } catch (error) {
    console.error(error)
    wordPanel.saveMessage = error instanceof Error && error.message
      ? error.message
      : '保存失败，请重试。'
  } finally {
    wordPanel.saving = false
  }
}

/**
 * 句子翻译再次点击会收起已翻译内容，符合阅读时临时查看的节奏。
 */
async function handleSentenceClick(sentence: ReadingSentence) {
  if (sentence.loading) return

  if (sentence.translation) {
    sentence.translation = ''
    sentence.error = ''
    return
  }

  const cached = sentenceCache.value.get(sentence.text)

  if (cached) {
    sentence.translation = cached
    sentence.error = ''
    return
  }

  sentence.loading = true
  sentence.error = ''

  try {
    const response = await translateReadingSentence(sentence.text)
    const nextCache = new Map(sentenceCache.value)

    nextCache.set(sentence.text, response.data.text)
    sentenceCache.value = nextCache
    sentence.translation = response.data.text
  } catch (error) {
    console.error(error)
    sentence.error = error instanceof Error && error.message
      ? error.message
      : '翻译句子失败，请再次点击重试。'
  } finally {
    sentence.loading = false
  }
}

/**
 * 关闭面板时同步清掉正文高亮，避免用户误以为仍在查询。
 */
function closeWordPanel() {
  wordPanel.open = false
  wordPanel.loading = false
  activeTokenId.value = ''
}

onMounted(() => {
  loadReadingHistory()
  loadWordBooks()
  loadAssistantChats()
  document.addEventListener('selectionchange', updateSelectedTextFromSelection)
})

onBeforeUnmount(() => {
  document.removeEventListener('selectionchange', updateSelectedTextFromSelection)
})
</script>

<style scoped>
.reading-page {
  min-height: calc(100vh - 52px);
  padding: 44px 20px 120px;
  overflow-x: clip;
}

.reading-shell {
  width: min(980px, 100%);
  margin: 0 auto;
  min-width: 0;
}

.reader-input-card,
.reader-toolbar,
.reading-content {
  border-radius: var(--sl-radius-xl);
}

.reader-input-card {
  max-width: 820px;
  margin: 6vh auto 0;
  padding: 30px;
}

.reader-input-head h2,
.reader-toolbar h2 {
  margin: 0;
  color: var(--sl-text-main);
  font-family: var(--sl-display-font);
  font-size: 34px;
  line-height: 1.1;
}

.reader-input-head span {
  display: block;
  margin-top: 8px;
  color: var(--sl-text-soft);
  font-size: 15px;
}

.article-input {
  width: 100%;
  min-height: 340px;
  margin-top: 24px;
  padding: 22px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 24px;
  outline: none;
  resize: vertical;
  background: rgba(255, 255, 255, 0.46);
  color: var(--sl-text-main);
  font: 18px/1.7 var(--sl-display-font);
}

.dark-theme .article-input {
  background: rgba(255, 255, 255, 0.06);
}

.article-input:focus {
  border-color: rgba(255, 90, 113, 0.48);
  box-shadow: 0 0 0 4px rgba(255, 90, 113, 0.12);
}

.reader-error {
  margin: 14px 0 0;
  color: #b42318;
  font-size: 14px;
  font-weight: 800;
}

.reader-input-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  margin-top: 22px;
  color: var(--sl-text-mute);
  font-size: 13px;
  font-weight: 800;
}

.reader-action-buttons {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  flex-wrap: wrap;
}

.ocr-method-toggle {
  display: inline-flex;
  min-height: 40px;
  padding: 3px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.42);
}

.dark-theme .ocr-method-toggle {
  background: rgba(255, 255, 255, 0.06);
}

.ocr-method-toggle button {
  min-width: 92px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.ocr-method-toggle button.is-active {
  background: var(--sl-peach-500);
  color: #fff;
  box-shadow: 0 8px 18px rgba(255, 90, 113, 0.2);
}

.ocr-method-toggle button:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.image-input {
  display: none;
}

.reading-history {
  margin-top: 28px;
  padding-top: 22px;
  border-top: 1px solid var(--sl-glass-border);
  min-width: 0;
}

.history-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 14px;
}

.history-head h3 {
  margin: 0;
  color: var(--sl-text-main);
  font-size: 20px;
}

.history-refresh {
  min-height: 36px;
  padding: 0 14px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  background: transparent;
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.history-refresh:hover {
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
}

.history-state {
  padding: 14px 0;
  color: var(--sl-text-mute);
  font-size: 14px;
  font-weight: 700;
}

.history-list {
  display: grid;
  gap: 10px;
  min-width: 0;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 12px 14px;
  border: 1px solid var(--sl-glass-border);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.36);
  color: var(--sl-text-main);
  text-align: left;
  min-width: 0;
}

.dark-theme .history-item {
  background: rgba(255, 255, 255, 0.06);
}

.history-item:hover,
.history-item:focus-within {
  border-color: rgba(255, 90, 113, 0.38);
  background: var(--sl-peach-50);
}

.history-open {
  min-width: 0;
  flex: 1;
  border: none;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.history-open strong {
  display: block;
  white-space: normal;
  overflow-wrap: anywhere;
  word-break: break-word;
  font-size: 15px;
  line-height: 1.45;
}

.history-open span {
  display: block;
  margin-top: 4px;
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.history-delete {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--sl-text-mute);
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}

.history-delete:hover {
  background: rgba(180, 35, 24, 0.1);
  color: #b42318;
}

.history-delete:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.history-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.history-edit-trigger {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--sl-text-mute);
  font-size: 16px;
  cursor: pointer;
}

.history-edit-trigger:hover {
  background: rgba(0, 0, 0, 0.05);
  color: var(--sl-text-soft);
}

.history-title-input {
  flex: 1;
  min-width: 0;
  width: 100%;
  padding: 6px 12px;
  border: 1px solid var(--sl-peach-200);
  border-radius: 8px;
  background: #fff;
  color: var(--sl-text-main);
  font-size: 15px;
  font-weight: 700;
}

.history-edit-actions {
  display: flex;
  gap: 6px;
}

.history-save-btn,
.history-cancel-btn {
  padding: 4px 10px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 6px;
  background: transparent;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
}

.history-save-btn {
  border-color: var(--sl-peach-200);
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
}

.history-save-btn:hover {
  background: var(--sl-peach-100);
}

.history-save-btn:disabled,
.history-cancel-btn:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.history-cancel-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.reader-stage {
  display: grid;
  gap: 18px;
}

.reader-toolbar {
  padding: 18px 22px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
}

.reading-content {
  padding: clamp(22px, 4vw, 44px);
  background: rgba(255, 255, 255, 0.64);
  min-width: 0;
  overflow-wrap: anywhere;
}

.dark-theme .reading-content {
  background: rgba(24, 20, 30, 0.68);
}

.assistant-trigger {
  position: fixed;
  right: 28px;
  bottom: 28px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  border: none;
  border-radius: 999px;
  background: var(--sl-peach-500);
  color: #fff;
  box-shadow: 0 8px 24px rgba(255, 90, 113, 0.4);
  cursor: pointer;
  transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);
}

.assistant-trigger:hover {
  transform: translateY(-4px) scale(1.05);
  box-shadow: 0 12px 28px rgba(255, 90, 113, 0.5);
}

.assistant-trigger.is-active {
  background: #333;
  transform: scale(0.9);
}

.assistant-icon {
  font-size: 24px;
  line-height: 1;
}

.assistant-label {
  margin-top: 2px;
  font-size: 11px;
  font-weight: 800;
  opacity: 0.9;
}

.assistant-panel {
  position: fixed;
  top: 28px;
  right: -400px;
  bottom: 28px;
  z-index: 1000;
  display: flex;
  flex-direction: column;
  width: 380px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15);
  transition: right 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.dark-theme .assistant-panel {
  background: rgba(30, 25, 35, 0.9);
}

.assistant-panel.is-open {
  right: 28px;
}

.assistant-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--sl-glass-border);
}

.assistant-head h3 {
  margin: 0;
  font-size: 18px;
  color: var(--sl-text-main);
}

.assistant-head span {
  display: block;
  max-width: 180px;
  margin-top: 2px;
  overflow: hidden;
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.assistant-new-chat {
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 999px;
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.assistant-new-chat:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.assistant-close {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--sl-text-soft);
  font-size: 24px;
  cursor: pointer;
}

.assistant-close:hover {
  background: rgba(0, 0, 0, 0.05);
}

.assistant-history {
  display: flex;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sl-glass-border);
  overflow-x: auto;
}

.assistant-history::-webkit-scrollbar {
  display: none;
}

.assistant-history-item {
  flex: 0 0 auto;
  max-width: 190px;
  min-height: 32px;
  padding: 0 12px;
  border: 1px solid var(--sl-glass-border);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.52);
  color: var(--sl-text-soft);
  font-size: 12px;
  font-weight: 900;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.assistant-history-item.is-active {
  border-color: rgba(255, 90, 113, 0.35);
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
}

.assistant-history-item:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}

.assistant-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.assistant-welcome {
  padding: 20px;
  text-align: center;
  color: var(--sl-text-soft);
}

.suggested-questions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 16px;
}

.suggestion-chip {
  padding: 6px 12px;
  border: 1px solid var(--sl-peach-200);
  border-radius: 999px;
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.suggestion-chip:hover {
  background: var(--sl-peach-100);
}

.chat-message {
  display: flex;
  flex-direction: column;
  max-width: 85%;
}

.chat-message.user {
  align-self: flex-end;
}

.chat-message.assistant {
  align-self: flex-start;
}

.message-bubble {
  padding: 12px 16px;
  border-radius: 18px;
  font-size: 14px;
  line-height: 1.5;
  word-break: break-word;
}

.user .message-bubble {
  background: var(--sl-peach-500);
  color: #fff;
  border-bottom-right-radius: 4px;
}

.assistant .message-bubble {
  background: var(--sl-peach-50);
  color: var(--sl-text-main);
  border-bottom-left-radius: 4px;
}

.dark-theme .assistant .message-bubble {
  background: rgba(255, 255, 255, 0.08);
}

.message-bubble.loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--sl-text-mute);
}

.assistant-footer {
  padding: 16px;
  border-top: 1px solid var(--sl-glass-border);
  display: flex;
  gap: 10px;
}

.assistant-input {
  flex: 1;
  height: 44px;
  padding: 10px 14px;
  border: 1px solid var(--sl-glass-border-strong);
  border-radius: 12px;
  background: var(--sl-surface);
  color: var(--sl-text-main);
  font-size: 14px;
  resize: none;
}

.assistant-send {
  padding: 0 18px;
  border: none;
  border-radius: 12px;
  background: var(--sl-peach-500);
  color: #fff;
  font-weight: 800;
  font-size: 14px;
  cursor: pointer;
}

.assistant-send:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.reading-paragraph {
  margin-bottom: 28px;
  color: var(--sl-text-main);
  font: 20px/1.85 var(--sl-display-font);
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reading-paragraph:last-child {
  margin-bottom: 0;
}

.sentence-block {
  display: inline;
  position: relative;
  overflow-wrap: anywhere;
}

.sentence-content {
  display: inline;
}

.word-token,
.text-token {
  display: inline;
  max-width: 100%;
  padding: 0 1px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: inherit;
  font: inherit;
  letter-spacing: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
  user-select: text;
  -webkit-user-select: text;
}

.word-token {
  cursor: pointer;
}

.word-token:hover,
.word-token.is-active {
  background: rgba(255, 224, 94, 0.7);
}

.text-token {
  cursor: text;
}

.text-token:disabled {
  color: inherit;
  opacity: 1;
  -webkit-text-fill-color: currentColor;
}

.sentence-translate-btn {
  width: 26px;
  height: 26px;
  margin: 0 8px 0 3px;
  border: none;
  border-radius: 999px;
  vertical-align: middle;
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.sentence-translate-btn:hover {
  background: var(--sl-peach-500);
  color: #fff;
}

.sentence-ask-btn {
  width: 26px;
  height: 26px;
  margin: 0 8px 0 0;
  border: none;
  border-radius: 999px;
  vertical-align: middle;
  background: rgba(16, 185, 129, 0.12);
  color: #047857;
  font-size: 12px;
  font-weight: 900;
  cursor: pointer;
}

.sentence-ask-btn:hover {
  background: #047857;
  color: #fff;
}

.selection-send {
  position: fixed;
  z-index: 1200;
  min-width: 116px;
  min-height: 38px;
  padding: 0 12px;
  border: none;
  border-radius: 999px;
  background: #111827;
  color: #fff;
  font-size: 13px;
  font-weight: 900;
  box-shadow: 0 12px 28px rgba(17, 24, 39, 0.22);
  cursor: pointer;
}

.selection-send:hover {
  background: var(--sl-peach-500);
  transform: translateY(-1px);
}

.sentence-translation {
  display: block;
  margin: 8px 0 18px;
  padding: 12px 16px;
  border-left: 4px solid var(--sl-peach-500);
  border-radius: 0 14px 14px 0;
  background: var(--sl-peach-50);
  color: var(--sl-text-soft);
  font: 16px/1.7 "SF Pro Display", "PingFang SC", sans-serif;
}

.sentence-translation.is-error {
  border-left-color: #b42318;
  color: #b42318;
}

.word-panel {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 180;
  padding: 20px 24px;
  border-top: 1px solid var(--sl-glass-border-strong);
  border-radius: 28px 28px 0 0;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 -18px 50px rgba(40, 22, 28, 0.16);
  transform: translateY(110%);
  transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
}

.dark-theme .word-panel {
  background: rgba(30, 25, 38, 0.96);
}

.word-panel.is-open {
  transform: translateY(0);
}

.panel-inner {
  width: min(920px, 100%);
  min-height: 84px;
  margin: 0 auto;
}

.panel-inner h3 {
  margin: 0 44px 8px 0;
  color: var(--sl-text-main);
  font: 800 30px/1.1 var(--sl-display-font);
}

.panel-inner p {
  margin: 0;
  color: var(--sl-text-soft);
  font-size: 16px;
  line-height: 1.7;
}

.panel-close {
  position: absolute;
  top: 14px;
  right: 24px;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--sl-text-mute);
  font-size: 28px;
  line-height: 1;
  cursor: pointer;
}

.panel-close:hover {
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
}

.panel-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--sl-text-soft);
  font-size: 15px;
}

.mini-loader {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 90, 113, 0.18);
  border-top-color: var(--sl-peach-500);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.panel-error {
  color: #b42318 !important;
}

.panel-save-area {
  display: grid;
  gap: 12px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px solid var(--sl-glass-border);
}

.panel-book-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.panel-book-head div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.panel-book-head strong,
.panel-book-option strong {
  color: var(--sl-text-main);
  font-size: 14px;
  font-weight: 900;
}

.panel-book-head span,
.panel-book-option small,
.panel-book-state {
  color: var(--sl-text-mute);
  font-size: 12px;
  font-weight: 800;
}

.panel-book-toggle {
  flex: 0 0 auto;
  border: none;
  border-radius: 999px;
  padding: 8px 12px;
  background: var(--sl-peach-50);
  color: var(--sl-peach-500);
  font-size: 13px;
  font-weight: 900;
  cursor: pointer;
}

.panel-book-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}

.panel-book-option {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding: 10px 12px;
  border: 1px solid var(--sl-glass-border);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.52);
}

.dark-theme .panel-book-option {
  background: rgba(255, 255, 255, 0.06);
}

.panel-book-option input {
  width: 16px;
  height: 16px;
  accent-color: var(--sl-peach-500);
}

.panel-book-option span {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.panel-book-option strong,
.panel-book-option small,
.panel-save-message {
  overflow-wrap: anywhere;
}

.panel-save-button {
  justify-self: start;
  min-width: 132px;
  height: 42px;
  border: none;
  border-radius: 999px;
  padding: 0 18px;
  background: var(--sl-peach-500);
  color: #fff;
  font-size: 14px;
  font-weight: 900;
  cursor: pointer;
  box-shadow: 0 12px 24px rgba(255, 90, 113, 0.2);
}

.panel-save-button:disabled {
  cursor: not-allowed;
  opacity: 0.65;
  box-shadow: none;
}

.panel-save-message {
  color: var(--sl-text-soft);
  font-size: 13px;
  font-weight: 800;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 900px) {
  .reading-page {
    padding: 18px 10px 112px;
  }

  .reading-page:has(.assistant-panel.is-open) {
    padding-bottom: calc(50vh + 96px);
  }

  .reader-input-card {
    margin-top: 18px;
    padding: 18px;
    border-radius: 22px;
  }

  .reader-input-actions,
  .reader-toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .reader-action-buttons {
    justify-content: stretch;
  }

  .reader-action-buttons button {
    width: 100%;
  }

  .ocr-method-toggle {
    width: 100%;
  }

  .ocr-method-toggle button {
    flex: 1;
    width: auto;
  }

  .history-head {
    align-items: stretch;
    flex-direction: column;
  }

  .history-item {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }

  .history-item-actions,
  .history-edit-actions {
    justify-content: flex-start;
  }

  .history-edit-actions {
    flex-wrap: wrap;
  }

  .history-save-btn,
  .history-cancel-btn,
  .history-edit-trigger,
  .history-delete {
    min-width: 44px;
    min-height: 36px;
  }

  .reading-paragraph {
    font-size: 18px;
  }

  .assistant-trigger {
    right: 18px;
    bottom: calc(88px + env(safe-area-inset-bottom));
    width: 56px;
    height: 56px;
    z-index: 190;
  }

  .assistant-trigger.is-active {
    transform: none;
  }

  .assistant-icon {
    font-size: 21px;
  }

  .assistant-label {
    font-size: 10px;
  }

  .assistant-panel {
    top: auto;
    right: 0;
    bottom: 0;
    left: 0;
    width: 100%;
    height: min(50vh, 430px);
    max-height: 50vh;
    border-radius: 24px 24px 0 0;
    transform: translateY(110%);
    transition: transform 0.28s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .assistant-panel.is-open {
    right: 0;
    transform: translateY(0);
  }

  .assistant-head {
    padding: 10px 14px;
  }

  .assistant-head h3 {
    font-size: 16px;
  }

  .assistant-head span {
    max-width: 132px;
  }

  .assistant-new-chat {
    min-height: 30px;
    padding: 0 10px;
  }

  .assistant-history {
    padding: 8px 12px;
  }

  .assistant-body {
    padding: 14px;
    gap: 10px;
  }

  .assistant-welcome {
    padding: 10px;
  }

  .suggested-questions {
    justify-content: flex-start;
    gap: 6px;
    margin-top: 10px;
  }

  .suggestion-chip {
    padding: 6px 10px;
    font-size: 12px;
  }

  .chat-message {
    max-width: 92%;
  }

  .message-bubble {
    padding: 10px 12px;
    font-size: 13px;
  }

  .assistant-footer {
    padding: 10px 12px calc(10px + env(safe-area-inset-bottom));
    gap: 8px;
  }

  .assistant-input {
    height: 40px;
    min-height: 40px;
  }

  .assistant-send {
    min-width: 58px;
    padding: 0 12px;
  }

  .word-panel {
    left: 0;
    padding: 18px;
  }
}
</style>
