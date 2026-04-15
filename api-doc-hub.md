# 📚 Tài liệu Tích hợp Hệ thống Chat Real-time (SignalR)

Tài liệu này cung cấp cái nhìn tổng quan về luồng hoạt động của hệ thống Chat phía Server, từ việc quản lý kết nối, trạng thái người dùng (Online/Offline) đến việc gửi/nhận tin nhắn. Đồng thời hướng dẫn đội Front-end (React) cách cấu hình và lắng nghe các sự kiện SignalR.

## 1. Kiến trúc & Các Hubs phía Server
Hệ thống hiện tại đang sử dụng **2 Hubs** chính (có yêu cầu xác thực bằng JWT Token):

- **`UserOperationHub`**: Quản lý trạng thái hoạt động (Online/Offline) của người dùng.
- **`ChatHub`**: Quản lý việc nhắn tin trong các cuộc hội thoại (Conversation). (*Lưu ý: Hub này cũng bao gồm luôn logic quản lý Online/Offline tương tự như `UserOperationHub`*).

---

## 2. Luồng Hoạt Động (Workflow) Chi Tiết

### A. Quản lý Kết nối và Trạng thái (Online/Offline)
Khi một client kết nối tới bất kỳ Hub nào (`ChatHub` hoặc `UserOperationHub`), quy trình sau sẽ diễn ra:

1. **Khi Client Connect (OnConnectedAsync):**
   - Server trích xuất `userId` từ JWT Token.
   - Server lưu trữ `ConnectionId` của client map với `userId` đó vào hệ thống quản lý kết nối (`_operation.UserConnectedAsync`).
   - Server kiểm tra xem user này có đang online từ trước không. Nếu user vừa mới online (không có connection nào trước đó), Server sẽ broadcast sự kiện **`UserOnline`** tới **tất cả** các client khác kèm theo `userId`.

2. **Khi Client Disconnect (OnDisconnectedAsync):**
   - Server lấy thông tin người dùng và hủy `ConnectionId` vừa bị đứt khỏi danh sách quản lý.
   - Server kiểm tra xem user đó còn `ConnectionId` nào khác đang hoạt động không (ví dụ user dùng trên nhiều tab/thiết bị).
   - Nếu không còn `ConnectionId` nào hoạt động (tức là offline hoàn toàn), Server sẽ broadcast sự kiện **`UserOffline`** tới **tất cả** các client khác.

### B. Luồng Gửi và Nhận Tin nhắn (Qua `ChatHub`)
Luồng nhắn tin được xử lý thông qua hàm `SendMessageToConversation` trên `ChatHub`.

1. **Client Gửi Tin nhắn:**
   - Client gọi phương thức `SendMessageToConversation` và truyền lên object `MessageForSendConversation`:
     ```typescript
     {
        conversationId: string; // GUID của cuộc hội thoại
        content: string;        // Nội dung tin nhắn
        sendTime: Date;         // Thời gian gửi
        toUserId: string;       // GUID của người nhận
     }
     ```
2. **Server Xử lý:**
   - Lấy thông tin người gửi (`FromUserId`) tự động từ JWT token, bảo đảm tính xác thực.
   - Lưu trữ tin nhắn vào Database thông qua `CreateMessageCommand`.
   - Thu thập danh sách tất cả các `ConnectionId` đang hoạt động của cả **người gửi** (ngoại trừ tab/thiết bị hiện tại đang gửi) và **người nhận** (`toUserId`).
3. **Server Phản hồi:**
   - Server sẽ gửi sự kiện **`ReceiveMessage`** tới các `ConnectionId` đã thu thập.
   - Payload trả về cho Frontend (`MessageRecieve`) bao gồm:
     ```typescript
     {
        id: string;             // Trùng với conversationId
        fromUserId: string;     // GUID của người gửi
        content: string;        // Nội dung tin nhắn
        sendTime: Date;         // Thời gian nhắn
     }
     ```

---

## 3. Hướng dẫn Triển khai phía Front-end (React)

Đội Front-end cần sử dụng thư viện `@microsoft/signalr` để kết nối. Vì `ChatHub` đã gánh luôn cả logic Online/Offline của `UserOperationHub`, Front-end **chỉ cần kết nối tới `ChatHub` là đủ** để tối ưu hóa tài nguyên.

### Bước 1: Khởi tạo Connection
Xây dựng một service hoặc hook để quản lý connection SignalR. Lưu ý phải truyền `accessTokenFactory` để Server có thể xác thực.

```typescript
import { HubConnectionBuilder, LogLevel, HttpTransportType } from '@microsoft/signalr';

const createChatConnection = (token: string) => {
    const connection = new HubConnectionBuilder()
        .withUrl("https://<YOUR_API_DOMAIN>/chathub", {
            skipNegotiation: true,
            transport: HttpTransportType.WebSockets,
            accessTokenFactory: () => token // Inject JWT token vào request
        })
        .configureLogging(LogLevel.Information)
        .withAutomaticReconnect()
        .build();

    return connection;
};
```

### Bước 2: Đăng ký Lắng nghe Sự kiện (Listen)
Client cần lắng nghe 3 sự kiện chính do Server trả về:

```typescript
// Lắng nghe có tin nhắn mới
connection.on("ReceiveMessage", (message: any) => {
    console.log("New message received:", message);
    // message format: { id: "conv-uuid", fromUserId: "user-uuid", content: "hello", sendTime: "..." }
    // TODO: Update Redux state hoặc React state để hiển thị tin nhắn vào đúng box chat (dựa theo message.id / conversationId).
});

// Lắng nghe có người dùng vừa online
connection.on("UserOnline", (userId: string) => {
    console.log("User is online:", userId);
    // TODO: Thay đổi chấm trạng thái thành màu xanh cho userId này
});

// Lắng nghe có người dùng vừa offline
connection.on("UserOffline", (userId: string) => {
    console.log("User is offline:", userId);
    // TODO: Thay đổi chấm trạng thái thành màu xám cho userId này
});
```

### Bước 3: Gửi tin nhắn lên Server (Invoke)
Khi user ấn nút "Gửi", Frontend invoke hàm `SendMessageToConversation`.

```typescript
const sendMessage = async (conversationId: string, content: string, toUserId: string) => {
    if (connection && connection.state === "Connected") {
        const payload = {
            conversationId: conversationId,
            content: content,
            sendTime: new Date().toISOString(),
            toUserId: toUserId
        };

        try {
            await connection.invoke("SendMessageToConversation", payload);
            // Lưu ý: Tin nhắn vừa gửi sẽ không được Server dội ngược lại về tab hiện tại. 
            // Frontend cần tự append tin nhắn này vào UI cục bộ ngay sau khi invoke thành công để có trải nghiệm mượt mà.
        } catch (error) {
            console.error("Error sending message: ", error);
        }
    }
};
```

### Bước 4: Khởi động Connection
Nên đặt logic start connection vào `useEffect` ở tầng Root hoặc Layout của hệ thống sau khi User đã đăng nhập thành công.

```typescript
useEffect(() => {
    if (userToken) {
        const conn = createChatConnection(userToken);
        conn.start()
            .then(() => console.log("Connected to ChatHub!"))
            .catch(err => console.error("SignalR Connection Error: ", err));

        // Cleanup function khi component unmount
        return () => {
             conn.stop().then(() => console.log("Disconnected"));
        };
    }
}, [userToken]);
```

### 💡 Lưu ý quan trọng dành cho Frontend:
1. **Quản lý danh sách tin nhắn UI:** Hàm `SendMessageToConversation` của Server nhận tin nhắn vào và phát đi cho các thiết bị *khác* của người gửi, cùng thiết bị của người nhận (Server loại trừ `Context.ConnectionId` của chính tab/thiết bị vừa gửi `userConnectionsId.Remove(Context.ConnectionId);`). Vì vậy Frontend khi invoke thành công thì **phải tự động thêm tin nhắn vào state đoạn chat hiện tại** trên UI chứ không được chờ event `ReceiveMessage` trả về.
2. **ConversationId mapping:** Thuộc tính `Id` trong object `ReceiveMessage` trả về từ server thực chất chính là `ConversationId`. Bạn dùng nó để gán tin nhắn vào đúng ô chat.
3. **Cơ chế Retry / Reconnect:** Đã bật sẵn `withAutomaticReconnect()` trong Builder, nhưng có thể cần handle thêm các logic fetch lại API danh sách tin nhắn bị lỡ trong quá trình reconnect nếu thời gian đứt kết nối quá lâu.