# Kế hoạch triển khai Auto Refresh Token Realtime cho React + Zustand + SignalR + OpenIddict SSO

- Phần Back-end Authorization Server tôi đã xử lý xong

## 1. Kiến trúc mục tiêu

```text
SSO(OpenIddict)
 ├── Access Token (short-lived)
 ├── Refresh Token (httpOnly cookie)
 └── Rotation refresh token

React Client
 ├── Zustand auth store
 ├── Axios interceptor
 ├── Refresh scheduler
 ├── SignalR auto reconnect
 └── Silent refresh
```

---

# 2. Thay đổi phía OpenIddict

## Bật refresh token rotation

```csharp
options.AllowRefreshTokenFlow();

options.UseRollingRefreshTokens();

options.SetAccessTokenLifetime(TimeSpan.FromMinutes(15));

options.SetRefreshTokenLifetime(TimeSpan.FromDays(7));
```

---

# 3. Không phụ thuộc expires_in từ OpenIddict

Vì SSO flow hiện tại không trả:

```json
expires_in
```

=> Giải pháp phù hợp hơn:

## Decode JWT access token để lấy exp

Cài:

```bash
npm install jwt-decode
```

Utility:

```ts
import { jwtDecode } from "jwt-decode";

export function getTokenExpiration(token: string) {
    const decoded: any = jwtDecode(token);

    return decoded.exp * 1000;
}
```

JWT luôn có:

```json
{
  "exp": 1719999999
}
```

=> không cần backend trả thêm.

---

# 4. Zustand Auth Store

Store nên có:

```ts
type AuthState = {
    accessToken: string | null;
    expiresAt: number | null;

    setAccessToken: (token: string) => void;

    clearAuth: () => void;

    refreshPromise: Promise<string> | null;
}
```

---

# 5. Khi login SSO thành công

Sau callback login:

```ts
const expiresAt = getTokenExpiration(accessToken);

setAccessToken(accessToken);
```

Không lưu access token vào localStorage nếu có thể.

Ưu tiên:

```text
memory only
```

---

# 6. Refresh Scheduler Realtime

## Mục tiêu

Refresh trước khi token hết hạn.

Ví dụ:

```text
Token sống: 15 phút
Refresh trước: 1 phút
```

---

## Tạo scheduler

```ts
let refreshTimer: NodeJS.Timeout;

export function scheduleTokenRefresh() {

    const { expiresAt } = useAuthStore.getState();

    if (!expiresAt) return;

    const timeout =
        expiresAt - Date.now() - 60000;

    clearTimeout(refreshTimer);

    refreshTimer = setTimeout(async () => {

        await refreshAccessToken();

    }, Math.max(timeout, 0));
}
```

---

# 7. Hàm refreshAccessToken()

## Yêu cầu quan trọng

* chỉ refresh 1 lần
* các request khác chờ
* tránh spam refresh

---

## Flow

```text
refreshAccessToken()
    ↓
POST /connect/token
grant_type=refresh_token
    ↓
receive new access token
    ↓
update Zustand
    ↓
reschedule refresh
    ↓
SignalR reconnect
```

---

## Nên dùng singleton promise

```ts
if (refreshPromise) return refreshPromise;
```

tránh:

```text
10 request -> 10 refresh call
```

---

# 8. Axios Interceptor

Interceptor hiện tại giữ lại nhưng đổi vai trò:

## Trước đây

```text
401 -> refresh
```

## Sau nâng cấp

```text
Primary:
    realtime scheduler

Fallback:
    interceptor khi token hết hạn bất ngờ
```

---

# 9. SignalR Realtime

## Tạo connection

```ts
.withUrl("/chatHub", {
    accessTokenFactory: async () => {
        return useAuthStore
            .getState()
            .accessToken!;
    }
})
```

---

# 10. Sau khi refresh token

SignalR vẫn đang dùng token cũ.

=> cần reconnect.

## Flow

```text
refresh success
    ↓
connection.stop()
    ↓
connection.start()
```

---

# 11. Auto reconnect SignalR

Bật:

```ts
.withAutomaticReconnect()
```

---

# 12. App Startup Flow

## Khi F5 browser

Access token trong memory mất.

=> cần silent auth.

---

## Flow khởi động app

```text
App start
    ↓
POST /connect/token
(refresh token cookie tự gửi)
    ↓
lấy access token mới
    ↓
restore Zustand
    ↓
connect SignalR
```

---

# 13. Refresh Token Storage

## Access Token

```text
Zustand memory
```

## Refresh Token

```text
httpOnly secure cookie
```

KHÔNG:

```text
localStorage refresh token
```

---

# 14. Logout Flow

```text
logout
    ↓
revoke refresh token
    ↓
clear Zustand
    ↓
stop SignalR
    ↓
redirect login
```

---

# 15. Thứ tự triển khai đề xuất

## Phase 1

* Decode JWT exp
* Zustand expiresAt
* Scheduler refresh trước hạn

---

## Phase 2

* Refactor refreshAccessToken singleton
* Queue request
* Cleanup interceptor

---

## Phase 3

* SignalR accessTokenFactory
* SignalR reconnect sau refresh

---

## Phase 4

* Silent refresh khi reload browser
* Session restore

---

# 16. Kiến trúc cuối cùng

```text
User online 8 tiếng
    ↓
token tự refresh nền
    ↓
SignalR tự reconnect
    ↓
request tự retry
    ↓
không hiện lỗi 401
    ↓
không logout giữa chừng
```

Đây là flow chuẩn của các hệ thống chat/social realtime hiện nay.
