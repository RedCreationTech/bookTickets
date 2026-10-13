# 220 项补齐分支独立重点 QA

实测窗口：2026-10-13 03:46–04:02 UTC。对象为当前工作树；不使用旧 CI 或旧提交证明本轮浏览器通过。阅读了原始审计、固定 220 项 worklist、8 份完成 receipts 及复核文件。

## 最终执行结果

- 仓库内 11 个互不重复专项文件：173/173 通过。
  - analytics-completion 31、batch-ordering 22、clinical-integration 7、group-report-builder 11、order-finance-completion 18、pdf-delivery 18、project-statistics 8、report-archive 17，共 132。
  - audit-closure 6、clinical-completion 26、group-payment-regression 9，共 41。
- 独立编写的临时跨模块用例：9/9 通过。未计入整仓正式测试数。
- JSON：/tmp/independent-220-final-targeted.json、/tmp/independent-220-final-closure.json、/tmp/health-final-repro/phase220-final-nine.json。
- 早期 126/126 是修复前旧快照，不作为最终数字。以上不是整个 220 项逐项浏览器验收，也不是整仓总数。

## 确证并已修后重验的缺陷

1. 团检个人仅付 99、单位挂账 300，却被记录为实收 399。修复后个人实收 99、未收 300。
2. 同一已审核订单修改结论后，旧 PDF 下载与预览仍存留。修复后旧文件与 iframe 失效，必须重生成。
3. 批量加项、已批准折扣消费后 groupSplit 更新但 H5 selfPay 保持旧值。两条路径分别重验通过。
4. 取消并删除业务订单后，保留的逐笔收款从统计中消失。修复后依据受范围约束的归档订单元信息继续计入。
5. 临床父项映射的子项结果没有进入异常/危急与团报分母。修复后子血糖 9.2 被正确计入，收费不重复增加子项。
6. 团报 DOCX 在 LibreOffice 中部分中文章节标题缺字。明确 CJK 字体及语言后重新实际渲染，3 页逐页查看已恢复。

另外验证：个人 99 + 单位预付款 300 后 paid=399、due=0、预付款账户 500→200，项目实收合计 399；现金收入仍为 99。相同交易重复提交和新 ID 再次结算均不重复扣款。另一个正向用例验证跨日收款/全退仍归属原始交易日期。

## 文件真实性与视觉证据

- PDF 为真实 PDF 字节，由解析器读取；嵌入中文字库、具有文本映射，并验证临床子结果实际进入内容。独立使用 Poppler 提取中文并查看标准报告第 1 页及 VIP 第 2 页，无观察到裁切。没有声称所有模板每页均人工查看。
- DOCX 为原生 OOXML ZIP，可读到段落/表格结构，不是重命名 HTML；实际由 LibreOffice 转 PDF，修复后 3 页已逐页查看中文标题、表格及附件。
- 文件：/tmp/health-220-qa/actual-group-report.docx、actual-group-report.pdf。修复后图为 word-render-after.png、word-final-2.png、word-final-3.png；word-render.png、word-page2.png 是修复前，不应作为最终截图。
- JS DOM 的下载导航提示不能证明真实浏览器下载。浏览器 PDF/Word 下载、条码及当前提交多端截图仍以 owner 后续新 CI 为准。未测试 Microsoft Word；LibreOffice 结果不等于所有阅读器兼容。

## 范围与未验证项

柜位容量、打印/装订/发放前置与重复守卫、批量变更、折扣审批消费、逐项收退、临床父子项、审核节点和撤销权限已通过上述对应行为测试。无本轮已知未关闭的确证缺陷；这不等于未测路径不存在缺陷。

此为本地合成数据前端演示。真实医疗判断、支付清算、医院接口、服务端授权与数据库隔离、硬件打印/采样、真实签署及正式安全验收不在本次通过结论内。原需求文档 SHA-256 仍为 cc1c9fe70328394908f79072bb98caec7defc5aa6427dd2309b0506383c300a6。

## 补录：单位预付款原路冲销（2026-10-13 04:14 UTC）

按冻结后的 `GROUP_ACCOUNT_REVERSE` 仅追加执行 1 个独立用例，1/1 通过。此前 9 条因 `-t` 精准筛选未重跑（JSON 为 1 passed / 9 skipped）；不称 10/10 最新全量通过，不将此前 9 条重复累计，也不改正式仓库 173 条的既有快照。

验证顺序：个人支付 99 → 单位预付款分配 300（账户 500→200）→ 按原分配流水原路冲销 300。结果为个人实收保留 99、单位实收 0、未收 300、账户恢复 500、项目实收合计 99；现金统计始终为 99。相同冲销重复提交和新 ID 对同一原分配再次冲销均被拒绝且余额不变；随后以新 ID 重新结算 300 成功，账户回到 200、订单实收 399、现金仍为 99。未发现新增确证缺陷。

补录 JSON：`/tmp/health-final-repro/phase220-reversal-only.json`；日志：`/tmp/health-final-repro/phase220-reversal-only.log`。本次未重跑浏览器或扩大审查范围。
