avim-chrome [![CI](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml/badge.svg)](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml)
===========

Bộ gõ tiếng Việt AVIM cho các trình duyệt dùng WebExtension. Cài đặt:
[Chrome](https://chrome.google.com/webstore/detail/opgbbffpdglhkpglnlkiclakjlpiedoh) ·
[Firefox](https://addons.mozilla.org/en-US/firefox/addon/avim-vietnamese-input-method-/) ·
[Opera](https://addons.opera.com/en/extensions/details/avim-vietnamese-input-method/) ·
[Edge](https://microsoftedge.microsoft.com/addons/detail/avim-vietnamese-input-m/mgoacbmfohepgebnedihminjdkbgbpcc/)

## Phát triển

Cần Node >= 24 và **yarn**, không dùng npm (npm bỏ qua `resolutions` trong `package.json`).

```sh
yarn test     # toàn bộ test, chạy ngay không cần cài dependency
yarn lint
yarn build    # -> dist/avim-chrome-<version>.zip và dist/avim-firefox-<version>.zip
```

Cũng có `yarn test:watch` và `yarn test:coverage`.

Test nào cần Chromium thật hoặc cần mạng sẽ **tự skip**, nên máy trắng vẫn xanh. Chạy thật:

```sh
yarn install && npx playwright install chromium
yarn test:browser                            # Chromium thật, chạy trên src/ và build/
node --test test/framework-editors.test.js   # nạp editor thật từ esm.sh

# Firefox đi riêng qua geckodriver, phải build trước
yarn firefox:install && yarn build && yarn test:firefox
```

Trỏ sang binary có sẵn bằng `AVIM_CHROME_PATH`, `AVIM_FIREFOX_PATH`, `AVIM_GECKODRIVER_PATH`.
Lý do đằng sau cách test nằm trong comment đầu mỗi file `test/helpers/*.js`.

## Giấy phép

GPL-3.0, xem [LICENSE](LICENSE).
