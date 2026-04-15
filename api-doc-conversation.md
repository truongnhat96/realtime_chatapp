## 2. Conversation (Hộp thoại trò chuyện)
*Lấy danh sách và thông tin các cuộc trò chuyện của người dùng.*
*(Luôn gửi kèm JWT Token trong header hoặc đi qua bộ lọc `AuthorizationUserIdFillter`)*

### 2.1. Lấy danh sách hộp thoại của User (Phân trang)
- **Method:** `GET`
- **Endpoint:** `/conversation/{userId}`
- **Route Parameters:**
  - `userId` (Guid): Id của user nhận (chính là user đang đăng nhập).
- **Query Parameters:**
  - `PageNumber` (int - Bắt buộc): Số trang.
  - `PageSize` (int - Bắt buộc): Số lượng record trên mỗi trang.
- **Mô tả:** Load danh sách bên thanh điều hướng tin nhắn.
- **Response JSON:**
```json
{
    "data": {
        "items": [
            {
                "conversationId": "821d421c-ea98-4bf2-a9c9-a87e61d116e4",
                "user": {
                    "id": "b68cd123-f2cb-4a18-b216-af1a014f4be8",
                    "urlAvatar": "https://lh3.googleusercontent.com/a/ACg8ocJI5yRy3TdNerbk2rf25uF7Rw-bj37m67s2CUHcz_FPXV-0og=s96-c",
                    "name": "Trường ",
                    "isOnline": false
                },
                "message": "hello",
                "seenMessage": "0001-01-01T00:00:00+00:00",
                "timeMessage": "2026-04-11T18:12:08.934+07:00"
            }
        ],
        "currentPage": 1,
        "totalPages": 1,
        "pageSize": 10,
        "hasPreviousPage": false,
        "hasNextPage": false
    },
    "messages": [],
    "isSuccess": true
}
```

### 2.2. Lấy thông tin hộp thoại giữa 2 người dùng
- **Method:** `GET`
- **Endpoint:** `/conversation`
- **Query Parameters:**
  - `userId` (Guid): Id của user hiện tại.
  - `otherUserId` (Guid): Id của user đầu bên kia.
- **Mô tả:** Lấy ra id hộp thoại và chi tiết nếu 2 người này đã từng nhắn tin, dùng để kiểm tra trước khi tạo hộp thoại mới hoặc render màn hình chat.
- **Response JSON:**
```json
{
  "data": {
    "conversationId": "3fa85f64-5717-4562-b3fc-2c963f66afa6", // ID hộp thoại thực tế hoặc Guid rỗng ("000000...")
    "hasConversation": true // true nếu đã từng nhắn, false nếu chưa tạo hộp thoại chung với user kia (khi đó ConversationId = rỗng)
  },
  "messages": [],
  "isSuccess": true
}
```

### 2.3. Tạo hộp thoại mới
- **Method:** `POST`
- **Endpoint:** `/conversation/create`
- **Body JSON:**
```json
{
  "fromUserId": "11111111-2222-3333-4444-555555555555",
  "toUserId": "22222222-3333-4444-5555-666666666666"
}
```
- **Response JSON:**
```json
{
    "data": "0f25737b-c7e5-470d-b15f-fd96abf81dc7",
    "messages": [],
    "isSuccess": true
}
```
---
