## 4. User (Người dùng)
*Quản lý thông tin hồ sơ và người dùng hệ thống.*
*Controller: `UserController`*

### 4.1. Lấy danh sách toàn bộ Users
- **Method:** `GET`
- **Endpoint:** `/user/`
- **Authorization:** `Bearer Token`
- **Query Parameters:**
  - `pageSize` (int): Kích thước danh sách trả về.
  - `pageNumber` (int): Trang thứ tự.
- **Mô tả:** Dùng để làm chức năng tìm kiếm người dùng / hiển thị gợi ý kết bạn.

### 4.2. Lấy thông tin Profile chi tiết của một User
- **Method:** `GET`
- **Endpoint:** `/user/{userId}`
- **Authorization:** `Bearer Token`
- **Route Parameters:**
  - `userId` (Guid): Id của user cần xem thông tin.

### 4.3. Cập nhật ảnh đại diện (Upload Avatar)
- **Method:** `POST`
- **Endpoint:** `/user/upload_avt`
- **Authorization:** `Bearer Token`
- **Content-Type:** `multipart/form-data`
- **Body Form-Data:**
  - `file`: File ảnh được chọn tải lên.
- **Response:**
  - Trả về JSON chứa `{ "url": "link_ảnh_azure_blob" }` 

---