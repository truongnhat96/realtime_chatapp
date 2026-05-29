## 3. Message (Tin nhắn)
*Lấy danh sách tin nhắn bên trong một cuộc trò chuyện cụ thể.*

### 3.1. Lấy danh sách tin nhắn theo Conversation
- **Method:** `GET`
- **Endpoint:** `/conversation/messages/{conversationId}`
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
        "id": "guid",
        "content": "string", // là chuỗi rỗng nếu messageType != Text
        "messageType": "Text|Image|Video|File|System|Sticker", // (numbers) Text = 0, Image = 1, Video = 2, File = 3, System = 4, Sticker = 5
        "senderName": "string",
        "senderAvatar": "string",
        "sendTime": "2025-01-01T00:00:00+00:00",
        "fromUserId": "guid",
        "readBy": ["guid", "guid"],
        "conversationType": "OneToOne|Group|...",
        "attachments": [
          {
            "fileName": "string",
            "fileSize": 12345,
            "url": "string"
          }
        ] // Mảng rỗng nếu messageType = Text (0) hoặc messageType = System (4)
      }
    ],
    "currentPage": 1,
    "totalPages": 10,
    "pageSize": 20,
    "hasPreviousPage": false,
    "hasNextPage": true
  },
  "messages": [],
  "isSuccess": true
}
```

## 3.2. Upload file media

### Endpoint
- **Method:** `POST`
- **Route:** `/conversation/messages/upload-media`
- **Auth:** Bearer JWT (`[Authorize]` on controller)

**Mô tả:** Upload media lên Cloudinary và trả thông tin file.

### Request

- **Content-Type:** `multipart/form-data`

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `conversationId` | `Guid` | Yes | ID của conversation. |
| `messageType` | `MessageType` | Yes | Chỉ chấp nhận `Image`, `Video`, `File`. |
| `file` | `IFormFile` | Yes | File cần upload. |
| `sendTime` | `DateTimeOffset` | No | Thời điểm gửi (mặc định theo client). |

**Lưu ý:**
- Trong Request không truyền MessageType là string mà là số nguyên (enum):
```
Text = 0,
Image = 1,
Video = 2,
File = 3
```
- Đối với `file` bắt buộc phải gửi qua `multipart/form-data`

### JSON tương đương (cho các field text)
```json
{
  "conversationId": "Guid",
  "messageType": 1|2|3, // Image, Video, File
  "sendTime": "DateTimeOffset"
}
```

### Response
**Success (200)**
```json
{
  "url": "string",
  "fileName": "string",
  "fileSize": 12345
}
```

### Error (400)
```json
"Invalid message type"
```

### Error (500)
```json
"Error upload file"
```

## 3.3. Tạo tin nhắn cho file media

### Endpoint
- **Method:** `POST`
- **Route:** `/conversation/messages/send-media`
- **Auth:** Bearer JWT (`[Authorize]` on controller)

**Mô tả:** Tạo message media với danh sách attachment đã upload.

### Request

- **Content-Type:** `application/json`

```json
{
  "conversationId": "guid",
  "messageType": 1|2|3, // Image = 1, Video = 2, File = 3
  "sendTime": "2025-01-01T00:00:00+00:00",
  "fromUserId": "guid",
  "attachments": [
    {
      "fileName": "string",
      "fileSize": 12345,
      "url": "string"
    }
  ]
}
```

**Lưu ý**
- messageType không được là Text hoặc System.
- Thứ tự trong attachments quyết định displayOrder khi server lưu database.
- displayOrder là thứ tự của mỗi file ảnh khi người dùng mở file explorer - chọn file - open file hiển thị tại input preview, dùng cho việc render ghép nhiều ảnh lại với nhau đúng thứ tự người dùng đã chọn (thứ tự từ trái sang phải)

### Response
**Success (200)**

```json
{
  "messageId": "guid",
  "attachments": [
    {
      "fileName": "string",
      "fileSize": 12345,
      "url": "string"
    }
  ]
}
```

### Realtime Events (SignalR)
#### Event: `ReceiveMediaMessage`
Phát tới group `conversation_{conversationId}` ngay sau khi tạo tin nhắn media thành công.

**Payload**
```json
{
  "id": "guid",
  "conversationId": "guid",
  "fromUserId": "guid",
  "senderName": "string",
  "senderAvatar": "string",
  "messageType": "Image|Video|File", // Image = 1, Video = 2, File = 3
  "conversationType": "Direct|Group", // Direct = 0, Group = 1
  "content": "string|null",
  "sendTime": "2025-01-01T00:00:00+00:00",
  "attachments": [
    {
      "fileName": "string",
      "fileSize": 12345,
      "url": "string"
    }
  ]
}
```

## Workflow gửi đồng thời nhiều media

**Mục tiêu:** Đảm bảo rằng khi người dùng chọn 1 lúc nhiều file (6 ảnh, 2 video, 3 tệp đính kèm chẳng hạn), server phải lưu đủ 11 file attachments. 6 ảnh sẽ được merge vào 1 message, video và tệp không cần gộp - nghĩa là 2 video thành 2 message, 3 tệp đính kèm thành 3 message.

**Lưu ý** 
- Nếu người dùng chọn file với thứ tự các loại file không liên tục, ví dụ: ảnh1, video1, ảnh2, tệp1, ảnh3, video2, tệp2 thì client cần phải gom lại toàn bộ ảnh để upload cùng lúc, sau đó xử lý lần lượt video và tệp.
- Ưu tiên gom toàn bộ ảnh người dùng đã chọn để xử lý cùng lúc trước (bất kể file đầu tiên người dùng chọn không phải là ảnh), sau đó mới xử lý lần lượt video và tệp còn lại theo thứ tự người dùng đã chọn.

**Ví dụ** Trường hợp 6 ảnh, 2 video, 3 tệp đính kèm cần thực hiện như sau:

### A: Gửi đồng thời nhiều ảnh (batch song song)
1. Client gọi đồng thời 6 lần POST /upload-media (mục 3.2) (xử lý bất đồng bộ), mỗi request là 1 ảnh.
2. Khi tất cả upload ảnh hoàn tất, client tổng hợp kết quả thành mảng attachments (từ url, fileName, fileSize).
3. Client gọi POST /send-media (mục 3.3) 1 lần với:
- messageType = Image (1)
- attachments = [6 ảnh]
4. Nhận response, SignalR event `ReceiveMediaMessage` (mục 3.3) trả về → render UI ngay (ghép các ảnh lại theo thứ tự trong mảng attachments nhận được từ server để hiển thị đúng thứ tự người dùng đã chọn).

### B: Gửi video và file đính kèm (xử lý tuần tự)
- Không gọi song song, xử lý tuần tự từng file:
  1. Gọi POST /upload-media (1 video)
  2. Nhận response → gọi POST /send-media với messageType = Video và attachments chỉ gồm 1 item
  3. Render UI (từng dòng)
- Tương tự với các video còn lại và các file đính kèm (messageType = File).

**Tóm tắt quy trình**
- Ảnh: song song upload → 1 lần send-media
- Video + File: lần lượt upload → send-media → render → lặp lại đến khi hết file.

**Quan trọng**: Cần đồng bộ sendTime (khi gửi) giữa /upload-media và /send-media để UI thể hiện chuẩn thời gian gửi. (tip: Lưu lại thời gian khi người dùng bấm gửi và dùng chính thời gian đó cho cả /upload-media và /send-media)

---

## Quy trình tối ưu UX khi xử lý nhiều file cùng lúc
Đọc kỹ tài liệu: [multiFile-processing-workflow.md](multiFile-processing-workflow.md)