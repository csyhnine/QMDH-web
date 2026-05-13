# Implementation Tasks

## Task 1: Backend - Image Extraction Endpoint

### Description
Create the `POST /api/v1/inspiration/extract-images` endpoint that accepts a URL, fetches the page HTML, and extracts all image URLs using BeautifulSoup.

### Files to Modify
- `backend/requirements.txt` - Add `beautifulsoup4`
- `backend/app/routers/inspiration.py` - Add extract-images endpoint
- `backend/app/schemas.py` - Add `ExtractImagesIn` and `ExtractImagesOut` schemas

### Acceptance Criteria
- [x] 1.1 Add `beautifulsoup4` to requirements.txt
- [x] 1.2 Create `ExtractImagesIn` (url field) and `ExtractImagesOut` (images list, title) schemas
- [x] 1.3 Implement `POST /inspiration/extract-images` endpoint with ops+ auth
- [x] 1.4 Extract images from `<img src>`, `<img data-src>`, and `<meta og:image>` tags
- [x] 1.5 Resolve relative URLs to absolute URLs based on the page base URL
- [x] 1.6 Filter out small icons (images with explicit width/height < 100px in HTML attributes)
- [x] 1.7 Extract page `<title>` as suggested title in response
- [x] 1.8 Handle errors gracefully: timeout (10s), invalid URL, connection errors → return appropriate HTTP error
- [x] 1.9 Set a browser-like User-Agent header for the HTTP request

---

## Task 2: Backend - PATCH Update Endpoint

### Description
Create the `PATCH /api/v1/inspiration/{post_id}` endpoint to allow ops+ users to update InspirationPost fields (image_path, title, description, category, tags, source_url, source_name).

### Files to Modify
- `backend/app/routers/inspiration.py` - Add PATCH endpoint
- `backend/app/schemas.py` - Add `InspirationPostUpdate` schema

### Acceptance Criteria
- [x] 2.1 Create `InspirationPostUpdate` schema with all optional fields (title, description, image_path, category, tags, source_url, source_name)
- [x] 2.2 Implement `PATCH /inspiration/{post_id}` endpoint with ops+ auth
- [x] 2.3 Only update fields that are provided (non-None) in the request body
- [x] 2.4 Return 404 if post_id does not exist
- [x] 2.5 Return the updated `InspirationPostOut` response

---

## Task 3: Frontend - Lightbox for Inspiration Images

### Description
Add lightbox functionality to the inspiration page. Clicking an inspiration card image opens a full-screen modal showing the large image, title, and source link.

### Files to Modify
- `frontend/src/App.tsx` - Add lightbox state, click handler, and lightbox JSX

### Acceptance Criteria
- [x] 3.1 Add `inspirationLightbox` state (`InspirationPost | null`)
- [x] 3.2 Make inspiration card image area clickable → sets lightbox state to that post
- [x] 3.3 Render lightbox modal (reuse `media-lightbox` CSS classes) when state is non-null
- [x] 3.4 Display full-resolution image, post title, and source link (if source_url exists) in lightbox
- [x] 3.5 Close lightbox on: × button click, backdrop click, Escape key press
- [x] 3.6 Source link in lightbox opens in new tab with `target="_blank"` and `rel="noopener noreferrer"`

---

## Task 4: Frontend - Source Link on Inspiration Cards

### Description
Display the original source URL as a clickable link on each inspiration card that has a source_url.

### Files to Modify
- `frontend/src/App.tsx` - Modify inspiration card rendering

### Acceptance Criteria
- [x] 4.1 Add `extractDomain(url)` helper function that extracts hostname without "www." prefix
- [x] 4.2 When `post.source_url` is non-empty, render a clickable link showing the domain name in the card meta area
- [x] 4.3 Link opens in new tab with `target="_blank"` and `rel="noopener noreferrer"`
- [x] 4.4 When `post.source_url` is empty, do not render the source link element

---

## Task 5: Frontend - Import Dialog with URL Image Extraction

### Description
Replace the existing `prompt()` based import flow with a modal dialog that accepts a URL, calls the backend to extract images, displays them in a grid for cover selection, and creates the inspiration post.

### Files to Modify
- `frontend/src/App.tsx` - Replace prompt-based import with modal dialog, add API call for extract-images

### Acceptance Criteria
- [x] 5.1 Add `importDialog` state object (open, url, loading, images, selectedImage, title, category, tags, error, manualMode)
- [x] 5.2 Replace existing prompt() import logic with modal dialog open action
- [x] 5.3 Modal contains: URL input + "提取" button, loading spinner, image grid, cover selection highlight, title/category/tags inputs, confirm/cancel buttons
- [x] 5.4 Call `POST /api/v1/inspiration/extract-images` when user clicks "提取"
- [x] 5.5 Display extracted images as clickable thumbnails; clicking one selects it as cover (highlighted border)
- [x] 5.6 Pre-populate category from current `inspirationCategory` state
- [x] 5.7 Pre-populate title from the API response `title` field
- [x] 5.8 On confirm: call `POST /api/v1/inspiration` with selected image as image_path, source_url as the input URL
- [x] 5.9 On extraction error: show error message and provide "手动输入" fallback (text input for image_path)
- [x] 5.10 Add `extractImages(url)` method to the API client object

---

## Task 6: Frontend - Edit Button for Ops Users

### Description
Add an edit button on inspiration cards visible only to ops+ users. Clicking opens a simple edit form to update image_path and other fields via the PATCH API.

### Files to Modify
- `frontend/src/App.tsx` - Add edit button, edit form state, PATCH API call

### Acceptance Criteria
- [x] 6.1 Show an edit icon/button on inspiration cards only when `canUseOpsViews(currentUser)` is true
- [x] 6.2 Clicking edit opens a small inline form or modal with current values (image_path, title, source_url)
- [x] 6.3 On save: call `PATCH /api/v1/inspiration/{id}` with changed fields
- [x] 6.4 On success: refresh the inspiration list to show updated data
- [x] 6.5 Add `updateInspiration(id, data)` method to the API client object

---

## Task 7: Fix Toyo Ito Image Data

### Description
Create a script or use the PATCH API to fix the incorrect Toyo Ito (伊东丰雄) inspiration post images in the database.

### Files to Modify
- `backend/app/services/bootstrap.py` or new script - Fix seed data for Toyo Ito entries

### Acceptance Criteria
- [x] 7.1 Identify the incorrect Toyo Ito inspiration posts in the database (by title or source_name)
- [x] 7.2 Update the image_path to correct image URLs using the PATCH endpoint or a migration script
- [x] 7.3 Verify the corrected images display properly on the inspiration page

