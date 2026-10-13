# 固定扩展条款核对清单

锁定日期：2026-10-13。本表仅管理已发现的22项具体展示差异；不以该子集替代945项矩阵。以下状态已按冻结源码逐项复核；自动测试运行结果另见最终报告，硬件、医院接口、医学有效性仍单独保留边界。

| 分组 | 来源ID | 原文核对项 | 实现责任 | 验证文件 | 本次状态 |
|---|---|---|---|---|---|
|A 预约与套餐|T0021|支持按照检查部位及疾病类型添加项目。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0023|支持选择不同院区、查看对应院区可选套餐并进行套餐选择预约。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0029|支持取消预约订单，自动删除检中订单信息；原文同时写有“是否删除订单，已经增加配置”。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0042|支持取消预约。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0037|支持单位内亲属预约，亲属可使用单位专属套餐并享受单位折扣。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0039|支持控制亲属预约为享受单位折扣自费，或由单位付费。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0113|支持同时选择多个体检套餐，并自动过滤相同项目及互斥项目。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|A 预约与套餐|T0482|支持不同套餐带出不同的自选包。|预约端与共享开单规则|tests/booking-extension.test.tsx| 已实现本地演示（demonstrated） |
|B 登记、财务与科研|T0099|客户弃拍时，系统支持签字确认记录。|登记确认、财务及科研实现|tests/registration-consents.test.tsx / tests/research-reminders.test.tsx| 已实现本地演示（demonstrated） |
|B 登记、财务与科研|T0175|通过对接签字版实现弃检签字、知情书签字、检查结束签字、职业病签字等多种签名类型。|登记确认、财务及科研实现|tests/registration-consents.test.tsx / tests/research-reminders.test.tsx| 部分实现（partial）：原文要求签字板对接；目前没有签字板/驱动或真实电子签名，仅前端多类型留样，不能认定硬件或法律效力满足。 |
|B 登记、财务与科研|T0120|支持自定义填写既往史，并在后续检查过程中向检查医生提示。|登记确认、财务及科研实现|tests/registration-consents.test.tsx / tests/research-reminders.test.tsx| 已实现本地演示（demonstrated） |
|B 登记、财务与科研|T0196|支持按开票时间标记回款时间，到达回款时间可弹窗提示相关业务员。|登记确认、财务及科研实现|tests/registration-consents.test.tsx / tests/research-reminders.test.tsx| 已实现本地演示（demonstrated） |
|B 登记、财务与科研|T0401|支持按照多维度的组合统计，如：存在血脂异常+存在血压高的体检客户的数据。|登记确认、财务及科研实现|tests/registration-consents.test.tsx / tests/research-reminders.test.tsx| 已实现本地演示（demonstrated） |
|C 导检与通知|T0424|主检、总检驳回通知。|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 已实现本地演示（demonstrated） |
|C 导检与通知|T0425|报告超期。|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 已实现本地演示（demonstrated） |
|C 导检与通知|T0426|支持自动发送祝福短信（内置节日、生日祝福）。|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 部分实现（partial）：没有后台自动发送或SMS网关，模拟送达不是真实回执；未含完整节假日历/农历规则。 |
|C 导检与通知|T0508|支持关注重点科室进度进行统计|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 已实现本地演示（demonstrated） |
|C 导检与通知|T0510|支持客户超声号设为固定号（客户中间字隐藏后，超声号显示在客户信息后面，便于区分）|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 已实现本地演示（demonstrated） |
|C 导检与通知|T0515|支持登录医生统计|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 已实现本地演示（demonstrated） |
|C 导检与通知|T0525|支持定时开关队列功能|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 部分实现（partial）：没有后台定时器，页面不操作不会持续调度；不能认定生产自动定时或物理屏幕控制满足。 |
|C 导检与通知|T0553|支持姓名多音字呼叫配置|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 部分实现（partial）：未播放真实语音，没有多音字语音合成/音响测试；文字替换不证明实际读音正确。 |
|C 导检与通知|T0568|支持系统用户管理；|导检与通知专项实现|tests/queue-controls.test.tsx / tests/control-center.test.tsx| 已实现本地演示（demonstrated） |

## 同批原文纠偏与稳定性

- T0255：回收业务动作分别是仅回收、回收并逐项确认，不把手选/扫码输入当作两种业务动作。确认快照不伪造检查结果。
- T0518：候检、过检（演示按过号口径）、已检人数上下限，类型和状态筛选。
- T0546：二维码凭条、浏览器打印、原队列恢复；打印取消不核销，无真实设备回传。
- 暂停/恢复同批双击幂等：独立复现后修复，2/2原失败复现已通过。

## 不转成纯前端通过的边界

- T0215真实录音采集权限及采集设备：保留音频文件导入，不声称实际诊室采集通过。
- T0095读卡器型号与驱动：仅规格映射，不声称真机读取。
- T0175真实签字板接入与签章法律效力、T0403真实身份照片与采血链路：合成演示不替代外设及身份验收。
- 模拟时间触发不是后台定时任务或真正消息送达；UI用户权限不是服务端数据隔离。

## 冻结源码的逐项证据

仅列本固定22项及3处纠偏。demonstrated表示存在对应本地交互，不是生产或投标符合性。测试引用只覆盖其断言子集；全量运行总数由最终测试报告填写。

| T项 | 状态 | 实际交互与实现定位 | 自动测试源码引用 | 保留边界 |
|---|---|---|---|---|
| T0021 | demonstrated | 医院项目规则维护部位和疾病类型；患者端按两类联合筛选，勾选项目实际入单并计价。 src/modules/Patient.tsx :: bodyPartFilter, diseaseFilter, getItemClassification；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/booking-extension.test.tsx :: T0021 医院分类配置被患者筛选 | 分类为有限合成字典，不代表医学适应证；停用/性别/必检约束仍需遵守，无医院主数据接口。 |
| T0023 | demonstrated | 按共享院区套餐配置过滤可选项，切换院区使不适用旧选择失效，Core提交也校验院区。 src/modules/Patient.tsx :: packageAvailableAtCampus, applicablePackages；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/booking-extension.test.tsx :: T0023 院区切换 | 院区为合成字典，本地过滤不是跨院区后台资源/账户隔离。 |
| T0029 | demonstrated | 配置保留或删除业务视图策略；仅本人未锁定且未开始体检订单可取消，删除时归档订单和限定关联业务，保留财务/审计；可恢复为取消历史而不恢复有效预约。 src/model.ts :: CANCEL_PATIENT_APPOINTMENT, cancelledAppointmentArchive, RESTORE_CANCELLED_APPOINTMENT；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/devices.test.tsx :: 改期与取消保留订单及操作记录；tests/booking-extension.test.tsx :: T0029/T0042 删除策略；tests/booking-extension.test.tsx :: T0029/T0042 H5 明确删除策略；tests/registration-consents.test.tsx :: B07 cancelled archived orders；tests/registration-consents.test.tsx :: B08 archived order snapshots | 删除是可恢复本地归档，不作永久清除；只清指定队列/打印/申请/预约通知及未完任务，真实退款与后端业务一致性未验证。 待澄清：源文取消预约自动删除与可配置并存；默认保留历史/审计的演示策略不代表院方已确认策略。 |
| T0042 | demonstrated | 配置保留或删除业务视图策略；仅本人未锁定且未开始体检订单可取消，删除时归档订单和限定关联业务，保留财务/审计；可恢复为取消历史而不恢复有效预约。 src/model.ts :: CANCEL_PATIENT_APPOINTMENT, cancelledAppointmentArchive, RESTORE_CANCELLED_APPOINTMENT；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/devices.test.tsx :: 改期与取消保留订单及操作记录；tests/booking-extension.test.tsx :: T0029/T0042 删除策略；tests/booking-extension.test.tsx :: T0029/T0042 H5 明确删除策略；tests/registration-consents.test.tsx :: B07 cancelled archived orders；tests/registration-consents.test.tsx :: B08 archived order snapshots | 删除是可恢复本地归档，不作永久清除；只清指定队列/打印/申请/预约通知及未完任务，真实退款与后端业务一致性未验证。 |
| T0037 | demonstrated | 非单位亲属关联有效员工，使用配置的亲属套餐及折扣；切换自费或单位承担策略，按折后金额/预算/个人项目计算分摊并入单。 src/modules/Patient.tsx :: groupDiscountPercent, relativePayment, sponsorPatientId；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/booking-extension.test.tsx :: T0037 非单位亲属关联有效员工 | 员工/亲属关系仅合成ID关联，没有真实授权或身份核验；付款是本地金额记录，单位预算并非真实扣款。 |
| T0039 | demonstrated | 非单位亲属关联有效员工，使用配置的亲属套餐及折扣；切换自费或单位承担策略，按折后金额/预算/个人项目计算分摊并入单。 src/modules/Patient.tsx :: groupDiscountPercent, relativePayment, sponsorPatientId；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/booking-extension.test.tsx :: T0039 单位承担策略 | 员工/亲属关系仅合成ID关联，没有真实授权或身份核验；付款是本地金额记录，单位预算并非真实扣款。 |
| T0113 | demonstrated | 多套餐自动去重及互斥整理，必检优先否则先选优先，显示移除原因并去除对应计价行；双必检互斥报错，依赖被过滤的非必检项一并移除。 src/orderingRules.ts :: normalizeOrderItems, 必检项目优先, excludedItems；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/ordering-clinical.test.tsx :: O01 deduplicates package items；tests/booking-extension.test.tsx :: T0113 重复与互斥自动整理；tests/booking-extension.test.tsx :: T0113 双必检互斥不能静默删除 | 确定性整理仅演示规则，不替院方作医疗取舍；H5提供开关，关闭后仍校验冲突，后台并发/临床有效性未验证。 |
| T0482 | demonstrated | 每个套餐维护独立自选包及必选数，切套餐不带旧选择；多套餐分别校验数量，共同项目只计价一次，H5和Core消费同一配置。 src/orderingRules.ts :: getPackageOptionalBundles, packageId, optionalItems；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/booking-extension.test.tsx :: T0482 多套餐各自满足必选数 | 自选包是本地业务规则，无医院套餐版本/真实结算接口；不证明医学组合有效。 |
| T0099 | demonstrated | 订单登记弃拍确认，显式同意后保存固定DEMO留样、类型/人/时及关联ID；取消不写入，同类型/双击防重复。 src/modules/RegistrationConsents.tsx :: photoDeclined, photoDeclineSignatureId, registrationConsents；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/registration-consents.test.tsx :: B01 photo refusal has explicit consent | 只有固定合成留样，非真实手写签字、法律签章或身份认证；不采集真实照片/签名。 |
| T0175 | partial | 分别登记弃检、知情书、检查结束、职业病及弃拍确认类型，保存各自DEMO留样，可查询且不推进临床流程。 src/modules/RegistrationConsents.tsx :: consentTypes, 弃检签字, 职业病签字；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/registration-consents.test.tsx :: B02 all requested signature categories | 原文要求签字板对接；目前没有签字板/驱动或真实电子签名，仅前端多类型留样，不能认定硬件或法律效力满足。 |
| T0120 | demonstrated | 登记页保存自定义合成既往史，分检详情读取并提示医生，确认阅读保存当前版本快照；不同版本可重新核对。 src/modules/RegistrationConsents.tsx :: PastHistoryNotice, pastMedicalHistory, medicalHistoryReads；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/registration-consents.test.tsx :: B04 custom synthetic medical history persists | 仅合成文本及演示角色，本地阅读记录不是真实医学评估或认证医嘱。 |
| T0196 | demonstrated | 按实际本地发票开票日加账期或指定日标记回款时间，推进演示日期仅给选定业务员弹到期提醒；关联回款扣余额，全额/作废不提醒，查看状态按日去重。 src/modules/InvoiceReminder.tsx :: invoiceDueDate, paymentDueDate, invoiceReminders；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/research-reminders.test.tsx :: opens a targeted popup when demo time；tests/research-reminders.test.tsx :: saves invoice-based due dates | 页面内合成业务员提示，不是后台定时催收、短信、税务系统或真实资金；回款仅本地登记。 |
| T0401 | demonstrated | 编辑多个指标/比较符/阈值，以AND或OR组合筛选，展示逐项数值及判定，缺失保留未知，CSV与当前表格同源。 src/modules/ResearchFilters.tsx :: evaluateResearchCriteria, AND, OR, RESEARCH_EXPORT_FIELDS；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/research-reminders.test.tsx :: uses three-valued AND/OR；tests/research-reminders.test.tsx :: exports the exact filtered rows | 有限合成结构化指标与教育科研条件，不是临床诊断/异常阈值或医院全量科研库。 |
| T0424 | demonstrated | 推进显式演示时钟，从真实本地REJECT快照和分类报告周期生成岗位通知；按来源去重，可筛类型/岗位/未读并保存已读状态。 src/modules/ControlCenter.tsx :: deriveStationNotifications, NOTICE-REJECT-, NOTICE-OVERDUE-；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/control-center.test.tsx :: creates source-backed rejection and overdue station notifications | 站内消息仅本地集合，岗位和收件人是演示字段；无后台事件总线、真实跨用户送达或认证消息权限。 |
| T0425 | demonstrated | 推进显式演示时钟，从真实本地REJECT快照和分类报告周期生成岗位通知；按来源去重，可筛类型/岗位/未读并保存已读状态。 src/modules/ControlCenter.tsx :: deriveStationNotifications, NOTICE-REJECT-, NOTICE-OVERDUE-；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/control-center.test.tsx :: creates source-backed rejection and overdue station notifications | 站内消息仅本地集合，岗位和收件人是演示字段；无后台事件总线、真实跨用户送达或认证消息权限。 |
| T0426 | partial | 显式推进UTC时钟时按有记录生日和内置三个公历节日生成一次本地祝福及模拟短信日志；缺生日不补造，跳日只匹配目标日。 src/modules/ControlCenter.tsx :: NOTICE-BIRTHDAY-, NOTICE-HOLIDAY-, notificationScanKey；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/control-center.test.tsx :: matches birthdays and built-in holidays | 没有后台自动发送或SMS网关，模拟送达不是真实回执；未含完整节假日历/农历规则。 |
| T0508 | demonstrated | 配置关注科室，按实际保留票据显示候检/过号/暂停/完成数及完成比例。 src/modules/Queue.tsx :: FocusedQueueProgress, queueFocusIds, 完成进度；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: tracks configured focused departments | 分母不含清空票据，口径是队列记录而非唯一患者或临床完成；不是自动优化模型。 |
| T0510 | demonstrated | 保存客户固定超声号并校验格式和重复，姓名脱敏后仍显示超声号，重排/叫号保持不变。 src/modules/Queue.tsx :: ultrasoundNumber, queuePatientPreferences；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: preserves fixed ultrasound numbers | 固定号仅本地合成识别信息，不是实名身份凭证或院方编号接口。 |
| T0515 | demonstrated | 维护导检用户/医生角色、启停与可操作队列，建立/退出本地会话；统计实际在线演示医生，停用即时退出并限制叫号/入队。 src/modules/Queue.tsx :: GuideUsers, guideSessions, hasGuideQueueAccess；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: enforces guide-user queue scopes | 本地用户和会话为模拟，不是真实登录认证或服务端权限；浏览器状态可修改，不保证分布式会话安全。 |
| T0525 | partial | 保存每天开关计划，显式推进演示时钟按含起点/不含终点及跨午夜规则执行，关闭时暂停呼叫，相同时间计划不重复写入。 src/modules/Queue.tsx :: GuideClock, guideSchedules, guideScheduleRunKey；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: executes queue schedules against an explicit clock | 没有后台定时器，页面不操作不会持续调度；不能认定生产自动定时或物理屏幕控制满足。 |
| T0553 | partial | 为客户保存模拟读音字符串，后续叫号日志spokenText实际使用该配置而非姓名默认值。 src/modules/Queue.tsx :: pronunciation, spokenText, queuePatientPreferences；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: preserves fixed ultrasound numbers | 未播放真实语音，没有多音字语音合成/音响测试；文字替换不证明实际读音正确。 |
| T0568 | demonstrated | 维护导检用户/医生角色、启停与可操作队列，建立/退出本地会话；统计实际在线演示医生，停用即时退出并限制叫号/入队。 src/modules/Queue.tsx :: GuideUsers, guideSessions, hasGuideQueueAccess；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: enforces guide-user queue scopes | 本地用户和会话为模拟，不是真实登录认证或服务端权限；浏览器状态可修改，不保证分布式会话安全。 |
| T0255 | demonstrated | 回收业务可选仅回收或回收并逐项确认，后一种逐项必选已做/未做且无结果不得确认已做；保存确认快照，手选/模拟扫码独立选择。 src/modules/ReviewTools.tsx :: recoveryAction, receive_and_confirm, itemConfirmations；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/review-tools.test.tsx :: RT31 / T0255 receive-and-confirm；tests/review-tools.test.tsx :: RT30 / T0255 receive-only | 确认只记录人工核对，不伪造检查结果或改审核/锁定状态；纸张回收/扫码硬件未接入。 |
| T0518 | demonstrated | 联合队列类型/状态/名称与候检、过号、已检各人数上下限筛选，非法负数/逆序范围拦截。 src/modules/Queue.tsx :: passedMin, completedMin, queueType, inRange；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: filters by real waiting-count bounds；tests/queue-controls.test.tsx :: combines queue type and actual passed/completed | 源文过检按演示过号口径处理；只统计当前本地票据，无真实跨终端同步。 |
| T0546 | partial | 暂停生成唯一QR凭条并可调用浏览器打印；打印或取消不核销；模拟输入码一次性恢复原科室队尾，同批双击暂停/恢复不重复记录。 src/modules/Queue.tsx :: queueResumeSlips, resumedTokens, pauseBusy, window.print()；人工阅读组件及状态更新路径，证据仅限下述交互范围。 | tests/queue-controls.test.tsx :: issues a unique QR slip；tests/queue-controls.test.tsx :: opens browser printing for the slip；tests/queue-controls.test.tsx :: guards pause and resume against two synchronous clicks | 浏览器打印调用不是实物条码输出或扫码器验收；实体打印取消/失败无设备回执，原文实机能力仍需另验。 |

暂停/恢复同一React批次双击的防重由tests/queue-controls.test.tsx中guards pause and resume against two synchronous clicks within the same React batch复核；打印调用本身不核销凭条。取消后归档与关联发票回款的患者/院区/体检类型范围由tests/registration-consents.test.tsx B07、B08复核，保留原财务数据，不声称服务端安全。
