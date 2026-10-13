# 红创前端演示验证报告

验证日期：2026-10-13。运行证据见 `verification-log.txt`、`all-test-results.json`、`coverage-check-result.json`；范围见 `DELIVERY_SCOPE.md`。

## 本次扩展版本

- 本地全验证通过：ESLint、TypeScript、38个文件627/627项Vitest/jsdom测试、生产构建与945项覆盖结构审计均退出0。原始日志与JSON随附；测试数不与以前执行次数累加。
- 固定220项前端差异已逐项实现并复核真实入口、配置消费和对应断言。原始778项全读审计与220项复核分别保留，不能把945行映射或测试条数当作全部功能验收。
- 独立专项复跑173/173，另9条临时跨模块复现通过，追加1条原路冲销独立补例通过，详见 `INDEPENDENT_QA_220.md`。这10条临时复现不混入正式627项。
- 本轮修后回归涵盖团检个人99与单位挂账300分离、单位预付款原子结算、按原账户冲销、防重、批改/折扣selfPay同步、取消归档后现金统计保留、临床父项子结果进入异常分母、旧PDF内容失效和Word标题中文字体。
- PDF由浏览器内PDF库生成真实字节并嵌入本地CJK字库；独立解析/Poppler文本与标准/VIP页面检查已通过。DOCX为原生OOXML，已用LibreOffice转PDF并实际查看3页标题/表格，无观察到缺字或裁切。未测试Microsoft Word。
- 远端并行提交 `a401d469` 的视频大纲、覆盖汇总、服务标题与品牌兼容补丁已保留并合并；后续提交基于此head，不覆盖并行工作。
- 443fc94e首轮新CI：626项及构建/结构审计通过，Chromium26通过/1预定跳过/1失败。桌面和手机实际PDF下载、条码，以及桌面Word下载通过；手机团报入口因报告表格/表单撑宽布局视口而点击错位。已修局部表格滚动与手机单列表单，并将宽度断言绑定设备viewportSize，修后浏览器结果待对应新提交。

构建仍有大chunk及Queue静态/动态导入共存警告，不影响退出成功，未据此声称首屏、低端手机、并发或性能指标达标。jsdom可能提示不支持文件导航，它不是浏览器下载证据。

## 已核实的历史浏览器基线

| 源码提交 | Vitest | Chromium | 证据 |
|---|---:|---:|---|
| 0054bc7 | 123 | 12通过 | [首版CI](https://github.com/RedCreationTech/bookTickets/actions/runs/38329801892) |
| 1bb6be0 | 255 | 17通过/1跳过 | [红创品牌版CI](https://github.com/RedCreationTech/bookTickets/actions/runs/38333647742)，24张截图已查看 |
| 9014e76 | 337 | 21通过/1跳过 | [移动布局修复版CI](https://github.com/RedCreationTech/bookTickets/actions/runs/38338053301)，29张截图已逐图查看 |

1个跳过是移动项目不重复桌面8角色截图，不是将失败标为跳过。9014修复了裸表最小宽导致手机布局视口扩张、暂停弹窗点击错位问题，局部表格滚动和弹窗独立挂载已有回归断言。历史CI仅证明各自提交。

## 证据层级与边界

- Vitest是jsdom组件/状态机和文件格式验证，真实触发按钮、取消、返回、重复确认、权限范围、本地持久化与配置消费，不执行Chromium排版。
- 真实浏览器测试在GitHub Actions独立Chromium执行；本地环境曾拒绝浏览器启动所需通信，没有绕过限制或公开部署。移动浏览器模拟视口不等于物理手机触摸、扫码或无障碍完整验收。
- 945项结构审计检查连续ID、225原条款、来源保真、10处星标/14核对项、证据/测试锚点及JSON/CSV/Markdown一致。逐项MC手工验收方案仍为not-executed，不等于945项行为通过。
- 角色范围仅是客户端演示；不代表服务端安全隔离。数据均合成。
- 医疗规则有效性、微信原生发布、真实支付/退款/发票、短信/呼叫、HIS/LIS/PACS、录音权限、读卡器及打印装订设备、安全/性能/容灾与正式医院验收未通过本项目验证。
- 36秒引导短片为原创流程示意，不是UI录屏或测试视频。

## 复现

```sh
npm ci
npm run check
python3 scripts/coverage.py --check
npx playwright install chromium
npm run test:e2e
```

为了持久保存JSON，本次本地完整命令为：

```sh
npm run lint && npm run typecheck && npm test -- --reporter=default --reporter=json --outputFile.json=docs/all-test-results.json && npm run build && python3 scripts/coverage.py --check
```

业务日期在Vitest中固定为工作日；设备计时器由用例控制。E2E独立上下文重置合成状态，测试会改变本地演示数据。所有模拟计时都不是实体硬件性能测量。
