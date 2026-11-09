# Zalo Lite — nhắn tin, gọi thoại/video, sao lưu (web app cho iPhone)

Web app dạng **PWA**: mở bằng Safari, bấm *Thêm vào MH chính* là dùng như app thật.
Server chỉ dùng thư viện lõi của Node.js (không cần `npm install`).

## Có gì trong bản này

| Tính năng | Chi tiết |
|---|---|
| Tài khoản | Đăng ký/đăng nhập bằng tên đăng nhập (hoặc số điện thoại) + mật khẩu (băm scrypt) |
| Nhắn tin | 1-1 và nhóm (tối đa 200 người), realtime, "đang soạn tin", Đã gửi/Đã xem, link bấm được, tự kết nối lại, không mất/không trùng tin khi rớt mạng |
| Tệp & ảnh | Gửi ảnh (tự nén ≤1600px) và tệp ≤25 MB, xem ảnh toàn màn hình |
| Gọi | Thoại + video **1-1** (WebRTC), tắt mic/camera, đổi camera trước/sau, lưu lịch sử cuộc gọi vào chat |
| Sao lưu | Tự sao lưu `db.json` mỗi ngày (giữ 14 bản) + nút **Sao lưu ngay** (xuất JSON, lưu vào Tệp/iCloud) + **Khôi phục** |
| Đồng bộ | Đăng nhập thiết bị khác là có đủ lịch sử |
| iPhone | Safe-area (tai thỏ), bàn phím không che ô nhập, chống tự phóng to, badge số tin chưa đọc |

## Chạy thử trên máy tính

```bash
node server.js          # mở http://localhost:3000
```

> Nhắn tin chạy được qua HTTP, nhưng **gọi thoại/video bắt buộc HTTPS** (trừ `localhost`) vì Safari chỉ cấp micro/camera cho trang HTTPS. Muốn thử trên iPhone, hãy deploy lên hosting có HTTPS (bên dưới).

## Deploy từ chính iPhone (không cần máy tính)

Bạn cần một nơi chạy Node.js/Docker **có HTTPS** và **ổ đĩa lưu trữ bền** (persistent volume) để dữ liệu không mất khi khởi động lại. Các dịch vụ như Railway, Render, Fly.io hay VPS riêng đều làm được — hãy xem trang giá hiện tại của từng nơi, vì gói miễn phí thường **không có ổ đĩa bền**.

1. **Giải nén**: trong app *Tệp*, chạm vào file `zalo-lite.zip` để giải nén.
2. **Đưa code lên GitHub**: mở Safari → github.com → *New repository* → *uploading an existing file* → chọn toàn bộ file/thư mục vừa giải nén (`server.js`, `package.json`, `Dockerfile`, thư mục `public`…).
   Lưu ý: Safari trên iPhone thường chỉ chọn được từng tệp chứ không chọn được cả thư mục. Nếu vậy, tải các tệp ở thư mục gốc lên trước, rồi dùng *Add file → Create new file* và gõ tên kiểu `public/app.js` (dấu `/` tự tạo thư mục) để dán nội dung từng tệp trong `public/`. Cách nhanh hơn là dùng máy tính hoặc một app Git trên iPhone để đẩy cả thư mục một lần.
3. **Tạo dịch vụ** trên nơi bạn chọn → *Deploy from GitHub repo* → chọn repo (nó sẽ tự dùng `Dockerfile`).
4. **Thêm ổ đĩa (volume)**, gắn vào đường dẫn `/data`.
5. **Biến môi trường**: `DATA_DIR=/data` (đã đặt sẵn trong Dockerfile), `PORT` nếu nơi đó yêu cầu.
6. Mở link HTTPS được cấp bằng Safari → đăng ký tài khoản.
7. **Thêm vào Màn hình chính**: nút Chia sẻ (□↑) → *Thêm vào MH chính*. Mở app từ biểu tượng, lần đầu gọi video bấm *Cho phép* micro/camera.

## Bật gọi ổn định trên 4G/Wi-Fi khác nhau: TURN server

Mặc định dùng STUN công cộng của Google. Khi hai người ở sau NAT "khó" (nhiều mạng 4G/5G, Wi-Fi công ty), cuộc gọi **cần TURN** để chuyển tiếp. Cài `coturn` trên một VPS (cần IP công cộng):

```
# /etc/turnserver.conf
listen-port=3478
fingerprint
use-auth-secret
static-auth-secret=ĐỔI_CHUỖI_BÍ_MẬT_DÀI
realm=turn.ten-mien-cua-ban.com
no-multicast-peers
total-quota=100
min-port=49152
max-port=65535
```

Mở cổng 3478 (UDP+TCP) và 49152–65535 (UDP). Rồi đặt biến môi trường cho app:

```
TURN_URLS=turn:turn.ten-mien-cua-ban.com:3478?transport=udp,turn:turn.ten-mien-cua-ban.com:3478?transport=tcp
TURN_SECRET=ĐỔI_CHUỖI_BÍ_MẬT_DÀI        # cùng giá trị static-auth-secret
```

Server tự cấp tài khoản TURN tạm thời (6 giờ) cho từng người dùng đang đăng nhập. Có thể thay bằng dịch vụ TURN thuê ngoài: đặt `TURN_URLS`, `TURN_USER`, `TURN_PASS`.

## Sao lưu dữ liệu

- **Phía server**: `DATA_DIR/backups/db-YYYY-MM-DD.json` tạo tự động mỗi ngày (giữ 14 bản). Hãy sao lưu cả thư mục `DATA_DIR` (gồm `db.json` và `files/`) ra nơi khác định kỳ (snapshot của volume, hoặc `rclone`/`rsync`).
- **Phía người dùng**: *Cá nhân → Sao lưu ngay* tải về file JSON lịch sử chat của họ.
- **Khôi phục**: *Cá nhân → Khôi phục từ tệp*. Chỉ khôi phục **tin nhắn do chính người dùng gửi**, trong các cuộc trò chuyện họ đang tham gia (để không ai giả mạo tin của người khác). Bản sao lưu chứa thông tin tệp đính kèm chứ **không chứa nội dung ảnh/tệp**.
- **Khôi phục toàn bộ server**: dừng app, chép `db.json` (hoặc một bản trong `backups/`) và thư mục `files/` về `DATA_DIR`, chạy lại.

## Cấu hình (biến môi trường)

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `PORT` | 3000 | Cổng HTTP |
| `DATA_DIR` | `./data` | Nơi lưu dữ liệu |
| `STUN_URLS` | stun của Google | Danh sách STUN, ngăn cách bằng dấu phẩy |
| `TURN_URLS`, `TURN_SECRET` | — | TURN dùng `use-auth-secret` |
| `TURN_URLS`, `TURN_USER`, `TURN_PASS` | — | TURN dùng tài khoản cố định |

## Giới hạn hiện tại (cần biết)

- **Chưa có thông báo đẩy** khi đóng app. iOS (16.4+) hỗ trợ Web Push cho app đã thêm vào Màn hình chính, nhưng chưa làm trong bản này (cần khóa VAPID + thư viện `web-push`). Khi mở app, tin mới vẫn tới ngay.
- **Gọi nhóm chưa có**; mới gọi 1-1. Gọi nhóm cần máy chủ SFU như LiveKit.
- **Chưa mã hóa đầu cuối**: máy chủ lưu tin nhắn dạng văn bản thường. Hãy dùng HTTPS và bảo vệ ổ đĩa.
- **Chưa xác thực OTP** qua SMS; đăng nhập bằng mật khẩu (có giới hạn đăng nhập sai).
- **Một server duy nhất**, lưu bằng file JSON: ổn cho nhóm bạn bè/đội nhỏ (hàng trăm người). Muốn lớn hơn nên chuyển sang PostgreSQL + Redis (pub/sub) để chạy nhiều instance.
- Mật khẩu quên **chưa có cách đặt lại** (cần thêm email/OTP).
- Đã kiểm thử tự động bằng Chrome mô phỏng iPhone (nhắn tin, nhóm, ảnh, gọi video 2 chiều, sao lưu/khôi phục, đồng bộ, tự nối lại), **chưa thử trên iPhone/Safari thật**. Nếu gặp lỗi riêng của Safari (ví dụ không có tiếng khi gọi), hãy báo lại để chỉnh.

## Cấu trúc

```
server.js            máy chủ: API, WebSocket, signaling WebRTC, sao lưu
public/index.html    vỏ ứng dụng
public/app.js        toàn bộ giao diện + logic client + WebRTC
public/style.css     giao diện (kiểu Zalo, hỗ trợ safe-area iPhone)
public/sw.js         service worker (mở nhanh, chạy được khi offline phần giao diện)
public/manifest.webmanifest, public/icons/   cài lên Màn hình chính
Dockerfile           đóng gói để deploy
```
