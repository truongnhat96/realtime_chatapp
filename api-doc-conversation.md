## 2. Conversation (Hộp thoại trò chuyện)
*Lấy danh sách và thông tin các cuộc trò chuyện của người dùng.*
*Controller: `ConversationController`*
*(Luôn gửi kèm JWT Token trong header hoặc đi qua bộ lọc `AuthorizationUserIdFillter`)*

### 2.1. Lấy danh sách hộp thoại của User
- **Method:** `GET`
- **Endpoint:** `/user/{userId}/conversation`
- **Route Parameters:**
  - `userId` (Guid): Id của user nhận (chính là user đang đăng nhập).
- **Query Parameters:**
  - `CountConversation` (int - Bắt buộc): Số lượng conversations cần lấy.
  - `RowFetch` (int - Bắt buộc): Số lượng record dùng để skip / phân trang.
- **Mô tả:** Load danh sách bên thanh điều hướng tin nhắn.

### 2.2. Lấy thông tin hộp thoại giữa 2 người dùng
- **Method:** `GET`
- **Endpoint:** `/user/{userId}/conversation/{otherUserId}`
- **Route Parameters:**
  - `userId` (Guid): Id của user hiện tại.
  - `otherUserId` (Guid): Id của user đầu bên kia.
- **Mô tả:** Lấy ra id hộp thoại và chi tiết nếu 2 người này đã từng nhắn tin, dùng để kiểm tra trước khi tạo hộp thoại mới hoặc render màn hình chat.

---
