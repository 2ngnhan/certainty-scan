# certainty-scan

Công cụ dòng lệnh (`npx certainty-scan`) chấm độ chắc chắn 0 tới 100 cho từng work item trong GitHub Issues, Linear, Jira, Notion, rồi xuất báo cáo HTML và Markdown tĩnh. Không có server. Dùng cho người quản lý dự án, và là công cụ đo của một nghiên cứu có DOI trên Zenodo. Phát hành qua npm và Zenodo.

Repo CÔNG KHAI `naucodehq/certainty-scan` (org `naucodehq`, chưa gắn team), nhánh mặc định `main`. Bản clone ở máy BOD: `~/dev/certainty-scan`.

Deploy: đọc DEPLOY.md trước khi deploy hoặc chuyển repo.

## Làm việc trong repo

- Test: `npm ci && npm test` (CI chạy trên Node 18, 20, 22).
- Đặc tả công cụ đo: `docs/instrument-design.md`, bản tiếng Việt `docs/instrument-design.vi.md` giữ cùng số mục. Sửa bản này thì sửa bản kia.
- Đổi cách chấm điểm thì tăng `INSTRUMENT_VERSION` trong `src/certainty.js` (đang `0.4.0`). Số này khác số phiên bản gói npm (`package.json`, đang `0.6.0`).
- README, mã, `CITATION.cff` và `.zenodo.json` viết tiếng Anh vì là gói công khai.

## Cảnh báo

- Repo công khai: mọi commit là công khai. Không đưa tài liệu nội bộ, dữ liệu khách, hay file của nghiên cứu (`certainty-key.txt`, `*.sealed`, `rating.json` và các file khác đã liệt kê trong `.gitignore`).
- Push `main` chỉ chạy test (`.github/workflows/ci.yml`), không phát hành gì. Phát hành là việc tay: `npm publish` rồi GitHub release.
- Tạo GitHub release là bắn webhook Zenodo và đúc một DOI vĩnh viễn, không xoá được. Không bao giờ tạo release để thử.
- Bản 0.6.0 là bản đầu tiên sau khi chuyển org: kiểm tích hợp Zenodo trước (bước 0 trong DEPLOY.md), chưa kiểm thì chưa phát hành.
- Không đổi DOI đã công bố trong `CITATION.cff`, `README.md`, `docs/paper-block.md`.
- `npm publish` chỉ từ repo này. Repo riêng tư `naucodehq/certainty-audit` (trang `certainty.naucode.io`) mang một bản sao engine trong `src/` với `package.json` cũng tên `certainty-scan`: không bao giờ publish từ đó.
- Không tạo repo mới ở đường cũ `2ngnhan/certainty-scan`: GitHub sẽ ngừng chuyển hướng, mà link cũ còn nằm trong metadata npm 0.5.x và bản lưu trên Zenodo.

Chuẩn chung về deploy và tổ chức repo: `~/dev/naucode-portal/content/md-docs/standards/huong-dan-deploy.md` (trên web ở ops.naucode.com, cần đăng nhập).
