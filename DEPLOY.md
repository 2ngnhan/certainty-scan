# Deploy và phát hành

Cập nhật 22/10/2026. Đọc trước khi phát hành `certainty-scan` hoặc chuyển repo sang chủ khác. Mọi dữ kiện dưới đây đã kiểm ngày 20 hoặc 21/10/2026, trừ chỗ ghi "chưa kiểm".

Chuẩn chung: tài liệu "Hướng dẫn deploy và tổ chức repo trên GitHub" (Ops Portal, kệ Standards; nguồn `content/md-docs/standards/huong-dan-deploy.md` trong `naucodehq/naucode-portal`).

## Repo

| | |
| --- | --- |
| Vị trí | `github.com/naucodehq/certainty-scan`, công khai, nhánh mặc định `main` |
| Org | `naucodehq`. Chưa gắn team nào (`gh api repos/naucodehq/certainty-scan/teams` trả rỗng) |
| Vị trí cũ | `github.com/2ngnhan/certainty-scan`, GitHub tự chuyển hướng về đây |
| Trạng thái | Đã chuyển sang `naucodehq` ngày 20/10/2026 |
| Bản clone ở máy BOD | `~/dev/certainty-scan`, remote `origin` đã trỏ `naucodehq/certainty-scan` |

## Đích deploy

Không có server nào. "Deploy" ở đây là phát hành ra một trong các đích sau:

| Đích | Là gì | Đi tới đó bằng cách nào |
| --- | --- | --- |
| Gói npm `certainty-scan` | CLI (`npx certainty-scan`) | `npm publish` bằng tay, từ tài khoản npm của maintainer (`2ngnhan`, maintainer duy nhất). Không có CI nào publish. |
| Bản lưu trên Zenodo | Bản phát hành được lưu trữ, DOI `10.5281/zenodo.22026189` (bản 0.5.1), DOI khái niệm `10.5281/zenodo.22026188` (mọi phiên bản) | Một GitHub **release** trên repo này bắn webhook Zenodo; Zenodo lưu tag đó và đúc DOI phiên bản mới dưới DOI khái niệm. Metadata lấy từ `.zenodo.json` (có file này thì Zenodo bỏ qua `CITATION.cff`); số phiên bản lấy từ tag. |
| Trang tài liệu `certainty.naucode.io` | Trang giới thiệu và tài liệu | KHÔNG thuộc repo này. Do Worker `certainty-audit` phục vụ (tài sản tĩnh, deploy bằng `cf` trong job `deploy` của `.github/workflows/ci.yml` ở repo riêng tư `naucodehq/certainty-audit`). GitHub Pages của repo đó đã tắt từ 20/10/2026. Sửa trang thì làm ở repo đó và đọc `DEPLOY.md` của nó. |

Trạng thái ngày 21/10/2026: npm có `0.5.0` và `0.5.1`; release và tag mới nhất là `v0.5.1`. `package.json`, `package-lock.json` và `CITATION.cff` đã ghi `0.6.0`, bản này chưa có trên npm và chưa có release. `CITATION.cff` đang ghi `date-released: 2026-10-18`, chưa phải ngày phát hành thật.

## Một lần deploy diễn ra thế nào

- Push hoặc PR vào `main`: `.github/workflows/ci.yml` chạy `npm ci && npm test` trên Node 18, 20, 22. Không phát hành gì. Commit mang `[skip ci]` thì không chạy.
- Ngoài CI không có gì nghe push vào `main`: không GitHub Pages, không Workers Builds, không deployment nào; check run trên `main` chỉ đến từ GitHub Actions. Webhook Zenodo chỉ nghe sự kiện `release`.
- Phát hành gồm các bước tay, đúng thứ tự:
  0. **Bản đầu tiên sau khi chuyển org (0.6.0):** vào zenodo.org, tab GitHub, xác nhận `naucodehq/certainty-scan` có trong danh sách và đang bật. Chưa bật thì DỪNG: chưa `npm publish`, chưa tạo GitHub release, vì release sẽ không được lưu và không có DOI mới. Phía GitHub không xác nhận được việc này (webhook đang bật nhưng chưa giữ lần gửi nào).
  1. Đổi phiên bản bằng `npm version X.Y.Z --no-git-tag-version` (đổi cả `package.json` lẫn `package-lock.json`), rồi sửa `version` và `date-released` trong `CITATION.cff` thành ngày phát hành thật. Rà `.zenodo.json` (mô tả, phiên bản công cụ đo, liên kết) cùng lúc với `CITATION.cff`: hai file phải nói cùng một điều. Commit, push, chờ CI xanh.
  2. `npm publish` từ một bản checkout sạch của đúng commit đó. Publish trước release vì `.zenodo.json` khai bản Zenodo trùng với gói npm.
  3. `git tag vX.Y.Z && git push origin vX.Y.Z`, rồi `gh release create vX.Y.Z -R naucodehq/certainty-scan`. Release (không phải tag) mới bắn Zenodo.

## Deploy tay và dev ở máy

Dev ở máy:

```bash
npm ci
npm test
node src/cli.js --help          # lệnh: init, sync, unseal, next, validate
node src/cli.js init            # sinh certainty.config.yaml, mẫu mặc định source: linear
node src/cli.js sync            # đọc tracker theo config, sinh certainty-report.html
```

Thử không cần khoá: trong `certainty.config.yaml` đặt `source: github`, mở `github.repo` là một repo công khai, rồi comment hoặc xoá dòng `apiKey: ${LINEAR_API_KEY}` (hoặc cả khối `linear:`) và để dòng `token: ${GITHUB_TOKEN}` ở trạng thái comment nếu không có biến đó. Lý do: `loadConfig` (`src/config.js`) bung `${VAR}` trên toàn bộ file, nên mọi `${VAR}` còn mở đều bắt buộc phải có, kể cả trong khối của source không dùng; thiếu thì `sync` báo `Missing env var: ...`.

File sinh ra (`certainty.config.yaml`, `certainty-report.*`, `certainty-data.json`, `.certainty-history.json`, file nghiên cứu) đã nằm trong `.gitignore`, đừng commit.

Phát hành (sau khi qua bước 0 và bước 1 ở trên):

```bash
npm ci
npm test                         # phải xanh
npm pack --dry-run               # kiểm danh sách file: src, examples, LICENSE, NOTICE, README.md
npm publish                      # cần `npm login` bằng tài khoản maintainer của gói
git tag v0.6.0 && git push origin v0.6.0
gh release create v0.6.0 -R naucodehq/certainty-scan --notes "..."
```

## Kiểm sau deploy

- `npm view certainty-scan version` ra phiên bản mới; `npx certainty-scan@<phiên bản> --help` chạy được.
- `npm view certainty-scan repository.url` trỏ `naucodehq/certainty-scan` (chỉ đúng sau lần publish đầu tiên kể từ 20/10/2026; metadata của 0.5.1 vẫn ghi `2ngnhan`).
- Zenodo: vài phút sau release, một phiên bản mới hiện dưới DOI khái niệm `10.5281/zenodo.22026188`.
- CI trên `main` xanh: `gh run list -R naucodehq/certainty-scan --branch main --limit 1`.

## Rollback

- npm: không ghi đè được một phiên bản. Phát hành bản vá mới, rồi `npm deprecate certainty-scan@<bản hỏng> "<lý do>"`. `npm unpublish` chỉ chạy trong 72 giờ và làm hỏng ai đang ghim bản đó; tránh.
- Zenodo: DOI là vĩnh viễn. Phát hành một release đã sửa; đừng tìm cách xoá bản lưu.
- GitHub release: `gh release delete vX.Y.Z` chỉ xoá trang release, không xoá bản lưu trên Zenodo.
- Không bao giờ đổi DOI đã công bố trong `CITATION.cff`, `README.md`, `docs/paper-block.md`.

## Secret và biến (chỉ TÊN)

- Secret và biến của GitHub Actions: không có (`gh secret list`, `gh variable list` đều rỗng). CI không cần.
- npm: đăng nhập npm của maintainer trên máy publish. Không có `NPM_TOKEN` trong repo.
- Zenodo: một webhook của repo (sự kiện `release`) mà URL mang access token của Zenodo. Không chép URL đó vào file, log hay chat.
- Biến môi trường CLI đọc từ người dùng (ghi trong README và mẫu config): `LINEAR_API_KEY`, `JIRA_API_TOKEN`, `NOTION_API_KEY`, `GITHUB_TOKEN`. Không phải secret của việc deploy.

## Khi chuyển repo sang org khác

- Chuỗi `naucodehq/certainty-scan` viết cứng ở: `package.json` (repository, homepage, bugs), `CITATION.cff`, `docs/paper-block.md`, `src/report.js`, `src/config.js`, `src/actions.js`. Sửa hết trong một commit.
- Webhook Zenodo đi theo repo, nhưng tích hợp GitHub của Zenodo gắn với tài khoản đã bật nó: kiểm trên zenodo.org trước release kế tiếp.
- Metadata npm chỉ đổi ở lần `npm publish` sau.
- Repo trang tài liệu `naucodehq/certainty-audit` link về repo này: sửa link bên đó.
- Không tạo repo trùng tên ở đường cũ: GitHub ngừng chuyển hướng ngay, mà link cũ còn trong metadata npm và bản lưu trên Zenodo.

Lần chuyển ngày 20/10/2026 (`2ngnhan` sang `naucodehq`), đã xong:

- [x] Đường dẫn `2ngnhan/certainty-scan` viết cứng đã đổi sang `naucodehq/certainty-scan` ở các file liệt kê trên.
- [x] Clone `~/dev/certainty-scan` đã trỏ `naucodehq/certainty-scan` (kiểm 21/10/2026). Clone ở máy khác thì chạy `git remote set-url origin https://github.com/naucodehq/certainty-scan.git`.
- [x] Repo trang tài liệu nay là `naucodehq/certainty-audit` (riêng tư); link về repo này đã đổi sang `naucodehq` ngày 20/10/2026.

## Việc còn lại

- [ ] Zenodo: xác nhận `naucodehq/certainty-scan` có trong tab GitHub trên zenodo.org và đang bật, trước bản 0.6.0 (chưa kiểm).
- [ ] npm: metadata còn ghi `2ngnhan` tới lần `npm publish` sau.
- [ ] Chú thích trong mẫu config (`src/config.js`, dòng nói về research mode) (`researchConfigBlock`) trỏ `certainty.naucode.io/pilot-vi/`, đường này trả 404 (kiểm 22/10/2026). Không phải lỗi do chuyển org: trang pilot đã bị gỡ khỏi site công khai có chủ đích ngày 19/08/2026 (commit `7210b1c` bên `naucodehq/certainty-audit`). Đừng thêm lại `pilot-vi` vào `SITE_FILES` bên đó: thư mục không còn, script build sẽ ném lỗi và job deploy đỏ. Cách sửa nằm trong repo này: trước khi phát hành 0.6.0, đổi chú thích sang một đích còn sống hoặc bỏ phần "see ...".
- [ ] `CITATION.cff`: đổi `date-released` thành ngày phát hành thật của 0.6.0.
- [ ] Gói npm chỉ có một maintainer là tài khoản cá nhân `2ngnhan`: cân nhắc thêm maintainer thứ hai hoặc chuyển sang npm org.
- [ ] Repo chưa gắn team trong org `naucodehq`.
