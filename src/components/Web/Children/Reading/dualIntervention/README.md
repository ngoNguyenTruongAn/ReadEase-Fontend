# Reading Dual-Intervention (Frontend)

Thư mục này gom toàn bộ logic can thiệp realtime cho Reading Page.

## Cấu trúc

- `tokenization/viWordTokenizer.js`
  - Tokenize tiếng Việt theo word/space/newline/punctuation.
  - Tạo `wordIndex` ổn định để map event backend -> DOM.
- `trackingProtocol.js`
  - Chuẩn hóa URL WebSocket `/tracking?token=...`.
  - Builder cho các event: `session:start`, `mouse:batch`, `session:end`, `tooltip:show`.
- `hooks/useReadingDualInterventionSession.js`
  - Quản lý vòng đời session + buffer chuột + flush timer.
  - Nhận `adaptation:trigger`, `tooltip:show` và map ra state frontend.
  - Quản lý timeout fluent để clear style can thiệp khi không còn intervention.

## Flow realtime

1. Mở Reading Page -> mở WebSocket.
2. `onopen` -> gửi `session:start` kèm `contentId`.
3. Pointer di chuyển trong vùng đọc -> đẩy vào buffer.
4. Timer 100ms -> gửi `mouse:batch`.
5. Nhận `adaptation:trigger`:
   - `VISUAL`: bật letter-spacing + color banding.
   - `SEMANTIC`: gắn target semantic để mở rộng logic highlight.
6. Nhận `tooltip:show` -> render tooltip lên từ mục tiêu.
7. Khi tooltip đã render -> gửi ngược `tooltip:show` với `source: frontend` để log replay.
8. Rời trang/cleanup -> gửi `session:end` và đóng socket.

## Gợi ý mở rộng

- Nếu backend gửi phrase thay vì word index, thêm resolver phrase -> dải `wordIndex` trong hook.
- Nếu cần confidence-based UI mạnh hơn, map thêm biến CSS theo `confidenceClassName`.
- Semantic intervention có thể nâng cấp từ `word-semantic-target` sang cụm từ nhiều từ bằng range class.
