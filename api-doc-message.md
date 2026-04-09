## 3. Message (Tin nhắn)
*Lấy danh sách tin nhắn bên trong một cuộc trò chuyện cụ thể.*
*Controller: `MessageController`*

### 3.1. Lấy danh sách tin nhắn theo Conversation
- **Method:** `GET`
- **Endpoint:** `/conversation/{conversationId}/messages`
- **Authorization:** `Bearer Token` yêu cầu bắt buộc.
- **Route Parameters:**
  - `conversationId` (Guid): Id của cuộc trò chuyện.
- **Query Parameters:**
  - `pageSize` (int): Kích thước của 1 trang (Ví dụ: 20 tin).
  - `PageNumber` (int): Trang hiện tại muốn lấy.
- **Mô tả:** Hỗ trợ load tin nhắn dạng phân trang (infinity scroll khi cuộn ngược lên trên màn hình tin nhắn). Do data được thiết kế đi qua lớp bọc `PageList<MessageResponseByConversationId>`, FE sẽ nhận được đầy đủ metadata (tổng trang, tổng tin nhắn,...).

---
