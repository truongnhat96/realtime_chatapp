## 1. Authentication (Xác thực)
*Quản lý đăng ký, đăng nhập và phiên đăng nhập của người dùng.*
*Controller: `AuthenticateController`*

### 1.1. Đăng nhập qua OAuth (Google, v.v.)
- **Method:** `GET`
- **Endpoint:** `/Authenticate/{scheme}`
- **Route Parameters:**
  - `scheme` (string): Tên scheme OAuth (ví dụ: `Google`).
- **Mô tả:** Chuyển hướng người dùng qua trang đăng nhập của bên thứ 3. Trả về callback URL chứa `access_token` và `Id` của user.

### 1.2. Đăng nhập hệ thống (Sign in)
- **Method:** `POST`
- **Endpoint:** `/Authenticate/sign-in`
- **Body request:** (`application/json`)
  ```json
  {
      "email": "user@example.com",
      "password": "your_password"
  }
  ```
- **Response:**
  - Trả về payload chứa `access_token` và thông tin User. 
  - **Lưu ý quan trọng cho FE:** `refresh_token` sẽ tự động được set vào **Cookie** của trình duyệt theo key `token-refresh` với cờ `HttpOnly` (bảo mật tốt hơn lưu ở LocalStorage).

### 1.3. Đăng ký tài khoản (Sign up)
- **Method:** `POST`
- **Endpoint:** `/Authenticate/sign-up`
- **Body request:** (`application/json`)
  ```json
  {
      "email": "user@example.com",
      "password": "your_password",
      "fullName": "User Name",
      ... // (Thêm các field theo định nghĩa của UserForRegisterCommand)
  }
  ```

### 1.4. Refresh Token (Làm mới phiên bản đăng nhập)
- **Method:** `POST`
- **Endpoint:** `/Authenticate/refresh-token`
- **Yêu cầu:** Request phải gửi kèm **Cookie** chứa key `token-refresh`.
- **Mô tả:** Khi `access_token` hết hạn, gọi API này để lấy lại token mới mà không cần đăng nhập lại. 

### 1.5. Đăng xuất (Sign out)
- **Method:** `POST`
- **Endpoint:** `/Authenticate/sign-out`
- **Mô tả:** Xoá cookie `token-refresh` và vô hiệu hóa phiên đăng nhập ở database.

---

### 1. Chi tiết JSON Trả về cho nhóm API Authentication

#### 1.2. Đăng nhập hệ thống (Sign in) & 1.4. Refresh Token
- **Endpoint:** `POST /Authenticate/sign-in` & `POST /Authenticate/refresh-token`
- **Response Model:** Trả về đối tượng `UserIdentity` bên trong `data`. 
- **Lưu ý:** `refreshToken` được server set vào HTTP-only Cookie nên trong payload JSON trả về trường này sẽ là `null` để đảm bảo bảo mật.



**JSON Response (Thành công - 200 OK):**
```json
{
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5c...", 
    "sessionId": "string-session-id-guid",
    "refreshToken": null, 
    "info": {
      "id": "123e4567-e89b-12d3-a456-426614174000",
      "userName": "user",
      "email": "user@example.com",
      "avatar": "https://..."
      // ... các thông tin khác của UserInfo
    }
  },
  "messages": [],
  "isSuccess": true
}
```

**JSON Response (Thất bại - 400/401 BadRequest/Unauthorized):**
```json
{
  "data": null,
  "messages": [
    "Sai email hoặc mật khẩu.",
    "Tài khoản chưa được kích hoạt."
  ],
  "isSuccess": false
}
```

#### 1.3. Đăng ký tài khoản (Sign up) & 1.5. Đăng xuất (Sign out)
- **Endpoint:** `POST /Authenticate/sign-up` & `POST /Authenticate/sign-out`
- **Response Model:** Thông thường trả về thông báo thành công.

**JSON Response (Thành công - 200 OK):**
```json
{
  "data": true,         // Hoặc object User tuỳ thuộc command trả về gì
  "messages": [
    "Đăng ký tài khoản thành công." 
  ],
  "isSuccess": true
}
```

---

### 💡 Hướng dẫn cho Front-end (Axios Interception)
Phía FE nên thiết lập một **Axios Interceptor** để tự động parse cái wrapper này, ví dụ:

```javascript
axiosInstance.interceptors.response.use(
  (response) => {
    const res = response.data;
    if (res.isSuccess) {
      return res.data; // Chỉ lấy phần data thực sự cần thiết
    }
    // Xử lý show toast message lỗi từ res.messages
    alert(res.messages.join(", "));
    return Promise.reject(new Error("API Error"));
  },
  (error) => {
    // Xử lý mã lỗi HTTP 401, 403, 500
    return Promise.reject(error);
  }
);
```