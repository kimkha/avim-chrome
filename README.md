avim-chrome [![CI](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml/badge.svg)](https://github.com/kimkha/avim-chrome/actions/workflows/ci.yml)
===========

Bộ gõ tiếng Việt AVIM được tùy chỉnh cho tương thích với trình duyệt Google Chrome và Opera:

* [Cài đặt vào Google Chrome](https://chrome.google.com/webstore/detail/opgbbffpdglhkpglnlkiclakjlpiedoh)
* [Cài đặt vào Opera](https://addons.opera.com/extensions/details/avim-vietnamese-input-method/)

## Phát triển

Bộ test chạy trên test runner có sẵn của Node (cần Node >= 20) và không cần cài dependency nào:

```sh
yarn test           # chạy toàn bộ test
yarn test:watch     # chạy lại khi có thay đổi
yarn test:coverage  # kèm báo cáo độ phủ
```

Đóng gói extension (cần `yarn install` trước):

```sh
yarn lint
yarn build          # tạo build/ và dist/avim-chrome-<version>.zip
```

Repo dùng yarn, không dùng npm: `package.json` ghim vài transitive dependency có lỗ hổng
qua `resolutions`, mà npm bỏ qua field này (npm dùng `overrides`).

Test nạp `src/scripts/avim.js` và `src/scripts/extension.js` vào một context `node:vm`
riêng cho từng test, nên không cần sửa mã nguồn và các biến toàn cục của engine không
rò rỉ giữa các test. Xem [`test/helpers/avim-harness.js`](test/helpers/avim-harness.js).

## Xem thêm

* [AVIM cho Firefox](http://avim.1ec5.org/) tương tích với các trình duyệt Firefox và SeaMonkey, chương trình thư điện tử Thunderbird, trình soạn thảo mã Komodo, và trình soạn thảo BlueGriffon.
* [Brackets-AVIM](https://github.com/baivong/brackets-avim) tương thích với trình soạn thảo Brackets.
