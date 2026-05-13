# Design Document: Inspiration Page Enhancement

## Overview

本设计文档描述灵感页增强功能的技术实现方案，包括前端 Lightbox 组件、原文链接展示、基于 URL 的图片提取导入流程，以及数据修复支持。

## Architecture

### 系统组件

```
┌─────────────────────────────────────────────────────┐
│  Frontend (App.tsx)                                  │
│  ┌───────────┐  ┌──────────────┐  ┌─────────────┐  │
│  │ Lightbox  │  │ Import Dialog│  │ Card Source  │  │
│  │ (modal)   │  │ (modal form) │  │ Link         │  │
│  └───────────┘  └──────────────┘  └─────────────┘  │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP API
┌─────────────────────▼───────────────────────────────┐
│  Backend (FastAPI)                                   │
│  ┌───────────────────┐  ┌────────────────────────┐  │
│  │ /inspiration      │  │ /inspiration/extract   │  │
│  │ PATCH /{id}       │  │ POST (url → images)    │  │
│  └───────────────────┘  └────────────────────────┘  │
│                              │                       │
│                    ┌─────────▼──────────┐            │
│                    │ Image Extractor    │            │
│                    │ (httpx + bs4)      │            │
│                    └────────────────────┘            │
└─────────────────────────────────────────────────────┘
```

### 技术选型

- **前端 Lightbox**: 复用现有 `media-lightbox` CSS 样式（已用于素材库放大），在灵感页添加状态管理
- **导入对话框**: 在 App.tsx 中新增模态组件逻辑（与现有 prompt() 替换）
- **图片提取后端**: 使用 `httpx` (已在 requirements.txt) + `beautifulsoup4` 解析 HTML
- **PATCH API**: 在现有 inspiration router 中新增端点

## Detailed Design

### 1. Lightbox 图片放大

**前端状态**:
```typescript
const [inspirationLightbox, setInspirationLightbox] = useState<InspirationPost | null>(null);
```

**交互逻辑**:
- 点击 `inspiration-card-image` 区域 → `setInspirationLightbox(post)`
- Lightbox 内显示: 大图 + 标题 + 原文链接（如有）
- 关闭方式: × 按钮 / 背景点击 / Escape 键
- 复用现有 `media-lightbox` 样式类

### 2. 原文链接展示

**域名提取逻辑** (纯函数):
```typescript
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
```

**卡片渲染**: 在 `inspiration-card-meta` 区域，当 `post.source_url` 非空时显示链接图标 + 域名文本。

### 3. URL 图片提取导入流程

**后端新增端点**:
```
POST /api/v1/inspiration/extract-images
Request: { "url": "https://..." }
Response: { "images": ["https://...", ...], "title": "页面标题" }
```

**提取策略**:
- 使用 httpx 发送 GET 请求（带 User-Agent 模拟浏览器）
- 使用 BeautifulSoup 解析 HTML
- 提取规则:
  - `<img>` 标签的 `src` 和 `data-src` 属性
  - `<meta property="og:image">` 内容
  - 过滤小图标（宽高 < 100px 的 img）
  - 将相对 URL 转为绝对 URL
- 提取页面 `<title>` 作为建议标题

**前端导入对话框流程**:
1. 打开模态 → 显示 URL 输入框
2. 用户粘贴 URL → 点击"提取" → 调用后端 API
3. 显示加载状态 → 返回图片网格
4. 用户点选封面图 → 填写标题/分类/标签
5. 确认 → 调用 `POST /api/v1/inspiration` 创建记录

**错误处理**:
- 网络超时: 显示"无法访问该链接"
- 无图片: 显示"未找到图片，请手动输入图片 URL"
- 提供手动输入 image_path 的 fallback 输入框

### 4. PATCH 更新端点

**后端新增端点**:
```
PATCH /api/v1/inspiration/{post_id}
Request: { "image_path": "...", "title": "..." }  (所有字段可选)
Response: InspirationPostOut
```

- 权限: 仅 ops+ 角色
- 支持更新: image_path, title, description, category, tags, source_url

**前端编辑按钮**:
- 在 `inspiration-card` 上为 ops 用户显示编辑图标
- 点击打开简单编辑表单（可复用 Import Dialog 的部分 UI）

## API Changes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/inspiration/extract-images` | ops+ | 从 URL 提取图片列表 |
| PATCH | `/api/v1/inspiration/{post_id}` | ops+ | 更新灵感帖子字段 |

### Request/Response Schemas

**ExtractImagesRequest**:
```python
class ExtractImagesIn(BaseModel):
    url: str = Field(min_length=10, max_length=2000)
```

**ExtractImagesResponse**:
```python
class ExtractImagesOut(BaseModel):
    images: list[str]  # 提取到的图片 URL 列表
    title: str = ""    # 页面标题（建议）
```

**InspirationPostUpdate**:
```python
class InspirationPostUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    image_path: str | None = None
    category: str | None = None
    tags: list[str] | None = None
    source_url: str | None = None
    source_name: str | None = None
```

## Dependencies

- `beautifulsoup4`: HTML 解析（新增）
- `httpx`: HTTP 客户端（已存在于 requirements.txt）

## Correctness Properties

### Property 1: Domain Extraction Correctness
- **Criteria**: 2.4 - Source link displays truncated domain name
- **Property**: For any valid URL string, `extractDomain(url)` returns a non-empty string that is a substring of the input URL's hostname, and does not start with "www."
- **Type**: Property-based test (pure function, behavior varies with input)

### Property 2: Image Extractor Completeness
- **Criteria**: 3.2 - Image extractor fetches page and extracts image URLs
- **Property**: For any HTML document containing `<img>` tags with valid `src` attributes, the Image_Extractor returns a list containing at least those image URLs (after resolving relative paths to absolute)
- **Type**: Property-based test (pure parsing function, behavior varies with HTML input)

### Property 3: PATCH Idempotence
- **Criteria**: 4.2 - PATCH updates record and returns updated post
- **Property**: Applying the same PATCH payload twice to the same InspirationPost produces the same final state (idempotent update)
- **Type**: Property-based test (idempotence property)

### Example Tests

- **Lightbox open/close**: Click image → lightbox visible with correct src; press Escape → lightbox hidden
- **Source link conditional**: Post with source_url renders link; post without source_url does not render link
- **Import flow happy path**: Submit URL → receive images → select cover → create post with correct fields
- **Extract failure**: Submit invalid URL → error message displayed → manual input available
- **PATCH authorization**: Non-ops user receives 403; ops user receives 200 with updated data
- **Edit button visibility**: Ops user sees edit button; designer user does not

## Migration Notes

- 无数据库 schema 变更（所有字段已存在于 InspirationPost 模型）
- 新增 `beautifulsoup4` 到 `requirements.txt`
- 伊东丰雄数据修复通过 PATCH API 手动执行或提供 seed 脚本

