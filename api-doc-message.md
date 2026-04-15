## 3. Message (Tin nhắn)
*Lấy danh sách tin nhắn bên trong một cuộc trò chuyện cụ thể.*

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
- **Response JSON:**
```json
{
  "data": {
    "items": [
      {
        "id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
        "content": "API có tài liệu rồi nhé",
        "sendTime": "2026-04-10T10:15:30.000Z",
        "fromUserId": "11111111-2222-3333-4444-555555555555" // Cần kiểm tra fromUserId == id của current user để nhận diện tin nào của mình (bên phải), tin nào của đối phương (bên trái)
      }
    ],
    "currentPage": 1,
    "totalPages": 5,
    "pageSize": 20,
    "hasPreviousPage": false,
    "hasNextPage": true
  },
  "messages": [],
  "isSuccess": true
}
```
---
