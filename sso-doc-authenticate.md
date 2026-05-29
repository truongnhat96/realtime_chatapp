# 1. Tổng quan Authentication & SSO Flow

Authorization Server Base Url: https://localhost:7004

Authorization Server sử dụng:

| Thành phần           | Công nghệ                    |
| -------------------- | ---------------------------- |
| Authentication       | ASP.NET Identity             |
| Authorization Server | OpenIddict                   |
| OAuth2/OIDC Flow     | Authorization Code + PKCE    |
| SSO Session          | Cookie Authentication        |
| External Login       | Google OAuth                 |
| Token Architecture   | BFF + HttpOnly Refresh Token |

Client applications:

* Chat App (hiện tại)
* Video App (chưa có, tương lai sẽ xây dựng sau)

sẽ KHÔNG:

* tự login bằng API truyền username/password
* tự lưu refresh token
* tự gọi `/connect/token`

Thay vào đó:

* redirect người dùng tới Authorization Server
* Authorization Server xử lý login
* React chỉ giữ access token
* refresh token được lưu trong HttpOnly Cookie phía server domain.

---

# 2. Kiến trúc Token

| Token         | Nơi lưu                 |
| ------------- | ----------------------- |
| Access Token  | React memory/state      |
| Refresh Token | HttpOnly Cookie         |
| SSO Session   | ASP.NET Identity Cookie |

Frontend:

```text id="v2m8qw"
KHÔNG BAO GIỜ đọc refresh token
```

Đây là kiến trúc:

```text id="m5x1vy"
BFF (Backend For Frontend)
```

giúp tăng bảo mật:

* chống XSS
* chống token theft
* chống malicious extensions.

---

# 3. Authentication Endpoints

Controller:

```text id="x7v3qw"
AccountController
```

---

# 3.1. Đăng ký tài khoản

## GET Register

* **Method:** `GET`
* **Endpoint:** `/Account/Register`

Hiển thị giao diện đăng ký tài khoản.

---

## POST Register

* **Method:** `POST`
* **Endpoint:** `/Account/Register`

## Form Data

| Field    | Type   |
| -------- | ------ |
| username | string |
| password | string |
| email    | string |
| name     | string |

---

## Mô tả

* Tạo user bằng ASP.NET Identity
* tự động gán role:

```text id="r1m7qx"
User
```

---

## Response

### Thành công

```text id="z6v2qw"
Redirect -> /Account/Login
```

### Thất bại

Trả về Register View cùng validation errors.

---

# 3.2. Đăng nhập hệ thống

## GET Login

* **Method:** `GET`
* **Endpoint:** `/Account/Login`

## Query Parameters

| Field     | Type   |
| --------- | ------ |
| returnUrl | string |

---

## Mô tả

Hiển thị trang login.

`returnUrl` thường là:

```text id="g9m2wr"
/connect/authorize?client_id=...
```

---

## POST Login

* **Method:** `POST`
* **Endpoint:** `/Account/Login`

## Form Data

| Field     | Type   |
| --------- | ------ |
| username  | string |
| password  | string |
| returnUrl | string |

---

## Mô tả

Đăng nhập bằng ASP.NET Identity:

```csharp id="w4x8qt"
_signInManager.PasswordSignInAsync(...)
```

Nếu thành công:

* ASP.NET Identity tạo:

```text id="s2m7vx"
SSO Cookie
```

---

## Response

Nếu có:

```text id="q5v1wr"
returnUrl
```

=> redirect về:

```text id="u8m3qx"
/connect/authorize
```

---

# 3.3. Đăng nhập Google

## External Login

* **Method:** `POST`
* **Endpoint:** `/Account/ExternalLogin`

## Form Data

| Field    | Type   |
| -------- | ------ |
| provider | string |

Ví dụ:

```text id="p4v9qy"
Google
```

---

## Mô tả

Redirect browser sang Google OAuth page.

---

## Response

```text id="d7m2qx"
302 Redirect -> accounts.google.com
```

---

# 3.4. Google Callback

* **Method:** `GET`
* **Endpoint:** `/Account/ExternalLoginCallback`

## Query Parameters

| Field     | Type   |
| --------- | ------ |
| returnUrl | string |

Default:

```text id="t1v8wr"
/connect/authorize
```

---

## Mô tả

Sau khi Google xác thực thành công:

* lấy Google user info
* kiểm tra local user
* nếu chưa có:

  * tạo local user
  * link external login
* tạo SSO cookie

---

## Response

```text id="h6m4qy"
Redirect -> returnUrl
```

Thông thường:

```text id="z9v2qx"
/connect/authorize
```

---

# 4. OpenIddict OAuth2/OIDC Endpoints

Các endpoint dưới đây do OpenIddict tự xử lý.

---

# 4.1. Authorization Endpoint

* **Method:** `GET`
* **Endpoint:** `/connect/authorize`

---

## Mô tả

Bắt đầu Authorization Code Flow + PKCE.

Client app redirect browser tới endpoint này.

---

## Query Parameters

| Field                 | Mô tả                   |
| --------------------- | ----------------------- |
| client_id             | ID client app           |
| response_type         | `code`                  |
| redirect_uri          | callback URL            |
| scope                 | openid profile chat-api |
| code_challenge        | PKCE challenge          |
| code_challenge_method | `S256`                  |
| state                 | anti-CSRF state         |

---

## Ví dụ

```http id="q8m1wr"
GET /connect/authorize?
client_id=chat-app
&response_type=code
&redirect_uri=http://localhost:5173/callback
&scope=openid profile chat-api
&code_challenge=abcxyz
&code_challenge_method=S256
```

---

## Response

### Nếu chưa login

```text id="x3v7qy"
Redirect -> /Account/Login
```

---

### Nếu đã login

```text id="f5m2qx"
Redirect -> client callback
```

Ví dụ:

```text id="c9v1wr"
http://localhost:5173/callback?code=abc123
```

---

# 4.2. Token Endpoint

* **Method:** `POST`
* **Endpoint:** `/connect/token`

---

## QUAN TRỌNG

Frontend React:

```text id="n6m8qy"
KHÔNG được gọi trực tiếp endpoint này
```

Endpoint này chỉ được gọi bởi:

```text id="t4v2qx"
TokenController (BFF Layer)
```

---

## Mô tả

Dùng để:

* exchange authorization code
* refresh access token

Endpoint do OpenIddict tự xử lý.

---

# 5. BFF Token Endpoints

Controller:

```text id="r2m7qx"
TokenController
```

---


# 5.1. Refresh Access Token

* **Method:** `POST`
* **Endpoint:** `/api/token/refresh`

---

## Mô tả

Khi access token hết hạn:

Frontend gọi:

```text id="k8v1wr"
/api/token/refresh
```

Browser sẽ tự gửi:

```text id="u5m2qx"
refresh token cookie
```

Backend:

* gọi `/connect/token`
* refresh token rotation
* set refresh token mới
* trả access token mới

---

## Request

Không cần body.

Browser tự gửi HttpOnly Cookie.

---

## Response

```json
{
  "access_token": "eyJhbGciOi...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

---

# 5.3. Logout

* **Method:** `POST`
* **Endpoint:** `/auth/logout`

---

## Mô tả

Server sẽ:

* revoke refresh token
* delete refresh cookie
* remove ASP.NET Identity session

---

## Response

```http id="d2m7qx"
200 OK
```

---

# 6. React Frontend Setup

Khuyến nghị sử dụng:

[react-oidc-context](https://github.com/authts/react-oidc-context)

---

# 7. Cài package

```bash id="x9v4qw"
npm install react-oidc-context oidc-client-ts
```

---

# 8. OIDC Config

```ts
const oidcConfig = {
  authority: "https://localhost:7004",

  client_id: "chat-app",

  redirect_uri:
    "http://localhost:5173/callback",

  response_type: "code",

  scope:
    "openid profile chat-api",

  automaticSilentRenew: false
};
```

---

# 9. QUAN TRỌNG

```text id="f4m8wr"
automaticSilentRenew PHẢI = false
```

vì:

* refresh token không nằm phía FE
* FE không tự refresh token được
* refresh flow do backend xử lý.

---

# 10. Setup AuthProvider

```tsx
import { AuthProvider } from "react-oidc-context";

<AuthProvider {...oidcConfig}>
  <App />
</AuthProvider>
```

---

# 11. Login Flow

## Login

```tsx
const auth = useAuth();

await auth.signinRedirect();
```

---

# 12. Điều gì xảy ra khi signinRedirect()

Library sẽ tự động:

## BƯỚC 1

Tạo:

* PKCE verifier
* PKCE challenge
* state

---

## BƯỚC 2

Redirect browser tới:

```text id="a8v2qx"
/connect/authorize
```

---

## BƯỚC 3

Authorization Server:

* login user
* tạo SSO cookie

---

## BƯỚC 4

OpenIddict generate:

```text id="p7m4qw"
authorization code
```

---

## BƯỚC 5

Redirect về:

```text id="z3v8qy"
/callback?code=abc
```


---

## BƯỚC 6

Exchange code lấy token
Client tự gọi /connect/token để lấy access token chứ không dùng siginRedirectCallback của react-oidc-context

```ts
const response = await axios.post(
  "https://localhost:7004/connect/token",
  new URLSearchParams({
    grant_type: "authorization_code",
    client_id: "chat-app",
    code,
    redirect_uri:
      "http://localhost:5173/auth-callback",
    code_verifier: codeVerifier
  }),
  {
    withCredentials: true,
    headers: {
      "Content-Type":
        "application/x-www-form-urlencoded"
    }
  }
);
```

---

## BƯỚC 7

Lưu access token vào memory/state

---

# 14. Sau Exchange thành công

Backend:

* set refresh token cookie
* trả access token

Frontend:

* lưu access token vào memory/state
* dùng để gọi API.

---

# 15. Gọi Chat API
Ví dụ:

```ts
axios.get("/api/messages", {
  headers: {
    Authorization: `Bearer ${accessToken}`
  }
});
```

---

# 16. Refresh Flow

Khi access token hết hạn:

```ts
await axios.post(
  "/api/token/refresh",
  {},
  {
    withCredentials: true
  }
);
```

Browser tự gửi:

```text id="h9m2qx"
refresh token cookie
```

Backend:

* refresh token rotation
* trả access token mới

---

# 17. SSO Flow giữa nhiều app

Ví dụ:

* user đã login Chat App
* Authorization Server đã có:

```text id="q7v4wr"
SSO Cookie
```

---

## User mở Video App

Video App gọi:

```text id="j1m8qx"
/connect/authorize
```

---

## Authorization Server thấy:

```text id="x6v2qy"
user đã authenticated
```

=> KHÔNG hiện login page nữa.

OpenIddict:

* generate authorization code ngay lập tức
* Video App login tự động

Đây chính là:

```text id="r5m9qw"
Single Sign-On (SSO)
```
