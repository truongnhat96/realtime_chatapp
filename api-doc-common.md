
Đây là tài liệu API Endpoint chi tiết dành cho team Front-end dựa trên cấu trúc các controller trong dự án api back-end (`Authenticate`, `Conversation`, `Message`, `User`). 

Tài liệu được thiết kế theo chuẩn RESTful API documentation để Front-end dễ dàng nắm bắt workflow, các tham số đầu vào và luồng xác thực (Authentication flow).

---

# 📚 API Documentation

**Domain:** https://localhost:7277
**Base URL:** `https://localhost:7277/api/v1`
**Authorization:** Sử dụng JWT (JSON Web Token) truyền trong `Authorization` header với format: `Bearer <access_token>`.

---

## 1. Authentication (Xác thực)
  đọc kỹ [api-doc-authenticate.md](api-doc-authenticate.md)

## 2. Conversation (Hộp thoại trò chuyện)
  đọc kỹ [api-doc-conversation.md](api-doc-conversation.md)

## 3. Message (Tin nhắn)
  đọc kỹ [api-doc-message.md](api-doc-message.md)

## 4. User (Người dùng)
  đọc kỹ [api-doc-user.md](api-doc-user.md)

### 🌟 Cấu trúc Response chung (Global Response Wrapper)
Tất cả các API trong hệ thống đều trả về dữ liệu được bọc qua một chuẩn chung (`Result<T>`). FE cần dựa vào cấu trúc này để kiểm tra trạng thái và lấy dữ liệu.

```json
{
  "data": { ... },           // Payload chính trả về (có thể là object, array, hoặc null)
  "messages": [              // Mảng các thông báo từ server (dùng để hiển thị lỗi, toast message...)
    "Đăng nhập thành công"
  ],
  "isSuccess": true          // Cờ đánh dấu API xử lý thành công hay thất bại (true/false)
}
```


### 💡 Lưu ý dành cho Team Front-end:
1. **Quản lý Token:** `access_token` nên lưu trên local memory hoặc SessionStorage / LocalStorage, nhưng `refresh_token` thì back-end đã tự động bắn vào **Cookie** trình duyệt. Mỗi lần token quá hạn (nhận mã lỗi 401 Unauthorized), phía interceptor của axios / fetch chỉ cần gọi vào `POST /Authenticate/refresh-token`, trình duyệt sẽ tự động mang theo cookie này đi.
2. **SignalR Cảnh báo thêm:** Dự án sử dụng SignalR cho realtime message (thông qua folder `Hubs`). Fe cần setup Connection vào Hub với header Bearer Token tương ứng để nhận tin nhắn real-time thay vì gọi api GET nhiều lần.
3. Dự án áp dụng [CQRS Pattern](https://learn.microsoft.com/en-us/azure/architecture/patterns/cqrs), các response trả về thông thường sẽ có wrapper chung `IResult<T>`, FE tham khảo wrapper trong Postman/Swagger để map model chuẩn.