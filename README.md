avim-chrome [![CI](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml/badge.svg)](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml)
===========

Bộ gõ tiếng Việt AVIM được tùy chỉnh cho tương thích với trình duyệt Google Chrome và các trình duyệt khác dùng WebExtension:

* [Cài đặt vào Google Chrome](https://chrome.google.com/webstore/detail/opgbbffpdglhkpglnlkiclakjlpiedoh)
* [Cài đặt vào Edge](https://microsoftedge.microsoft.com/addons/detail/avim-vietnamese-input-m/mgoacbmfohepgebnedihminjdkbgbpcc/)

## Phát triển

Bộ test chạy trên test runner có sẵn của Node (cần Node >= 20) và không cần cài dependency nào:

```sh
yarn test           # chạy toàn bộ test
yarn test:watch     # chạy lại khi có thay đổi
yarn test:coverage  # kèm báo cáo độ phủ
```

Riêng `test/browser-smoke.test.js` cần Chromium thật (nó nạp extension bằng `--load-extension`
để kiểm những thứ DOM giả không chứng minh được: content script có inject vào page hay không,
`Selection` thật trong contenteditable, iframe, shadow DOM, và clipboard hệ thống). Nó **tự skip**
kèm lý do khi thiếu Chromium, nên `yarn test` vẫn xanh trên máy trắng. Bật lên bằng:

```sh
yarn install
npx playwright install chromium
yarn test:browser   # chạy trên cả src/ và build/ nếu đã build
```

Đặt `AVIM_CHROME_PATH` nếu muốn chỉ vào một bản Chromium khác.

Đóng gói extension (cần `yarn install` trước):

```sh
yarn lint
yarn build          # tạo build/ và dist/avim-chrome-<version>.zip
```

Repo dùng yarn, không dùng npm: `package.json` ghim vài transitive dependency có lỗ hổng
qua `resolutions`, mà npm bỏ qua field này (npm dùng `overrides`).

Test nạp `src/scripts/avim-ext.js` vào một context `node:vm` riêng cho từng test, nên không
cần sửa mã nguồn và các biến toàn cục của engine không rò rỉ giữa các test.
Xem [`test/helpers/avim-harness.js`](test/helpers/avim-harness.js).

Chrome không có test runner riêng cho extension của bên thứ ba (`chrome.test` cần một harness C++
`ExtensionApiTest` bên trong bản build Chromium), nên cách chính thức Google hướng dẫn là điều
khiển browser bằng Puppeteer/Playwright với `--load-extension`. Đó là những gì
[`test/helpers/browser-harness.js`](test/helpers/browser-harness.js) làm.

