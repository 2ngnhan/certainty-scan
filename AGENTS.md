# AGENTS.md

`certainty-scan` là công cụ dòng lệnh (`npx certainty-scan`) chấm độ chắc chắn 0 tới 100 cho work item trong GitHub Issues, Linear, Jira, Notion và xuất báo cáo tĩnh; phát hành qua npm và Zenodo, không có server.

Đọc CLAUDE.md và DEPLOY.md trước khi sửa code hoặc deploy. CLAUDE.md là hướng dẫn chính, áp dụng cho mọi công cụ AI.

## Cảnh báo

- Repo công khai: mọi commit là công khai. Không đưa tài liệu nội bộ, dữ liệu khách, hay file của nghiên cứu (`certainty-key.txt`, `*.sealed`, `rating.json` và các file khác đã liệt kê trong `.gitignore`).
- Push `main` chỉ chạy test (`.github/workflows/ci.yml`), không phát hành gì. Phát hành là việc tay: `npm publish` rồi GitHub release.
- Tạo GitHub release là bắn webhook Zenodo và đúc một DOI vĩnh viễn, không xoá được. Không bao giờ tạo release để thử.
- Bản 0.6.0 là bản đầu tiên sau khi chuyển org: kiểm tích hợp Zenodo trước (bước 0 trong DEPLOY.md), chưa kiểm thì chưa phát hành.
- Không đổi DOI đã công bố trong `CITATION.cff`, `README.md`, `docs/paper-block.md`.
- `npm publish` chỉ từ repo này. Repo riêng tư `naucodehq/certainty-audit` (trang `certainty.naucode.io`) mang một bản sao engine trong `src/` với `package.json` cũng tên `certainty-scan`: không bao giờ publish từ đó.
- Không tạo repo mới ở đường cũ `2ngnhan/certainty-scan`: GitHub sẽ ngừng chuyển hướng, mà link cũ còn nằm trong metadata npm 0.5.x và bản lưu trên Zenodo.

Chuẩn chung về deploy và tổ chức repo: `~/dev/naucode-portal/content/md-docs/standards/huong-dan-deploy.md`.
