# Đặc tả thiết kế — Certainty Instrument

**Trạng thái:** v0.3. `INSTRUMENT_VERSION = '0.3.0'` mang theo bộ từ vựng đã chốt ở
§3.1; **phần chấm điểm giống hệt v0.2** — cùng năm signal, cùng trọng số, cùng các quy
tắc anti-circularity. Những phần bổ sung được đặc tả ở đây (RCE §6.3, CAD §7.1, F_risk
§8.1, phát hiện gian lận §6.4) là **đã thiết kế, chưa xây** — một report đóng dấu
`0.3.0` **không** có nghĩa là bất kỳ phần nào trong số đó đã chạy. Xem §14 cho trạng
thái xây dựng chính xác.
**Thay thế:** phần đặc tả ngầm nằm rải trong comment của `src/certainty.js` và
`README.md`.
**Sửa lần cuối:** 2026-08-20
**Bản tiếng Anh:** [`instrument-design.md`](instrument-design.md) — cùng cấu trúc mục,
tham chiếu chéo được.

---

## 0. Cách đọc tài liệu này

Tài liệu tách ba thứ rất dễ bị lẫn vào nhau, và chính việc tách đó là điểm mấu chốt:

| Lớp | Là gì | Trạng thái nhận thức |
|---|---|---|
| **Implemented** | Hành vi đọc được trong `src/` hôm nay | Đã đối chiếu với source |
| **Specified** | Thiết kế ở đây, chưa xây | Đề xuất |
| **Calibrated** | Có phép đo đối chứng với tiêu chí bên ngoài | **Hiện đang rỗng** |

Mọi trọng số trong instrument này là **prior đặt tay**. Chưa cái nào được calibrate
với tiêu chí bên ngoài. Tài liệu này **không** gán lý thuyết ngược vào các trọng số
đó — chỗ nào chọn bằng phán đoán thì ghi thẳng là phán đoán, kèm quy trình sẽ thay
phán đoán bằng phép đo. Gán lý thuyết vào một thiết kế đã có sẵn là một lỗi đã được
đặt tên (xem §12.4) và bị từ chối ở đây.

---

## 1. Phát biểu vấn đề

**Luận điểm.** Trong công việc tri thức có AI hỗ trợ, effort không còn dùng được làm
proxy cho tiến độ, vì effort trở nên rẻ trong khi validation thì không. Đội nào theo
dõi throughput sẽ thấy tăng tốc và nhầm đó là tiến bộ.

**Instrument này đo gì.** Với mỗi work item: bao nhiêu phần của bằng chứng đáng lẽ
phải có để biện minh cho sự tự tin là thật sự đang tồn tại, và bằng chứng nào đang
thiếu.

**Không đo gì.** Item đó có đúng hay không. Xem §7.2 — đây là giới hạn trung tâm của
instrument và là lý do vòng ngoài tồn tại.

**Điều kiện bác bỏ phát biểu vấn đề.** Tiền đề sai nếu trong bối cảnh delivery có AI
hỗ trợ, các metric dựa trên effort (velocity, giờ công) vẫn giữ tương quan cao
(r > 0.8) với giá trị đầu ra thật, trên mẫu N > 50 dự án. Nếu vậy, instrument này
đang giải một vấn đề không tồn tại.

---

## 2. Ranh giới phạm vi

**Trong phạm vi.** Delivery phần mềm và sản phẩm số được theo dõi trên issue tracker
(GitHub Issues, Linear, Jira, Notion), nơi work item có description, label, comment,
và link tới artifact code.

**Ngoài phạm vi.**

- Công việc không được biểu diễn thành item rời rạc.
- Công việc chân tay/vật lý, nơi effort vẫn là proxy tuyến tính cho output.
- Công việc sáng tạo không có tiêu chí nghiệm thu mà bên thứ ba áp dụng được.
- Đảm bảo real-time hoặc an toàn tính mạng. Đây là công cụ quản trị, không phải công
  cụ verification.

**Điều kiện tiên quyết để điểm có nghĩa.**

1. Đội có viết description. Tracker rỗng sẽ ra điểm gần 0 — điểm đúng nhưng vô dụng.
2. Link bằng chứng (PR, commit, closing keyword) thật sự được gắn.
3. Có người sẵn sàng hành động khi điểm thấp, thay vì đổi label cho điểm lên.

**Điều kiện làm instrument suy thoái.**

- Đội tối ưu thẳng vào điểm số (Goodhart). Phát hiện: §6.4.
- Tracker bị dùng như con dấu sau khi việc đã xong, nên mọi bằng chứng xuất hiện cùng
  lúc và không đọc được thứ tự validation.
- AI viết nhiều mà không có xác nhận người — giảm thiểu một phần bởi §4.7, không triệt
  tiêu được.

---

## 3. Từ vựng

Ba đại lượng khác nhau đã lưu hành dưới những cái tên chồng lấn. Mục này có tính quy
phạm; định nghĩa ở đây ghi đè mọi tài liệu trước đó.

| Thuật ngữ | Định nghĩa | Miền | Nằm ở đâu |
|---|---|---|---|
| **Certainty Score** | Mức đầy đủ bằng chứng của một work item | 0–100 | Instrument này, `certainty_score` |
| **Tier** | Trọng số khi tổng hợp — thể hiện độ chắc chắn của item này đáng giá bao nhiêu | basic 0.5 · intermediate 1.0 · advanced 2.0 | `tier` |
| **Item estimate** | Con số kích thước mà tracker vốn đã có | do tracker định nghĩa | `estimate` — xem §6.1 |

**Đã khai tử.**

- *"Certainty Unit" dạng bậc Fibonacci (0·1·3·5·8·13)* — bản nháp cũ trong LIFT
  methodology spec. Chưa từng implement. Loại bỏ vì: nó mô hình hoá độ chắc chắn thành
  một bậc thứ tự duy nhất, nên không diễn đạt được **bằng chứng nào đang thiếu** —
  mà đó lại chính là đầu ra hành động được của công cụ này. Thay bằng Certainty Score.
- *"CU velocity"* — tên gây hiểu nhầm cho một tổng story point. Đổi thành delivery
  volume ở §6.1.
- *BVU (Business Value Unit)* — khái niệm thuộc lớp thương mại, từ nghiên cứu riêng.
  Không thuộc instrument này. Cố ý giữ ở ngoài: trộn một đơn vị-để-xuất-hoá-đơn vào
  một instrument đo bằng chứng sẽ khiến điểm số trở nên **thương lượng được**.
- ***"CU" như một từ viết tắt, ở mọi dạng*** — đã gỡ khỏi codebase, CLI, tên file,
  quy ước label, và tên package ở v0.3. Lý do bên dưới.

### 3.1 Vì sao bỏ chữ "unit", và bỏ tới đâu

Một **đơn vị** mang theo ba tính chất theo định nghĩa. Certainty không có tính chất nào:

| Tính chất của đơn vị | Certainty có? |
|---|---|
| **Cộng được** — 2 + 3 = 5 | Không. Chắc chắn về A cộng chắc chắn về B không phải chắc chắn về A-và-B. |
| **Thang tỷ lệ** — 10 gấp đôi 5 | Không. 80 không chắc chắn gấp đôi 40; thang này là thứ tự (§4.1). |
| **Phổ quát** — mét ở đâu cũng là mét | Không. §11 phủ nhận thẳng việc so sánh giữa các đội. |

Gọi đại lượng đó là "unit" tức là tuyên bố ba điều mà instrument phủ nhận. Đó là lỗi
phạm trù, và nó **không vô hại**: nó đã tạo ra một vụ đụng độ ba chiều đang sống giữa
*CU* dạng bậc Fibonacci trong bản nháp LIFT, *CU* dạng story point của tracker trong
`cu_value`, và *BVU* dạng đơn vị tính tiền trong nghiên cứu lân cận. Người xây cả ba
thứ đó nhầm trước tiên — đó chính là bằng chứng rằng lỗi nằm ở **cái tên**, không nằm
ở người đọc.

**Phép thử máy móc.** Lỗi không phải là chữ đó xuất hiện ở đâu đó; lỗi là **một con số
mang hậu tố đơn vị**. Gõ `npx certainty-scan` không sinh ra niềm tin nào về tính cộng
được. Đọc `42 CU delivered` thì có.

Bốn chỗ mắc dạng bị cấm đã lọt vào v0.2 — dòng certainty-debt và payload Slack trong
`cli.js`, chân hill chart và nhãn phụ completion-rate trong `report.js`. Một trong số
đó dán `CU` lên một **tổng story point**, gắn nhãn certainty cho một đại lượng effort:
đúng sự nhầm lẫn đó, ở dạng chữ đen trên nền trắng.

**Phạm vi đổi tên ở v0.3.** Thay vì giữ từ viết tắt như một token vô nghĩa, nó được gỡ
sạch — vì một token không còn bung ra thành gì sẽ mời gọi ai đó bung lại:

| Trước | Sau |
|---|---|
| `certainty-units` (package, CLI, repo) | `certainty-scan` |
| `cu.naucode.io` | `certainty.naucode.io` |
| `cu_tier`, `cu_value` | `tier`, `estimate` |
| label `cu:basic` / `cu:intermediate` / `cu:advanced` | `certainty:basic` / `:intermediate` / `:advanced` |
| `cu-report.html`, `cu-data.json`, `.cu-history.json` | `certainty-report.html`, `certainty-data.json`, `.certainty-history.json` |
| định dạng phong bì `cu-sealed` | `certainty-sealed` |
| label `cu-generated` | `certainty-generated` |
| `computeCUMetrics`, `CU_TIERS`, `completedCUValue` | `computeMetrics`, `TIERS`, `completedEstimate` |

**Đây là breaking change**, và nó được thực hiện ngay lúc này thay vì hoãn lại. Cửa sổ
mở được chính là vì **pilot ở §9 chưa chạy**: chưa có sealed export nào, chưa phát pair
id nào, chưa kết quả công bố nào mang tên cũ. `INSTRUMENT_VERSION` tồn tại để định danh
vĩnh viễn cái gì đã sinh ra một con số — đổi tên **sau** khi có dữ liệu nghiên cứu sẽ
phá đúng một điều mà con dấu đó bảo đảm. Chi phí đổi tên gần như rơi trọn vào một
package 220 download/tháng; chi phí hoãn lại sẽ rơi vào **hồ sơ nghiên cứu**.

*Giữ chữ "certainty".* Nó đặt tên cho **mục tiêu**, điều mà tên sản phẩm hoàn toàn được
phép làm — nhiệt kế nói về nhiệt độ mà không tuyên bố mình *là* nhiệt độ. "Units" đặt
tên cho một **đại lượng không tồn tại**, đó là một loại tuyên bố khác hẳn.

---

## 4. Instrument — Certainty Score ở cấp item

### 4.1 Cấu trúc và nguồn gốc của các trọng số

Năm signal, tổng 100 điểm.

| Signal | Tối đa | Trả lời câu hỏi |
|---|---|---|
| Validation | 40 | Đã có gì thật sự xác nhận cái này chạy chưa? |
| Workflow / dependencies | 20 | Nó đứng trên nền đã xong chưa? |
| Acceptance criteria | 15 | Người ngoài có biết thế nào là xong không? |
| Evidence | 15 | Lập luận có được viết ra không? |
| Discussion | 10 | Đã đi đến quyết định, hay mới chỉ bàn? |

**Xuất xứ của tỷ lệ — nói thẳng.** Cách chia 40/20/15/15/10 là **prior đặt tay**, phản
ánh đúng một phán đoán: xác nhận trực tiếp rằng item chạy được thì nặng hơn toàn bộ
tài liệu về ý định cộng lại (40 so với 40 của bốn signal còn lại, workflow là biến
điều tiết). Nó không suy ra từ lý thuyết nào và chưa được calibrate. Quy trình sẽ thay
thế nó nằm ở §9; thứ mà calibration cụ thể kiểm tra là: đổi trọng số có cải thiện mức
khớp thứ hạng với phán đoán chuyên gia hay không.

**Thứ tự, không phải khoảng cách.** Điểm được thiết kế để **xếp hạng** item, không phải
để làm số học trên hiệu 60 và 70. Vì vậy toàn bộ validation ở §9 dùng tương quan hạng.

**Có chặn trên.** `computeSignalScore` clamp về 100. Từng signal không bao giờ vượt max
nên clamp chỉ mang tính phòng vệ.

---

### 4.2 Signal 1 — Validation (tối đa 40)

**Construct.** Xác nhận trực tiếp rằng item làm được điều nó tuyên bố.

**Quy tắc (đã implement).**

| Điều kiện | Điểm | Chuỗi lý do |
|---|---|---|
| `validation_status = validated` **và** có `linked_evidence` | 40 | `validated with linked evidence` |
| `validation_status = validated`, không có linked evidence | 20 | `labelled validated, no linked evidence` |
| `validation_status = assumed` | 10 | `assumed` |
| còn lại (`unvalidated`, `needs_clarification`, …) | 0 | text trạng thái, bỏ gạch dưới |

**Nguồn dữ liệu.** Label tường minh (`validated`, `assumed`, `needs-clarification`) ghi
đè trạng thái suy ra từ workflow. `linked_evidence` đọc từ URL PR/commit, closing
keyword (`fixes #12`) trong description và comment, và attachment GitHub/GitLab của
Linear.

**Ghi chú thiết kế — vì sao "closed" không đồng nghĩa "validated".** Bậc thang trạng
thái cố ý không suy ra từ workflow state. Ticket đóng là bằng chứng có người ngừng
làm, không phải bằng chứng việc đã được xác nhận. Đây là quyết định thiết kế hệ trọng
nhất của instrument, và cũng là điểm dễ bị phản đối nhất ở những đội lấy số ticket
đóng làm báo cáo.

**Điểm yếu đã biết.** `linked_evidence` chỉ kiểm tra **có tồn tại**, không kiểm tra
chất lượng. Một PR merged mà không làm gì vẫn thoả. Cách chữa là vòng ngoài (§7),
không phải regex tinh vi hơn.

**Điều kiện bác bỏ.** Nếu item đạt 40 ở đây không ít lỗi hơn item đạt 20 khi audit mù,
thì signal này không đo validation và phân biệt 40/20 nên bị bỏ.

---

### 4.3 Signal 2 — Workflow / dependencies (tối đa 20)

**Construct.** Nền móng của item đã ổn định chưa.

**Quy tắc (đã implement).** Xét theo đúng thứ tự này:

| Điều kiện | Điểm | Lý do |
|---|---|---|
| item blocked, hoặc bất kỳ dependency nào blocked | 0 | `blocked` / `a dependency is blocked` |
| không khai báo dependency nào | 10 | `no dependencies declared (flagged for PM review)` |
| tất cả dependency đã `done` | 20 | `all N dependencies done` |
| còn dependency mở | 10 | `M of N dependencies still open` |

**Nguồn dữ liệu.** Quan hệ trong tracker (Jira issue link, Linear `blocks`) và khai báo
trong description (`depends on #12`, `blocked by ENG-42`). Label `blocked` đưa signal
về 0 bất kể trạng thái tracker.

**Ghi chú thiết kế — không ưu đãi item đã done.** Item done mà không khai báo dependency
vẫn ở 10, không lên 20. Signal này chỉ đọc trạng thái dependency; nó không thưởng cho
việc hoàn thành, vì hoàn thành là việc của Signal 1. Điều này gây bất ngờ cho người
dùng và là cố ý.

**Điểm yếu đã biết.** Dependency không khai báo và công việc thật sự độc lập là không
phân biệt được — cả hai rơi vào 10. Cờ `no_dependencies_declared` tồn tại để sự mập mờ
đó **nhìn thấy được** thay vì bị trung bình hoá âm thầm. Trên backlog mà đa số item
thật sự độc lập, signal này đóng góp gần như hằng số 10 và mang rất ít thông tin.

**Điều kiện bác bỏ.** Nếu tỷ lệ cờ này vượt ~80% số item trên nhiều đội pilot, signal
không phân biệt được gì và 20 điểm của nó nên chia lại.

---

### 4.4 Signal 3 — Acceptance criteria (tối đa 15)

**Construct.** "Xong" có được định nghĩa đủ rõ để bên thứ ba kiểm tra không.

**Quy tắc (đã implement).**

| Điều kiện | Điểm |
|---|---|
| có và kiểm chứng được | 15 |
| có nhưng chung chung | 5 |
| không có, hoặc chỉ khoảng trắng | 0 |

**"Kiểm chứng được" do `isVerifiableAC` quyết định**, yêu cầu một trong hai:

- **≥ 2** dòng khớp mẫu checklist/bullet/đánh số
  (`- item`, `* item`, `+ item`, `- [ ] item`, `1. item`, `1) item`), **hoặc**
- **≥ 2** trong các token `given` / `when` / `then` xuất hiện như từ nguyên vẹn.

**Nguồn dữ liệu.** Heading `## Acceptance Criteria` (hoặc `**Acceptance Criteria**`,
hoặc dòng `Acceptance criteria:`) trong description, một markdown checklist, hoặc cột
`Acceptance Criteria` trong Notion.

**Điểm yếu đã biết.** Phép kiểm tra là **cấu trúc**, không phải ngữ nghĩa. Hai bullet
vô nghĩa vẫn được 15. Đây là đánh đổi có chủ ý: kiểm tra ngữ nghĩa cần gọi model cho
mỗi item, làm điểm số mất tính tất định và không audit được, đồng thời đặt một AI vào
vị trí chấm output của AI — đúng lỗi mà §4.7 sinh ra để chặn. Cấu trúc là proxy yếu,
được chọn vì rẻ, ổn định, và soi được.

**Điều kiện bác bỏ.** Nếu item có AC kiểm chứng được **không** dễ nghiệm thu hơn thật —
không khác biệt về số vòng review theo §6.3 — thì proxy cấu trúc thất bại, và signal
này hoặc chuyển sang đánh giá ngữ nghĩa, hoặc bị bỏ.

---

### 4.5 Signal 4 — Evidence (tối đa 15 = 5 + 5 + 5)

**Construct.** Lập luận đằng sau item có được ghi lại không.

**Quy tắc (đã implement).** Ba thành phần độc lập, mỗi thành phần 5 điểm, nhận diện
bằng regex trên description (song ngữ Anh/Việt):

| Thành phần | Khớp heading/nhãn kiểu |
|---|---|
| **goals** (5) | goal, objective, purpose, why, context, mục tiêu, lý do, bối cảnh |
| **how-to** (5) | how, approach, steps, plan, guideline, implementation, solution, cách làm, hướng dẫn, giải pháp, các bước |
| **dependency notes** (5) | dependency, depends on, blocked by, coordination, collaboration, phụ thuộc, phối hợp |

Mẫu neo vào đầu dòng, chấp nhận dấu heading `#` và `**đậm**`.

**Quy tắc không đếm hai lần.** Signal này **chỉ** đọc cấu trúc description. Link
dependency trong tracker thuộc Signal 2 và không bao giờ được tính điểm ở đây.
Description rỗng được 0.

**Điểm yếu đã biết.** Thưởng cho hình thức văn bản hơn nội dung — description có đủ ba
heading mà bên dưới trống rỗng vẫn được 15. Cùng đánh đổi và cùng lý do như §4.4.

---

### 4.6 Signal 5 — Discussion (tối đa 10)

**Construct.** Việc bàn bạc có đi đến kết luận không.

**Quy tắc (đã implement).** `discussionState` trả về:

| Trạng thái | Kích hoạt bởi | Điểm |
|---|---|---|
| `decision` | label `decision`/`decided`/`concluded`/`decision-recorded`, **hoặc** mục Decision/Conclusion/Resolution/Kết luận/Quyết định/Chốt trong description, **hoặc** comment khớp mẫu quyết định (`Decision:`, `decided`, `we agreed`, `agreed to`, `approved`, `signed off`, `thống nhất`, `chốt là`) | 10 |
| `exchange` | có comment nhưng không phát hiện kết luận | 5 |
| `none` | không comment, không citation | 0 |

**Ghi chú thiết kế — cố ý không đếm comment.** Số lượng comment không bao giờ được quá
5 điểm. Một thread 40 comment không có kết luận là **triệu chứng**, không phải bằng
chứng. Điều này đảo ngược heuristic engagement thông thường một cách có chủ ý.

**Điểm yếu đã biết.** Nhận diện theo từ khoá sẽ bỏ sót kết luận diễn đạt khác thường, và
báo nhầm với chữ "approved" trong ngữ cảnh không liên quan.

---

### 4.7 Các quy tắc chống vòng lặp tự chứng (anti-circularity)

Tính chất quan trọng nhất của instrument: **nó không được phép bị lách bởi chính cái
automation mà nó đang đo.** Ba quy tắc, đều đã implement.

**Quy tắc 1 — tài liệu do máy viết bị chặn trần cho đến khi có người xác nhận.**

- *AI-generated* nhận diện bằng `AI_MARKER_RE` (`generated by/with ai|claude|copilot|chatgpt|gpt|cursor|gemini|codex`, `Co-authored-by: …`, `🤖`, `[ai-generated]`) hoặc label `ai-generated` / `machine-generated`.
- *Human-confirmed* yêu cầu có `linked_evidence`, hoặc label `human-reviewed` / `reviewed` / `review:done`.
- Item AI chưa xác nhận bị **chặn Acceptance criteria ở 5** và **Evidence ở 5**, có ghi rõ lý do chặn trong reason string, và mang cờ `machine_generated_unconfirmed`. Số lượng được báo cáo ở mỗi lần sync.
- Validation (Signal 1) **không** bị chặn — nó vốn đã đòi linked evidence mới cho đủ điểm.

**Quy tắc 2 — công cụ không bao giờ chấm output của chính nó.** Issue do
`next --create-issues` tạo ra bị gắn label `certainty-generated` và loại khỏi scoring ở mọi
lần sync sau. Không có quy tắc này, một công cụ biết tự tạo task tài liệu sẽ nâng điểm
bằng cách tạo task.

**Quy tắc 3 — đổi label không phải là validation.** Đánh dấu `validated` mà không có
linked evidence được 20, không bao giờ 40. Đã cài ở §4.2, nhắc lại ở đây vì đây là quy
tắc bị tranh cãi nhiều nhất.

**Ba quy tắc này KHÔNG bao phủ điều gì.** Một người copy output AI, bỏ marker đi, đứng
tên mình, gắn kèm một PR hình thức — sẽ vượt qua cả ba. Các quy tắc làm việc lách trở
nên **đắt hơn**, không làm nó bất khả thi. Phòng thủ trung thực là §7.

---

### 4.8 Mức và vị trí trên hill

| Điểm | Mức |
|---|---|
| ≥ 80 | `high` |
| ≥ 50 | `medium` |
| ≥ 20 | `low` |
| < 20 | `uncertain` |

`hillPosition(score) = round((1 + score/100 × 8) × 10) / 10` ánh xạ sang thang 1–9 dùng
trong delta view, để output của máy và đánh giá 1–9 của PM nằm trên trục so sánh được.
**Thứ hạng mới là thứ §9 đối chiếu** — ánh xạ này tồn tại để hiển thị, không phải để
cho phép làm số học giữa hai thang.

Các ngưỡng đều là đặt tay. `uphill`/`downhill` cắt ở 50.

---

## 5. Tổng hợp

### 5.1 Tier

Là **trọng số**, không phải điểm. Đặt tường minh bằng label `certainty:basic` /
`certainty:intermediate` / `certainty:advanced`, hoặc bằng field mapping của adapter. **Thiếu tier
thì mặc định intermediate (1.0).**

| Tier | Trọng số | Ý nghĩa dự định |
|---|---|---|
| basic | 0.5 | Quen thuộc, tác động thấp, đường mòn |
| intermediate | 1.0 | Mặc định |
| advanced | 2.0 | Lạ hoặc tác động lớn — chắc chắn ở đây đáng giá hơn |

**Lý do.** Chắc chắn về việc thường ngày thì rẻ và ít thông tin; chắc chắn về việc lạ,
tác động lớn mới là thứ PM thật sự cần mua. Lấy trung bình phẳng sẽ để một backlog toàn
việc vặt che mất chỗ đang bất định.

**Điểm yếu đã biết.** Tier do PM gán và không được audit. PM muốn trung bình cao hơn
thì gán việc bất định thành `basic`. Phát hiện: báo cáo phân bố tier kèm giá trị trung
bình và cảnh báo khi phân bố trôi. **Đã đặc tả, chưa implement.**

### 5.2 Trung bình có trọng số

```
aggregate = Σ(score_i × w_i) / Σ(w_i)          biểu diễn 0–100
```

Cài đặt là `weightedSum / weightSum`, tương đương đại số với dạng
`Σ(score×w) / Σ(100×w) × 100` ghi trong comment source.

Báo cáo cả trung bình có trọng số lẫn không trọng số. **Khoảng lệch giữa hai giá trị
tự nó là một tín hiệu**: nó nghĩa là độ chắc chắn phân bố không đều giữa các tier.

---

## 6. Metric phái sinh

### 6.1 Delivery volume — **đổi tên, v0.3**

**Hiện đang cài là** `velocity: completedEstimate` = Σ `estimate` trên các item đã hoàn
thành, trong đó `estimate` đến từ:

| Adapter | Nguồn | Ghi chú |
|---|---|---|
| Linear | `issue.estimate ?? 1` | story point |
| Jira | `storyPoints ?? 1` | story point |
| Notion | field estimate đã cấu hình `?? 1` | |
| GitHub | **hardcode `1`** | nên tổng chính là số item đã đóng |

**Vấn đề.** `estimate` là tổng story point — một proxy của effort. Gọi nó là "CU
velocity" khiến người đọc hiểu đây là một đại lượng certainty. Nó không phải, và chính
sự trùng tên đã làm nó bị đọc như vậy. Trên GitHub thì nó đúng nghĩa là **đếm ticket** —
metric mà tiền đề của instrument này phản đối.

**Cách xử lý ở v0.3.**

1. **Đổi tên** field thành `delivery_volume` trong report và history. Nó là con số
   throughput và phải được dán nhãn đúng như vậy.
2. **Giữ lại.** Throughput không vô nghĩa — nó chính là số hạng mà §6.2 cần. Sai lầm là
   gọi nó là certainty, không phải việc tính nó.
3. **Báo cáo cơ sở tính** ở mỗi lần sync (`delivery volume: 43 story points` so với
   `43 items`), để không ai giả định là so sánh được giữa các đội.

### 6.1b Validated share (tỷ lệ đã xác nhận)

**Construct.** Trong phần việc đã kết thúc, bao nhiêu là được **xác nhận** chứ không
chỉ là **đóng lại**.

**Công thức (đã implement).**

```
validated_share = |completed ∧ validation_status = validated| / |completed|
```

Báo cáo dạng phần trăm; bằng 0 khi chưa có gì hoàn thành. Tên field trong code vẫn
giữ `integrityScore` để tương thích ngược với file history đã có; **nhãn hiển thị là
"Validated share"** ở mọi nơi.

**Lý do đổi tên.** "Integrity score" đặt tên một **tỷ lệ** như thể nó là một điểm số,
và ngụ ý một phẩm chất đạo đức của đội thay vì một tính chất của hồ sơ. Nó là một tỷ
lệ, và cái nhãn giờ nói đúng như vậy. Đây cùng một lỗi phạm trù với §3, ở quy mô nhỏ hơn.

**Điểm yếu đã biết.** Thừa hưởng trần của Signal 1 — nó đếm label `validated`, nên đổi
label là nâng được. Khác Signal 1, nó **không** có cổng linked-evidence. **Đã đặc tả:**
yêu cầu có linked evidence thì item mới được tính vào tử số, cho nhất quán với §4.2.

### 6.2 Certainty debt

**Construct.** Output tăng tốc nhanh hơn validation.

**Quy tắc đã cài.**

```
debt = delivery_volume > previous.delivery_volume  VÀ  avg ≤ previous.avg
```

Đòi hỏi cả snapshot hiện tại và trước đó đều có giá trị; nếu không thì trả `null`.

**Thay đổi ở v0.3.** Báo cáo song song hai biến thể:

| Biến thể | Tử số | Đọc là |
|---|---|---|
| **Throughput debt** (hiện tại) | delivery volume | "ta đang ship nhiều hơn và biết ít hơn" |
| **Confirmed-work debt** (mới) | số item đạt `certainty_score ≥ 80` | "ta đang ship nhiều hơn mà không xác nhận thêm được gì" |

Biến thể thứ hai dùng chính thang đo của instrument ở cả hai vế, và là dạng **trung
thực** của luận điểm. Biến thể đầu được giữ lại vì throughput là thứ các đội vốn đã báo
cáo, và sự tương phản chính là lập luận.

**Điểm yếu đã biết.** Một biểu thức boolean trên hai snapshot liên tiếp thì nhiễu — một
tuần chậm là đảo dấu. **Đã đặc tả:** yêu cầu điều kiện đúng trong 3 snapshot liên tiếp,
hoặc so với trung bình trượt 3 snapshot.

### 6.3 Review Cycle Efficiency (RCE) — **mới ở v0.3**

**Construct.** Ma sát review. Một deliverable cần bao nhiêu vòng review đi-về trước khi
được chấp nhận.

**Chỗ dựa.** Phỏng theo **DORA** và framework **SPACE**; việc dùng số vòng code review
làm tín hiệu năng suất theo Bosu et al. (2015). Đây là **instrument đã có sẵn, có nền
bên ngoài**, không phải phát minh mới — và đó chính là lý do chọn nó thay vì tự thiết
kế một metric ma sát mới.

**Công thức.**

```
RCE = Σ số vòng review / số deliverable trong cửa sổ
```

Một *vòng* là một lần chuyển `ReadyForReview → ChangesRequested`. Deliverable được duyệt
mà không bị yêu cầu sửa có 1 vòng.

**Nguồn dữ liệu.** Lịch sử review event của PR — vốn đã nằm trong tầm với của GitHub
adapter, cái đang đọc link PR hôm nay. Linear và Jira có transition review ở nơi đội
dùng chúng; chỗ nào không có thì RCE báo là **không khả dụng**, không ước lượng bừa.

**Biến kiểm soát.** Kích thước PR (số dòng thay đổi) phải báo cáo kèm RCE. RCE giảm mà
PR cũng nhỏ đi thì không phải cải thiện ma sát — đó chỉ là chia lô nhỏ hơn.

**Mục tiêu.** Không đặt. Tài liệu hiện có báo cáo những khoảng giá trị có ý nghĩa,
nhưng NAUCode chưa có baseline nào. Pilot đầu tiên thiết lập baseline, và **chỉ khi đó**
mới phát biểu được mục tiêu. **Việc từ chối đặt mục tiêu trước khi có baseline là cố ý** —
mục tiêu chọn lúc này sẽ là con số suy ngược từ hư không.

**Vì sao RCE thuộc về đây.** Nó là con số duy nhất có thể **tăng** khi một đội dùng AI
mạnh: sinh code nhanh lên, review thì không, và số vòng đi-về nhân lên. Certainty Score
đo bằng chứng trên một item; RCE đo **cái giá phải trả** để tới đó. Cùng nhau, chúng
phân biệt "chắc chắn và rẻ" với "chắc chắn và kiệt sức".

**Trạng thái.** Đã đặc tả. Chưa implement.

### 6.4 Phát hiện gian lận điểm — **đã đặc tả, mới ở v0.3**

Mọi điểm số được công bố đều trở thành mục tiêu. Các tín hiệu đối trọng cần đo:

| Kiểu lách | Cách phát hiện |
|---|---|
| Đổi hàng loạt sang `validated` | Tần suất chuyển trạng thái validation mỗi sync so với baseline |
| AC/evidence rập khuôn | Trùng lặp gần đúng về cấu trúc description giữa các item (hash bộ khung heading) |
| Hạ tier | Phân bố tier trôi trong khi thành phần backlog không đổi |
| Điểm trước, việc sau | Item đạt certainty cao mà không có hoạt động code nào liên kết |

Không tín hiệu nào tự nó là kết luận. Chúng được báo cáo cho PM như **quan sát**, không
bao giờ là hình phạt tự động — một hình phạt tự động thì tự nó cũng lách được.

---

## 7. Vòng validation ngoài

### 7.1 Correctness–Audit Divergence (CAD) — **mới ở v0.3**

**Construct.** Điểm thấp có thật sự dự báo lỗi không. Đây là phép kiểm **hiệu lực tiêu
chí (criterion validity)** của instrument.

**Chỗ dựa.** Recall của một bộ phân loại rủi ro — metric chuẩn. Hiện tượng mà nó nhắm
tới — hệ thống mạnh nhưng hỏng khó lường ngay bên rìa năng lực — theo Dell'Acqua et al.
(2023), *Navigating the Jagged Technological Frontier* (HBS working paper).

**Quy trình.**

1. Lấy mẫu ngẫu nhiên các deliverable đã nghiệm thu trong một cửa sổ đã đóng.
2. Người review độc lập, **mù** với điểm certainty, với tác giả, và với giờ công đã log,
   chấm mỗi cái **đúng / lỗi** theo chính acceptance criteria của item đó.
3. Tính:

```
CAD detection rate = |lỗi ∧ bị gắn cờ certainty thấp| / |lỗi|
```

trong đó *bị gắn cờ certainty thấp* nghĩa là điểm < 50 hoặc mang cờ
`machine_generated_unconfirmed`.

**Yêu cầu về độ tin cậy.** Mức đồng thuận giữa người chấm phải báo cáo kèm kết quả. Với
3 người chấm, dùng **trung bình Cohen's κ theo cặp, kèm báo cáo cả κ cặp nhỏ nhất** —
không dùng Fleiss' κ. Fleiss tổng quát hoá cho tập người chấm cố định trên nhiều item và
**che mất trường hợp một người chấm lệch**, mà đó lại đúng là tín hiệu quan trọng khi
những người chấm có thể chia sẻ chung một điểm mù. Ngưỡng thông qua: κ trung bình ≥ 0.60
**và** κ cặp nhỏ nhất ≥ 0.40. Dưới 10 item thì κ không ổn định và phải ghi rõ như vậy.

**Nếu người chấm là model chứ không phải người**, chúng phải đến từ nhà cung cấp khác
nhau, và lần chạy phải đóng dấu **DEGRADED** nếu không — cùng nhà cung cấp thì mức đồng
thuận phản ánh chung tiên nghiệm, không phải chung sự thật.

**Trạng thái.** Đã đặc tả. Chưa implement. **Đây là phần chưa xây có giá trị cao nhất.**

### 7.2 Vì sao điểm bên trong tự nó không đủ

Cả năm signal đều đo **vệ sinh bằng chứng** (evidence hygiene). Không cái nào đo tính
đúng. Một item có tài liệu hoàn hảo về một giả định sai vẫn được 100.

Đây không phải lỗi để vá bên trong instrument — nó là **giới hạn cấu trúc** của bất kỳ
thứ gì chỉ đọc tracker. Cách chữa duy nhất là một tiêu chí bên ngoài, và CAD là tiêu chí
đó. **Cho tới khi §7.1 chạy ít nhất một lần, mọi tuyên bố của instrument này là tuyên bố
về tài liệu, không phải về độ chắc chắn** — và tài liệu phải nói rõ như vậy. Bây giờ nó
đã nói.

---

## 8. Cổng chặn (gating)

### 8.1 Cờ rủi ro cấp item (F_risk) — **đã đặc tả, mới ở v0.3**

Một cờ nhị phân bật **trước khi** item được đưa đi review, kích hoạt review sâu bắt
buộc chứ không phải trừ điểm.

Bật khi có bất kỳ điều nào:

1. Tác giả không tự kiểm chứng được thay đổi trong một khoảng thời gian ngắn có giới hạn.
2. Công việc thuộc lĩnh vực tác giả không quen.
3. Nó chạm vào code có mức khớp nối cao (core module, config, contract dùng chung).
4. Nó do AI sinh ra và chưa được người xác nhận (§4.7 đã tính sẵn điều này).

Điều kiện 4 suy ra được từ dữ liệu công cụ đã có. Điều kiện 1–3 là tự khai. **Một cờ rủi
ro tự khai chỉ trung thực bằng đúng văn hoá xung quanh nó** — nó không bao giờ được đưa
vào đánh giá hiệu suất cá nhân, nếu không nó sẽ bị khai thiếu về 0. Ràng buộc này là một
phần của thiết kế, không phải lời nhắc thêm.

### 8.2 CI gate

Đã implement: `certainty-scan sync --fail-below 50` thoát khác 0 khi trung bình có
trọng số rơi dưới ngưỡng. Ở cấp repo, thô, và hữu ích khi đặt trước một sprint kickoff
hay release train.

Bổ sung v0.3 (đã đặc tả): fail khi **bất kỳ** item nào trên một ngưỡng tier rơi dưới một
sàn điểm, thay vì fail theo trung bình — vì trung bình che được một item thảm hoạ đơn lẻ.

---

## 9. Giao thức validation — sealed reveal

**Bộ máy đã tồn tại và đã implement.** Nó **chưa từng chạy trọn vẹn trên một dự án
thật.** Đó chính là khoảng cách giữa instrument này và một instrument đã calibrate.

### 9.1 Giả thuyết

| | Tuyên bố | Phép kiểm |
|---|---|---|
| **H1** | Điểm certainty của máy xếp hạng item giống cách một PM có kinh nghiệm xếp | Spearman ρ giữa điểm máy và đánh giá 1–9 độc lập của PM |
| **H2** | Việc làm lộ ra bằng chứng đang thiếu sẽ thay đổi hành vi | Dịch chuyển trong thành phần signal sau khi mở niêm phong |
| **H3** | Mức đầy đủ tài liệu có liên hệ với độ chắc chắn | Độ dài description, có/không AC, các thành phần evidence — export theo từng item để phân tích |

### 9.2 Chống hiệu ứng neo

Đánh giá của PM không được nhiễm output của máy. Cài đặt:

- `sync --research` chấm điểm cục bộ, rồi **niêm phong** kết quả: AES-256-GCM, key ngẫu
  nhiên 32 byte, IV 12 byte. Metadata phong bì (`format`, `pair_id`, `mode`,
  `instrument_version`) được gắn vào làm AAD, nên sửa phong bì sẽ bị phát hiện lúc mở.
- Key đi tới **người phụ trách nghiên cứu**, không đi tới đội.
- PM nhận `certainty-rating-sheet.html` — cục bộ, không điểm số, không mạng.
- Config đã ghi danh pilot sẽ **từ chối** lệnh `sync` thường, để điểm không rò ra cửa bên.
- `--reveal-now` dành cho đối tác từ chối niêm phong; cặp đó bị đóng dấu `revealed_first`
  và **loại khỏi H1**, vẫn giữ cho H2/H3.

### 9.3 Dữ liệu rời khỏi máy

Chỉ `certainty-research-export.json`: id item, điểm, signal, tiêu đề đã hash. Không tiêu đề,
không tên người, không code. Đóng dấu pair id và instrument version.

### 9.4 Đọc kết quả

`unseal --key … --rating rating.json` mở Delta view: điểm máy đặt cạnh đánh giá của PM,
kèm Spearman ρ trên các item được chấm trước khi mở niêm phong.

| ρ | Đọc là |
|---|---|
| ≥ 0.7 | Instrument bám theo phán đoán chuyên gia. Các trọng số đặt tay được biện minh **bằng phép đo**, và không cần biện minh lý thuyết nào cả. |
| 0.4 – 0.7 | Đồng thuận một phần. Soi phần dư theo từng signal: signal nào gây ra bất đồng? |
| < 0.4 | Instrument không đo cái PM đo. Hoặc trọng số sai, hoặc construct sai. Cả hai đều là phát hiện đáng có sớm. |

**Cỡ mẫu tối thiểu để dùng được.** Tương quan hạng dưới ~20 item được chấm thì quá nhiễu
để hành động. Pilot nhỏ hơn vẫn nêu được quan sát H2/H3 nhưng **không được** báo ρ như
bằng chứng.

**Giới hạn diễn giải.** ρ cao cho thấy đồng thuận với một PM, **không** cho thấy tính
đúng. Một PM có thể sai một cách tự tin. Chỉ §7.1 xử lý được điều đó, và hai phép kiểm
trả lời hai câu hỏi khác nhau: H1 hỏi *cái này có khớp phán đoán chuyên gia không*, CAD
hỏi *phán đoán chuyên gia có khớp thực tế không*.

---

## 10. Điều kiện bác bỏ

Instrument phải sửa lại hoặc bỏ đi nếu:

1. **H1 thất bại** — ρ < 0.4 trên ≥ 3 đội pilot, mỗi đội n ≥ 20.
2. **Hiệu lực tiêu chí thất bại** — item đạt ≥ 80 không ít lỗi hơn item < 50 khi audit mù.
3. **Một signal không mang thông tin** — ví dụ `no_dependencies_declared` vượt 80% số
   item trên nhiều đội, khiến Signal 2 thành hằng số.
4. **Điểm bị lách với chi phí thấp** — đội nâng trung bình đáng kể mà tỷ lệ lỗi và ma sát
   review không đổi. §6.4 là bộ phát hiện.
5. **Tiền đề thất bại** — metric effort vẫn giữ r > 0.8 với giá trị đầu ra trong bối cảnh
   có AI hỗ trợ (§1).

Mỗi điều là một quan sát cụ thể, không phải chuyện quan điểm. Ghi ra đây nghĩa là một kết
quả về sau **không thể được diễn giải lại thành thành công**.

---

## 11. Những gì KHÔNG được tuyên bố

Nêu tường minh, vì sự vắng mặt của các tuyên bố này rất dễ bị bỏ qua:

- **Không** tuyên bố điểm dự báo được lỗi. Chưa kiểm chứng cho tới khi §7.1 chạy.
- **Không** tuyên bố trọng số là tối ưu. Chúng là prior chưa đo.
- **Không** tuyên bố điểm so sánh được giữa các đội. Khác tracker, khác quy ước, khác kỷ
  luật gán tier — so sánh chéo hôm nay là vô nghĩa.
- **Không** tuyên bố điểm cao nghĩa là item là ý tưởng tốt. Nó nghĩa là lập luận đã được
  ghi lại và có thứ gì đó đã xác nhận.
- **Không** tuyên bố ngưỡng nào (80/50/20, `--fail-below 50`) đã được calibrate.
- **Không** tuyên bố instrument đo độ chắc chắn. Nó đo **mức đầy đủ bằng chứng**, vốn là
  proxy cho độ chắc chắn với chất lượng chưa biết (§7.2).

---

## 12. Các phương án đã loại

### 12.1 Một bậc thứ tự duy nhất cho certainty (Fibonacci 0·1·3·5·8·13)

Loại. Nén về một con số và mất thông tin **bằng chứng nào đang thiếu** — mà đầu ra hành
động được (`next`) phụ thuộc hoàn toàn vào chỗ đó. Một bậc cho biết bạn đang ở đâu; bảng
phân tích signal cho biết phải làm gì.

### 12.2 Story point làm đại lượng certainty

Loại. Story point ước lượng effort. Dùng nó làm đơn vị là tái tạo lại đúng tiền đề mà
instrument phản đối. Chỉ giữ dưới dạng `delivery_volume` (§6.1), có dán nhãn rõ là
throughput.

### 12.3 Một đơn vị giá-trị-để-tính-tiền nằm trong instrument

Loại. Một khi điểm số quyết định hoá đơn, nó thôi là phép đo và trở thành cuộc thương
lượng. Giữ đơn vị thương mại ở lớp riêng bảo toàn tài sản thật sự duy nhất của điểm số:
**không ai có động cơ tranh cãi với nó**.

### 12.4 Gán kernel theory ngược vào các trọng số hiện có

Loại **trên cơ sở liêm chính**. Hoàn toàn có thể viết một biện minh lý thuyết nghe lọt
tai cho 40/20/15/15/10 sau khi mọi thứ đã xong. Làm thế sẽ khiến đặc tả *trông* rigorous
mà không thêm chút thông tin nào, và tài liệu kết quả sẽ **không thể bị bác bỏ bởi bất kỳ
phép đo nào**. §9 tốn kém hơn và đáng giá hơn.

### 12.5 Đánh giá AC và evidence bằng ngữ nghĩa (dùng model)

Tạm loại. Nó làm điểm mất tính tất định và không audit được, đồng thời đặt một model vào
vị trí chấm output của model — đúng vòng lặp tự chứng mà §4.7 chống. Chỉ xem lại nếu proxy
cấu trúc thất bại theo §10.3, và chỉ với người chấm khác nhà cung cấp, kèm dấu DEGRADED khi
không có điều đó.

### 12.6 Fleiss' κ cho hội đồng 3 người chấm

Loại, thay bằng trung bình Cohen's κ theo cặp kèm κ cặp nhỏ nhất (§7.1). Fleiss che mất
trường hợp một người chấm lệch — mà đó là trường hợp mang thông tin khi những người chấm có
thể chia sẻ chung một điểm mù hệ thống.

---

## 13. Câu hỏi còn mở

1. **40 điểm cho validation có đúng không?** Chỉ §9 trả lời được. Trước đó nó là phỏng đoán.
2. **Tier có nên audit được không?** Một trọng số do PM gán và không audit là một bề mặt để
   lách (§5.1). Lựa chọn: suy tier từ đặc điểm item, bắt buộc nêu lý do, hoặc chỉ báo cáo
   độ trôi của phân bố.
3. **RCE bao nhiêu là khoẻ mạnh?** Chưa biết khi chưa có baseline. Đừng đặt mục tiêu trước.
4. **Proxy cấu trúc cho AC có đứng vững không?** §10.3 là phép kiểm.
5. **Bằng chứng một phần xử lý thế nào?** Một PR đã link nhưng đóng mà không merge hiện được
   tính như đã merge. Nhiều khả năng là sai.
6. **Chuẩn hoá giữa các đội** — hiện đang phủ nhận (§11). Có khôi phục được không, hay điểm
   số bất khả quy về tính tương đối theo đội?

---

## 14. Trạng thái triển khai

| Thành phần | Trạng thái |
|---|---|
| Điểm 5 signal, breakdown, gợi ý | **Đã có** — `computeScoreBreakdown` |
| Anti-circularity quy tắc 1–3 | **Đã có** |
| Trọng số tier và trung bình có trọng số | **Đã có** |
| Mức, hill position, gaps, `next` | **Đã có** |
| History, delta, certainty debt | **Đã có** |
| Sealed reveal, Spearman, research export | **Đã có, chưa từng chạy trọn vẹn** |
| Adapter: GitHub · Linear · Jira · Notion | **Đã có** |
| CI gate `--fail-below` | **Đã có** |
| Đổi tên `delivery_volume` (§6.1) | Đã đặc tả |
| Biến thể confirmed-work debt (§6.2) | Đã đặc tả |
| RCE (§6.3) | Đã đặc tả |
| Phát hiện gian lận điểm (§6.4) | Đã đặc tả |
| Vòng ngoài CAD (§7.1) | Đã đặc tả — **giá trị cao nhất** |
| F_risk gating (§8.1) | Đã đặc tả |
| CI floor theo từng item (§8.2) | Đã đặc tả |

**Thứ tự ưu tiên xây.** §9 trước — chạy bộ máy đã có sẵn một lần sinh ra nhiều thông tin
hơn bất kỳ tính năng mới nào. Rồi §7.1, rồi §6.3, rồi các phần đổi tên.

---

## 15. Xuất xứ

- **v0.1** — kiểm tra evidence kiểu "khác rỗng"; tier là điểm cộng.
- **v0.2** — instrument đang chạy hiện nay. Tier chuyển từ điểm sang trọng số tổng hợp;
  evidence chuyển sang tính theo thành phần; discussion chuyển từ đếm comment sang dựa trên
  quyết định; thêm các quy tắc anti-circularity. `INSTRUMENT_VERSION = '0.2.0'`, đóng dấu vào
  mọi report và export.
- **v0.3 (tài liệu này)** — đặc tả tường minh đầu tiên. Thêm phán quyết về từ vựng (§3),
  đổi tên ở §6.1, và đặc tả RCE, CAD, F_risk, phát hiện gian lận điểm.

**Đầu vào từ bên ngoài.** RCE phỏng theo DORA / SPACE / Bosu et al. (2015). Khung
jagged-frontier đằng sau CAD theo Dell'Acqua et al. (2023). Ghi chú phương pháp κ ở §7.1
theo dải Landis & Koch (1977) và thực hành chuẩn cho hội đồng chấm nhỏ.

**Một ghi chú về CBM investigation.** Một dự án Design Science Research riêng do agent chạy
(`cbm-investigation`) đã khảo sát một framework lân cận và tạo ra một khối lượng lớn số liệu
định lượng. **Không con số nào của nó được dùng ở đây, và không nên dùng**: mọi kết quả trong
dự án đó đến từ mô phỏng do chính agent viết với bộ sinh ngẫu nhiên có seed, các rubric chấm
điểm do chính các agent bị chấm viết ra, và cùng một nghiên cứu báo cáo những giá trị mâu
thuẫn nhau cho chính metric chủ đạo của nó. Cái nó **thật sự** đóng góp thì có thật và đã được
ghi công ở trên: kỷ luật đặc tả instrument mà tài liệu này tuân theo (construct · chỗ dựa ·
công thức · nguồn dữ liệu · mục tiêu · độ nhạy · độ tin cậy · hiệu lực tiêu chí · điều kiện bác
bỏ), construct RCE, và thiết kế vòng ngoài CAD. **Phân biệt giữa mượn một construct và mượn một
kết quả chính là toàn bộ kỷ luật.**
