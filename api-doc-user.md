## 4. User (Người dùng)
*Quản lý thông tin hồ sơ và người dùng hệ thống.*

### 4.1. Lấy danh sách toàn bộ Users
- **Method:** `GET`
- **Endpoint:** `/user/`
- **Authorization:** `Bearer Token`
- **Query Parameters:**
  - `pageSize` (int): Kích thước danh sách trả về.
  - `pageNumber` (int): Trang thứ tự.
- **Mô tả:** Dùng để làm chức năng tìm kiếm người dùng / hiển thị gợi ý kết bạn.
- **Response JSON:**
```json
{
  "data": {
    "items": [
      {
        "id": "11111111-2222-3333-4444-555555555555",
        "userName": "john_doe",     // username đăng nhập hệ thống
        "urlAvatar": "https://...",// Ảnh đại diện
        "name": "John Doe",         // Tên hiển thị ra UI
        "isOnline": true,            // Field này tồn tại nếu BE sử dụng ProfileUserResponseWithOperation
      }
    ],
    "currentPage": 1,
    "totalPages": 2,
    "pageSize": 20,
    "hasPreviousPage": false,
    "hasNextPage": false
  },
  "messages": [],
  "isSuccess": true
}
```

### 4.2. Lấy thông tin Profile chi tiết của một User
- **Method:** `GET`
- **Endpoint:** `/user/{userId}`
- **Authorization:** `Bearer Token`
- **Route Parameters:**
  - `userId` (Guid): Id của user cần xem thông tin.
- **Response JSON:**
```json
{
  "data": {
    "id": "11111111-2222-3333-4444-555555555555",
    "userName": "john_doe",     // username đăng nhập hệ thống
    "urlAvatar": "https://...",// Ảnh đại diện
    "name": "John Doe",         // Tên hiển thị ra UI
    "isOnline": true,
    "email": "john.doe@example.com", // Field này tồn tại nếu BE sử dụng ProfileUserResponseDetail
    "phoneNumber": "1234567890" // Field này tồn tại nếu BE sử dụng ProfileUserResponseDetail  
  },
  "messages": [],
  "isSuccess": true
}
```

### 4.3. Tìm kiếm người dùng theo từ khóa
- **Method:** `GET`
- **Endpoint:** `/user/search`
- **Authorization:** `Bearer Token`
- **Query Parameters:**
  - `query` (string): Từ khóa tìm kiếm.
  - `take` (int): số lượng kết quả muốn lấy 
- **Response JSON:**
```json
{
    "data": [
        {
          "isOnline": false,
          "id": "b68cd123-f2cb-4a18-b216-af1a014f4be8",
          "userName": "user06a22e",
          "urlAvatar": "https://lh3.googleusercontent.com/a/ACg8ocJI5yRy3TdNerbk2rf25uF7Rw-bj37m67s2CUHcz_FPXV-0og=s96-c",
          "name": "Trường "
        },
        ...
    ],
    "messages": [],
    "isSuccess": true
}
```

### 4.4. Cập nhật ảnh đại diện (Upload Avatar)
- **Method:** `POST`
- **Endpoint:** `/user/upload_avt`
- **Authorization:** `Bearer Token`
- **Content-Type:** `multipart/form-data`
- **Body Form-Data:**
  - `file`: File ảnh được chọn tải lên.
- **Response:**
  - Trả về JSON chứa `{ "url": "link_ảnh_azure_blob" }` 

---