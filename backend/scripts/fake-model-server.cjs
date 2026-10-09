/**
 * 本地假模型服务：只用于真机联调，绝不部署到生产。
 *
 * 作用：让移动端能对着“真实后端 → 真实 HTTP → 假模型”跑通词卡生成、句子翻译、
 * 阅读助手流式回复和多模态 OCR，而不用真的调外部模型、也不产生费用。
 *
 * 用法：
 *   node backend/scripts/fake-model-server.cjs            # 默认 3010 端口
 *   PORT=3010 node backend/scripts/fake-model-server.cjs
 *
 * 约定：
 * - POST /v1/chat/completions，OpenAI-compatible，stream 时按 SSE 返回 delta。
 * - 提问里包含 CUT_STREAM 时故意发两段就断开，用来验证“断流不能当完成”。
 * - 带图片（image_url）时返回一段固定英文文章，供 OCR 流程使用。
 */
const http = require('http');

const port = Number(process.env.PORT || 3010);

function readBody(request) {
  return new Promise((resolve) => {
    let raw = '';

    request.on('data', (chunk) => {
      raw += chunk;
    });
    request.on('end', () => resolve(raw));
  });
}

function hasImage(messages) {
  return messages.some((message) => {
    if (!Array.isArray(message.content)) {
      return false;
    }

    return message.content.some((part) => part.type === 'image_url');
  });
}

function buildText(messages) {
  const lastUser = [...messages].reverse().find((message) => message.role === 'user');
  const content = lastUser?.content;
  const text = typeof content === 'string' ? content : '';

  if (hasImage(messages)) {
    return 'Fake OCR article: the quick brown fox jumps over the lazy dog.\n\nSecond paragraph for merging tests.';
  }

  if (text.includes('词卡') || text.toLowerCase().includes('json')) {
    return JSON.stringify({
      word: 'probe',
      phonetic: '/prəʊb/',
      meanings: [
        {
          partOfSpeech: 'n.',
          meaning: '探针；探测',
          sceneTitle: '测试场景',
          examples: ['The probe returned a value.'],
          explanation: '假模型返回的固定词卡，用于真机联调。',
          imageQueries: [],
          example: 'The probe returned a value.',
          tip: '联调用词卡',
        },
      ],
    });
  }

  return '这是假模型返回的固定回答，用于真机联调验证流式回复。';
}

const server = http.createServer(async (request, response) => {
  if (!request.url.includes('/chat/completions')) {
    response.writeHead(404).end('not found');
    return;
  }

  const body = JSON.parse((await readBody(request)) || '{}');
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const text = buildText(messages);

  if (!body.stream) {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(
      JSON.stringify({
        choices: [{ message: { role: 'assistant', content: text } }],
      }),
    );
    return;
  }

  response.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-cache',
    connection: 'keep-alive',
  });

  const pieces = text.match(/.{1,12}/gu) ?? [text];
  let index = 0;

  const timer = setInterval(() => {
    if (index >= pieces.length) {
      clearInterval(timer);
      response.write('data: [DONE]\n\n');
      response.end();
      return;
    }

    response.write(
      `data: ${JSON.stringify({ choices: [{ delta: { content: pieces[index] } }] })}\n\n`,
    );
    index += 1;

    // 断流场景：发两段就断开，客户端必须识别成“没完成”。
    if (index === 2 && messages.some((message) => String(message.content).includes('CUT_STREAM'))) {
      clearInterval(timer);
      response.destroy();
    }
  }, 120);
});

server.listen(port, () => {
  console.log(`fake model server listening on http://127.0.0.1:${port}`);
});
