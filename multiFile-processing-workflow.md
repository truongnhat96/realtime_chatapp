# Quy trình triển khai tối ưu UX khi gửi nhiều file cùng lúc phía client (React)

## 1. Khi user chọn file

### Phân loại file

```ts id="jlwm60"
const images: File[] = [];
const videos: File[] = [];
const documents: File[] = [];

for (const file of selectedFiles) {
    if (file.type.startsWith("image/")) {
        images.push(file);
    }
    else if (file.type.startsWith("video/")) {
        videos.push(file);
    }
    else {
        documents.push(file);
    }
}
```

---

## 2. Tạo optimistic messages ngay lập tức

KHÔNG chờ upload.

### Nếu có ảnh

Tạo:

```ts id="jlwm61"
temp-image-message
```

chứa:

* toàn bộ ảnh
* status = "uploading"

---

## Với video

Mỗi video:

```ts id="jlwm62"
1 temp message riêng
```

---

## Với file

Mỗi file:

```ts id="jlwm63"
1 temp message riêng
```

---

## 3. Render ngay lên chat UI

Ví dụ UI:

```text id="jlwm64"
[6 ảnh] 0%
[video1.mp4] queued
[video2.mp4] queued
[file.pdf] queued
```

KHÔNG đợi server response.

---

## 4. Upload ảnh song song

### Dùng Promise.all chỉ cho ảnh

```ts id="jlwm65"
const uploadedImages = await Promise.all(
    images.map(uploadImage)
);
```

---

## 5. Trong lúc upload ảnh

### Update progress realtime

```ts id="jlwm66"
onUploadProgress(percent)
```

### Cập nhật

```ts id="jlwm67"
temp-image-message.progress
```

---

## 6. Sau khi toàn bộ ảnh upload xong

Gọi:

```http id="jlwm68"
POST /send-media
```

Body:

```json id="jlwm69"
{
  "messageType": "Image",
  "attachments": [...]
}
```

---

## 7. Khi send-media thành công

Replace:

```text id="jlwm6a"
temp message
```

thành:

```text id="jlwm6b"
real message từ server
```

---

## 8. Xử lý video + file bằng upload queue

KHÔNG dùng Promise.all cho video/file lớn.

---

## 9. Tạo upload queue

```ts id="jlwm6c"
const uploadQueue = [
   ...videos,
   ...documents
];
```

---

## 10. Xử lý tuần tự

```ts id="jlwm6d"
for (const file of uploadQueue) {
    await processFile(file);
}
```

---

## 11. processFile()

### STEP 1

Update UI:

```ts id="jlwm6e"
status = "uploading"
```

---

### STEP 2

Upload file:

```http id="jlwm6f"
POST /upload-media
```

---

## 12. Trong lúc upload

Update progress realtime:

```ts id="jlwm6g"
tempMessage.progress = percent;
```

---

## 13. Upload xong

Gọi:

```http id="jlwm6h"
POST /send-media
```

---

## 14. Khi send-media thành công

Replace:

```text id="jlwm6i"
temp message
```

thành:

```text id="jlwm6j"
message thật
```

---

## 15. Nếu upload fail

KHÔNG remove message.

Update:

```ts id="jlwm6k"
status = "failed"
```

Hiển thị:

```text id="jlwm6l"
❌ Failed
[Retry]
```

---

## 16. State tối thiểu cần có

```ts id="jlwm6m"
type MessageStatus =
    | "queued"
    | "uploading"
    | "sending"
    | "sent"
    | "failed";
```

---

## 17. Message local state

```ts id="jlwm6n"
{
   tempId: string;
   status: MessageStatus;
   progress: number;
   attachments: [];
}
```

---

## 18. Khi SignalR trả về message thật

Tìm:

```ts id="jlwm6o"
tempId
```

rồi replace bằng:

```ts id="jlwm6p"
message từ server
```

---

## 19. UI cần hiển thị

### Ảnh

```text id="jlwm6q"
1 bubble
nhiều ảnh
1 progress
```

---

### Video/file

```text id="jlwm6r"
mỗi file 1 dòng riêng
progress riêng
```

---

## 20. Không làm theo cách này

Sai:

```ts id="jlwm6s"
await uploadAllFiles();
renderUI();
```

---

## 21. Luồng đúng

```text id="jlwm6t"
Render temp UI ngay
    ↓
Upload nền
    ↓
Update progress realtime
    ↓
Replace bằng message thật
```

---

## 22. Kiến trúc upload tối ưu

### Ảnh

```ts id="jlwm6u"
Promise.all(images)
```

---

### Video/file

```text id="jlwm6v"
queue tuần tự
```

---

## 23. Nếu muốn tối ưu hơn

Cho phép:

```text id="jlwm6w"
2 upload song song
```

cho video/file.

Ví dụ:

```ts id="jlwm6x"
concurrency = 2
```

Không nên vượt quá:

```text id="jlwm6y"
2-3
```

với video lớn.

---

## 24. Flow hoàn chỉnh

```text id="jlwm6z"
User click send
    ↓
Phân loại file
    ↓
Tạo optimistic temp messages
    ↓
Render UI ngay
    ↓
Upload ảnh song song
    ↓
send-media ảnh
    ↓
Upload queue video/file
    ↓
send-media từng file
    ↓
Replace temp messages bằng dữ liệu server
```
