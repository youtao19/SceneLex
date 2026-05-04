# SceneLex OCR Service

独立的 PaddleOCR 服务，用 `uv` 管理 Python 依赖。

## 安装

```bash
cd ocr-service
uv sync
```

## 启动

```bash
uv run uvicorn main:app --host 127.0.0.1 --port 8001 --reload
```

根目录也提供了脚本：

```bash
npm run dev:ocr
```

`dev:ocr` 默认不带 `--reload`，因为 PaddleOCR 模型初始化比较重；改服务代码时再用 `npm run dev:ocr:reload`。

接口文档：

```text
http://127.0.0.1:8001/docs
```

Node 后端默认请求：

```text
http://127.0.0.1:8001/ocr
```
