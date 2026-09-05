avim-chrome [![CI](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml/badge.svg)](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml)
===========

Bộ gõ tiếng Việt AVIM được tùy chỉnh cho tương thích với trình duyệt Google Chrome và các trình duyệt khác dùng WebExtension:

* [Cài đặt vào Google Chrome](https://chrome.google.com/webstore/detail/opgbbffpdglhkpglnlkiclakjlpiedoh)
* [Cài đặt vào Firefox](https://addons.mozilla.org/en-US/firefox/addon/avim-vietnamese-input-method-/)
* [Cài đặt vào Opera](https://addons.opera.com/en/extensions/details/avim-vietnamese-input-method/)
* [Cài đặt vào Edge](https://microsoftedge.microsoft.com/addons/detail/avim-vietnamese-input-m/mgoacbmfohepgebnedihminjdkbgbpcc/)

## Phát triển

Cần Node >= 24. Repo dùng yarn, không dùng npm: `package.json` ghim vài transitive dependency có lỗ
hổng qua `resolutions`, mà npm bỏ qua field này (npm dùng `overrides`).

### Chạy test

```sh
yarn test           # toàn bộ test, chạy được ngay không cần cài dependency
yarn lint
yarn test:watch     # chạy lại khi có thay đổi
yarn test:coverage  # kèm báo cáo độ phủ
```

`yarn test` chạy mọi file trong `test/`, kể cả những file cần Chromium thật hoặc cần ra mạng — số đó
**tự skip kèm lý do** khi thiếu, nên trên máy trắng vẫn xanh. Muốn chạy thật thì cài Chromium rồi
gọi riêng:

```sh
yarn install
npx playwright install chromium

yarn test:browser                            # smoke test, chạy trên cả src/ và build/ nếu đã build
node --test test/framework-editors.test.js   # cần thêm mạng, nạp editor thật từ esm.sh
```

Đặt `AVIM_CHROME_PATH` nếu muốn chỉ vào một bản Chromium khác.

### Đóng gói

```sh
yarn install
yarn lint
yarn build
```

`yarn build` tạo `build/` và hai zip trong `dist/`: `avim-chrome-<version>.zip` cho Chrome, Opera,
Edge và `avim-firefox-<version>.zip` cho Firefox — cùng một `src/manifest.json`, khác cách khai báo
background.

### Ghi chú

Lý do đằng sau cách test được ghi ngay trong từng file, đọc ở đó khi cần sửa:

* [`test/helpers/avim-harness.js`](test/helpers/avim-harness.js) — nạp engine vào một context
  `node:vm` riêng cho từng test.
* [`test/helpers/browser-harness.js`](test/helpers/browser-harness.js) — vì sao là Playwright với
  `--load-extension` chứ không phải `chrome.test`, và những gì chỉ browser thật chứng minh được.
* [`test/framework-editors.test.js`](test/framework-editors.test.js) — vì sao phải nạp editor thật
  thay vì mô phỏng ([#30](https://github.com/kimkha/avim-chrome/issues/30)).

## Giấy phép

GPL-3.0, xem [LICENSE](LICENSE).
