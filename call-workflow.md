# Trường hợp 1: Cuộc gọi thành công

## Bước 1: Người dùng A bấm gọi

Trong cuộc trò chuyện:

```text
A → gọi thoại cho B
```

Hệ thống ghi nhận:

```text
Một cuộc gọi mới được tạo
Trạng thái: Đang đổ chuông
Người gọi: A
Người nhận: B
```

Lúc này:

```text
Chưa xuất hiện gì trong lịch sử chat
```

Không tạo ngay "tin nhắn cuộc gọi".

---

## Bước 2: B nhận được cuộc gọi

Màn hình B hiển thị:

```text
A đang gọi cho bạn
```

B có thể:

```text
Chấp nhận
Từ chối
Bỏ qua
```

---

## Bước 3: B chấp nhận

Hai bên kết nối.

Trạng thái cuộc gọi chuyển sang:

```text
Đang diễn ra
```

Người dùng bắt đầu nói chuyện.

---

## Bước 4: Một trong hai bên kết thúc

Ví dụ:

```text
A gác máy
```

Hệ thống tính:

```text
Thời điểm bắt đầu
Thời điểm kết thúc
Thời lượng
```

Ví dụ:

```text
05 phút 32 giây
```

---

## Bước 5: Tạo lịch sử cuộc gọi

Lúc này mới xuất hiện trong khung chat:

```text
📞 Cuộc gọi thoại

05:32
```

hoặc:

```text
📹 Cuộc gọi video

05:32
```

---

# Trường hợp 2: Cuộc gọi nhỡ

## Bước 1

A gọi B.

---

## Bước 2

B không nghe máy.

Ví dụ:

```text
30 giây không phản hồi
```

---

## Bước 3

Cuộc gọi tự kết thúc.

Trạng thái:

```text
Missed
```

---

## Bước 4

Lịch sử chat xuất hiện:

Ở phía A:

```text
📞 Cuộc gọi thoại
Không trả lời
```

Ở phía B:

```text
📞 Cuộc gọi nhỡ
```

---

# Trường hợp 3: Người nhận từ chối

## Bước 1

A gọi B.

---

## Bước 2

B nhấn:

```text
Từ chối
```

---

## Bước 3

Cuộc gọi kết thúc ngay.

Trạng thái:

```text
Rejected
```

---

## Bước 4

Lịch sử chat:

A thấy:

```text
📞 Cuộc gọi bị từ chối
```

B thấy:

```text
📞 Bạn đã từ chối cuộc gọi
```

---

# Trường hợp 4: Người gọi hủy

## Bước 1

A gọi B.

---

## Bước 2

Trước khi B nghe:

```text
A tự hủy
```

---

## Bước 3

Trạng thái:

```text
Cancelled
```

---

## Bước 4

Lịch sử chat:

A:

```text
📞 Bạn đã hủy cuộc gọi
```

B:

```text
📞 Cuộc gọi đã bị hủy
```

---

# Trường hợp nhóm chat

Ví dụ:

```text
Nhóm ABC

A gọi video nhóm
```

---

## Bước 1

Tạo cuộc gọi nhóm.

---

## Bước 2

Mọi thành viên nhận được lời mời.

Ví dụ:

```text
A
B
C
D
```

---

## Bước 3

Một số người tham gia - cần xử lý render tin nhắn hệ thống giống như các tin nhắn hệ thống khác trong nhóm chat:

```text
A đã tham gia cuộc gọi video
B đã tham gia cuộc gọi video
```

---

Một số người không tham gia:

```text
C bỏ qua
D bỏ qua
```

---

## Bước 4

Kết thúc.

Lịch sử chat:

```text
📹 Cuộc gọi video nhóm

2 người tham gia

15 phút 24 giây
```

---

# Điều người dùng thực sự nhìn thấy

Quan trọng, cuộc gọi không được xem là một "tin nhắn của người dùng".

Người dùng không thấy:

```text
A:
📞 Cuộc gọi thoại
```

hoặc

```text
B:
📞 Cuộc gọi thoại
```

như tin nhắn thông thường.

Thay vào đó họ thấy một **mục lịch sử cuộc gọi** nằm trong timeline cuộc trò chuyện.

Về mặt trải nghiệm người dùng nó giống:

```text
Tin nhắn
↓
Tin nhắn
↓
Sự kiện cuộc gọi
↓
Tin nhắn
```

chứ không phải:

```text
Tin nhắn của A
↓
Tin nhắn của B
↓
Tin nhắn cuộc gọi thuộc về A
```

Đây là lý do nhiều hệ thống tách riêng **Messages** và **Calls**, rồi khi tải cuộc trò chuyện sẽ hợp nhất chúng thành một danh sách timeline để render. Nhờ vậy cùng một bản ghi cuộc gọi có thể hiển thị khác nhau tùy người đang xem:

```text
Bạn đã thực hiện cuộc gọi thoại

Nam đã thực hiện cuộc gọi thoại

Cuộc gọi nhỡ

Bạn đã bỏ lỡ cuộc gọi
```

mà không cần lưu nhiều bản ghi lịch sử khác nhau trong database.
