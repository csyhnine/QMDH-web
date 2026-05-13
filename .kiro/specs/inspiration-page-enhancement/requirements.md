# Requirements Document

## Introduction

灵感页增强功能，旨在提升 QMDH-web 平台灵感页面的用户体验和管理效率。主要包括：图片点击放大预览、灵感卡片附带原文链接、基于 URL 自动提取图片的导入流程优化，以及修复现有错误数据（伊东丰雄相关图片）。

## Glossary

- **Inspiration_Page**: 灵感页面，展示建筑设计参考案例的卡片网格页面
- **Lightbox**: 图片放大预览浮层，点击图片后全屏展示大图的模态对话框
- **Inspiration_Card**: 灵感卡片，灵感页网格中的单个内容卡片，包含图片、标题、标签和元信息
- **Import_Dialog**: 导入参考对话框，管理员用于从外部 URL 导入灵感内容的模态表单
- **Image_Extractor**: 图片提取服务，后端从给定 URL 页面中提取所有图片的服务
- **Cover_Selector**: 封面选择器，用户从提取的图片列表中选择一张作为灵感卡片封面的 UI 组件
- **Source_Link**: 原文链接，灵感内容的来源网页 URL
- **Ops_User**: 运营用户，拥有 ops 或更高权限角色的用户，可执行导入参考等管理操作
- **System**: QMDH-web 平台整体系统

## Requirements

### Requirement 1: 灵感图片点击放大

**User Story:** As a designer, I want to click on an inspiration image to view it in a larger lightbox, so that I can examine architectural details more clearly.

#### Acceptance Criteria

1. WHEN a user clicks on an Inspiration_Card image, THE Lightbox SHALL display the full-resolution image in a centered modal overlay with a semi-transparent backdrop
2. WHILE the Lightbox is open, THE Lightbox SHALL display a close button (×) in the top-right corner
3. WHEN a user clicks the close button or the backdrop area, THE Lightbox SHALL close and return to the Inspiration_Page grid view
4. WHEN a user presses the Escape key while the Lightbox is open, THE Lightbox SHALL close
5. WHILE the Lightbox is open, THE Lightbox SHALL display the inspiration post title below the image
6. WHILE the Lightbox is open and the post has a Source_Link, THE Lightbox SHALL display a clickable link to the original source URL

### Requirement 2: 灵感卡片显示原文链接

**User Story:** As a designer, I want to see the source link on inspiration cards, so that I can visit the original article for more context.

#### Acceptance Criteria

1. WHEN an Inspiration_Card has a non-empty source_url field, THE Inspiration_Card SHALL display a clickable Source_Link element in the card metadata area
2. WHEN a user clicks the Source_Link on an Inspiration_Card, THE System SHALL open the original URL in a new browser tab
3. WHEN an Inspiration_Card has an empty source_url field, THE Inspiration_Card SHALL not display the Source_Link element
4. THE Source_Link SHALL display a truncated version of the URL domain name (e.g., "archdaily.com") as the link text

### Requirement 3: URL 自动提取图片的导入流程

**User Story:** As an ops user, I want to import inspiration by pasting a source URL and having the system extract images automatically, so that I can quickly add references without manually finding image URLs.

#### Acceptance Criteria

1. WHEN an Ops_User clicks the "导入参考" button, THE Import_Dialog SHALL open a modal form with a URL input field
2. WHEN an Ops_User submits a URL in the Import_Dialog, THE Image_Extractor SHALL fetch the page content and extract all image URLs from the page
3. WHILE the Image_Extractor is processing, THE Import_Dialog SHALL display a loading indicator
4. WHEN the Image_Extractor completes extraction, THE Import_Dialog SHALL display a grid of extracted image thumbnails for the user to select from
5. WHEN an Ops_User selects one image from the extracted thumbnails, THE Cover_Selector SHALL highlight the selected image as the cover
6. THE Import_Dialog SHALL provide input fields for title, category, and tags in addition to the URL and cover selection
7. WHEN an Ops_User confirms the import with a selected cover image, THE System SHALL create a new InspirationPost with the source_url set to the original URL and image_path set to the selected image URL
8. IF the Image_Extractor fails to fetch the URL or finds no images, THEN THE Import_Dialog SHALL display an error message and allow the user to retry or enter image URL manually
9. THE Image_Extractor SHALL support extracting images from pages on archdaily.com, gooood.cn (古德), xiaohongshu.com (小红书), and mp.weixin.qq.com (微信公众号) domains
10. WHEN the Import_Dialog opens, THE Import_Dialog SHALL pre-populate the category field with the currently active category filter from the Inspiration_Page

### Requirement 4: 修复伊东丰雄错误图片数据

**User Story:** As an ops user, I want the incorrect Toyo Ito inspiration images to be fixed, so that the inspiration library displays accurate content.

#### Acceptance Criteria

1. THE System SHALL provide an API endpoint for Ops_User to update the image_path of an existing InspirationPost
2. WHEN an Ops_User sends a PATCH request with a new image_path to the update endpoint, THE System SHALL update the InspirationPost record and return the updated post
3. THE Inspiration_Page SHALL provide an edit button on each Inspiration_Card visible only to Ops_User, allowing image_path correction through the UI

