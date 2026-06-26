# Use Case 1 - Bắt đầu cuộc gọi nhóm

## 1. Người dùng A bắt đầu cuộc gọi

Ví dụ nhóm:

```text
A
B
C
D
E
```

A nhấn:

```text
📹 Gọi video
```

Hệ thống tạo:

```text
Call Session #1001

Conversation = Nhóm ABC

Host = A

Status = Active
```

Đồng thời A tự động trở thành người tham gia đầu tiên.

```text
A
Joined
```

---

## 2. Gửi lời mời

Toàn bộ thành viên còn lại:

```text
B
C
D
E
```

đều nhận được thông báo:

```text
A đang bắt đầu cuộc gọi video
```

Lúc này:

```text
B
Ringing

C
Ringing

D
Offline

E
Ringing
```

Lưu ý:

Offline **không đồng nghĩa từ chối**.

---

# Use Case 2 - Người dùng tham gia

Ví dụ:

B nhấn:

```text
Tham gia
```

Trạng thái:

```text
B

Joined
```

Cuộc gọi lúc này có:

```text
A

B
```

---

# Use Case 3 - Người dùng từ chối

Ví dụ:

C nhấn:

```text
Từ chối
```

Trạng thái:

```text
C

Declined
```

C không còn popup.

Nhưng:

Call Session vẫn còn tồn tại.

---

# Use Case 4 - Người dùng Offline sau đó Online

Ví dụ:

D đang offline.

Sau 5 phút:

D mở Messenger.

Ứng dụng phát hiện:

```text
Conversation

↓

Có Call Session

↓

Status = Active
```

UI hiện:

```text
Cuộc gọi nhóm đang diễn ra

[Tham gia]
```

D có thể tham gia ngay.

Không cần A gọi lại.

---

# Use Case 5 - Người dùng đã từ chối nhưng muốn tham gia lại

Ví dụ:

C

↓

Declined

↓

Sau 2 phút đổi ý.

Mở lại cuộc trò chuyện.

Ứng dụng thấy:

```text
Call Session

Status = Active
```

Vẫn hiện:

```text
📹 Cuộc gọi đang diễn ra

[Tham gia]
```

C chỉ cần bấm:

```text
Join
```

Không cần A mời lại.

Trạng thái chuyển:

```text
Declined

↓

Joined
```

---

# Use Case 6 - Người dùng đã tham gia rồi rời cuộc gọi

Ví dụ:

B

↓

Joined

↓

Out

````

Trạng thái:

```text
Left
````

Lưu ý:

Không xóa participant.

Chỉ ghi:

```text
LeftAt
```

---

# Use Case 7 - Người dùng quay lại

Ví dụ:

B

↓

Left

↓

Join again

````

Trạng thái:

```text
Joined
````

Tiếp tục vào cuộc gọi.

Messenger và Zalo đều hỗ trợ.

---

# Use Case 8 - Host rời cuộc gọi

Ví dụ:

Host:

```text
A
```

rời.

Nếu:

```text
B

C
```

vẫn còn trong phòng.

Cuộc gọi:

```text
Vẫn tiếp tục.
```

Không kết thúc.

Messenger hoạt động như vậy.

Host chỉ là người tạo cuộc gọi.

Không phải "chủ phòng" theo nghĩa Teams.

---

# Use Case 9 - Cuộc gọi kết thúc

Call chỉ kết thúc khi:

```text
Không còn bất kỳ ai
```

trong phòng.

Ví dụ:

```text
A

Left

B

Left

C

Left
```

Số participant online:

```text
0
```

Server:

```text
Call Session

↓

Ended
```

Sau đó mới sinh lịch sử cuộc gọi.

Ví dụ:

```text
📹 Cuộc gọi video

35 phút

3 người tham gia
```

---

# Use Case 10 - Có người mở chat khi cuộc gọi đang diễn ra

Ví dụ:

E chưa từng nhận popup.

Nhưng mở Conversation.

Ứng dụng kiểm tra:

```text
Conversation

↓

Có Active Call
```

Hiện:

```text
📹 Cuộc gọi đang diễn ra

[Tham gia]
```

---

# Use Case 11 - Thành viên mới được thêm vào nhóm khi cuộc gọi đang diễn ra

(Messenger hiện nay không tự động kéo người mới vào cuộc gọi.)

Ví dụ:

```text
A
B
C
```

Đang gọi.

Thêm:

```text
D
```

vào nhóm.

D:

```text
Không tự động tham gia.
```

Nếu muốn:

Host phải mời.

Hoặc D mở chat và bấm:

```text
Tham gia
```

(nếu ứng dụng hỗ trợ).

---

# State Machine của Participant

Mình khuyên mỗi participant chỉ có một state tại một thời điểm:

```text
                 +----------------+
                 |   Invited      |
                 +----------------+
                   |   |      |
          Join     |   |      | Decline
                   |   |      |
                   v   |      v
             +---------+   +-----------+
             | Joined  |   | Declined |
             +---------+   +-----------+
                  |
                  | Leave
                  v
             +---------+
             |  Left   |
             +---------+
                  |
                  | Join again
                  v
             +---------+
             | Joined  |
             +---------+
```

Offline thực chất **không phải là một trạng thái**, mà là tình trạng kết nối của người dùng. Một người offline vẫn có thể được coi là đang ở trạng thái `Invited` nếu cuộc gọi còn diễn ra.

---

# Điều kiện kết thúc Call Session

Chỉ khi:

```text
Joined Participants == 0
```

thì:

```text
Call Session

↓

Ended
```

Sau đó:

* Không ai có thể tham gia lại.
* Muốn gọi tiếp phải tạo Call Session mới.
* Lúc này mới ghi lịch sử cuộc gọi vào timeline.

---

## Tổng kết

Mô hình này rất gần với Messenger và Zalo:

* Một cuộc gọi nhóm chỉ có **một Call Session** gắn với `Conversation`.
* Thành viên có thể **tham gia nhiều lần**, **rời nhiều lần**, **từ chối rồi tham gia lại**, hoặc **online sau mới tham gia** miễn là `Call Session` vẫn còn `Active`.
* Cuộc gọi **không phụ thuộc vào Host**; host rời không làm cuộc gọi kết thúc.
* Cuộc gọi chỉ kết thúc khi **không còn bất kỳ người tham gia nào trong phiên**, sau đó mới tạo bản ghi lịch sử để hiển thị trong cuộc trò chuyện. Đây là mô hình đủ linh hoạt để sau này bạn mở rộng thêm chia sẻ màn hình, thêm người vào cuộc gọi hoặc các tính năng khác mà không cần thay đổi workflow cốt lõi.
