#!/usr/bin/env python3
"""Reproduce the 945-item requirement traceability matrix without claiming tender compliance.

With --source, parse the user-supplied Markdown. Without it, reuse the verbatim
source fields in the checked-in requirements.json. --check is read-only and
checks inventory, source preservation, evidence references, and output agreement;
it is not a substitute for executing the individual acceptance scenarios.
"""
from __future__ import annotations
import argparse
import csv
import hashlib
import io
import json
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'src/data/requirements.json'
SOURCE_NAME = '数字化健康体检一体化管理软件_技术需求清单.md'
SOURCE_SHA256 = 'cc1c9fe70328394908f79072bb98caec7defc5aa6427dd2309b0506383c300a6'
DEFAULT_SOURCE = ROOT.parent / SOURCE_NAME
STATUS_LABELS = {'demonstrated': '前端交互有实现证据', 'partial': '部分实现或存在明确缺口', 'config-only': '仅配置/静态展示', 'hardware-unverifiable': '硬件无法由前端验证'}
EXPECTED = {'2.2.1': (11, 85), '2.2.2': (47, 416), '2.2.3': (6, 68), '2.2.4': (140, 209), '2.3.1': (12, 109), '2.3.2': (9, 58)}
SOURCE_KEYS = ['id', 'clause', 'title', 'text', 'subitem', 'star', 'sourcePage', 'sourceModule', 'sourceLine']

# The entries below are a human-reviewed implementation register, not keyword-
# based compliance scoring. A file/anchor guard prevents stale evidence claims.
# Populated after inspection of the modules, never by route presence alone.
REVIEWS: list[dict] = []
def reviewed(items, file, anchors, status, interaction, boundary, classification='mock', route=None):
    row=dict(items=items,file=file if file.startswith('src/') else ('src/App.tsx' if file=='App' else 'src/modules/'+file+'.tsx'),anchors=anchors,status=status,interaction=interaction,boundary=boundary,classification=classification,evidence='人工阅读组件及状态更新路径，证据仅限下述交互范围。')
    if route: row['route']=route
    REVIEWS.append(row)

P='Patient'; C='Core'; O='Operations'; K='Kiosk'
LOCAL='使用合成数据和本地状态；未验证服务端、多用户、权限、并发或真实外部系统。'
reviewed('1-2,17,82-83',P,['questionDone','使用方案继续预约'],'partial','勾选生活方式/关注项，生成示例推荐并带入预约。','推荐仍为有限关键词规则，未给定专家共识版本或临床验证；已有独立互斥/依赖开单规则不等于完整1+X医学推荐引擎。')
reviewed('3,16,26,28,31,40',P,['createOrder','CREATE_APPOINTMENT'],'demonstrated','选择体检人、套餐、院区、日期与时段，确认后在共享预约列表出现新订单。',LOCAL+'这是H5演示，未构建微信原生小程序或账号认证。')
reviewed('4,36,49',P,['selfPay','模拟支付'],'partial','显示团检单位承担/超额自费，选择模拟支付并推进本地订单状态。','无真实支付接口、费用拆单交易、支付回调、退款或财务对账；选择渠道不代表实际扣款。')
reviewed('5',P,["view === 'article'"],'partial','打开健康课堂示例文章并记录收藏。','只内置科普示例，未与内容运营发布列表自动联动，H5不是已发布小程序。')
reviewed('6',P,["view === 'services'"],'demonstrated','打开健康服务列表，选择项目和日期并生成本地服务申请。',LOCAL+'服务申请未与专业服务订单工作区自动关联。')
reviewed('8-10',P,["view === 'guide'",'upcoming.results'],'partial','电子导检按共享检查结果更新完成状态，显示下一未检项目和预计等候。','项目完成和活动票据读取共享状态；楼层和等候时长仍为固定示例，不是实时最优路径/等待预测算法。')
reviewed('11',P,['提交留言','H5 留言'],'partial','提交留言生成本地任务。','留言气泡为组件内临时状态；没有医患双向会话和回复展示，未接入短信/微信。')
reviewed('12',P,['提交评价','满意度评价'],'partial','选择1至5星并写入演示日志。','只有评分交互，缺完整满意度调查问卷及问卷维护/分析。')
reviewed('15',P,['QRCodeSVG','unitSchedules','entranceGroup'],'demonstrated','团检入口生成真实SVG二维码，URL携固定单位标识；打开同一入口进入相应团检预约。','二维码为真实本地SVG编码，目标为本服务H5地址；仅固定演示单位，未验证手机实际扫码、微信发布、账号归属和后端订单权限。')
reviewed('19',K,['创建模拟预约','ks-package-grid'],'partial','自助机选择演示身份、固定套餐和院区时间，创建本地预约。','自助机已支持共享问卷配置和合成填写流程，但未具备完整个性化共识方案；真实设备身份验证未接入。',route='/kiosk')
reviewed('21',P,['selectedExtras','bookingExtras.map'],'partial','预约页勾选三个预设加项，价格随选择变化。','没有按检查部位/疾病类型检索或分类选项。')
reviewed('22',P,['simple','简单预约'],'demonstrated','勾选简单预约后只选到院时间，套餐项目为空。',LOCAL+'后端零元/空项目规则、预约限额及审核策略未验证。')
reviewed('23',P,['就诊院区','state.packages.filter'],'partial','切换预约院区并选择套餐。','套餐集合仍未按院区独立过滤；院区已统一使用中心/东院区演示名称，尚无完整医院院区字典。')
reviewed('25',P,['pt-compare-table','compare.includes','meanings[item]'],'demonstrated','选至少两个套餐，横向查看价格、包含项目并选择套餐。','预置项目有各自意义文案，未包含完整医院项目字典；内容及套餐价格仅用于演示，临床内容需院方审核。')
reviewed('27',P,['常用体检人 / 演示身份切换'],'partial','切换预置演示体检人。','不能新增或保存真实常用体检人，也没有家庭授权/身份绑定。')
reviewed('29,42',P,['cancelId',"status:'cancelled'"],'partial','确认取消后修改共享订单状态，保留历史与操作日志。','没有取消后删除检中订单的可配置策略；保留历史是演示默认，真实退款未接入。')
reviewed('30,43',P,['editId','确认改期'],'demonstrated','改期弹窗校验非过去日期并更新日期/时段。',LOCAL+'不验证号源并发冲突与可预约日历。')
reviewed('32-33,37,39',P,['groupMode','groupRelative'],'partial','选择固定/定额/N选M方案和亲属开关，预览单位额度与个人金额。','额度固定800元；不支持套餐N选M、单位专属折扣、亲属由单位付款策略与独立公司配置。')
reviewed('34-35',P,["activeExtras.length !== 2",'selectedExtras'],'demonstrated','团检项目N选M限制3选2，添加项目并计算总价。',LOCAL+'仅固定3选2示例，无通用规则配置与生产结算。')
reviewed('41',K,['CHECKIN',"startPrint('guide')"],'partial','模拟识别预约、到检签到、导检单模拟打印，记录本地事件。','无真实身份核验、纸张输出和打印机回执；仅软件流程。',route='/kiosk')
reviewed('44',P,['短信为模拟记录'],'partial','创建预约时提示成功及模拟短信说明。','未实际生成可送达的短信请求/送达状态；成功提示不等于短信通知实现。')
reviewed('46',P,['pt-campus','MapPin'],'config-only','展示院区名称与示意楼层。','没有医院详细位置、地图、出行路线或导航接入。')
reviewed('48',O,['短信字典','dictionaries'],'config-only','字典工作区可新增/编辑短信字典文本。','字典内容未应用到自动发送的预约提醒模板；没有真实短信服务。',route='/settings')
reviewed('50',P,['H5个检'],'partial','H5模拟线上预约。','未构建微信小程序部署包，电话预约接入/记录分类流程未专门实现。')
reviewed('51,55-56',C,['dailyCapacity','08:00–08:30'],'partial','显示每日剩余额度和预设时段选择。','未按套餐/项目人数限额校验，无黄红线和分时号源扣减/防超售。')
reviewed('67,69,71,73-74',C,['搜索预约','预约状态'],'partial','显示预约列表、状态搜索、总量、待到检及剩余额度。','没有完整日期范围、类型、时段、性别、单位分布统计与项目号源明细。')
reviewed('68',C,['预约日期',"type:'UPDATE_APPOINTMENT'"],'demonstrated','详情中修改预约日期并更新共享订单。',LOCAL)
reviewed('72',C,['取消预约','预约状态'],'partial','筛选预约并执行取消/日期修改。','已能通过独立配置工作区设置/解除预约黑名单并生效；本列表未整合全部通知/黑名单动作，真实短信发送仍未接入。')
reviewed('78',C,['操作追踪','state.audit'],'partial','操作追踪查询本地预约/改期/取消日志。','已有结构化前后快照与预约项目/问卷相关记录，但未提供完整专用检前历史追踪报表；记录可被本地清理，不是永久审计。',route='/quality')
reviewed('79',C,['OVERVIEW / 运营概览','固定合成样例'],'partial','运营页显示预约/到检/报告/随访指标和合成趋势。','趋势是固定样例；不含完整单位排期指标及生产实时大屏数据。',route='/dashboard')
reviewed('80-81',P,['state.packages','p.tag'],'partial','患者与医护端使用同一预置套餐集合，展示套餐标签。','无体检后端同步、预约启用标志、筛查套餐分类管理接口。')
# Core: registration, exams, reporting, queues, finance and quality.
reviewed('86-89',C,['a.campus','院区（可自由更换）'],'partial','订单详情选择院区，到检时写入选中院区。','客户可在演示中更换院区；缺登录院区选择、院区数据隔离、创建订单院区专属项目/套餐。',route='/appointments')
reviewed('92',C,['新建体检预约','团检 CSV 导入'],'partial','创建个检预约，打开团检CSV导入进行名单校验与批量备单。','团检CSV只允许现有合成客户DEMO身份；未覆盖所有证件类型、完整医院主数据和真实团检开单接口。',route='/appointments')
reviewed('103',C,['历次异常参考','颈动脉彩超'],'partial','开单页展示历次异常示例，可勾选针对性加项并计算金额。','异常文字为固定示例，未按当前患者历史结果动态生成推荐，不构成医学建议。',route='/appointments')
reviewed('104,108-109',C,['discountMin','折扣百分比'],'partial','输入折扣自动计算金额，低于当前权限阈值时阻止创建并提示审批。','有前端折扣校验，但无折扣密码、按角色服务端校验和实际审批申请流程。',route='/appointments')
reviewed('120',C,['既往史 / 备注'],'partial','开单备注可录入并保存在订单。','后续检查医生提示为固定文案，尚未联动录入病史。',route='/appointments')
reviewed('130-135',C,['团检 CSV 导入'],'partial','点击团检样例按钮为预置星辰科技人员创建订单。','不支持文件导入、分组/套餐匹配、身份证校验及错误行下载；不能把样例批量创建视为本组要求完成。',route='/appointments')
reviewed('140-142',C,['弃检','加项：肺功能','操作追踪'],'partial','订单加项/弃检/到检/变更调用共享状态并生成可查询日志。','本地日志仅有限字段/角色，不记录所有变更前后值，非全流程永久可审计记录。',route='/quality')
reviewed('143',C,['a.source','前台登记'],'partial','订单表展示并保存前台/团检/患者H5/自助机等来源。','缺第三方预约接入与来源字典规则。',route='/appointments')
reviewed('145-146,148-150,153-154',C,['订单详情','克隆预约','搜索预约'],'partial','检索姓名/编号/单位和状态，查看历史订单、详情、克隆与修改。','未覆盖删除订单、身份证/简拼、完整22种状态、多日期维度及全部混合条件。',route='/appointments')
reviewed('151',C,['单位支付 / 个人支付'],'partial','财务列表展示应收、单位/个人金额和本地支付状态。','单位/个人金额已读取订单groupSplit；尚无单列待缴/待退金额及完整退款拆分明细，真实支付对账未接入。',route='/finance')
reviewed('152,155-156',C,['快速到检' if False else '批量到检','检查项目与结果'],'partial','已付款订单可到检，详情查看项目结果及待检状态。','项目状态仅录入/未录入，弃检移出项目列表；缺已登记/已收到报告等完整分类。',route='/appointments')
reviewed('161',C,['重大异常已上报'],'partial','分检阈值异常出现本地上报弹窗，审核驳回写日志。','未实现全部岗位危急值/主检/总检消息分发及回执。',route='/exam')
reviewed('167-169,183',C,['批量到检','全选预约'],'partial','可多选预约并批量模拟到检。','无发医嘱接口、批量加减项及批量更换套餐；不能把批量到检按钮视作其他批量动作。',route='/appointments')
reviewed('170,172-174',C,['报告审核积案','未回传结果检查'],'partial','质控页统计未完成检查与待审核订单，可跳转处理。','缺时间范围/超时判断、责任人积案筛选、自动排序和颜色标记。',route='/quality')
reviewed('177,181-182',C,['a.locked','弃检','锁定订单'],'partial','锁定订单禁用部分编辑和到检，项目可弃检、订单可改期。','缺项目确认/自取/项目独立改期、解禁权限；UI锁定不是所有动作的服务端禁止。',route='/appointments')
reviewed('184-186',C,['模拟全退','模拟合并开票'],'partial','模拟收费/全退，记录合并、拆分、作废开票操作。','没有现金/银联多渠道完整结算、按项目收退、收退相抵或真实发票号码/税务接口。',route='/finance')
reviewed('189-192,195',C,['本批次回款金额','预付款抵扣（模拟）'],'partial','单位账单登记分批回款，校验0以上且不超剩余应收，可选预付款。','金额及方式是本地模拟；未按合同/已检/弃检/自费项目等规则生成结算单，自动回款未接入。',route='/finance')
reviewed('197-200',C,['新增模拟会员卡','模拟抵扣'],'partial','创建单张演示会员卡并固定抵扣100元。','无批量制卡、短信验证码、完整消费明细及体检完成套餐卡失效机制。',route='/finance')
reviewed('201-204',C,['导出结算报表','团检账龄.csv'],'partial','导出内置团检账单CSV。','仅预设账单导出，无通用财务报表设计、多条件查询及随时添加报表引擎。',route='/finance')
reviewed('205-212',C,['采样与条码工作站','确认标本采集'],'partial','查看固定标本与示意条码，模拟打印/补打并保存采集标志。','无扫码/真实条码编码/打印回执、照片核验、自动/手工条码合并与完整打印明细。')
reviewed('213-214,218-221',C,['检前信息','今日候检','setDepartment'],'partial','选择在检人员及科室，显示其项目、结果和固定检前提示。','不是刷体检号；项目未按科室权限过滤，无身份照片、真实问卷/病史联动及当日已检完整列表。')
reviewed('222-223,227',C,['填入正常示例'],'partial','一键填入预设正常结果。','无可维护的分检模板及所见→小结→结论字典引擎；正常示例不可替代医学判断。')
reviewed('224-226',C,['历次合成结果','带入上次结果'],'partial','打开历次固定结果并带入上次样例。','并非按患者/日期查询真实历史订单，历史内容为固定样例。')
reviewed('228,247',C,['分检小结 / 医学建议','SAVE_RESULTS'],'demonstrated','编辑分检小结并保存到订单结论，供后续审核显示。',LOCAL+'未实现临床词典。')
reviewed('237',C,['重大异常已上报',"collection:'alerts'"],'partial','血糖达到阈值并确认后生成本地异常记录和分检弹窗。','Core生成异常后由App全局弹窗读取，可记录方式/结果/人员/时间并选择随访；仍缺真实岗位消息推送、临床阈值验证及跨用户可靠送达。')
reviewed('240-243',C,['空腹血糖必须为数值型结果','isCritical','override'],'partial','血糖文字输入阻止提交，超过可配置阈值警示，复核后可继续。','仅血糖字段有数值规则；缺按子项目配置数值/描述类型以及通用阈值字典。')
reviewed('248-250',C,['项目进度','a.results'],'partial','按已录入结果占项目数显示进度并查看结果。','没有按未执行/检查中完整项目状态模型，重复/无关键可能影响计数。',route='/appointments')
reviewed('257-258',C,['弃检','预约日期'],'partial','订单详情弃检项目及修改整单预约日期。','缺每项目独立改期、弃检电子签字、改日到期自动处理。',route='/appointments')
reviewed('284-285,287,293-294,305,310-311',C,['reviewStages','仅看异常','责任医生'],'partial','按2/3阶段推进审核，显示本次/固定上次结果，筛选血糖异常并选择责任医生。','已有排班/工作量辅助人工指派；仍缺完整可配置审核流程、全部问卷/项目呈现和自动级别匹配；Core仅看异常主要识别血糖，历史对比为合成样例。',route='/review')
reviewed('292',C,['锁定报告','a.locked'],'partial','报告锁定后SAVE_RESULTS路径阻止继续分检修改。','没有第三方报告接入阻断、并发抢锁和服务端锁控制，部分UPDATE_APPOINTMENT仍可直接更改。',route='/review')
reviewed('295,297,320-325',C,['生成关联异常综合建议'],'partial','辅助主检读取结果，运行有限本地规则并写入可编辑综合建议。','采用有限确定性规则识别血糖/血脂/收缩压及合并示例，不是医疗AI；无通用共识异常抓取、术语校验、风险排序或临床有效性证据。',route='/review')
reviewed('296',C,['综合结论与指导意见'],'demonstrated','编辑综合结论并随审核保存。',LOCAL,route='/review')
reviewed('312-317',C,['驳回重检','确认驳回'],'partial','填写原因后驳回到分检，审核记录保留。','没有撤销审核及按主检/总检层级选择退回目标、驳回项目和定向通知；无法证明全部本组要求。',route='/review')
reviewed('326,329-333,351,356',C,['体检报告预览与流转','年度健康报告'],'partial','审核后报告列表，预览报告并切换三种标题模板。','主报告预览仍以标题和通用布局为主；已有独立JSON文本章节模板设计/导入导出，但缺完整专科版式/PDF排版和独立报告终审，历史日期查询有限。',route='/reports')
reviewed('334',P,["view === 'reports'"],'partial','H5选择合成身份，查看其已审核报告和结果。','非微信小程序账号绑定查询；未完成生产认证及个人报告访问隔离。',route='/patient')
reviewed('336,340,350',C,['搜索报告'],'partial','按姓名/体检号搜索报告。','没有身份证、单位、主检医生及精准/模糊多条件完整检索。',route='/reports')
reviewed('337,485-487',C,['浏览器打印 / 存 PDF','导出文本报告'],'partial','浏览器打印或另存PDF，另可导出文本报告。','不能把浏览器手动另存视为批量PDF生成或在线PDF下载接口；缺原生PDF查看与批量打包。',route='/reports')
reviewed('338,343-349',C,['报告柜位置','登记领取','模拟打印装订'],'partial','输入柜位/领取方式，模拟打印并登记领取时间。','缺装订/交接各人员和时间、批量出入库/移柜/发放、柜分类、领取人和完整档案单。',route='/reports')
reviewed('342',C,['历史对比次数','a.history','years.slice'],'demonstrated','选择展示0至3次历史结果列，并勾选2025/2024/2023年度记录；缺失显示未收录。','可选的是固定2025/2024/2023年度示例，而非按真实历史订单ID动态检索；缺失值已显示未收录。生产历史订单关联仍需验收。',route='/reports')
reviewed('377-385',C,['团检账龄.csv','个检收退费'],'partial','显示/导出固定团检应收回款及当前个人订单金额。','无完整时间范围、科室/开单项目、原价/执行价、已开票交易、检查完成情况和通用报表统计。',route='/finance')
reviewed('387,419',C,['操作追踪','搜索审计'],'partial','查看/搜索/导出共享本地审计日志；预约、加弃项、结果、审核与折扣创建有日志。','★全过程留痕未完整记录前后值、人员身份、每个折扣/建议修改细节；日志仅存本地最多1000条，可被清除。',route='/quality')
reviewed('388-390,395-399',C,['未回传结果检查','A / B 类异常跟进'],'partial','质控卡片汇总未完成检查、审核待办和A/B随访计数。','缺指定单位/日期/年龄组合查询、异常分布/率/名单导出和各科实时压力统计。',route='/quality')
reviewed('391-394',C,['Trend','Bars'],'partial','显示固定七日趋势与团检账龄柱形图，队列有大屏入口。','未实现统计大屏全屏API、饼图、定时刷新及真实动态数据趋势。',route='/dashboard')
reviewed('404-405',C,['空腹血糖必须为数值型结果','criticalGlucose'],'partial','血糖字段校验数值并触发配置阈值提示。','只对一个演示指标生效，缺通用数值/文字纠错规则。',route='/exam')
reviewed('406',C,['通过','reviewStages'],'partial','执行本地多级审核状态流转。','未证明源文专家共识报告质控标准执行；无临床标准版本。',route='/review')
reviewed('409,431-433',C,['报告超期阈值（天）'],'config-only','在质控页配置报告超期天数，审核页展示待审订单。','该配置未驱动真正计时、订单超期高亮/置顶或流程节点时长分析。',route='/quality')
reviewed('412-415',C,['异常规则：血糖阈值（演示）','重大异常已上报'],'partial','维护单一演示血糖阈值，在分检提交后产生异常记录和局部弹窗。','已有App全局异常弹窗与处置/可选随访；只有有限血糖规则，缺专家共识完整AB字典及真实岗位推送，★AB抓取不能认定满足。',route='/quality')
reviewed('434-435',C,['seedBills','原条款 0–30 / 30–60'],'demonstrated','查看团检账期、登记分批回款，并按五个互斥示例账龄区间重新汇总余额。','账单天数为固定合成值，未由开票/账期实时计算；区间端点采用演示解释，待院方确认。',route='/finance')
reviewed('462',C,['discountMin'],'partial','开单折扣低于全局阈值时阻止创建。','没有针对不同角色的实际折扣权限策略与密码验证。',route='/appointments')
reviewed('502-506',C,['检查路径建议','queueRule'],'config-only','展示固定检查路径并保存优先级规则选项。','未实现多参数最优队列算法；规则选择未真正重排队列，项目依赖/性别/区域/瓶颈不参与运算。',route='/queue')
reviewed('517-520,530-532,539-540,544-545',C,['候检队列','过号队列','depts'],'partial','选择科室标签，查看在检/过号患者和编号。','各科复用同一全局候检池，缺高级条件、真正科室归属和每客户全部队列明细；未展示VIP类型。',route='/queue')
reviewed('535-538,541-542,547-548',C,['呼叫 / 重呼','queueCalls','召回'],'partial','选择或重呼客户，写入本地叫号记录，同页大屏显示；过号后可召回。','语音/呼叫器是模拟；多诊室实时共享需后端，未验证跨终端竞态和真实屏幕同步。',route='/queue')
reviewed('554-555',C,['候检大屏'],'partial','可切换到队列大屏展示入口。','大屏入口不等于单/多诊室模式或多房间队列池调度。',route='/queue')
reviewed('556-560,563',P,['电子导检单','未接入实时院内导航'],'partial','使用演示身份查看共享项目进度及模拟等候。','没有微信账号绑定、公众号到号推送、真实队列查询接口或小程序融合发布。',route='/patient')


# Operations: each workspace has a domain-specific schema; generic CRUD alone
# is never counted as a clinical, finance, messaging or integration workflow.
reviewed('624,627-630',O,['serviceOrders','serviceCatalog','transitions'],'demonstrated','专业服务中维护项目并提交；服务订单可筛选待处理/待服务/已完成/取消，查看详情和按状态处理。',LOCAL+'仅本地服务状态，未关联患者端真实服务和付款。',route='/services')
reviewed('625-626',O,['serviceCatalog','批量流转'],'partial','多选服务项目批量提交，查看待审服务并通过/驳回。','批量仅变更状态，未支持全部字段批量维护；待审原文具体操作须澄清。',route='/services')
reviewed('631-633',O,['consultations','待领取','已领取','我的抢单'],'demonstrated','筛选咨询单状态，领取时指定演示医生，切换我的抢单，执行完成/取消并保存原因。','我的抢单按固定演示医生owner过滤；没有真实账号认证、抢单并发锁和线上咨询通道。',route='/services')
reviewed('634',O,['doctorTeams','团队成员'],'demonstrated','创建、查看、编辑医生团队名称、负责人、成员和介绍。',LOCAL+'成员为文本字段，未接入真实资质和排班。',route='/services')
reviewed('635,679',O,['doctorTeams','团队成员'],'partial','维护团队及成员文本。','不能按当前医生账户隔离“我的团队”；成员缺独立档案关系和权限。',route='/services')
reviewed('662-664,667-669',O,['products','shopOrders','productReviews','库存不能调整为负数'],'demonstrated','商品列表编辑、整数库存调整、上架/下架；商城订单按状态查询；商品评价维护与本地处理。',LOCAL+'没有真实交易、物流、跨订单库存扣减或外部评价发送。','frontend',route='/commerce')
reviewed('665-666',O,['groupBuy','预约中'],'config-only','维护团购最低人数/折扣/日期及商品预约状态。','规则不自动执行成团、限额或预约放号，状态不代表线上发布生效。',route='/commerce')
reviewed('670-671',O,['settlements','shopOrders'],'partial','查看/编辑演示结算账单金额并推进已核对/已结算。','手工账单未从商品订单自动汇总，缺对账口径和支付结算接口。',route='/commerce')
reviewed('672',O,['退款申请','已退款'],'partial','商城订单可申请退款及模拟批准，保留处理日志。','未实现换货流程、退款资金通道、退货物流和售后金额计算。',route='/commerce')
reviewed('673-676',O,['shipping','stores','baseFee'],'config-only','维护物流公司、运费模板地区/首重/包邮门槛及店铺信息。','配置未驱动订单运费计算、真实物流或独立店铺发布。','frontend',route='/commerce')
reviewed('677-678',O,['消费码前缀','图片资源地址'],'partial','店铺维护消费码前缀，商品维护图片地址字段。','没有消费码生成/核销/状态管理，也没有图片上传/预览/资源维护。',route='/commerce')
reviewed('680-681,701',O,['doctorTeams','已驳回'],'demonstrated','筛选团队待审/驳回列表，详情中审批并要求驳回说明。',LOCAL+'未验证资质或对外发布。',route='/services')
reviewed('682-689',O,['messages','friends','模拟回复（未对外发送）'],'partial','按渠道/状态查看咨询、评价、短信邮件模拟记录，保存回复和服务关系。','不发送真实消息；好友无账号绑定；“已发送”记录只为示例，不能证明邮件/短信投递。',route='/content')
reviewed('690,692-695',O,['articles','contentCategories','先审核再发布'],'demonstrated','编辑文章/动态/公告及分类，草稿→待审核→发布，筛选待审或已发布内容。',LOCAL+'发布只改变本地状态，没有网站后端；“我发布”没有当前作者权限隔离。','frontend',route='/content')
reviewed('691',O,['健康视频','media'],'partial','选择健康视频类型并维护媒体资源地址和描述。','没有真实媒体上传、播放器、转码或播放验收。',route='/content')
reviewed('696-700',O,['community','健康豆奖励'],'config-only','配置健康豆奖励及梦想任务/商品/活动、团队活动字段。','无健康豆账本、兑换、活动报名/任务完成发放或团队参与权限。','frontend',route='/content')
reviewed('702-711',O,['settlements','演示账户充值'],'partial','通用本地账单按商城/服务/报告/平台/充值类型维护金额和核对状态。','已有本地商城订单月度结算快照；仍缺真实充值/资金流、完整平台与服务/报告费用自动结算及支付对账。',route='/commerce')
reviewed('712-713,742',O,['organizations','机构类型'],'demonstrated','维护机构/团体/企业及上级机构、管理员，搜索和导出列表。',LOCAL+'上级机构是文本，缺机构树/租户隔离。','frontend',route='/settings')
reviewed('714-715,718-722',O,['staff','人员与资质'],'partial','创建/维护医生、管理师、客服与资质字段，筛选审核状态并查看处理原因。','未按本机构/专业类型限定账号数据，分组为文本字段，不能证明真实资质或独立分组管理。',route='/settings')
reviewed('716-717',O,['roles','黑名单','权限矩阵'],'config-only','维护角色配置与黑名单类型人员记录。','配置不保证角色实际限制接口/页面，也不会真正阻止黑名单预约或登录。','frontend',route='/settings')
reviewed('723',O,['serviceCatalog'],'partial','服务项目工作区显示审核状态并可处理。','源文“查看、服务审核情况”范围未定义，当前仅演示项目审核。',route='/services')
reviewed('724-727,729-731,740-741,743',O,['clinicalConfig','dictionaries'],'config-only','维护健康业务配置和系统字典，包括评估套餐/模板、干预细项、疫苗、科室、疾病、药品厂家/类别及短信条目。','只有命名/分类/说明字段，未实现报告模板渲染、临床规则和相关业务自动应用。','frontend',route='/settings')
reviewed('728',O,['serviceCatalog','serviceCatalog'],'demonstrated','设置服务名称、类型、价格、时长和说明并维护审核状态。',LOCAL,route='/services')
reviewed('732',O,['products'],'demonstrated','商品工作区新增和编辑商品资料。',LOCAL,'frontend',route='/commerce')
reviewed('733',O,['商品介绍与属性'],'partial','商品描述可录入属性文字。','未有结构化属性、属性值/SKU组合或类别规则。',route='/commerce')
reviewed('734-739',O,['devices','模拟连接检查成功'],'config-only','设备/接口工作区记录类型、标识与说明；运行连接模拟产生本地回执。','无真实设备接入、在线状态/库存台账、体检接口、文件接口或字典同步；模拟200并非实际网络响应。','unverifiable',route='/settings')
reviewed('744-745,776',O,['systemInfo','系统基本信息'],'config-only','查看和编辑系统基本信息、更新说明、帮助文字。','内容为合成配置，没有真实版本发布记录、完整设备文档或运行环境信息。','frontend',route='/settings')
reviewed('746',O,['操作审计','state.audit'],'demonstrated','在系统管理的操作审计页查看本地业务操作记录。',LOCAL+'日志最多1000条，非不可篡改或持久审计。','frontend',route='/settings')
reviewed('747-750',O,['supportSpecs','待受理','已解决'],'demonstrated','工单与投诉工作区按状态筛选，编辑、记录处理、解决和关闭。',LOCAL+'不联系真实客户；与患者H5留言生成任务尚未自动汇入同一工作区。',route='/support')
reviewed('751-752',O,['serviceDisputes','shopDisputes'],'partial','分别维护服务/商城纠纷记录与处理状态。','平台介入原文未定义具体动作；没有关联真实订单/支付争议、证据材料与介入决策权限。',route='/support')
reviewed('753-755',O,['uiResources','roles','权限矩阵'],'config-only','维护菜单/按钮/字段资源信息与角色权限勾选。','输入的路径/可见规则未驱动真正路由生成、页面元素或服务端访问控制。','frontend',route='/settings')
reviewed('756-775,777',O,['dictionaries','contentCategories','字典分类'],'config-only','维护各字典分类/编码/值及通知分类，支持新增、编辑、搜索、导出。','字典内容未应用到所有业务表单；民族/职业等使用演示分类，不代表完整国家标准字典。','frontend',route='/settings')
reviewed('778',O,['待办消息提示'],'config-only','维护待办提示资源配置。','配置本身不产生系统待办小气球；全局通知实现需独立核对。','frontend',route='/settings')

H='Health'
reviewed('254,268,272,275,277-278,281-283',H,['Followup','ADD_TASK','UPDATE_TASK'],'partial','按客户查询随访、手工分配负责人/日期，创建或完成本地任务，显示任务状态统计。','已有本地客户锁与异常合并任务；自动风险排序、按工作量平均分配、后台到期提醒及完整类型过滤仍不全，外部异常来源未集成。',route='/health')
reviewed('274',H,['selected.history','保存记录'],'demonstrated','随访详情多次保存本次记录，历史顺序显示并可重新跟进。',LOCAL+'记录未含全部每次通话人员/时间精度和真实录音。',route='/health')
reviewed('570,583,587-588',H,['UPSERT_PATIENT','medicalRecords','体检记录'],'demonstrated','新增/维护共享客户档案，查看关联体检和时间线；新增查看病历记录。',LOCAL+'档案仅为合成数据，病历条目以姓名文本关联。','frontend',route='/health')
reviewed('571-572',H,['questions','评估客户','评估类型'],'partial','为选中客户填写五问示例问卷，可切换评估类型并保存。','不同人群共用同一简化问题，缺人群专属问卷入口/临床量表。',route='/health')
reviewed('574-576',H,['healthAssets','报告与个人设备'],'config-only','登记外部报告/设备标识、短信或邮件草稿元数据。','已有独立的本地档案文件读写；本组仅登记设备/消息信息，没有真实物联设备接入、短信或邮件发送。','unverifiable',route='/health')
reviewed('577',H,['profileFields','owner'],'demonstrated','客户档案选择/输入服务人员字段后保存共享客户。',LOCAL+'只保存负责人文本，未验证实际人员资质和分配权限。',route='/health')
reviewed('578,582',H,['familySpec','家庭成员'],'partial','创建/维护家庭账户、成员与关系文本。','没有建立独立账号登录、成员授权、家庭资料隔离或与患者ID的强关系。',route='/health')
reviewed('579-581',H,['unitSpec','上级单位'],'demonstrated','企业工作单位维护中创建单位/子单位，保存上级、负责人并维护列表。',LOCAL+'层级为文本引用，未具备多租户组织权限。','frontend',route='/enterprise')
reviewed('584-586',H,['profileType','medicalSpec'],'partial','新建档案可选儿童/孕产妇/精神卫生类型，维护相应资料文本。','缺各专科档案字段、标准表单、生命周期、专门权限和敏感资料保护。',route='/health')
reviewed('589-592,613-616',H,['medicalSpec','用药处方记录','planSpec'],'partial','按人群/类型维护医生既有处方、运动/膳食计划文本与复核状态。','不制定真实处方；缺结构化药物/剂量/频次、个性化规则、处方资质/签名与临床有效性，不能以文本记录代替处方能力。',route='/health')
reviewed('593-597',H,['Assessments','assessments','此简化问卷不属于临床量表'],'partial','选择慢病/心理/中医/设备套餐/团检类型，保存和查看教育性采集报告。','类型共享五问，不生成真实慢病风险、心理量表、中医体质结论或设备套餐/团体医学报告。',route='/health')
reviewed('598-604',H,['groupSpec','为重点人群创建随访'],'partial','维护人群/工作分组说明，企业分析按单位/性别/年龄过滤并给重点客户创建随访。','儿童/孕产妇/精神卫生分类只配置；未执行分组条件表达式，也未自动将分组关联完整干预计划。',route='/health')
reviewed('605',H,['health-kanban','UPDATE_TASK'],'demonstrated','随访看板推进待处理/进行中/完成，完成前要求填写结果，保留历史记录。',LOCAL,route='/health')
reviewed('606-607',H,['monitorSpec','需跟进'],'partial','指标工作区按客户姓名/状态检索预警与复核记录。','预警标识为人工/种子记录，未根据实时监测自动生成或全面关联客户预警。',route='/health')
reviewed('608-609',H,['healthMetrics','测量值'],'demonstrated','新增/编辑客户指标值、日期和复核说明，查看监测记录。',LOCAL+'未接入设备且未提供结构化单位/量程校验。',route='/health')
reviewed('610-611',H,['干预效果追踪','节点匹配任务'],'partial','切换30/60/90天/1年观察节点，显示对应任务数和完成数。','节点依据任务period字段；没有依据真实起止日期和前后指标评估干预效果。',route='/health')
reviewed('612',H,['healthPlans','已终止'],'demonstrated','创建健康计划，按草稿/进行中/完成/终止流转并查看详情。',LOCAL+'计划不自动执行医嘱或提醒。',route='/health')
reviewed('617-623',H,['healthTemplates','templatesSpec'],'config-only','新增/维护计划单元、计划/处方模板、处方/干预/医嘱/再检词条。','模板文本没有自动作用到处方和计划执行；缺临床内容、结构化规则与适应证校验。','frontend',route='/health')
reviewed('636-638',H,['cohortLabel','筛选企业','生成分析报告'],'partial','按单位/年龄/性别筛选，汇总风险标识，生成并保存本地人群分析报告。','危险因素仅源于A/B风险标签；缺完整危险因素模型，“生产条件”定义待明确。',route='/enterprise')
reviewed('639-640',H,['cohortLabel','年龄','性别'],'demonstrated','按年龄/性别维度分组当前合成客户，显示人数/占比并导出CSV。',LOCAL+'上期数据为合成对比，无真实纵向趋势。','frontend',route='/enterprise')
reviewed('641-650,655-661',H,['cohortLabel','const n=i','dimensions'],'partial','切换血压/血脂/血糖/吸烟/体重/职业/教育/膳食/运动/饮酒，展示分类图表并导出。','这些分类由列表索引取模生成，不读取真实指标或问卷；筛选改变索引可能改变同一人分类，不能作为数据分析逻辑验收。',route='/enterprise')
reviewed('651-654',H,['慢病分类','建档情况','已建立体检记录'],'partial','展示风险标签分类、合成建档图和实际存在体检记录的人数。','不能等同于已患慢病/患病风险分类或每人建档次数；部分分类为索引生成的预置样例。',route='/enterprise')

# Explicit negative findings. These are not covered simply because another
# feature or a similarly named configuration exists on the destination page.
def gap(items,file,anchors,boundary,route=None,kind='mock'):
    reviewed(items,file,anchors,'partial','代码审查未发现本项对应的完整专用交互；当前入口仅便于定位待补范围。',boundary,kind,route)
    REVIEWS[-1]['evidence']='人工阅读指定组件；本项未发现实现，引用为缺口定位而非正向符合性证据。'
gap('7',P,['常用体检人'],'没有用户自行身份证/手机号注册或真实账号验证。')
gap('13-14',P,['groupVerified'],'没有分销人员二维码、分销订单归因或绩效统计。')
gap('18,20,24,38',P,['selectedExtras','groupRelative'],'没有医院检查项目维护及套餐加减/价格显示/团检亲属预约的管理开关与业务联动。')
gap('45,47',P,['reminders'],'本地提醒开关不执行检前定时短信；未对接医院导航。',kind='unverifiable')
gap('52-53,59,70,75-77',C,['Appointments'],'未实现单位可约日期/限額、周末禁约、定时放号/团转个号源、预约日历排程及问卷/默认选择/价格可见性细粒度规则。')
gap('84-85',O,['dictionaries'],'字典CRUD不包含体检项目互斥/绑定引擎及其实际预约联动。',route='/settings')
gap('91',O,['systemInfo'],'系统帮助只有文字记录，没有核心/复杂操作视频资源与播放器。',route='/settings')
gap('93-99',C,['新建体检预约'],'仅选择预置患者；无证件类型/手工身份登记、读卡型号与定制读写、证件照片、现场拍照、防替检及弃拍签字。',route='/appointments',kind='unverifiable')
gap('100-102',C,['Appointments','Queue'],'无客户类型→订单类型自动映射和队列分区规则，类型也不可完整自定义。',route='/appointments')
gap('105-107',C,['折扣百分比'],'只支持整套餐折扣；没有按总金额反算折扣、禁折项目排除或单项折扣。',route='/appointments')
gap('110-114',C,['体检套餐'],'无性别/婚姻过滤、强制添加确认、多套餐去重互斥或必检依赖自动加入。',route='/appointments')
gap('115',C,['patientId','packageId'],'没有按单位订单自动带出专属套餐。',route='/appointments')
reviewed('116',C,['领取方式'],'partial','报告管理中可选择领取方式并保存。','不是开单时标记；个人/单位/邮寄/线上仅本地选项，无后续配送集成。',route='/reports')
reviewed('117',H,['familySpec'],'partial','家庭账户可记录家庭成员和关系文本。','没有开单时填家庭成员并与患者ID建立人群关系。',route='/health')
gap('118',C,['新建体检预约'],'提交开单不会自动打印导检单、项目/检验条码；自助机另行模拟打印不能证明本条。',route='/appointments',kind='unverifiable')
gap('119',C,['检前信息'],'检查页面的检前提示是固定示例，未从预约问卷自动带入病史/用药史/家族史/既往史。',route='/exam')
reviewed('121,123',H,['unitSpec'],'partial','企业页新增、编辑/删除单位和上级单位文本。','单位维护与检中开单单位订单未建立完整强关联。',route='/enterprise')
gap('122,124-129,136-139',C,['团检 CSV 导入'],'没有完整单位订单、预付款台账、订单人员/分组/专属套餐/加项包维护，以及套餐换项超额转个人和单位定制包配置。',route='/appointments')
gap('144',C,['Appointments'],'源文未完句尚未明确处理动作；本演示未自行补写。',route='/appointments')
gap('147',C,['订单详情'],'详情只能更改订单院区/日期/项目，未提供审核中客户基础资料编辑流程。',route='/appointments')
reviewed('157',K,["startPrint('guide')"],'partial','自助机可查看导检项目信息并创建模拟打印记录。','缺前台导检单/条码文件预览和真打印。',route='/kiosk')
gap('158-160,162-166',C,['订单详情'],'已有本地打印版式、模拟目标和替检流程；本项身份证刷卡带出与历史时间段联动仍无真实设备接口，源文具体动作待澄清。',route='/appointments')
reviewed('171',H,['Followup','selected.history'],'partial','随访工作台可为客户记录跟进内容及日期。','订单未完成/未回传专项回访流程和精确操作人/时间字段未完整实现。',route='/health')
gap('175-176,178-180',C,['Exam'],'没有签字板、导检单回收机、高拍仪或回收单触发未检项目提示；文字与模拟打印不等于设备集成。',route='/exam',kind='unverifiable')
gap('187-188,193-194,196',C,['Finance'],'已有单位订单分摊与模拟发票业务员关联；尚无按开票时间自动排回款日并定向弹窗给相关业务员的完整流程。',route='/finance')
gap('215-216',C,['Exam'],'已有合成音频文件导入/播放/删除，但没有通过麦克风现场录音、自动启停录制及真实录音验收。',kind='unverifiable')
reviewed('217',C,['加项：肺功能'],'partial','可返回订单详情加项并改变应收金额。','缺分检页直接加项及补缴费完成后才准继续检查的状态联动。',route='/appointments')
gap('229-234',C,['分检小结 / 医学建议'],'没有小结等级/手动排序、报告图片上传、内科问诊模板、快捷键提交或撤销已提交结果。')
reviewed('235-236',C,['LIS 检验结果回传','设备采集工作站'],'config-only','接口模拟台可点击生成本地成功提示/日志。','无医院第三方报告/检查设备接口、PC工作站SDK或结果自动回传；原文厂家前提未验证。','unverifiable',route='/quality')
reviewed('244',C,['criticalGlucose',"collection:'alerts'"],'partial','血糖阈值触发本地异常记录。','仅一项演示规则；不是通用检验检查危急值字典，原文是否保留功能待澄清。')
gap('245-246',C,['采样与条码工作站'],'采样弹窗是固定血/尿样例；没有妇科漏采提醒与病理专属条码。')
gap('251-253,255-256,259-261',C,['Exam'],'已有申请单、本地重推、独立结束和手动到期批处理；仍缺导检单“仅回收/回收并确认项目”两种完整策略，项目自取的原文范围未定义。')
gap('262-267',H,['Followup'],'随访可手工记录，但没有异常项目聚合生成可编辑短信、自动发送/多次通知渠道和完整发送回执。',route='/health',kind='unverifiable')
gap('269-271,273,276',H,['Followup','groupSpec'],'已有展示等级配置、本地锁定与异常合并；仍没有给定的完整专家共识AB标准及医学有效性证据。',route='/health')
gap('279-280',H,['Followup'],'没有三方呼叫中心接口、自动拨号或电话录音；需院方提供第三方接口。',route='/health',kind='unverifiable')
gap('286,288-291',C,['责任医生'],'只能手选两个示例医生；缺按日期排班、繁忙指数、报告难度分级/权重及级别分配。',route='/review')
gap('298-300,302-304,306-309,318',C,['Review'],'已有合成编码、分句匹配、人工分级、排序与复查入口；仍未给出并实现完整专家共识AB标准字典，不能把演示词条视为临床知识库。',route='/review')
reviewed('319',C,['PACS 影像报告'],'config-only','接口模拟台记录PACS演示响应。','没有PACS网络、影像文件或影像查看器。','unverifiable',route='/quality')
gap('327-328,335,339,341,352-355',C,['Reports'],'已有JSON模板、批量本地流转与解读工作量记录；真实领取短信和医学AI解读仍未实现，报告自主领取的疑问式原文待澄清。',route='/reports')
reviewed('357-364',H,['Enterprise','生成分析报告'],'partial','企业页筛选单位/年龄/性别生成当前人群统计，并导出CSV数据。','不能代替完整团检报告；缺体检完成时间/婚姻/套餐/部门过滤、阳性异常选择排序、男女前十疾病/三高分析、Word输出及自动医学建议。',route='/enterprise')
gap('365-376',C,['Dashboard'],'运营看板是总体订单/任务计数和固定趋势；未实现逐登记人/医生/科室/标本/销售/打印/解读工作量与金额统计及对应条件。',route='/dashboard')
reviewed('386,464-465',O,['roles','scope'],'config-only','角色可记录数据范围和页面权限勾选。','未实际按角色限制报表、人员、体检类型和页面数据；没有服务端鉴权。','frontend',route='/settings')
reviewed('400-401',H,['Enterprise','cohortLabel'],'partial','企业分析按稳定患者结构化字段展示人口属性和有限检查指标分桶，可筛选和导出。','仅有限合成字段和预设分桶，不是全量检查结果结构化科研查询；另有科研复合筛选已支持有限AND/OR条件；仍未接入医院全量真实结果值集。',route='/enterprise')
gap('402-403',C,['Exam'],'只有姓名头像和合成身份，未提供证件照/现场照双验证及采血分检照片比对。',route='/quality',kind='unverifiable')
gap('407-408,417-418',C,['弃检'],'弃检仅修改订单项目；没有手写板签名、签名文档查询、关键节点签署与永久存档。',route='/quality',kind='unverifiable')
gap('410-411',C,['Quality'],'驳回事件写日志，但没有按医生/原因/次数与错误概率统计整改。',route='/quality')
gap('420-422,426-428',O,['messages'],'已有本地批量与自定义通知预览/日志；本项节日生日自动祝福机制与真实短信送达仍未实现。',route='/content',kind='unverifiable')
reviewed('429-430,473',O,['短信字典'],'config-only','维护短信字典的名称/编码/文本。','未形成完整通知模板变量、渠道校验和自动发送应用。','frontend',route='/settings')
gap('424-425',C,['Quality'],'未实现按岗位的主检/总检驳回和超期站内通知队列；日志或待办统计不等于消息送达。',route='/quality')


reviewed('472',O,['clinicalConfig','科室'],'config-only','健康业务配置可维护科室名称/编码/说明。','科室配置未联动全部工作站和排队数据。','frontend',route='/settings')
gap('475',O,['settings'],'无账号认证后端及修改登录密码页面；前端角色切换不能代替密码变更。',route='/settings',kind='unverifiable')

gap('488-493',P,['服务通知','reminders'],'只展示服务通知说明和本地提醒开关；无复查时间/报告领取触发、真实注册登录或体检前一天定时短信。',route='/patient',kind='unverifiable')
gap('494-501',O,['articles'],'内容工作区仅文章/视频/动态/公告；未实现中心/设备/医生/医院地址电话、海报、FAQ、友情链接、服务信息及小程序菜单的完整管理。',route='/content')
gap('507-516',C,['Queue'],'队列只显示全局候检数量/过号清单；缺按性别统计、瓶颈进度、姓名中间字隐藏、固定超声号、已开队列/登录医生及各科分类统计。',route='/queue')
gap('521-529,533-534',C,['Queue'],'无清空/批量开关/定时开关队列、远程屏控、医生照片简介、任意调位、后台指定入队或外检专用流程。',route='/queue')
gap('543,546,549-553',C,['Queue'],'无完成检查正式出队事件、可恢复条码凭条、长列表滚动策略、真实自助刷卡/扫码入队、语音与多音字配置。',route='/queue',kind='unverifiable')
gap('561-562',P,['电子导检单'],'没有手机排队二维码或患者主动结束排队动作。',route='/patient')
gap('564-569',C,['Queue'],'队列科室为固定数组；未实现科室/队列/区域/诊室/用户完整配置和真实体检系统无缝接口。',route='/queue')

reviewed('238-239,416', 'App', ['重大异常全局提醒','handledAt','handler:role.name','if(follow)'],'demonstrated','全局异常弹窗填写处理方式/结果；保存人员及ISO时间；勾选后创建关联患者随访，不勾选仅结束处置。',LOCAL+'处理人取演示角色，非认证身份；消息只在本浏览器/同源状态内。',route='/health')
reviewed('423','App',['state.records.alerts','重大异常全局提醒'],'demonstrated','全局读取未处理异常并弹出站内提醒。',LOCAL+'没有真实跨用户推送和消息送达回执。',route='/quality')
reviewed('301','src/rules.ts',['analyzeDemoResults','alerts.length>1'],'demonstrated','将血糖/血脂/收缩压的有限演示异常关联为代谢复核建议，结果进入总检可编辑文本。','有限确定性规则不是临床知识库；尚不能证明多种阳性指标关联的完整共识覆盖和医学有效性。',route='/review')

reviewed('90',C,['院区（可自由更换）','CHECKIN'],'demonstrated','在订单详情选择院区，或以顶部当前院区执行到检；订单保存所选院区。',LOCAL+'院区字典为示例，数据隔离与跨院区资源统筹未实现。',route='/appointments')
reviewed('54,57-58,60-66',O,['BookingConfig','weekendAllowed','priceMode'],'config-only','保存周末/问卷/默认选中/删项/价格开关与放号时刻；日期预览按周末开关过滤。','只有预览/配置，没有预约端执行的禁周末、定时放号、团转个号源、问卷约束和价格模式联动。','frontend',route='/settings')
reviewed('436-438,441,444-450,452-455',O,['crmContracts','crmCustomers','crmActivities'],'demonstrated','专业服务中的CRM页维护客户/合同/拜访立项资料，支持新建删除详情导出及合同审批状态流转。',LOCAL+'合同/活动已优先按customerId关联（兼容旧名称数据）；满意度/周期等仍含手填字段，不是全部自动业务事实。',route='/services')
reviewed('439-440,442-443,451,456-461',O,['CrmSummary','monthly','认领待审'],'partial','CRM客户可认领/审批/指派状态；维护计划/实际回款；看板汇总合同金额、完成率、月份收款与逾期合同。','已有年度/业务员过滤与ID关联回款；真实账号认领锁、完整体检进度及跨系统财务绩效联动仍不完整。',route='/services')
reviewed('466-471,474',O,['examDictionaries','关联项目编码'],'config-only','设置体检项目/条码/互斥依赖/三级小结/异常/建议/驳回资源，保存编码与关联项目编码。','配置是资源记录，不自动执行项目绑定、条码生成、模板渲染或医学词典抓取。','frontend',route='/settings')
reviewed('476,478,480-483',O,['packageRules','minAge','selectCount'],'config-only','套餐规则可录入单位、性别、年龄范围、订单模式、预算、自选数及线上开关。','没有将规则应用到共享套餐集合和实际预约引擎；套餐/项目N选M等只配置。','frontend',route='/settings')
reviewed('477,479,484',O,['packageRules','online'],'partial','维护套餐适用范围及线上开启/关闭配置。','开单/患者查询未读取这些规则，不能自动过滤不适用套餐、优先显示单位套餐或隐藏关闭订单。',route='/settings')

reviewed('573',H,['healthAttachments','readAsDataURL','512*1024'],'demonstrated','选择PDF/TXT/CSV演示报告文件，验证类型/512KB/最多4份限制，按患者本地保存、下载和删除。','实际读取内容但仅存浏览器localStorage；不上传服务器、不支持医院安全存储或自动医学解析；只允许合成报告。','frontend',route='/health')
reviewed('463','App',['role.paths.includes(route)','当前角色无此页面权限'],'demonstrated','选择预置角色后导航过滤，直接访问不在固定角色路径列表中的页面显示无权限。','仅前端固定角色映射；配置工作区新增权限矩阵未动态影响此映射，用户可改本地状态，必须服务端鉴权。','frontend',route='/settings')

# Final-generation overrides for modules upgraded after the first code review.
def replace_reviews(spec):
    def numbers(value):
        out=[]
        for fragment in value.split(','):
            if '-' in fragment:
                a,b=map(int,fragment.split('-'));out.extend(range(a,b+1))
            else: out.append(int(fragment))
        return out
    remove=set(numbers(spec))
    retained=[]
    for row in REVIEWS:
        left=[n for n in numbers(row['items']) if n not in remove]
        if left:
            row['items']=','.join(map(str,left));retained.append(row)
    REVIEWS[:]=retained

replace_reviews('502-555,564-569')
Q='Queue'
reviewed('502',Q,['queueTickets','a.items.includes(item)'],'demonstrated','首次初始化按各客户待检项目创建科室独立队列。','只有四种预置科室项目映射；后续新增客户需手动入队，未实现真实院区检查项目全集。',route='/queue')
reviewed('503-506',Q,['queueRule','最短等待优先'],'partial','显示固定空腹路径；按演示等待分钟或订单标识重排当前科室队列。','已按配置性别/项目/区域匹配候选并用服务分钟估时，但无瓶颈预排及项目依赖综合最优算法；“预约时间优先”实际按订单标识排序。',route='/queue')
reviewed('509',Q,['displayName','maskQueueNames'],'demonstrated','勾选隐藏姓名中间字，候检/过号/叫号大屏显示脱敏姓名。','仅视觉姓名遮蔽；操作按钮无障碍名称仍含全名，不能视为完整隐私访问控制。','frontend',route='/queue')
reviewed('512-513,520,529,533,537-538,542-545,547-548',Q,['手动入队','position','完成出队','召回入队'],'demonstrated','查看当前科室候检/过号，手动加入符合项目的到检客户，上下移动、选呼/重呼、过号说明、召回、完成出队；显示呼叫客户。',LOCAL+'跨标签共享本地数据，非真实现场语音/屏幕；队列完整并发控制和跨用户推送未验证。',route='/queue')
reviewed('516-519,530-532,539-541',Q,['tickets','list.length','queues.map'],'partial','以科室标签查看候检/过号名单、姓名编号、当前呼叫与人数。','已有队列名称/科室/开关查询和候检/过号/已检计数；缺人数上下限高级查询、瓶颈标识、客户姓名/身份证搜索及客户全部队列明细、VIP类型；切科室不是硬件呼叫器。',route='/queue')
reviewed('535-536,552',Q,['呼叫 / 重呼','语音与微信推送未接入'],'partial','点击叫号写本地记录，同源数据更新大屏。','现场语音播放和物理诊室屏未接入；本地更新不能证明真实终端/语音设备。','unverifiable',route='/queue')
reviewed('554-555',Q,['候检大屏'],'partial','切换当前队列的大屏视图。','同队列可配置多个诊室并显式选择叫号房间；没有单/多诊室模式切换或自动负载均衡共享池调度，页面切换不等于终端模式切换。',route='/queue')
gap('507-508,510-511,514-515',Q,['Queue'],'已有性别到检、完成数和开启队列统计；本组仍缺瓶颈科室进度专项统计、固定超声号及真实登录医生计数。',route='/queue')
gap('521-525,527-528,534',Q,['Queue'],'已有清空/批量启停和医生资料；仍无自动定时启停队列，外检的流程范围未定义。',route='/queue')
gap('526,546,551,553',Q,['Queue'],'缺远程物理屏关闭、恢复检查条码凭条、自助扫码/刷卡入队及姓名多音字语音配置。',route='/queue',kind='unverifiable')
gap('549-550',Q,['Queue'],'列表可展示候检与过号；没有针对长队列的大屏滚动策略/自动滚屏。',route='/queue')
gap('564-569',Q,['areas'],'已有动态科室/队列/区域/诊室配置与本地角色管理；仍无智能导检专用完整用户管理和真实体检系统无缝接口。',route='/queue')

replace_reviews('20,24,51,54-56,64-66,67,103,130-135,140-142,335,339,346-349,387,409,419,431-433')
reviewed('20,24,64-65',P,['allowAdd','allowRemove','displayPrices'],'demonstrated','患者预约读取共享加项/删项/价格开关；项目勾选真实影响入单，隐藏价格实际影响展示。','删项保持套餐价，界面已说明此演示口径；不代表医院项目定价规则或跨用户权限。','frontend',route='/patient')
reviewed('54','src/bookingRules.ts',['weekendAllowed','getUTCDay'],'demonstrated','周末关闭时，患者/自助机及接入共享规则的预约入口阻止周末提交。','本地规则使用日期与UTC判断，未连接医院节假日/特殊开放日或后端事务。','frontend',route='/patient')
reviewed('51,55-56','src/bookingRules.ts',['dailyCapacity','used >= capacity'],'partial','共享规则按所选日统计未取消预约，容量满额时阻止提交并显示剩余额度。','只按全院每日总量；没有套餐/项目及每时段名额、红线阈值执行或防并发超卖，黄红线为配置输入。',route='/patient')
reviewed('66',P,['priceMode','displayPrices'],'partial','选择不显示模式可以隐藏套餐/项目展示价格。','没有独立原价与执行价字段及两者切换；结算支付页仍须展示金额。',route='/patient')
reviewed('67',C,['筛选预约日期','filterDate'],'demonstrated','按日期筛选预约名单并打开具体订单详情。',LOCAL,route='/appointments')
reviewed('103',C,['historyPatient','historyOrder','recommendation'],'demonstrated','开单时随所选患者展示其合成历史指标与风险标记，切换推荐项目并可勾选加入订单。','仅预置历史指标和有限风险推荐映射，未经临床验证；真实历次异常库和医学规则需另验。',route='/appointments')
reviewed('130-132,134','Advanced',['validateGroupCsv','下载错误行','CREATE_APPOINTMENT'],'demonstrated','读取或粘贴CSV，匹配现有合成客户/套餐/分组，逐行预览错误并导出；全行通过后确认批量创建预约。','仅合成身份DEMO-ID与当前本地集合，未接医院人口/单位主数据；需先由预约页打开导入入口。',route='/appointments')
reviewed('133,135','Advanced',['DEMO-','证件标识必须使用'],'partial','拒绝真实证件号，只核验DEMO-ID与预置姓名，错误显示物理CSV行号。','不校验真实身份证号码；不支持无证件标识导入，特殊团检空身份证场景未实现。',route='/appointments')
reviewed('140-142,387,419','src/model.ts',['before','after','action:action.type','entity'],'demonstrated','本地状态写入时生成action/entity/actor/time与变更前后快照，记录开单、加减项、弃检、状态、折扣和审核建议；可查询导出。','仅浏览器演示审计，最多1000条，可被重置/篡改；操作者为演示角色，非生产不可篡改的完整跨系统审计。',route='/quality')
reviewed('335,339,347,349',C,['批量领取 / 发放单','批量模拟打印','批量移柜'],'demonstrated','多选报告批量登记领取并导出发放CSV，按选中报告批量移柜及模拟打印更新状态。','仅本地批操作；实际纸质打印/配送/签收不执行，发放单没有真实领取人身份核验。',route='/reports')
reviewed('346,348',C,['批量移柜','deliveredAt'],'partial','多选报告写柜位；领取登记时间和方式。','缺完整出入库状态、空柜出库、发放人/领取人字段及真实交接凭证。',route='/reports')
reviewed('409',C,['daysOld','reportDeadline'],'partial','用预约日期计算待审报告天数，超期标签和筛选可操作。','未按体检开始/回传/主检/总检各节点分别计算时长，也未按订单类型设置周期。',route='/review')
reviewed('431',C,['报告超期阈值（天）','reportDeadline'],'demonstrated','质控设置全局报告超期天数，审核页读取阈值判断超期。','全局单一阈值；尚无订单类型细分与后台定时提醒。',route='/quality')
reviewed('432-433',C,['仅看超期报告','daysOld(b)-daysOld(a)'],'demonstrated','待审核报告按日期年龄排序，超期显示标签，可筛选只看超期订单。','基于预约日期而非全部业务节点；同源前端计算，无服务端积案调度。',route='/review')

replace_reviews('365-376')
reviewed('365-368,370-372','Advanced',['Analytics','auditKind','grouped'],'partial','按真实演示日志的日期/操作人/类型统计开单、分检、审核、打印等事件，导出明细和人员汇总。','事件数不是客户数/项目金额；无个检团检拆分、科室原价/执行价金额、采样类型细分、销售指定项目人数等完整统计。',route='/analytics')
reviewed('374-375','Advanced',['Analytics','打印','审核'],'demonstrated','按日期和操作人筛选报告打印/审核事件，统计工作量并导出CSV。','以本地保留日志事件计数；不等于实际纸张输出、唯一报告数或真实人员绩效。',route='/analytics')
gap('369,373,376','Advanced',['Analytics'],'没有标本类型下拉、导检单回收或报告解读的专门工作量分类。',route='/analytics')

# Final dedicated-entry review: the control center adds bounded interactions,
# never external delivery, credential changes, biometric verification or e-signing.
replace_reviews('91,262-267,402,407-408,410-411,417-418,420-422,427-430,473,475,488-491,493-501,564,566-567')
CC='ControlCenter'
reviewed('91','App',['training-video','workflow-guide.mp4','workflow-captions.vtt'],'partial','打开演示指南中的真实HTML视频播放器，观看36秒六步流程示意；支持视频控制和中文字幕。','public/media/workflow-guide.mp4经ffprobe核对为H.264、1280×720、36秒并抽帧检查。该视频是流程示意而非真实界面录屏，尚未覆盖各核心/复杂操作的逐步演练；未验证实际浏览器播放。','frontend',route='/dashboard')
reviewed('262',CC,['function abnormalItems','const items','关联异常项目'],'partial','读取所选订单共享分检结果，按有限规则聚合异常项目名称，供通知勾选。','只提取有限血糖/血脂/血压规则和异常关键词；未在摘要中汇总每项目完整异常结果、全面异常字典或经验证的临床规则。',route='/controls')
reviewed('263',CC,['selectedItems','replaceAll','通知预览'],'demonstrated','勾选订单与关联异常项目，替换姓名/体检号等模板变量，编辑正文并逐对象预览后确认本地通知记录。','只证明本地短信内容生成与预览交互；未向任何短信网关发送，异常依据为演示规则，不作医疗判断。',route='/controls')
reviewed('264',CC,['const send','确认模拟发送'],'partial','手工预览确认后批量生成本地通知状态。','没有自动触发/后台调度、网关请求、真实短信送达或发送成功证据。','unverifiable',route='/controls')
reviewed('265',CC,['通知渠道','电话（本地模拟）'],'partial','可选短信、电话、站内消息模拟渠道，记录所选渠道。','不发短信、不拨打电话、不生成真实站内消息；渠道选择和模拟状态不代表外部通信实现。','unverifiable',route='/controls')
reviewed('266-267',CC,['const retry','attempts','controlNotifications'],'demonstrated','同一订单可多次创建通知，模拟首位失败后可重试；逐次保存状态、演示操作人和ISO时间并展开查询。','仅本地通知记录与失败分支；模拟送达不是真实回执，操作人为当前演示角色，缺认证与可靠长期消息审计。',route='/controls')
reviewed('402',CC,['AbstractAvatar','identityVerification','controlIdentity'],'partial','选择共享订单，核对证件照/现场照两幅抽象示意图；确认后保存一致或含说明的不一致记录和历史。','不读取真实证件照、不拍照、不采集生物识别、不做人脸识别；固定抽象图无法验证真实身份或防替检效果。',route='/controls')
reviewed('407,418',CC,['controlSignatures','演示签名','特殊报告领取','导检单回收'],'partial','选择弃检/替检/特殊领取/导检单回收，填写说明，以固定演示文字或指针笔画显式确认并本地归档。','只保存留样，不实际执行弃检/替检/领取/回收，不具备用户认证、合法电子签名、防篡改或永久存档保证；禁止录入真实签名。',route='/controls')
reviewed('408',CC,['查询签名档案','SignatureVisual','查看签名档案'],'demonstrated','按姓名、体检号或操作查询本地签名留样，打开档案查看演示笔画/文字、说明、记录人和时间。','仅可清理的本地演示档案；不证明真实弃检凭据、有效电子签章或生产保管期限。',route='/controls')
reviewed('417',CC,['onPointerDown','onPointerMove','签名方式'],'partial','浏览器指针事件捕获示例笔画并在SVG中显示，可清空重绘。','没有连接手写板或厂商SDK、未验证关键节点设备兼容/压力采样；触摸/鼠标画图不能替代手写板验收。','unverifiable',route='/controls')
reviewed('410',CC,['RejectionQuality','a.action === "REJECT"','筛选责任医生'],'partial','从实际本地REJECT审计快照提取记录医生、环节与原因，按医生筛选并聚合次数，查看源事件。','医生来自订单责任医生字段，不一定是原分检执行医生；主检/总检合并为一类，未完整区分各岗位实际责任及全部跨系统驳回。',route='/controls')
reviewed('411',CC,['count / visible.length','原因占比'],'partial','自动计算筛选后的驳回原因事件占比。','分母为筛选后的驳回事件数，不是医生全部检查数，不能当作错误发生概率；未接主任看板或整改任务闭环。',route='/controls')
reviewed('420-422,488-491,493',CC,['const templates','eligible','确认模拟发送'],'partial','选报告完成/领取、预约/检前、异常复核或复查提醒模板，从共享订单选择对象并预览编辑；报告通知限定已审核/已打印订单。','仅手工创建本地通知；缺真实短信、自动报告/领取/预约事件触发、复查具体时间关联和前一天定时任务。注册登录没有由通知工作台实现。','unverifiable',route='/controls')
reviewed('427-428',CC,['targets.forEach','通知正文','body.length > 500'],'partial','多选对象编辑自定义正文，校验500字/占位符并逐人预览后生成批量模拟日志。','没有真实短信发送、发送速率/费用/退订规则、网关失败和送达回执。','unverifiable',route='/controls')
reviewed('429-430,473',CC,['const templates','setBody','通知正文'],'partial','选择内置通知模板后修改本次正文，支持变量校验与预览。','正文编辑仅用于当前发送，不保存为可维护模板库；切换模板会恢复默认文字，不证明全部模板持久化管理。','frontend',route='/controls')
reviewed('475',CC,['PasswordDemo','passwordDemoChanged','setCurrent("")'],'partial','在专用演练表单校验DEMO旧值、新值强度与两次一致，通过后清空输入，只保存完成时间/标志。','没有真实账号认证或密码修改；输入值不写入本地存储和日志，每次仍使用固定DEMO-OLD。该模拟不能作为安全认证或生产密码策略验收。',route='/controls')
reviewed('494-501',CC,['portalSpecs','portalHospital','PortalConfiguration'],'config-only','维护中心介绍/设备团队/医院地址演示热线、新闻海报、FAQ、友情链接、服务与小程序菜单等分域字段，保存本地配置并预览医院资料。','未发布微信小程序，也未联动患者端现有菜单和内容；海报只维护标题摘要/顺序，缺图像资源管理；链接为文本，不执行外部验证。','frontend',route='/controls')
reviewed('564,566-567',CC,['guideDepartments','guideZones','guideRooms'],'config-only','维护科室项目/平均时长/适用性别、院区楼层区域及诊室科室/区域/队列编码/容量。','关系为文本配置，未驱动现有固定Queue映射、区域路径规划或诊室调度；无真实体检系统接口。','frontend',route='/controls')

# Second implementation pass: reviewed stateful workflows, with remaining semantics explicit.
replace_reviews('18,38,46,48,51-53,55-63,70,75-77,84-85,93-94,100-102,105-107,110-115,118-119,122,124-129,136-139,147,158-160,163-166,186-188,193-194,216,229-234,245-246,251-253,259-261,270-271,286,288-291,298-300,303-304,306-309,318,327-328,352-353,369,373,376,407,409,418,429-430,431-433,466,468,470-471,473,476-484,507,511,514,521-524,527-528,549-550,564-567,717,778')
reviewed('18,84-85,466,468','Ordering',['OrderingRuleEditor','orderingRules','保存并应用项目规则'],'demonstrated','新增/载入编辑/启停项目规则与演示价格，维护必检、互斥、依赖和适用性；开单实际读取这些规则。','规则内容与定价为合成配置，不是院方医学标准；没有院方主数据接口或全量字典。','frontend',route='/appointments')
reviewed('105-107','src/orderingRules.ts',['quoteOrder','percentFromAmount','nonDiscount'],'demonstrated','开单输入目标金额反算可折项目折扣，逐项目调整比例，禁折项目保持原价，多套餐重复项目只计一次。','项目基价按套餐金额均分、重叠取较高者是演示口径；金额不能低于禁折底价，比例会钳位。生产医院价格/折扣审批/资金一致性未验证。',route='/appointments')
reviewed('110,113,477',C,['getOrderingIssues','resolveDependencies','orderingErrors'],'partial','多套餐项目去重，适用性与互斥规则检查，依赖自动加入；不合法选择阻止提交。','当前校验机制不等于全部项目/套餐自动过滤；互斥通过报错处理而不是自动替用户选择保留项。医学适用规则仅演示。',route='/appointments')
reviewed('111-112,114',C,['overrideReason','hardErrors','resolved.added'],'demonstrated','按客户婚姻状态显示项目警示，填写强制添加理由才可覆盖婚姻警示；必检/依赖加入清单，循环依赖阻止提交。','只允许覆盖婚姻警示，不可覆盖性别/互斥等硬错误；临床适应证及强制添加权限仍须正式规范。',route='/appointments')
reviewed('115','Groups',['applicableGroup','groupOrders'],'partial','根据客户单位、名单、日期和有效状态选择本地单位订单，开单显示预算/自选包并校验允许套餐。','是否自动带入具体套餐依赖开单选择流程；没有完整多单位订单优先级、全部医院主数据及真实团检业务关联。',route='/appointments')
reviewed('93','Registration',['证件类型','演示身份证','演示护照'],'partial','手工登记可选演示身份证/护照/军人证/港澳台/其他证件类型。','不读取证件；源文医保卡、电子医保、就诊卡、电子健康卡、永居证等类型未逐一实现。','frontend',route='/appointments')
reviewed('94,147','Registration',['UPSERT_PATIENT','合成证件标识','保存客户基本资料'],'demonstrated','创建或编辑合成客户基本资料，校验DEMO标识/重复身份/18至120岁，并写共享客户与审计；不改临床结果。','只允许合成身份且不支持未成年人；不证明真实实名、证件校验、隐私权限或生产认证。',route='/appointments')
reviewed('100-102','Registration',['customerTypes','orderType','queueArea'],'partial','维护预置客户类型到订单类型/导检区域映射，新建订单带入映射，队列可按偏好区域分配诊室。','客户类型和订单类型仍为有限预置选择，不支持全部类型任意新增；跨院区资源调度和安全隔离未验证。',route='/appointments')
reviewed('119','Registration',['preExamHistory','带入已保存问卷'],'partial','为已有客户选择带入已保存检前问卷，将回答及来源写入preExamHistory，开单携带该记录。','问卷目前主要是合成生活方式选择，不能代替完整结构化病史/用药史/家族史；字段缺失必须保持空，不能生成假病史。',route='/appointments')
reviewed('122,124-126,129,136,138-139','Groups',['GroupContractWorkbench','groupAccounts','splitGroupAmount'],'demonstrated','创建/查询/编辑单位订单、允许套餐和加项自选包，设置预算模式与单位/个人项目；本地预付款入账、余额校验、逐订单扣减并留流水。','仅浏览器账本和合成预算分摊；普通CRM合同不会自动转为团检订单，不发生真实付款或银行会计处理。',route='/appointments')
reviewed('127-128,137,187-188','Groups',['members','personalItems','导出团检项目及分组结算'],'partial','维护单位成员名单、允许套餐、自选项目包；按订单列单位/个人金额、项目和弃检，导出明细。','缺独立人员分组及组套餐/组内人数金额、人员资料就地编辑；预算超额可分个人，但未实现完整套餐内换项和弃检金额重算。',route='/finance')
reviewed('186,193-194','Groups',['InvoiceLedger','invoiceLedger','seller'],'partial','多选交易合并/按比例拆分模拟开票，关联原订单和业务员；阻止重复有效开票，支持作废后重开和CSV导出。','只有本地台账，非真实电子发票、税务号码/验签/红冲接口；单位维度仍主要通过原订单关联。',route='/finance')
reviewed('158-160','ExecutionDesk',['photoMode','printColumns','printTargets'],'demonstrated','保存导检单双图显隐、表头顺序/显示和DEMO A4/条码目标，订单表与预览实际消费配置。','图片为固定抽象合成图，目标是模拟标识，未选择操作系统打印机或真实驱动；不能证明照片身份或真实输出。',route='/appointments')
reviewed('118,166','ExecutionDesk',['printTasks','批量生成打印任务','execute'],'partial','开单自动写三类打印任务，按单位多选生成并去重；确认模拟执行，失败可重试并保存目标、人员、时间与快照。','生成/处理本地任务而非开单自动出纸；QR只编码演示标识，不证明检验条码码制、打印速度、真实设备回执。',route='/appointments')
reviewed('163-165',C,['replacements','originalPatientId','确认替检并更新订单'],'demonstrated','未开始检查的团检可替换为合成患者，保存原人/替检人映射并过滤性别不适用项；两种姓名均可查询，导出关联名单。','仅本地替检；导出是同表两列关联而非两份独立名单，真实身份核验/费用重算/全跨系统资料迁移未验。',route='/appointments')
reviewed('216,229-232','ClinicalExtras',['ExamExtras','examSummaries','readAsDataURL','examInquiry'],'demonstrated','分级小结新增/排序/删除，配置等级；应用可编辑结构化内科演示模板；读取并预览/删除本地图像及合成音频。','文件每类最多3份、每份512KB；仅浏览器保存。音频是导入文件，不是科室声音录制；问诊模板未经医学验证。',route='/exam')
reviewed('233',C,['ctrlKey','metaKey','Enter'],'demonstrated','Ctrl或Command加Enter复用分检提交函数，执行必填/锁定校验后提交。','浏览器快捷键与前端守卫不替代后台业务授权。','frontend',route='/exam')
reviewed('234','ClinicalExtras',['UndoExam','UNDO_RESULTS'],'demonstrated','选择尚未审核且未锁定的分检提交，填写撤销原因后退回可编辑草稿，保留结果和前后审计。','不能撤销审核中/已审核订单；生产并发抢锁和后台权限未验证。',route='/exam')
reviewed('245','ExecutionDesk',['GynecologySpecimens','reportSpecimens','待采标本'],'demonstrated','订单包含妇科/宫颈/TCT/HPV/病理项目时显示待采提示，确认后写共享标本记录并阻止重复采集。','关键词为演示识别规则，不是完整临床标本流程；确认只改变本地状态，没有真实采样。',route='/exam')
reviewed('246','ExecutionDesk',['DEMO-PATHOLOGY','QRCodeSVG'],'partial','为妇科病理生成订单关联的真实SVG二维码并预览状态。','只有二维码预览，没有病理条码打印任务/真实打印机回执或检验申请接口。',route='/exam')
reviewed('251-253','ClinicalExtras',['applicationPushes','DEMO-APPLICATION','导出单项结果'],'partial','选择项目查看申请单与结果、生成真实演示QR、导出单项CSV；模拟推送失败/成功并记录重推次数。','单项CSV不是打印；申请单为合成文档，重推只变本地状态，不发送医院医嘱。',route='/exam')
reviewed('259','ClinicalExtras',['examinationEnded','独立标记检查结束'],'demonstrated','对可编辑在检订单独立设置/取消检查结束标记和时间，不跳过原有结果校验。',LOCAL,route='/exam')
reviewed('260-261','ExecutionDesk',['getDeferredCandidates','deferredExecutions','确认执行本地到期处理'],'partial','登记改日检、配置提醒窗口与模拟日期；去重生成临期模拟通知；管理员预览确认后只弃未检项并转待审核，保留已有结果。','没有后台自动调度或真实短信；必须显式执行，本地模拟日期不代表生产到期任务已运行。',route='/appointments')
reviewed('270-271',CC,['AbnormalLevels','getAbnormalLevel','abnormalLevels'],'demonstrated','编辑预置异常等级名称和颜色，校验并保存，合成客户标签实时读取。','改变展示含义不改变患者风险分类/医学阈值；不构成完整AB专家共识规则。','frontend',route='/controls')
reviewed('286,288,291','ReviewTools',['reviewSchedules','reviewWorkload','reviewDifficulty'],'demonstrated','按日/医生/环节排班、配置容量和五维权重，给当前待审订单指派医生，动态汇总加权负载/繁忙指数。','权重总和100；难度/工作量是公开合成公式，不代表临床能力、真实绩效或服务端并发分配。',route='/review')
reviewed('289-290','ReviewTools',['reviewDifficulty','reviewAssignments'],'partial','年龄/项目数/有限异常/重大阳性/客户类型及权重参与演示难度计算，并记录分配快照。','没有医院确认的难度规则、金额口径和医生级别自动匹配；当前为人工选择排班医生。',route='/review')
reviewed('298','ReviewTools',['ReviewTerm','合成 ICD10 映射编码'],'partial','维护合成编码、词条、等级、严重度与建议，可按词条/编码查找和匹配。','仅DEMO编码字段机制，没有完整ICD10标准库及真实编码正确性验证。',route='/review')
reviewed('299-300,304,306','ReviewTools',['matchReviewText','reviewFindings','REVIEW-FOLLOWUP-'],'demonstrated','按标点拆分文本并提示未匹配片段；维护词条后即时参与匹配，人工分级按严重度生成有序建议和每订单词条去重随访。','字面包含匹配及人工等级不是医学AI或专家共识；未知文本需人工复核，按词条建任务不等于同订单全部异常合并。',route='/review')
reviewed('303,307-309,318','ReviewTools',['PositiveEditor','SuggestionEditor','sortReviewAppointments','RecheckEditor'],'demonstrated','人工重大阳性标记写共享异常并可撤销；编排建议顺序；危急/超期订单排序置顶；按订单类型时限判超期；特殊订单标记/撤销复查项目。','全为本地合成流程，标记不构成诊断；复查无真实医嘱/调度，超期起点用到检日或预约日。',route='/review')
reviewed('327-328','ReviewTools',['parseReportTemplate','reportTemplateText','ReportTemplateTools'],'demonstrated','导入或编辑64KB以内白名单JSON报告模板，明确确认后保存；按模板章节实际生成文本，可下载模板并更新同ID版本。','只支持安全文本章节模板，不执行任意HTML/脚本，也不具备医院复杂版式/PDF引擎或服务器模板分发。','frontend',route='/reports')
reviewed('352-353,369,373,376','ReviewTools',['ReportOperations','queryReportOperations','reportInterpretations','guideRecoveries'],'demonstrated','登记/更正/撤销报告解读、导检单回收及标本事件；保存人员时间，按日期/操作人/标本类型筛选并统计去重有效事件。','解读仅记录合成人员和时间，不提供医学解读；回收是本地人工登记，不代表实物回收设备；取消记录不计有效工作量。',route='/reports')
reviewed('409','ReviewTools',['reportAgeDays','reportDeadlineDays'],'partial','从到检日（缺失用预约日）计算各订单类型超期，列表按危急/超期/时长排序。','没有分别记录报告回传、主检开始结束、总检开始结束每节点耗时；不能代替完整体检流程时效分析。',route='/review')
reviewed('431-433','ReviewTools',['isReportOverdue','sortReviewAppointments','ReviewConfiguration'],'demonstrated','配置订单类型报告期限，实时算超期与排序，Core审核页使用同一函数进行筛选和显示。','规则为本地日期计算，不是后台积案调度或跨岗位送达；不覆盖全部节点时间。',route='/review')
reviewed('407,418',CC,['signatureArchiveIds','execute','waivable'],'partial','固定演示文字/指针笔画留样后，可另行明确勾选执行本地弃检/核验确认/特殊领取/回收，检查角色/订单状态并关联档案。','不产生有效电子签名/永久存档，真实手写板未接入；替检确认不等于人员替换，导检单回收另有逐项确认入口，仍不伪造检查结果。',route='/controls')
reviewed('48,429-430,473',CC,['notificationTemplates','保存为当前通知模板'],'demonstrated','编辑并保存内置通知类型的正文模板，校验字段；切换/重新进入可重新套用已保存文本到逐人通知预览。','仅本地内置类型模板库，未对接真实短信网关或医院全量模板；保存模板不等于自动发送。','frontend',route='/controls')
reviewed('476,478,480-483','Groups',['groupOrders','optionalItems','choose','mode'],'demonstrated','配置单位允许套餐、固定/限额/无限模式、项目N选M与自选包；Core开单实际限制允许套餐/选择数量并执行单位个人分摊。','套餐年龄/性别规则在Ordering中维护；同单位多订单优先级、按套餐独立自选包及复杂排期仍有限，本条只证明已写明的本地规则子集。',route='/appointments')
reviewed('479,484','Groups',['applicableGroup','status'],'partial','开单查找生效且日期/名单匹配的单位订单，停用后不再套用。','尚不能证明所有患者/自助端自动优先单位套餐或隐藏全部关闭订单；跨端统一策略需逐端核验。',route='/appointments')
reviewed('38,52-53,59,70,75-77',P,['UnitBookingCalendar','groupBookingSchedules','保存单位排期'],'demonstrated','按单位维护起止日/日容量/保留号源/可约时段/亲属和预约开关；月历可点日查看单位订单，预约校验消费保存配置。','纯本地合成排期，名额没有后端事务和跨终端防超卖；不证明生产单位账号权限。','frontend',route='/controls')
reviewed('51,55-56','src/bookingRules.ts',['slotRemaining','redCapacity','yellowCapacity'],'partial','每日及分时容量实际拦截，红线限制总容量，黄线达量返回预警，单位日容量也参与校验。','仍无按套餐/单项目独立人数限额和跨用户原子号源扣减；预警返回不等于全部入口已展示。',route='/patient')
reviewed('57-58','src/bookingRules.ts',['getBookingNow','releaseHour','reservedForGroups'],'demonstrated','共享UTC演示时钟改变次日放号与预约当天团转个保留名额；时刻跨越后可预约结果随之变化。','判断在前端操作/重渲染时运行，不是后台定时任务，不证明服务关闭后仍持续执行。',route='/patient')
reviewed('60-63',P,['questionnaireEnabled','questionnaireSkippable','recommendationEnabled','bookingQuestionnaires'],'demonstrated','问卷开关、能否跳过、推荐开关和套餐默认选择实际影响H5预约；必填未完成阻止提交，保存回答后方可继续。','问卷为教育性合成选项，推荐为有限关键词规则；必检项目仍受共享规则保护，不证明临床方案有效。','frontend',route='/patient')
reviewed('46',P,['portalHospital','合成健康路'],'partial','患者端消费医院演示地址、热线、开放时间及合成本地院区路线说明。','没有真实地图、定位、交通路线或院内导航接口；演示地址不可用于实际就医导航。','frontend',route='/patient')
reviewed('507,511,514',Q,['arrived','todayComplete','isOpen'],'demonstrated','根据实际合成订单日期/状态统计当日男女到检、完成数，按队列开关统计已开启队列。','完成口径为进入审核/已审/已打印，未做所有临床节点终态核验；按本浏览器UTC日统计。',route='/queue')
reviewed('521-524',Q,['clearMode','batchOpen','clearedAt'],'demonstrated','多选队列批量启停；关闭后拦入队/呼叫并暂停当前呼叫；确认后仅清过号或清全部，历史以cleared状态保留。','只控制本地业务队列，不远程关闭物理诊室屏；无跨用户并发队列锁。',route='/queue')
reviewed('527-528',Q,['doctorDraft','queueDoctor','avatar'],'demonstrated','上传/预览/移除合成医生头像，保存姓名职称简介，实际显示到当前队列大屏。','只允许演示媒体，本地保存；不验证真实资质、真实医生登录或物理屏发布。','frontend',route='/queue')
reviewed('549-550',Q,['ScrollList','scrollTop','overflowY'],'demonstrated','候检/过号列表在容器溢出时滚动，大屏支持自动滚屏及暂停，定时器卸载清理。','只证明页面滚动行为，不验证真实现场大屏、长时间设备运行或所有浏览器性能。','frontend',route='/queue')
reviewed('564-567',Q,['deriveQueueDefinitions','queueDefinitions','mappedRooms','guideZones'],'demonstrated','科室项目与区域/诊室配置实际改变队列集合、候选客户匹配、停用状态、估时和叫号roomId/方向；可新增编辑业务队列。','关联仍用名称/编码，未具备完整外键/删除约束和多诊室最优负载算法；真实体检系统接口未接。',route='/queue')
reviewed('717','src/bookingRules.ts',['bookingBlacklist','blockedPatient'],'demonstrated','共享预约规则读取患者及有效期内黑名单，实际阻止H5/自助及接入规则的后台预约提交。','仅本地前端预约限制，不是账号登录禁用或服务端安全授权。','frontend',route='/settings')
reviewed('778',CC,['getControlTodos','ControlTodoList'],'partial','从实际本地模拟通知失败、身份待复核及驳回订单计算待办数量并提供跳转。','尚不等于所有系统待办类型的实时跨用户通知；只覆盖已列出的三类。','frontend',route='/controls')

# Patient/health/operations follow-through after second-pass integration.
replace_reviews('7,13-14,27,32-33,34-35,37,39,110,115,119,127-128,137,270-271,273,276,386,462-465,470-471,476-479,482,484,494-501,561-562,571-572,593-604,617-623,639-661,665-666,670-671,673-678,691,696-700,716')
reviewed('7',P,['registerPerson','demoAccount','DEMO-'],'partial','校验演示称呼、DEMO手机号、成人年龄和重复标识，创建共享合成客户并加入常用列表。','不是身份证/手机号实名注册、密码登录或微信账号认证，只是浏览器合成账户演练。',route='/patient')
reviewed('13-14',P,['referralUrl','distributorId','个人推广预约二维码'],'demonstrated','选择演示推广人员生成真实带来源参数的QR/H5链接，新预约保存distributorId，按来源统计总单及有效单。','只有本地H5归因演示，未发布全员分销微信小程序，不验证真实扫码、账号身份和服务端绩效防作弊。',route='/patient')
reviewed('27',P,['patientCommonPeople','saveCommon','我的常用体检人'],'demonstrated','新增合成体检人并收藏到当前演示账户常用列表，可移除关联而保留既有体检档案。','账户与关系是本地模拟，无家庭授权、实名验证或真实跨账户访问隔离。',route='/patient')
reviewed('32-35,37,39',P,['activeGroup','splitGroupAmount','groupSplit'],'partial','H5读取有效单位订单/名单/允许套餐和项目自选数量，项目按预算及个人承担标记分摊入单，亲属开关真实约束。','套餐N选M、单位/亲属折扣与付款策略已按共享配置执行；额度/选项仍基于套餐和项目组合，没有真实交易拆分和退款。',route='/patient')
reviewed('110',C,['packageIsApplicable','getOrderRules','sex'],'demonstrated','开单套餐及规则附加项目根据当前客户性别/套餐适用规则过滤，提交仍校验适用性。','使用有限合成适用规则，不能证明院方医学适应证完整性；多套餐已有可显式使用的自动互斥整理；双必检冲突仍须人工处理。',route='/appointments')
reviewed('115,128','Groups',['groupPersonnelGroups','subgroup','packageId'],'demonstrated','单位订单创建人员分组与组套餐，成员互斥校验；新开单匹配单位及人员组，自动带入该组套餐并保存组名。','分组是本地ID关系；不验证医院人员主数据、跨单位并发或真实费用业务。',route='/appointments')
reviewed('119','Registration',['bookingQuestionnaires','preExamHistory','sourceId'],'partial','读取患者端保存的合成病史/用药/家族史及问卷回答，显式带入客户检前资料并随开单保存；未填写字段保持空。','目前需要点击带入，非全部历史数据自动汇聚；真实医学问卷、原始病历接口和完整下游提醒仍有限。',route='/appointments')
reviewed('127,137','Groups',['members','groupPersonnelGroups','splitGroupAmount'],'partial','维护单位及人员组成员、专属套餐和个人项目，预算超额自动分个人。','名单选择不是完整人员基础资料就地维护；没有全部套餐内换项/弃检价差重算策略。',route='/appointments')
reviewed('270-271,273,276',H,['RiskManagement','followupLocks','mergeKey','riskLevels'],'demonstrated','维护实际用于标签的等级名称/颜色，演示操作者认领锁定并确认解锁；同订单多异常合并一条任务，保存关联ID且同集合去重。','锁仅限制本地界面操作，无真实认证/跨用户原子锁；合并按选中集合，不验证医学风险分层。',route='/health')
reviewed('386,464-465','src/store.tsx',['customRoleId','allowedPatientIds','allowedCampus','examTypes'],'partial','自定义角色实际过滤共享hook返回的患者、订单和关联任务，按指定客户/院区/体检类型限制当前工作区可见数据。','浏览器可修改存储；records与审计按患者/订单、归档订单同范围及发票关联过滤，资源容量使用匿名全局汇总；仍基于已知本地字段，不是服务端访问控制。','frontend',route='/settings')
reviewed('462,716',O,['StaffPolicyWorkspace','minDiscount','permissions'],'partial','人员关联自定义角色，在专用操作模拟器校验权限、体检类型和折扣下限；共享角色可供App读取。','模拟器通过不会执行实际审核/收费；各业务动作仍需分别验证实际权限消费，不能据此声称全系统鉴权完成。','frontend',route='/settings')
reviewed('463','App',['customRoleId','menuPaths','role.paths.includes(route)'],'demonstrated','选择预置或自定义角色后实际过滤导航，并对不允许的路由显示无权限；可退出自定义角色。','仅前端路由守卫，本地用户可自行改配置；不构成生产认证或服务端接口授权。','frontend',route='/settings')
reviewed('470-471','ReviewTools',['ReviewTerm','advice','matchReviewText'],'demonstrated','维护异常词条与对应合成建议，后续文字匹配和建议生成真实消费保存内容。','词条未含完整临床字典/专家共识，必须人工医学审核，不构成自动诊断。',route='/review')
reviewed('476','Ordering',['minAge','maxAge','保存并应用套餐规则'],'demonstrated','创建和编辑套餐性别/年龄/单位适用规则，实际用于套餐显示和提交校验。','只演示业务过滤，不证明医疗适应证和完整医院套餐版本管理。','frontend',route='/appointments')
reviewed('477-479,484',P,['applicablePackages','onlineEnabled','activeGroup'],'demonstrated','患者端按有效单位订单/允许套餐、年龄性别适用条件和线上开关过滤展示；名单不符阻止回退通用团检，配套自助机消费同一规则。','仅本地共享数据与合成客户，无医院套餐接口/微信原生身份；特殊单位优先级仍采用有限本地匹配。',route='/patient')
reviewed('482','Groups',['optionalItems','groupOrders'],'partial','按单位订单保存并带出项目自选包。','仍是单位订单级包，未给每个不同套餐分别配置独立自选包。',route='/appointments')
reviewed('494-496,498,500-501',P,['publicRows','portalHospital','portalMenus','portalFaq'],'demonstrated','后台已启用医院/团队/新闻/FAQ/服务/菜单配置被H5真实读取，按日期和排序呈现，菜单导航和服务入口可操作。','仍为H5，不是已发布微信小程序；无真实医院数据或外部账号体系。','frontend',route='/patient')
reviewed('497,499',P,['文字海报','portalLinks'],'partial','按启用状态读取文字海报及友情链接名称/地址/说明。','海报没有图像资源发布；链接只展示文本、不执行外访或验证，不证明完整图片海报/友情链接导航。','frontend',route='/patient')
reviewed('561',P,['queueEntry','演示排队查询二维码','joinQueue'],'partial','生成真实携订单参数的排队QR，打开后显示正确合成订单，可按签到及科室开关加入共享队列。','目标是本地H5排队页，未接真实诊室自助扫码终端或微信认证；不是实际扫码入队验收。',route='/patient')
reviewed('562',P,['结束此排队','endedBy','queueTickets'],'demonstrated','患者主动结束选中队列票据，写cleared状态和结束人/时间，医护队列读取相同记录。','只证明H5本地状态联动，非微信原生功能或后台身份授权。',route='/patient')
reviewed('571-572,593-597',H,['assessmentForms','scoreDemoAssessment','SYNTHETIC-EDU-2'],'partial','不同慢病/心理/中医/设备/团检类型有独立字段和确定性演示维度，保存回答/指标/算法版本快照并可复核。','全部为自定义非临床模型，不是经验证量表、慢病风险模型、中医体质诊断或真实设备评估；专门人群完整医疗表单仍不足。',route='/health')
reviewed('598-604',H,['GroupBuilder','memberIds','groupId'],'demonstrated','按单位/风险/人群档案类型/年龄筛选并预览成员，可排除个体，保存规则和成员快照并去重生成关联干预随访。','儿童/孕产妇/精神卫生采用档案类型字段过滤，不证明专科医疗管理、敏感数据权限或临床干预有效性。',route='/health')
reviewed('617-623',H,['PlanComposer','templateSnapshot','termsSnapshot','sourcePlanId'],'demonstrated','维护启用模板/计划单元/词条/再检推荐并实际套用，保存来源快照，生成有日期的计划任务及非药物教育资料；终止取消未完成关联任务。','模板适用人群及专业复核为演示选择，不生成真实处方/医嘱，不执行药物治疗；模板修改不应当作已验证医学版本发布。',route='/health')
reviewed('639-650,655-661',H,['getPatientHealth','cohortLabel','无上期数据'],'demonstrated','从稳定患者字段或按ID固定的合成指标分组，按单位/年龄/性别筛选显示人数/占比和CSV；缺字段标待补充，无历史标无上期数据。','数值分桶是公开演示口径，不是医学诊断或实际医院科研统计；固定ID后备是合成资料，不能冒充已采集真实值。',route='/enterprise')
reviewed('651-654',H,['knownConditions','archiveComplete','archiveCount'],'partial','显示合成既往状况与档案完整性，提供建档次数字段及风险标签分类。','已患病记录/风险标签未接真实诊断模型；建档次数尚需完整统计呈现，不是仅有字段即全部满足。',route='/enterprise')
reviewed('665-666,673-677',O,['CommerceSimulator','quoteCommerceOrder','groupBuyRounds','consumptionCode'],'demonstrated','从商品/地区/重量/免邮/团购/店铺配置实时计价，预约占库并转单不重复、不同客户成团后可模拟付款，消费码精确核销且防二次核销。','资金/物流/核销仍是本地模拟；过期团购需显式检查，未部署后台任务、真实支付或并发库存事务。',route='/commerce')
reviewed('670-671',O,['OrderSettlement','sourceSnapshot','生成本月结算账单'],'demonstrated','按月份汇总实际本地商城订单已收/退款/待付，生成保留来源快照的结算账单，导出明细并供核对。','状态口径为演示定义，没有银行账单、支付渠道对账、会计凭证或真实结算。',route='/commerce')
reviewed('678,691',O,['readAsDataURL','上传商品图片','健康视频预览播放器'],'demonstrated','本地图片/视频按类型大小校验后实际读文件，图像预览、HTML视频controls及媒体删除使用保存内容。','存浏览器数据，非服务器媒体库/转码/CDN；DOM测试只证明source与控件，不证明视频解码播放或真实浏览器兼容。','frontend',route='/content')
reviewed('696-700',O,['LoyaltyCenter','applyLoyaltyChange','sourceKey'],'demonstrated','健康豆逐笔账本拒负余额/重复来源，任务一次奖励、商品兑换/取消退豆/核销、跨合成客户容量报名/取消/签到奖励，配套规则可维护。','积分无现金价值，状态只保存在当前浏览器；不证明并发一致性、真实奖品交付、团队授权或对外活动发布。',route='/content')

# Final frozen-source refinements; keep missing subfeatures explicit.
replace_reviews('187-188,439-440,451,456-461,678,753,755')
reviewed('187-188','Groups',['groupPersonnelName','groupSplit','导出团检项目及分组结算'],'partial','单位订单结算显示组名、套餐、项目、单位/个人分摊及弃检名称，可按订单导出明细。','人员分组已实现，但缺按组人数/金额小计、逐弃检金额及完整多模式结算；变更项目不等于已自动按院方口径重算费用。',route='/finance')
reviewed('440,456-457',O,['CrmSummary','contractId','paymentType','monthly'],'demonstrated','按客户ID关联合同，登记计划/实际回款并限制不超剩余应收；实际回款更新合同余额，月份统计同时按年度和业务员筛选。','只登记本地合成财务事实，不执行真实转账、发票或支付渠道对账。',route='/services')
reviewed('439,451,458-461',O,['CrmSummary','overdue','year','person'],'partial','年度及业务员过滤合同金额、完成率、月回款与逾期合同，客户/合同/活动通过ID关联。','合同台账不是全部体检订单进度；完整拜访/项目审批绩效与跨系统财务数据仍不全，真实人员权限与认领锁另验。',route='/services')
reviewed('678',O,['readAsDataURL','上传商品图片','删除图片'],'demonstrated','校验本地图像类型/大小，读取内容保存到商品，显示实际预览并可删除。','仅浏览器合成媒体，不是服务器图片存储、CDN或医疗敏感图片处理。','frontend',route='/commerce')
reviewed('753,755',O,['menuPaths','allowedPatientIds','激活此自定义角色'],'partial','角色配置可选择实际菜单、客户/院区/类型范围，激活后App路由和共享数据视图实际消费。','只配置现有路由集合，不创建任意新页面；按钮/字段资源配置未全面生效，records及审计已有患者/订单/归档快照/发票关联过滤和匿名容量汇总；原始浏览器存储仍可查看修改，非服务端鉴权。','frontend',route='/settings')

# Final per-item checks against the frozen components, without group-wide upgrades.
replace_reviews('8-9,34-35,287,492,516-517,539')
reviewed('8-9',P,['upcoming.results','currentTickets','pt-guide-list'],'demonstrated','电子导检列出该订单检查项目，分检结果改变完成状态；当前队列票据同步显示叫号/过号和诊室。','检查进度为共享浏览器状态；路线楼层及等待分钟仍为示例，不是微信原生或跨用户实时医院导检。',route='/patient')
reviewed('34-35',P,['activeExtras.length !== Number(activeGroup.choose','groupQuote','bookingExtras'],'demonstrated','单位项目自选按配置数量校验，套餐外加项真实入单，并按共享项目价格计算总金额及单位/个人分摊。','仅本地合成订单与金额规则；套餐N选M及折扣另有共享配置；没有真实支付拆分和退款事务。',route='/patient')
reviewed('287','ReviewTools',['reviewAssignments','reviewWorkload','分配给'],'demonstrated','从有排班的主检/总检医生选择当前待审核订单受理人，保存分配日期和记录，重复分配受限，工作量即时重算。','仅本地人工指派与合成工作量，不证明服务端并发抢单、真实医生身份或医院绩效口径。',route='/review')
reviewed('492',P,['registerPerson',"view === 'reports'",'reportId'],'partial','可注册合成体检人并查看所选已审核历史报告，演示身份切换用于访问样例资料。','没有真实登录/账号认证，也没有注册登录或查看报告触发的自动消息；本项与消息中心的正式业务关系待澄清。',route='/patient')
reviewed('516,539',Q,['visibleQueues','t.status === "missed"','t.status === "done"'],'demonstrated','按业务队列/所属科室统计当前候检和叫号、过号、完成票据数量，并显示已检名单。','本演示将源文过检按过号理解，需院方确认；统计单位为本地票据，未验证真实人次去重、跨终端或临床完成口径。',route='/queue')
reviewed('517',Q,['visibleQueues','q.name','q.department'],'demonstrated','按队列名称或科室名称筛选队列列表，并可联合开启/关闭状态筛选。','仅本地名称包含匹配；不代表人数上下限、VIP类型等全部高级查询。','frontend',route='/queue')

# Final accepted-source increment: scoped UI interactions, not production integrations.
replace_reviews('12,33,151,176,187-188,255,403,497,499,518-519,546')
reviewed('12',P,['satisfactionQuestions','submitSatisfaction','patientSatisfaction'],'demonstrated','完成五维必答评分及可选合成建议，按患者/订单保存一次问卷，防重复提交，切换订单及刷新可回看。','问卷题目为演示服务体验调查；没有医院正式问卷版本、后台分析或真实身份认证。',route='/patient')
reviewed('33',P,['packageChooseCount','selectedPackageIds','groupQuote'],'demonstrated','按全局或单位优先配置多选套餐，严格校验N选M数量，项目去重计价并复用单位个人分摊；人员组指定单套餐优先。','仅本地合成套餐/金额；组合仍受互斥规则约束，不证明临床套餐有效性、后端并发或真实交易。',route='/patient')
reviewed('151,187-188','SettlementDetails',['buildSettlementRows','settlementSubtotals','pendingRefund','packageCatalogComplete'],'demonstrated','按订单pricing及groupSplit展示总额/单位/个人/待缴/待退、项目承担及弃检金额，按单位/日期/人员组筛选，统计组人数与套餐/外加项/自费小计并导出CSV。','比例分摊是明确的本地模拟口径，缺收款或价格证据标未登记；当前套餐并集用于分类，非历史版本证明。弃检金额不自动退款，没有真实收款/对账。',route='/finance')
reviewed('176','ReviewTools',['unfinishedGuideItems','GuidePendingNotice','resolveGuideRecoveryCode'],'demonstrated','手选订单或输入合成条码定位已到检订单，回收前列出未检项目，排除已弃检项，保存回收方式/人员/时间及未检快照，拒绝重复回收。','回收是本地登记，不连接扫码枪/回收机；不会自动完成检查结果或执行纸张回收。',route='/reports')
reviewed('255','ReviewTools',['recoveryMode','GuidePendingNotice','guideRecoveries'],'partial','提供手选订单与模拟条码定位两种回收入口，显示未检项目并记录回收。','尚无原文“仅回收”与“回收并确认项目”两种业务策略；手选/条码只是定位方式，不能据此认定第二种项目确认行为。',route='/reports')
reviewed('403',C,['IdentityPhotoViewer appointmentId={a.id}'],'partial','分检订单详情实际加载共享身份核验组件，显示两幅抽象证件/现场示意图及当前订单人工核验结论。','不是实际前台登记照片，尚未证明独立采血全流程均展示同一照片；无身份读取、摄像头或人脸识别。',route='/exam')
reviewed('497',CC,['imageData','readAsDataURL','portalPosters'],'demonstrated','上传512KB以内PNG/JPEG/WebP，实际预览并维护海报标题/状态/发布时间/排序；患者页只展示已发布合规图像。','仅浏览器保存合成栅格图，拒绝SVG/GIF及远程图片；无服务器媒体库、微信发布或真实海报版权审查。','frontend',route='/controls')
reviewed('499',CC,['safePortalUrl','portalLinks'],'demonstrated','新增编辑并校验不含凭据的HTTPS链接，保存发布状态；患者页提供主动点击的新窗口锚点并隔离opener。','不自动访问第三方网站，不验证第三方内容/可用性；本地配置不等于微信原生友情链接发布。','frontend',route='/controls')
reviewed('518',Q,['waitingMin','waitingMax','validRange','visibleQueues'],'partial','队列名称/科室/状态联合候检人数上下限筛选，校验非负整数及上下限顺序。','仍缺过号人数、已检人数上下限及队列类型筛选，不能把候检过滤当完整高级查询。','frontend',route='/queue')
reviewed('519',Q,['queueBottleneckMinutes','pendingCount','瓶颈队列'],'demonstrated','队列表显示科室、等待/过号/已检数量，并以候检人数乘服务分钟和可配置阈值显示瓶颈标记及计算过程。','瓶颈判定为透明本地演示公式，不是经院方验证的拥塞模型或最优调度。',route='/queue')
reviewed('546',Q,['queueResumeSlips','resumeToken','QRCodeSVG'],'partial','暂停活动票据并生成唯一QR凭条，保存原因和原科室；模拟输入码恢复至原队列末尾，已用/无效/关闭科室不重复核销。','只有凭条预览，无浏览器打印动作或纸张条码输出；实际扫码与外设打印仍未验证。',route='/queue')

# Locked extension scope: only the 22 published items and three earlier corrections.
replace_reviews('21,23,29,42,37,39,113,482,99,175,120,196,401,424-426,508,510,515,525,553,568,255,518,546')
reviewed('21',P,['bodyPartFilter','diseaseFilter','getItemClassification'],'demonstrated','医院项目规则维护部位和疾病类型；患者端按两类联合筛选，勾选项目实际入单并计价。','分类为有限合成字典，不代表医学适应证；停用/性别/必检约束仍需遵守，无医院主数据接口。','frontend',route='/patient')
reviewed('23',P,['packageAvailableAtCampus','applicablePackages'],'demonstrated','按共享院区套餐配置过滤可选项，切换院区使不适用旧选择失效，Core提交也校验院区。','院区为合成字典，本地过滤不是跨院区后台资源/账户隔离。','frontend',route='/patient')
reviewed('29,42','src/model.ts',['CANCEL_PATIENT_APPOINTMENT','cancelledAppointmentArchive','RESTORE_CANCELLED_APPOINTMENT'],'demonstrated','配置保留或删除业务视图策略；仅本人未锁定且未开始体检订单可取消，删除时归档订单和限定关联业务，保留财务/审计；可恢复为取消历史而不恢复有效预约。','删除是可恢复本地归档，不作永久清除；只清指定队列/打印/申请/预约通知及未完任务，真实退款与后端业务一致性未验证。',route='/patient')
reviewed('37,39',P,['groupDiscountPercent','relativePayment','sponsorPatientId'],'demonstrated','非单位亲属关联有效员工，使用配置的亲属套餐及折扣；切换自费或单位承担策略，按折后金额/预算/个人项目计算分摊并入单。','员工/亲属关系仅合成ID关联，没有真实授权或身份核验；付款是本地金额记录，单位预算并非真实扣款。',route='/patient')
reviewed('113','src/orderingRules.ts',['normalizeOrderItems','必检项目优先','excludedItems'],'demonstrated','多套餐自动去重及互斥整理，必检优先否则先选优先，显示移除原因并去除对应计价行；双必检互斥报错，依赖被过滤的非必检项一并移除。','确定性整理仅演示规则，不替院方作医疗取舍；H5提供开关，关闭后仍校验冲突，后台并发/临床有效性未验证。',route='/appointments')
reviewed('482','src/orderingRules.ts',['getPackageOptionalBundles','packageId','optionalItems'],'demonstrated','每个套餐维护独立自选包及必选数，切套餐不带旧选择；多套餐分别校验数量，共同项目只计价一次，H5和Core消费同一配置。','自选包是本地业务规则，无医院套餐版本/真实结算接口；不证明医学组合有效。',route='/patient')
reviewed('99','RegistrationConsents',['photoDeclined','photoDeclineSignatureId','registrationConsents'],'demonstrated','订单登记弃拍确认，显式同意后保存固定DEMO留样、类型/人/时及关联ID；取消不写入，同类型/双击防重复。','只有固定合成留样，非真实手写签字、法律签章或身份认证；不采集真实照片/签名。',route='/appointments')
reviewed('175','RegistrationConsents',['consentTypes','弃检签字','职业病签字'],'partial','分别登记弃检、知情书、检查结束、职业病及弃拍确认类型，保存各自DEMO留样，可查询且不推进临床流程。','原文要求签字板对接；目前没有签字板/驱动或真实电子签名，仅前端多类型留样，不能认定硬件或法律效力满足。','unverifiable',route='/appointments')
reviewed('120','RegistrationConsents',['PastHistoryNotice','pastMedicalHistory','medicalHistoryReads'],'demonstrated','登记页保存自定义合成既往史，分检详情读取并提示医生，确认阅读保存当前版本快照；不同版本可重新核对。','仅合成文本及演示角色，本地阅读记录不是真实医学评估或认证医嘱。',route='/exam')
reviewed('196','InvoiceReminder',['invoiceDueDate','paymentDueDate','invoiceReminders'],'demonstrated','按实际本地发票开票日加账期或指定日标记回款时间，推进演示日期仅给选定业务员弹到期提醒；关联回款扣余额，全额/作废不提醒，查看状态按日去重。','页面内合成业务员提示，不是后台定时催收、短信、税务系统或真实资金；回款仅本地登记。',route='/finance')
reviewed('401','ResearchFilters',['evaluateResearchCriteria','AND','OR','RESEARCH_EXPORT_FIELDS'],'demonstrated','编辑多个指标/比较符/阈值，以AND或OR组合筛选，展示逐项数值及判定，缺失保留未知，CSV与当前表格同源。','有限合成结构化指标与教育科研条件，不是临床诊断/异常阈值或医院全量科研库。','frontend',route='/enterprise')
reviewed('424-425',CC,['deriveStationNotifications','NOTICE-REJECT-','NOTICE-OVERDUE-'],'demonstrated','推进显式演示时钟，从真实本地REJECT快照和分类报告周期生成岗位通知；按来源去重，可筛类型/岗位/未读并保存已读状态。','站内消息仅本地集合，岗位和收件人是演示字段；无后台事件总线、真实跨用户送达或认证消息权限。',route='/controls')
reviewed('426',CC,['NOTICE-BIRTHDAY-','NOTICE-HOLIDAY-','notificationScanKey'],'partial','显式推进UTC时钟时按有记录生日和内置三个公历节日生成一次本地祝福及模拟短信日志；缺生日不补造，跳日只匹配目标日。','没有后台自动发送或SMS网关，模拟送达不是真实回执；未含完整节假日历/农历规则。','unverifiable',route='/controls')
reviewed('508',Q,['FocusedQueueProgress','queueFocusIds','完成进度'],'demonstrated','配置关注科室，按实际保留票据显示候检/过号/暂停/完成数及完成比例。','分母不含清空票据，口径是队列记录而非唯一患者或临床完成；不是自动优化模型。',route='/queue')
reviewed('510',Q,['ultrasoundNumber','queuePatientPreferences'],'demonstrated','保存客户固定超声号并校验格式和重复，姓名脱敏后仍显示超声号，重排/叫号保持不变。','固定号仅本地合成识别信息，不是实名身份凭证或院方编号接口。',route='/queue')
reviewed('515,568',Q,['GuideUsers','guideSessions','hasGuideQueueAccess'],'demonstrated','维护导检用户/医生角色、启停与可操作队列，建立/退出本地会话；统计实际在线演示医生，停用即时退出并限制叫号/入队。','本地用户和会话为模拟，不是真实登录认证或服务端权限；浏览器状态可修改，不保证分布式会话安全。',route='/queue')
reviewed('525',Q,['GuideClock','guideSchedules','guideScheduleRunKey'],'partial','保存每天开关计划，显式推进演示时钟按含起点/不含终点及跨午夜规则执行，关闭时暂停呼叫，相同时间计划不重复写入。','没有后台定时器，页面不操作不会持续调度；不能认定生产自动定时或物理屏幕控制满足。',route='/queue')
reviewed('553',Q,['pronunciation','spokenText','queuePatientPreferences'],'partial','为客户保存模拟读音字符串，后续叫号日志spokenText实际使用该配置而非姓名默认值。','未播放真实语音，没有多音字语音合成/音响测试；文字替换不证明实际读音正确。','unverifiable',route='/queue')
reviewed('255','ReviewTools',['recoveryAction','receive_and_confirm','itemConfirmations'],'demonstrated','回收业务可选仅回收或回收并逐项确认，后一种逐项必选已做/未做且无结果不得确认已做；保存确认快照，手选/模拟扫码独立选择。','确认只记录人工核对，不伪造检查结果或改审核/锁定状态；纸张回收/扫码硬件未接入。',route='/reports')
reviewed('518',Q,['passedMin','completedMin','queueType','inRange'],'demonstrated','联合队列类型/状态/名称与候检、过号、已检各人数上下限筛选，非法负数/逆序范围拦截。','源文过检按演示过号口径处理；只统计当前本地票据，无真实跨终端同步。','frontend',route='/queue')
reviewed('546',Q,['queueResumeSlips','resumedTokens','pauseBusy','window.print()'],'partial','暂停生成唯一QR凭条并可调用浏览器打印；打印或取消不核销；模拟输入码一次性恢复原科室队尾，同批双击暂停/恢复不重复记录。','浏览器打印调用不是实物条码输出或扫码器验收；实体打印取消/失败无设备回执，原文实机能力仍需另验。',route='/queue')

# Automated test references describe only the exact asserted browser-DOM or
# reducer subset. Results belong in the runner report; MC acceptance remains open.
AUTO_TESTS = [
 ('3,4,16,28','tests/devices.test.tsx','预约需确认须知，创建后可模拟支付并在电子导检中查看'),
 ('15','tests/independent-qa.test.tsx','T0015 group entry carries an explicit unit identifier'),
 ('25','tests/devices.test.tsx','从预约进入套餐比较，展示不同项目的具体检查意义'),
 ('29,30,42,43,140','tests/devices.test.tsx','改期与取消保留订单及操作记录'),
 ('90','tests/devices.test.tsx','签到默认保留订单原院区，并支持显式选择另一院区'),
 ('41,157','tests/devices.test.tsx','模拟缴费、签到、导检单打印可以闭环'),
 ('92','tests/core.test.tsx','U01 creates a booking, persists it'),
 ('181,292','tests/independent-qa.test.tsx','locked exam must not report apparent success'),
 ('191,195','tests/core.test.tsx','U07 rejects overpayment'),
 ('237-239,415-416,423','tests/independent-qa.test.tsx','T0237/38/39 and T0415/16 display global alert'),
 ('239','tests/independent-qa.test.tsx','T0239 lets staff opt out'),
 ('241,404','tests/core.test.tsx','U03 blocks nonnumeric clinical results'),
 ('284,296,301','tests/core.test.tsx','U04 generates actual associated demo conclusion'),
 ('301','tests/model.test.ts','C07 merges multiple abnormal indicators'),
 ('338,342','tests/core.test.tsx','U05 report exposes selectable synthetic history years'),
 ('342','tests/independent-qa.test.tsx','T0342 hides unselected synthetic history years'),
 ('434-435','tests/independent-qa.test.tsx','T0434/35 validates nonzero and excessive repayments'),
 ('435','tests/model.test.ts','C08 assigns mutually exclusive aging boundary buckets'),
 ('463','tests/core.test.tsx','U06 role switching changes workbench'),
 ('55','tests/operations.test.tsx','validates and persists booking capacity'),
 ('570,583','tests/operations.test.tsx','creates a patient in the shared patient collection'),
 ('571,593','tests/operations.test.tsx','captures educational questionnaire reports'),
 ('573','tests/operations.test.tsx','stores and downloads only accepted small synthetic local report files'),
 ('274,605','tests/operations.test.tsx','requires a followup outcome before completing'),
 ('598,602','tests/operations.test.tsx','filters enterprise cohorts and creates only missing open followup tasks'),
 ('627-630','tests/operations.test.tsx','advances a service order only through its permitted lifecycle'),
 ('630','tests/operations.test.tsx','requires a cancellation explanation'),
 ('631-632','tests/operations.test.tsx','assigns a claimed consultation and filters it into my orders'),
 ('663-664','tests/operations.test.tsx','rejects negative stock'),
 ('667','tests/operations.test.tsx','requires a saved simulated tracking number before shipping'),
 ('747-748','tests/operations.test.tsx','records a support response and follows triage'),
]

AUTO_TESTS += [
 ('20,24,64-66','tests/devices.test.tsx','H5 增删项目与价格开关实际影响展示及订单'),
 ('51,54-56','tests/devices.test.tsx','自助机执行容量、周末、项目和价格规则'),
 ('130-132,134','tests/advanced.test.tsx','requires preview and explicit confirmation, creates mapped appointments once'),
 ('133','tests/advanced.test.tsx','reports invalid identity, missing package/group, bad dates'),
 ('365,374-375','tests/advanced.test.tsx','aggregates the actual audit records and filters operator and business type'),
 ('67,73','tests/advanced-core.test.tsx','A07 appointment date filter'),
 ('502,543','tests/advanced-core.test.tsx','A01 queue departments have independent membership'),
 ('542','tests/advanced-core.test.tsx','A02 queue over-number requires reason'),
 ('509,529','tests/advanced-core.test.tsx','A03 queue privacy mask and move order persist'),
 ('140-142,419','tests/advanced-core.test.tsx','A04 audit captures before and after'),
 ('409,431-433','tests/advanced-core.test.tsx','A05 report overdue filtering'),
 ('347','tests/advanced-core.test.tsx','A06 batch report cabinet movement'),
 ('91','tests/reliability.test.tsx','R03 tutorial provides actual video, captions and chapter seeking without claiming a recording'),
 ('266-267,427,488-489','tests/control-center.test.tsx','validates recipients, previews resolved messages, and records per-recipient failure and retry history'),
 ('262-263','tests/control-center.test.tsx','builds abnormal notifications from shared results and validates chosen projects'),
 ('420','tests/control-center.test.tsx','filters report notifications to audited reports and rejects unknown merge fields'),
 ('402','tests/control-center.test.tsx','requires a manual double-image confirmation and records mismatch reason on the shared appointment'),
 ('408,418','tests/control-center.test.tsx','requires fixed demo signature and explicit operation confirmation then supports archive lookup and preview'),
 ('410-411','tests/control-center.test.tsx','derives rejection counts, responsible doctor and reasons from actual REJECT audit snapshots'),
 ('494-495,564,567','tests/control-center.test.tsx','validates demo hospital hotline and persists distinct portal and guide fields'),
 ('475','tests/control-center.test.tsx','validates simulated password change, clears inputs and never persists entered values in state or audit'),
]

AUTO_TESTS += [
 ('105-107,113','tests/ordering-clinical.test.tsx','O01 deduplicates package items'),
 ('84-85,110,114','tests/ordering-clinical.test.tsx','O02 rejects mutually exclusive and sex-specific items'),
 ('136-137','tests/ordering-clinical.test.tsx','O03 backend-shaped local group budgets'),
 ('122,124-126,129,139','tests/ordering-clinical.test.tsx','O04 group contract saves specific members'),
 ('94','tests/ordering-clinical.test.tsx','O05 manual profile rejects real-like identification'),
 ('229-230,232','tests/ordering-clinical.test.tsx','O06 graded summaries reorder'),
 ('231','tests/ordering-clinical.test.tsx','O07 report image upload is real file read'),
 ('234','tests/ordering-clinical.test.tsx','O08 confirmed undo returns only unreviewed unlocked results'),
 ('233','tests/ordering-clinical.test.tsx','O09 Ctrl+Enter uses the same completeness guard'),
 ('163-164','tests/ordering-clinical.test.tsx','O10 replacing a group member updates identity'),
 ('118','tests/ordering-clinical.test.tsx','O11 creating an appointment creates three linked simulated print jobs'),
 ('186,193-194','tests/ordering-clinical.test.tsx','O12 invoice split preserves transaction total'),
 ('115,136-137','tests/ordering-clinical.test.tsx','O13 front desk group booking enforces package scope'),
 ('476','tests/ordering-clinical.test.tsx','O14 saved custom package actually joins the shared catalog'),
 ('386,463-465','tests/ordering-clinical.test.tsx','O15 configured route and patient scopes affect actual frontend pages'),
 ('286,288','tests/review-tools.test.tsx','RT01 / T0286 T0288 saves date schedules'),
 ('286','tests/review-tools.test.tsx','RT02 / T0286 schedule save is idempotent'),
 ('291,309','tests/review-tools.test.tsx','RT03 / T0291 T0309 validates'),
 ('308-309','tests/review-tools.test.tsx','RT04 / T0308 T0309 critical review ordering'),
 ('303','tests/review-tools.test.tsx','RT05 / T0303 marking updates appointment'),
 ('307','tests/review-tools.test.tsx','RT06 / T0307 manually reorders suggestions'),
 ('318','tests/review-tools.test.tsx','RT07 / T0318 marks special-order recheck items'),
 ('352-353,376','tests/review-tools.test.tsx','RT08 / T0352 T0353 T0376 interpretation preserves doctor/time'),
 ('352','tests/review-tools.test.tsx','RT09 / T0352 disallows pre-approval interpretation'),
 ('373','tests/review-tools.test.tsx','RT10 / T0373 guide recovery supports cancel'),
 ('369','tests/review-tools.test.tsx','RT11 / T0369 explicit specimen types filter independently'),
 ('369','tests/review-tools.test.tsx','RT12 / T0369 supports examination module type/at records'),
 ('353,373,376','tests/review-tools.test.tsx','RT13 / T0353 T0373 T0376 date/operator queries'),
 ('298-300','tests/review-tools.test.tsx','RT14 / T0298 T0299 T0300 punctuation segments unmatched text'),
 ('304,306','tests/review-tools.test.tsx','RT15 / T0304 T0306 custom grades sort findings'),
 ('300','tests/review-tools.test.tsx','RT16 / T0300 word maintenance cancellation'),
 ('327-328','tests/review-tools.test.tsx','RT17 / T0327 T0328 safe templates reject executable fields'),
 ('327','tests/review-tools.test.tsx','RT18 / T0327 updating a stable template ID'),
 ('327','tests/review-tools.test.tsx','RT19 / T0327 template schema is bounded'),
 ('309','tests/review-tools.test.tsx','RT20 / T0309 all configured order classes resolve independently'),
 ('118','tests/execution-desk.test.tsx','consumes automatic order-created tasks then confirms local execution'),
 ('166','tests/execution-desk.test.tsx','generates batch tasks for a selected company'),
 ('158-160','tests/execution-desk.test.tsx','applies photo visibility, column ordering and chosen targets'),
 ('118,166','tests/execution-desk.test.tsx','previews a genuine QR payload and retains failed print attempt history'),
 ('258','tests/execution-desk.test.tsx','creates explicit deferred arrangements'),
 ('260','tests/execution-desk.test.tsx','uses configurable reminder windows'),
 ('261','tests/execution-desk.test.tsx','requires confirmation before waiving only unfinished projects'),
 ('261','tests/execution-desk.test.tsx','excludes customers who arrived'),
 ('245-246','tests/execution-desk.test.tsx','shares gynecology specimen records'),
 ('48,429-430,473','tests/control-center.test.tsx','persists an edited notification template'),
 ('402','tests/control-center.test.tsx','queries pending identity rechecks'),
 ('407,418','tests/control-center.test.tsx','executes an explicitly selected local waiver'),
 ('418','tests/control-center.test.tsx','rejects report collection without an audited report'),
 ('270-271','tests/control-center.test.tsx','updates abnormal level labels and colours'),
 ('523-524','tests/queue-controls.test.tsx','batch closing suspends calls'),
 ('521-522','tests/queue-controls.test.tsx','clears passed clients only after confirmation'),
 ('564,566-567','tests/queue-controls.test.tsx','consumes department and room mappings'),
 ('565','tests/queue-controls.test.tsx','creates a genuine configured queue'),
 ('528','tests/queue-controls.test.tsx','saves a doctor introduction'),
 ('549-550','tests/queue-controls.test.tsx','automatically scrolls long waiting and missed lists'),
 ('101','tests/queue-controls.test.tsx',"prefers a customer type's queue area"),
 ('52-53,76-77','tests/devices.test.tsx','单位真实日期、日限额、开关、排期与单位时段逐一实际阻止预约'),
 ('57-58','tests/devices.test.tsx','模拟时钟跨越次日放号及团转个时刻后号源确实改变'),
 ('51,55-56','tests/devices.test.tsx','分时容量实际校验'),
 ('717','tests/devices.test.tsx','黑名单根据生效和过期日期'),
 ('59,70,75','tests/devices.test.tsx','日历编辑实际持久化单位限额'),
 ('38','tests/devices.test.tsx','单位关闭亲属预约时'),
 ('60-62','tests/devices.test.tsx','必填问卷阻止H5预约'),
 ('60-62','tests/devices.test.tsx','问卷可跳过、关闭不拦截'),
 ('63','tests/devices.test.tsx','套餐非默认选中仍保留必检'),
 ('494-501','tests/devices.test.tsx','患者端消费医院、海报新闻、菜单、FAQ、团队、服务、链接'),
 ('7,27','tests/devices.test.tsx','合成注册拒绝真实号码格式'),
 ('13-14','tests/devices.test.tsx','个人推广二维码编码来源'),
 ('561-562','tests/devices.test.tsx','排队二维码进入正确订单'),
 ('561','tests/devices.test.tsx','患者排队尊重已签到及队列开关'),
 ('32-35,136-138','tests/devices.test.tsx','共享单位订单限制套餐及自选数量'),
 ('119','tests/devices.test.tsx','问卷保存明确的合成既往史用药家族史'),
 ('477,484','tests/devices.test.tsx','线上停用套餐与年龄不适用套餐'),
 ('617-623','tests/operations.test.tsx','applies enabled plan units and terms as immutable snapshots'),
 ('598-604','tests/operations.test.tsx','previews actual group membership'),
 ('641-650,655-661','tests/operations.test.tsx','derives every cohort from stable individual fields'),
 ('593-597','tests/operations.test.tsx','uses distinct nonclinical assessment structures'),
 ('270-271,273,276','tests/operations.test.tsx','edits risk colors used by displayed labels'),
 ('273','tests/operations.test.tsx','prevents a different local operator'),
 ('696','tests/operations.test.tsx','enforces nonnegative balances'),
 ('696-698','tests/operations.test.tsx','awards a completed task once'),
 ('699-700','tests/operations.test.tsx','enforces activity capacity across customers'),
 ('674','tests/operations.test.tsx','calculates region, weight, group discount'),
 ('665','tests/operations.test.tsx','reserves stock, converts a reservation'),
 ('666','tests/operations.test.tsx','uses two distinct customers to form a group'),
 ('677','tests/operations.test.tsx','generates a unique consumption code'),
 ('678,691','tests/operations.test.tsx','stores validated product image previews'),
 ('716-717','tests/operations.test.tsx','applies edited doctor permissions'),
]

AUTO_TESTS += [
 ('440,439','tests/operations.test.tsx','limits CRM monetary and monthly receipt statistics to the selected year and salesperson'),
 ('456-457','tests/operations.test.tsx','records contract-linked receipts and rejects amounts exceeding the remaining balance'),
 ('670-671','tests/operations.test.tsx','derives a monthly settlement snapshot from actual local order statuses'),
 ('386,463-465,753,755','tests/operations.test.tsx','saves explicit menu, patient and campus scopes before activating a custom role'),
]

AUTO_TESTS += [
 ('18','tests/devices.test.tsx','医院维护项目可在 H5 加选并按维护价格计费'),
 ('18','tests/devices.test.tsx','自助机读取相同项目及价格'),
 ('287','tests/review-tools.test.tsx','RT01 / T0286 T0288 saves date schedules'),
]

AUTO_TESTS += [
 ('12','tests/devices.test.tsx','满意度五个维度必答'),
 ('33','tests/devices.test.tsx','N选M严格计数'),
 ('33','tests/devices.test.tsx','单位套餐选择数量优先于全局配置'),
 ('497','tests/control-center.test.tsx','validates image types and size'),
 ('497','tests/devices.test.tsx','门户显示已发布本地栅格海报'),
 ('499','tests/devices.test.tsx','HTTPS友情链接可手动打开'),
 ('151,187-188','tests/settlement-details.test.tsx','reconciles unit and personal line allocations'),
 ('151','tests/settlement-details.test.tsx','does not invent pricing or paid amounts'),
 ('188','tests/settlement-details.test.tsx','filters the actual order population'),
 ('187-188','tests/settlement-details.test.tsx','classifies de-duplicated pricing'),
 ('176,373','tests/review-tools.test.tsx','RT23 / T0176 T0373 manual recovery'),
 ('176,373','tests/review-tools.test.tsx','RT24 / T0176 T0373 barcode mode'),
 ('518-519','tests/queue-controls.test.tsx','filters by real waiting-count bounds'),
 ('546','tests/queue-controls.test.tsx','issues a unique QR slip'),
]

AUTO_TESTS += [
 ('21','tests/booking-extension.test.tsx','T0021 医院分类配置被患者筛选'),
 ('23','tests/booking-extension.test.tsx','T0023 院区切换'),
 ('29,42','tests/booking-extension.test.tsx','T0029/T0042 删除策略'),
 ('29,42','tests/booking-extension.test.tsx','T0029/T0042 H5 明确删除策略'),
 ('37','tests/booking-extension.test.tsx','T0037 非单位亲属关联有效员工'),
 ('39','tests/booking-extension.test.tsx','T0039 单位承担策略'),
 ('113','tests/booking-extension.test.tsx','T0113 重复与互斥自动整理'),
 ('113','tests/booking-extension.test.tsx','T0113 双必检互斥不能静默删除'),
 ('482','tests/booking-extension.test.tsx','T0482 多套餐各自满足必选数'),
 ('99','tests/registration-consents.test.tsx','B01 photo refusal has explicit consent'),
 ('175','tests/registration-consents.test.tsx','B02 all requested signature categories'),
 ('120','tests/registration-consents.test.tsx','B04 custom synthetic medical history persists'),
 ('196','tests/research-reminders.test.tsx','opens a targeted popup when demo time'),
 ('196','tests/research-reminders.test.tsx','saves invoice-based due dates'),
 ('401','tests/research-reminders.test.tsx','uses three-valued AND/OR'),
 ('401','tests/research-reminders.test.tsx','exports the exact filtered rows'),
 ('424-425','tests/control-center.test.tsx','creates source-backed rejection and overdue station notifications'),
 ('426','tests/control-center.test.tsx','matches birthdays and built-in holidays'),
 ('508','tests/queue-controls.test.tsx','tracks configured focused departments'),
 ('510,553','tests/queue-controls.test.tsx','preserves fixed ultrasound numbers'),
 ('515,568','tests/queue-controls.test.tsx','enforces guide-user queue scopes'),
 ('525','tests/queue-controls.test.tsx','executes queue schedules against an explicit clock'),
 ('255','tests/review-tools.test.tsx','RT31 / T0255 receive-and-confirm'),
 ('255','tests/review-tools.test.tsx','RT30 / T0255 receive-only'),
 ('518','tests/queue-controls.test.tsx','combines queue type and actual passed/completed'),
 ('546','tests/queue-controls.test.tsx','opens browser printing for the slip'),
 ('546','tests/queue-controls.test.tsx','guards pause and resume against two synchronous clicks'),
]

AUTO_TESTS += [
 ('29,42,386,464-465,753,755','tests/registration-consents.test.tsx','B07 cancelled archived orders'),
 ('29,42,386,464-465,753,755','tests/registration-consents.test.tsx','B08 archived order snapshots'),
]

# Fixed B220 post-implementation review. This is a separately authored human
# review, not an import of owner receipts or a route-presence completion score.
COMPLETION_REVIEW = ROOT / 'docs/FRONTEND_COMPLETION_REVIEW.json'
if COMPLETION_REVIEW.exists():
    completion = json.loads(COMPLETION_REVIEW.read_text(encoding='utf-8'))
    closing_rows = [r for r in completion['items'] if r['baselineCategory'] == 'B']
    assert len(closing_rows) == 220 and len({r['id'] for r in closing_rows}) == 220
    closing_numbers = {int(r['id'][1:]) for r in closing_rows}
    replace_reviews(','.join(map(str, sorted(closing_numbers))))
    retained_tests = []
    for spec, file, test_name in AUTO_TESTS:
        ids = []
        for fragment in spec.split(','):
            if '-' in fragment:
                first, last = map(int, fragment.split('-')); ids.extend(range(first, last + 1))
            else: ids.append(int(fragment))
        keep = [n for n in ids if n not in closing_numbers]
        if keep: retained_tests.append((','.join(map(str, keep)), file, test_name))
    AUTO_TESTS[:] = retained_tests
    for r in closing_rows:
        reviewed(str(int(r['id'][1:])), r['primaryFile'], [r['primaryAnchor']],
                 r['matrixStatus'], r['currentInteraction'],
                 (('尚存前端缺口：' + r['remainingGap'] + ' ') if r['remainingGap'] else '') + r['remainingBoundary'],
                 'mock', route=r['route'])
        REVIEWS[-1]['evidence'] = '人工复核动作、共享数据与实际挂载；详见 docs/FRONTEND_COMPLETION_REVIEW.json。仅本地前端范围，不能外推为投标/生产完全满足。'
        for t in r['tests']:
            AUTO_TESTS.append((str(int(r['id'][1:])), t['file'], t.get('sourceAnchor',t['name'])))

# Relocated implementations outside the B220 scope: preserve their previous
# status while replacing removed anchors and describing the actual current flow.
replace_reviews('116,206,208,211,335,338,339,347,349,564-567,569')
reviewed('116,338','ReportArchive',['ReportArchive','recipient','method'],'partial','选择当前报告的领取方式及合成领取人，预览确认后保存发放人、时间、对象及历史。','实际身份签收、邮寄和电子认证未接入；纸质流转只登记合成事实。',route='/reports')
reviewed('206,208,211','SpecimenStation',['SpecimenStation','IdentityPhotoViewer','prints'],'partial','已到检体检号定位当前采样站，生成真实CODE128示意、模拟打印与多次补打，并登记采集及操作时间/人员；查看登记抽象核验资料。','条码软件编码及本地记录有实现，不证明打印机输出/扫描回执；身份照片仍为合成抽象图，不作真实身份认证。',route='/exam')
reviewed('335,339,347,349','ReportArchive',['ReportArchive','operation','appointmentIds'],'demonstrated','多选报告进入整批流转预览，登记模拟打印、移柜或发放，导出含选中报告的历史清单；正式柜位与库存状态联动。','真实打印、柜体、物流和身份签收未执行；预览确认与版本/容量守卫仅本地。',route='/reports')
reviewed('564-567','src/modules/queueAutomationRules.ts',['deriveQueueDefinitions','availableQueueRooms'],'demonstrated','科室/项目/区域/诊室与独立队列配置实际被队列定义及可用诊室函数消费，影响入队匹配、估时和呼叫分配。','本地共享配置，非现场终端或医院主数据接口。',route='/queue')
reviewed('569','src/modules/queueAutomationRules.ts',['deriveQueueDefinitions'],'partial','使用当前浏览器共享体检订单和导检配置，驱动模拟队列。','没有与现有医院体检系统的真实无缝接口、可靠同步和联调证据。',classification='unverifiable',route='/queue')
AUTO_TESTS = [(ids,file,{'U05 report exposes selectable synthetic history years':'U05 report compares actual same-patient stored orders and records issuance','A06 batch report cabinet movement':'A06 batch report inventory uses stable cabinet IDs and selected orders only'}.get(name,name)) for ids,file,name in AUTO_TESTS]

# Wording-only refresh after implementations moved into shared workspaces.
# This does not reclassify the frozen A/C/D audit or promote matrix statuses.
BOUNDARY_REFRESH = {}
def refresh_boundary(ids, text):
    for n in ids: BOUNDARY_REFRESH[f'T{n:04d}'] = text
refresh_boundary([90], '已有前端院区/患者/类型范围过滤和显式跨院区查询；浏览器原始存储可访问，不是服务端数据隔离或跨院区生产资源统筹。')
refresh_boundary([117], '健康工作区已按实际合成患者ID维护家庭关系；开单就地家庭录入范围与真实亲属身份/授权仍须分别核验，不能以家庭页面代替全部开单子流程。')
refresh_boundary([127], '名单/人员分组及套餐变更已有共享工作区；不等于医院完整人员主数据就地维护，换项/弃检计价仅按明确的本地规则。')
refresh_boundary([178,179,180], '导检回收已能提示未检项目并保存逐项确认快照；没有签字板、回收机、高拍仪或真实设备回执，本地记录不等于设备集成。')
refresh_boundary([202], '已有可保存的字段白名单/多条件/分组汇总报表及同源CSV；仅针对本地登记的数据集，非医院任意数据库或生产财务报表引擎。')
refresh_boundary([228,247], '维护的演示结果/小结词条可应用；不具备医院完整临床词典、正式诊断标准或临床有效性证明。')
refresh_boundary([241,242,243], '数值/描述子项目及异常/危急/纠错界限可维护并用于输入；规则为演示配置，非院方审定的医学阈值、误差范围或专家共识验证。')
refresh_boundary([248,250], '已有逐项目登记/开始/收到报告/未完成/改期/弃检状态与时间留痕；未回传来源仅本地记录，非LIS/PACS或设备实际执行确认。')
refresh_boundary([289], '可配置演示医生等级及报告难度范围并实际限制匹配；项目数/金额权重尚无院方确认，不能作为正式临床分级规则。')
refresh_boundary([313,316,317], '可配置审核撤销权限和初审节点，并按真实阶段向分检或主检退回；定向通知为本地事件记录，医院岗位账号、真实送达和服务端并发锁另验。')
refresh_boundary([326,331,332,333,351], '已有用途版式和嵌入中文字体的真实PDF生成/预览；仅合成报告及有限模板，医学内容审批、医院全量专科版式和打印设备仍需正式验收。')
refresh_boundary([330], '实际历史订单可在报告工作区选择比较；历史对比UI并不自动证明所选对比内容已写入每种PDF版式，医学报告格式与终审须另验。')
refresh_boundary([412,413,414,415], '已有多项目规则字典、全局异常处置及可选随访；专家共识完整AB字典、医学有效性和真实岗位推送未验证，不能把演示抓取当临床符合性。')
refresh_boundary([420,421,422], '共享业务事件可生成本地通知，复查/随访及前一天提醒需显式推进时钟；无真实短信、微信送达或页面关闭后的后台调度，注册登录仍是本地DEMO身份。')
refresh_boundary([472], '科室/项目配置已有分检和队列消费路径；当前条目的字段维护不代表医院所有工作站主数据、外设和接口同步完整。')
refresh_boundary([502], '队列定义可消费维护的科室/项目/区域/诊室映射并进行本地分流；尚无医院项目全集、真实等候/检查设备状态与多终端一致性验证。')
refresh_boundary([574], '本地消息会话及档案文件另有可操作工作区；本条设备/消息配置不证明物联设备接入、短信或邮件真实发送。')
refresh_boundary([662,663,664,667,668,669], '本地订单及匿名共享用量已参与库存与活动容量计算；真实交易、物流、外部评价发送和服务端并发库存一致性未验证。')
refresh_boundary([726,727,729,730,731,740,741,743], '此条当前证据主要为命名/分类/说明等配置维护；其他模块已有评估模板渲染不自动证明本条分类的全部业务语义、医院规则或自动应用。')
refresh_boundary([747,748,749,750], '客服工作区可查看与H5共享的本地会话，工单状态另行维护；不联系真实客户，不证明全部留言自动转工单或外部渠道接入。')

CLARIFICATIONS = {
 'T0029': '源文取消预约自动删除与可配置并存；默认保留历史/审计的演示策略不代表院方已确认策略。',
 'T0083': '专家共识具体版本、原始问卷及规则未提供，演示规则不得宣称经临床验证。',
 'T0084': '源文“本远互斥”待澄清。',
 'T0144': '源文为未完句，不得自行补造假身份证订单的处置规则。',
 'T0162': '源文句式不完整；刷卡与时间段历史订单联动行为待澄清。',
 'T0240': '原文“结果指控提醒”待确认是否为质控提醒。',
 'T0244': '源文尾有“是否删除”；是否保留此功能尚未明确。',
 'T0256': '源文“项目自取功能”未定义业务范围。',
 'T0289': '难易度依据项目数量还是金额，以及权重和计算方式，待院方确认。',
 'T0302': '专家共识版本未给出；本地演示词典不构成医学依据或符合性证明。',
 'T0348': '原文“可标记方法时间”字段名称待澄清。',
 'T0355': '原文为疑问“是否可以自主领取报告”，非已确定的支持承诺。',
 'T0406': '原文“专家共识报告指控标准”的名称及版本待澄清。',
 'T0409': '不同体检类型周期、时间较慢判定值待明确。',
 'T0435': '原始区间0-30/30-60/60-90/90-180/180天以上存在重叠端点；演示分桶规则须单独说明，不代表正式澄清。',
 'T0492': '“注册、登录、报告查看”与领取报告提示的关系及触发场景不明。',
 'T0534': '“外检功能”的流程和范围未展开。',
 'T0550': '过检列表条目中写“等待客户较多”，滚动条件待澄清。',
 'T0563': '源文明确微信消息通知受限制；限制类型、条件、程度待确认。',
 'T0578': '“等等相关操作”未列明其余操作，不能作为无限功能承诺。',
 'T0590': '“不用药处方”定义待确认；不自动解释为非药物处方标准。',
 'T0626': '原句语义不完整，待审列表的可执行操作待确认。',
 'T0638': '“生产条件”含义不明。',
 'T0660': '原文“动动情况”保留，需确认。',
 'T0713': '标题“团体权构”疑似错字，保留原文。',
 'T0723': '“查看、服务审核情况”具体操作待明确。',
 'T0726': '“客户职工制度的类型”分类口径未明确。',
 'T0735': '原文仅“库存设备”，未规定具体操作。',
 'T0738': '原文“文件接品”的含义及对接范围待明确。',
 'T0745': '“设备系统帮助”具体要求待明确。',
 'T0751': '服务订单平台介入仅列场景，未规定操作。',
 'T0752': '商城订单平台介入仅列场景，未规定操作。',
 'T0773': '功能标题“教育程度”与正文“教育程序”不一致。',
 'T0786': '频响两端缺少连接符。', 'T0787': '失真度未给数值。',
 'T0790': '原文lntel拼写保留；“不低于”仅限定处理器。',
 'T0845': '“200W 像素”按原文保留，不能擅改为200万。',
 'T0896': '原文80HZ 16KIZ存在疑似错字与缺失分隔符。',
 'T0897': '原文80UB及失真度空值保留。',
 'T0913': '500页扩展纸盒是否随供或仅具备扩展能力未明确。',
 'T0915': '原文ISO-I4443{TYPE-B}按原样保留，标准号待澄清。',
 'T0922': '“200W 像素”按原文保留。',
 'T0927': '“固定50～150cm”含义待澄清。',
 'T0945': '原文“2个装订机”未明确每台或项目合计；不自动换算4个。',
}


def route_for(item: dict) -> str:
    clause, num = item['clause'], int(item['id'][1:])
    prefix, idx = clause.rsplit('.', 1); n = int(idx)
    if prefix == '2.3.1': return '/kiosk'
    if prefix == '2.3.2': return '/kiosk?mode=report'
    if prefix == '2.2.1':
        if n in (1,2,3,4,6,7): return '/patient'
        if n == 11: return '/settings'
        return '/appointments'
    if prefix == '2.2.2':
        if n == 1: return '/exam'
        if n == 2: return '/support'
        if n in (3,4,9,10,11): return '/exam'
        if n in (5,6,7,8,19,38): return '/finance'
        if n in (12,13): return '/health'
        if n in (14,15,37): return '/review'
        if n in (16,17): return '/reports'
        if n in (18,20,21,22): return '/dashboard'
        if 23 <= n <= 31: return '/quality'
        if 32 <= n <= 36: return '/support'
        if n == 39: return '/enterprise'
        if 40 <= n <= 44: return '/settings'
        if n in (45,46): return '/patient'
        if n == 47: return '/content'
    if prefix == '2.2.3': return '/patient' if n == 5 else '/queue'
    if prefix == '2.2.4':
        if n == 2: return '/enterprise'
        if 1 <= n <= 26: return '/health'
        if 27 <= n <= 37 or 68 <= n <= 70: return '/services'
        if 38 <= n <= 51: return '/enterprise'
        if 52 <= n <= 67 or n in (88,89,112): return '/commerce'
        if 121 <= n <= 126 or n == 140: return '/support'
        if 71 <= n <= 76: return '/content'
        if 77 <= n <= 82 or n in (83,84,85,86): return '/content'
        if 87 <= n <= 91: return '/commerce'
        if n in (92,93,116): return '/settings'
        return '/settings'
    raise ValueError(f'Unmapped clause {clause}')


def parse_source(path: Path) -> list[dict]:
    rows, current, page, module = [], None, '', ''
    for lineno, line in enumerate(path.read_text(encoding='utf-8').splitlines(), 1):
        m = re.match(r'^#### (2\.[23]\.\d+\.\d+) (.+)$', line)
        if m: current = (m.group(1), m.group(2))
        m = re.match(r'^原文模块：(.*?)。来源：PDF 第 (.*?) 页。', line)
        if m: module, page = m.groups()
        if re.match(r'^\| T\d{4} \|', line):
            values = [v.strip() for v in line.strip('|').split('|')]
            if len(values) != 4 or current is None: raise ValueError(f'Bad source row at {lineno}')
            tid, original, subitem, _ = values
            rows.append(dict(id=tid, clause=current[0], title=current[1], text=original,
                             subitem=subitem, star='★' in subitem, sourcePage=page,
                             sourceModule=module, sourceLine=lineno))
    return rows


def baseline(item: dict) -> dict:
    item = {k: item[k] for k in SOURCE_KEYS}
    hardware = item['clause'].startswith('2.3.')
    item.update(route=route_for(item), interaction='本项尚无逐项核验的专用交互证据；到对应业务页核对具体功能。',
                status='hardware-unverifiable' if hardware else 'partial',
                classification='unverifiable' if hardware else 'mock',
                evidence='无实物/厂商证明/检测报告。' if hardware else '未登记可逐项证明此要求的实现证据；不能因存在页面而认定覆盖。',
                boundary='前端页面、参数展示或模拟设备事件无法证明该硬件性能或采购交付；须逐项实物验收。' if hardware else '本项尚未实现或未经逐项核验；不计为已满足。数据仅为前端演示，不是医院生产数据。',
                test=f"MC-{item['id']}（本矩阵本行手工验收步骤，待执行）；scripts/coverage.py --check仅校验映射完整性",
                testStatus='not-executed',
                testProcedure=(f"按源文“{item['text']}”核对厂商型号、合格证明、实物配置及适用测试记录，记录设备序列号和判定。" if hardware else f"打开{route_for(item)}，用独立演示数据逐项执行“{item['text']}”；验证输入、结果及失败分支，保留证据。若不存在对应交互，记录未实现，不以路由可打开通过。"))
    if hardware: item['interaction'] = '核对物料/设备参数清单与自助终端模拟界面；真实性能须真机测量。'
    return item


def apply_reviews(rows: list[dict]) -> None:
    by_id = {r['id']: r for r in rows}
    reviewed = set()
    for review in REVIEWS:
        spec = review['items']
        ids = []
        for fragment in spec.split(','):
            fragment = fragment.strip()
            if '-' in fragment:
                a,b = map(int, fragment.split('-')); ids.extend(f'T{x:04d}' for x in range(a,b+1))
            else: ids.append(f'T{int(fragment):04d}')
        evidence = review.get('evidence', '')
        file = review.get('file')
        if file:
            path = ROOT / file
            if not path.exists(): raise ValueError(f'Review evidence missing: {file}')
            content = path.read_text(encoding='utf-8')
            for anchor in review.get('anchors', []):
                if re.sub(r'\s+', '', anchor).replace(chr(39), chr(34)) not in re.sub(r'\s+', '', content).replace(chr(39), chr(34)): raise ValueError(f'Review anchor missing: {file}: {anchor}')
            evidence = file + (' :: ' + ', '.join(review.get('anchors', [])) if review.get('anchors') else '') + '；' + evidence
        for tid in ids:
            if tid in reviewed: raise ValueError(f'Duplicate manual review: {tid}')
            reviewed.add(tid)
            row = by_id[tid]
            row.update({k:v for k,v in review.items() if k not in ('items','file','anchors')})
            row['evidence'] = evidence
            row['test'] = f"MC-{tid}（本矩阵本行手工验收步骤，待执行）；scripts/coverage.py --check仅校验映射完整性"
            row['testProcedure'] = f"打开{row['route']}，用独立演示数据逐项执行“{row['text']}”；按本行已审交互核对输入、结果及失败分支并留证。缺少的子能力和本行边界必须分别记录，不能以路由可打开或模拟成功认定原要求满足。"
    for row in rows:
        if row['id'] in BOUNDARY_REFRESH: row['boundary'] = BOUNDARY_REFRESH[row['id']]
        if row['id'] in CLARIFICATIONS: row['boundary'] += ' 待澄清：' + CLARIFICATIONS[row['id']]


def apply_test_refs(rows: list[dict]) -> None:
    refs = {r['id']: [] for r in rows}
    for spec, file, test_name in AUTO_TESTS:
        contents = (ROOT / file).read_text(encoding='utf-8')
        if test_name not in contents: raise ValueError(f'Automated test reference missing: {file}: {test_name}')
        ids=[]
        for fragment in spec.split(','):
            if '-' in fragment:
                a,b=map(int,fragment.split('-'));ids.extend(range(a,b+1))
            else: ids.append(int(fragment))
        for n in ids: refs[f'T{n:04d}'].append(f'{file} :: {test_name}')
    for row in rows:
        row['automatedTest'] = '；'.join(refs[row['id']]) or '无本项专用自动测试'
        if refs[row['id']]:
            row['test'] += '；自动化子集参考：' + row['automatedTest'] + '（jsdom/逻辑断言，运行结果见测试报告；不代表整项验收）'
        # The source-based manual scenario must start on the actual audited route.
        if not row['clause'].startswith('2.3.'):
            row['testProcedure'] = f"打开{row['route']}，用独立合成数据执行“{row['text']}”；具体核对{row['interaction']} 并检查边界：{row['boundary']} 本行MC验收仍待执行，自动化只覆盖已列子集。"


def validate(rows: list[dict], source: list[dict] | None = None) -> list[str]:
    errors = []
    # The separate fixed-B review is additive. The frozen full audit must remain intact.
    if COMPLETION_REVIEW.exists():
        review = json.loads(COMPLETION_REVIEW.read_text(encoding='utf-8'))
        audit_path = ROOT / 'docs/FRONTEND_COMPLETION_AUDIT.json'
        audit_bytes = audit_path.read_bytes()
        if hashlib.sha256(audit_bytes).hexdigest() != '67f1ad5def5547e70dfbbc5666fa6d780dd3c613f673b4d2deb4637e0d02fbfc': errors.append('Frozen 778-item baseline audit changed')
        originals = json.loads(audit_bytes)['items']
        reviewed_items = review.get('items', [])
        if [r['id'] for r in reviewed_items] != [f'T{i:04d}' for i in range(1,779)]: errors.append('Completion review must preserve all 778 unique software IDs')
        if len([r for r in reviewed_items if r.get('baselineCategory') == 'B']) != 220: errors.append('Completion review must contain the fixed 220 B items exactly once')
        for original, item in zip(originals, reviewed_items):
            if any(original[k] != item[k] for k in ('id','clause','title','text','sourcePage','sourceLine')): errors.append('Completion review altered source fields: ' + original['id'])
            if original['category'] != item.get('baselineCategory'): errors.append('Completion review changed a baseline category: ' + original['id'])
            if original['category'] != 'B' and item.get('reviewStatus') != 'baseline-retained': errors.append('Completion review reclassified non-B item: ' + original['id'])
    # Existence guards only; neither these bytes nor jsdom prove browser playback.
    for relative in ('public/media/workflow-guide.mp4','public/media/workflow-captions.vtt','public/media/workflow-poster.png'):
        asset=ROOT/relative
        if not asset.is_file() or not asset.stat().st_size: errors.append(f'T0091 missing media evidence: {relative}')
    app=(ROOT/'src/App.tsx').read_text(encoding='utf-8')
    if not re.search(r'case\s+[\"\']/controls[\"\']\s*:',app): errors.append('Control center evidence has no /controls route entry')
    if [r['id'] for r in rows] != [f'T{i:04d}' for i in range(1,946)]: errors.append('T0001–T0945须连续且无重复')
    if len({r['clause'] for r in rows}) != 225: errors.append('条款总数应为225')
    for prefix, (clauses, count) in EXPECTED.items():
        selected = [r for r in rows if r['clause'].startswith(prefix + '.')]
        if len(selected) != count or len({r['clause'] for r in selected}) != clauses: errors.append(f'{prefix}数量不符')
    if sum(r['star'] for r in rows) != 14: errors.append('星标拆分应为14项')
    if len({(r['clause'],r['subitem']) for r in rows if r['star']}) != 10: errors.append('星标原处应为10处')
    for r in rows:
        for key in ('id','clause','title','text','route','interaction','status','boundary','test','evidence','testProcedure','sourcePage'):
            if not r.get(key): errors.append(f"{r.get('id')}: {key} missing")
        if r.get('status') not in STATUS_LABELS: errors.append(f"{r['id']}: invalid status")
        if r.get('classification') not in ('frontend','mock','unverifiable'): errors.append(f"{r['id']}: invalid classification")
        if r['clause'].startswith('2.3.') and r['status'] != 'hardware-unverifiable': errors.append(f"{r['id']}: hardware must remain unverifiable")
        if r['testStatus'] != 'not-executed': errors.append(f"{r['id']}: unsubstantiated test result")
    if source:
        for a,b in zip(rows, source):
            if any(a[k] != b[k] for k in SOURCE_KEYS): errors.append(f"{a['id']}: source fields changed")
    return errors


def render_csv(rows: list[dict]) -> str:
    keys = ['id','clause','title','subitem','star','sourcePage','sourceLine','sourceModule','text','route','interaction','status','classification','evidence','boundary','test','testStatus','automatedTest','testProcedure']
    out=io.StringIO(); writer=csv.DictWriter(out, fieldnames=keys, lineterminator='\n'); writer.writeheader(); writer.writerows({k:r[k] for k in keys} for r in rows)
    return '\ufeff'+out.getvalue()


def md_escape(text: object) -> str:
    return str(text).replace('|', '\\|').replace('\n','<br>')


def clause_entry_summary(rows: list[dict]) -> dict[str,list[dict]]:
    groups: dict[str,list[dict]] = {}
    for r in rows:
        if r['clause'].startswith('2.2.'): groups.setdefault(r['clause'],[]).append(r)
    result={'interaction-entry':[],'config-only-entry':[],'no-dedicated-entry':[]}
    for clause,items in groups.items():
        positive=[r for r in items if '未发现实现' not in r['evidence']]
        kind='no-dedicated-entry' if not positive else 'config-only-entry' if all(r['status']=='config-only' for r in positive) else 'interaction-entry'
        result[kind].append({'clause':clause,'title':items[0]['title'],'sourcePage':items[0]['sourcePage']})
    return result


def render_md(rows: list[dict]) -> str:
    counts=Counter(r['status'] for r in rows); classes=Counter(r['classification'] for r in rows); entries=clause_entry_summary(rows)
    lines=['# 逐项需求覆盖矩阵', '', '> 这是前端演示的可追溯性记录，不是“945项已实现”、投标符合性证明或医院上线验收报告。原文来自用户提供的技术需求清单；页码为其注明的原招标PDF物理页序。本仓库未重新验证原PDF。', '',
        '## 核心统计', '', f'- 来源Markdown SHA-256：{SOURCE_SHA256}。', '- 225个原始条款；945个T项：软件778项、硬件167项。', '- ★为10处原始星标、14个拆分T项，不能按14处计算。', '- 记录完整率是945/945；功能满足率未认定。演示截图、路由和本地数据不能代替生产符合性。', f"- partial 中有 {sum('未发现实现' in r['evidence'] for r in rows)} 项明确未发现专用实现；不把这些项计为已实现。", '- MC-T####为本文件本行的待执行手工验收设计，不是已通过的自动测试。结构审计也不验证业务效果。', '- 自动化引用映射到具体测试源码及断言子集；其运行状态看测试报告。jsdom不是实际浏览器/视觉/硬件验证，亦不是整项验收。', '',
        '| 状态 | 项数 | 含义 |','|---|---:|---|']
    for status,label in STATUS_LABELS.items(): lines.append(f'| {status} | {counts[status]} | {label} |')
    lines += ['', '| 实现类别 | 项数 |','|---|---:|']
    for cls in ('frontend','mock','unverifiable'): lines.append(f'| {cls} | {classes[cls]} |')
    lines += ['', '## 分模块状态与原条款入口', '', '| 模块 | 原条款 | T项 | demonstrated | partial | config-only | hardware-unverifiable | 交互入口条款 | 仅配置条款 | 无专用入口条款 |', '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for prefix,(clauses,_) in EXPECTED.items():
        subset=[r for r in rows if r['clause'].startswith(prefix+'.')]
        status=Counter(r['status'] for r in subset); module_entries=clause_entry_summary(subset)
        entry_counts=[str(len(module_entries[k])) for k in ('interaction-entry','config-only-entry','no-dedicated-entry')] if prefix.startswith('2.2.') else ['不适用']*3
        lines.append('| '+' | '.join([prefix,str(clauses),str(len(subset))]+[str(status[k]) for k in STATUS_LABELS]+entry_counts)+' |')
    lines += ['', '## 204个软件原条款的入口清点', '',
        f"- 有可定位的交互入口：{len(entries['interaction-entry'])}条。至少一个子项存在专用交互；本条其他子项可能仍缺失。",
        f"- 仅配置/展示入口：{len(entries['config-only-entry'])}条。可维护/查看配置，但未证明业务规则执行。",
        f"- 未发现专用实现入口：{len(entries['no-dedicated-entry'])}条。只有相关业务页定位，不作为本条入口覆盖。",
        f"- 合并口径：有某种专用入口 {len(entries['interaction-entry'])+len(entries['config-only-entry'])}/204条；无专用入口 {len(entries['no-dedicated-entry'])}/204条。这是入口清点，绝非原条款全部满足率。",
        '- 判定按本矩阵人工审查证据：全部子项均是明确负向证据则无专用入口；剩余条款的正向证据若全部仅配置则归为配置；否则为交互入口。纯路由可访问不会算入。', '',
        '| 尚无专用入口的原条款 | 功能 | PDF页 |', '|---|---|---|']
    for c in entries['no-dedicated-entry']:
        lines.append(f"| {c['clause']} | {c['title']} | {c['sourcePage']} |")
    if not entries['no-dedicated-entry']:
        lines.append('| 无 | 每条至少有一个交互或配置子项；不表示整条满足 | — |')
    lines += ['', '## 判定方法', '',
        '- demonstrated：已逐项查看代码，存在对应的前端交互和结果变化；不等同于手工测试已通过，也不等同于端到端生产能力。',
        '- partial：只实现本条的一部分，或者没有逐项实现证据；必须阅读“缺口与边界”，不能统计为满足。',
        '- config-only：仅配置、输入、说明、静态数据或展示；不会据此宣称后台规则真实生效。',
        '- hardware-unverifiable：167个硬件T项一律保留，须设备与厂商材料另验。',
        '- frontend：仅浏览器内可执行的真实交互；mock：数据或业务处理为本地模拟；unverifiable：真实外部系统、设备或性能证据缺失。',
        '- 检查脚本对条款数量、连续性、★数量、原文保真及映射文件一致性进行断言。没有以关键词出现自动判定功能满足。', '',
        '## ★条款快速核对', '', '| ID | 条款 | PDF页 | 状态 | 入口 | 当前交互 | 缺口 |','|---|---|---|---|---|---|---|']
    for r in rows:
        if r['star']: lines.append('| '+' | '.join(md_escape(r[k]) for k in ('id','clause','sourcePage','status','route','interaction','boundary'))+' |')
    lines += ['', '## 逐项矩阵', '', '所有T项保留原文。每行测试ID对应其“验收步骤”，全部为待执行；已运行自动用例应另以测试报告提供，不作逐项通过推断。', '']
    for prefix in EXPECTED:
        selected=[r for r in rows if r['clause'].startswith(prefix+'.')]
        lines += [f'### {prefix}', '', '| ID / 用例 | 原条款 / 子项 / PDF页 | 功能与原文 | 入口及交互 | 状态 / 分类 | 实现证据 | 缺口与边界 | 验收步骤（待执行） |', '|---|---|---|---|---|---|---|---|']
        for r in selected:
            values=[f"{r['id']} / MC-{r['id']}；自动：{r['automatedTest']}", f"{r['clause']} {r['subitem']} / p.{r['sourcePage']}",f"{r['title']}：{r['text']}",f"{r['route']}；{r['interaction']}",f"{r['status']} / {r['classification']}", r['evidence'],r['boundary'],r['testProcedure']]
            lines.append('| '+' | '.join(map(md_escape,values))+' |')
        lines.append('')
    lines += ['## 复现', '', '运行 python3 scripts/coverage.py --check 进行只读审计。', '运行 python3 scripts/coverage.py --source /path/to/数字化健康体检一体化管理软件_技术需求清单.md 可从来源重新提取并生成。', '不带 --source 时复用已登记的逐项原文元数据，按脚本中的人工审查记录重新生成；原PDF不复制到仓库。', '']
    return '\n'.join(lines)


def render_boundaries(rows: list[dict]) -> str:
    counts=Counter(r['status'] for r in rows); entries=clause_entry_summary(rows)
    return f'''# 演示与生产边界

## 交付性质

本项目交付可运行的前端演示与需求追溯材料。逐项矩阵收录225个原条款、945个核对项，是完整登记，不是完整实现。当前登记：demonstrated {counts['demonstrated']}项、partial {counts['partial']}项、config-only {counts['config-only']}项、hardware-unverifiable {counts['hardware-unverifiable']}项。请结合每项证据和缺口阅读，不能把这些状态直接写入“完全满足”的投标响应。

204个原软件条款按专用入口统计：{len(entries['interaction-entry'])}条至少有一项交互、{len(entries['config-only-entry'])}条仅配置/展示、{len(entries['no-dedicated-entry'])}条未发现专用实现入口。有入口只表示至少部分子项可定位，不代表整条满足。

审计来源为用户提供的《{SOURCE_NAME}》，没有从二手网站补写或修改原始要求；标注页码沿用来源注明的招标PDF物理页号。本次没有重新核验原PDF。来源Markdown SHA-256：{SOURCE_SHA256}。条文中的疑问式、未完句、笔误及数值单位保留。完整投标证明、采购实物验收、服务承诺与上线准入不包含在前端演示通过之内。

## 前端复核与仍需验证的边界

partial与config-only不能都归因为后端或硬件依赖。固定扩展清单中的分类加项、院区套餐、取消归档策略、亲属付款、多套餐互斥、自选包、既往史提示、财务提醒和组合科研筛选现已补充对应本地交互。回收逐项确认、完整人数筛选和浏览器凭条打印亦已补充。仍有明确边界：声音录制现有开始/暂停/保存合成静音WAV流程（T0215），未接真实麦克风；抽象双照已供独立采样及分检流程查看（T0403），真实身份照片仍未验证；真实/完整AI报告解读未实现（T0354）。通知/队列时钟仅显式推进，真实送达、后台调度及语音/签字板不因有前端配置而通过。完整778软件原子审计固定于9014基线（A469/B220/C81/D8），后续仅针对固定B220核验实现消费和测试，详见FRONTEND_COMPLETION_REVIEW.json/md。固定220项的本地操作与数据消费已完成定向复核，6组涉及18项的联动断点经修复回归关闭；A/C/D基线未升级。复核表单列跨模块正确性回归及发布门槛，不能由receipt、220项核销或测试数推断全仓无缺陷、生产验收通过。

明确负向证据的子项清点与partial总数不同：同一项可能同时涉及前端、临床、接口和待澄清要求，未将其强行自动分成互斥缺口总量。未完句/疑问句和真实设备依赖仍按原文保留，详见逐项矩阵。

## 数据、隐私与权限

- 只用虚构演示数据。本地状态和浏览器存储能被当前用户查看、编辑或清除，不是安全数据库，也不是可靠的医院档案保存机制。不要录入真实患者、身份证、照片、病历、联系方式或支付凭据。
- UI角色切换、菜单隐藏、折扣输入校验和本地日志不是服务端鉴权。已有前端菜单守卫及患者/院区/体检类型范围过滤；records和审计已按患者/订单关联过滤，取消归档及关联发票回款也遵守患者/院区/类型范围，库存及预约容量使用匿名全局汇总；规则基于已知本地字段，原始浏览器存储和患者/自助入口仍非安全隔离边界。生产还需身份认证、服务端数据范围控制、接口授权和审计。
- 本地日志可演示谁、何时、什么动作；不等于不可篡改、永久保存、签章或完整跨系统追溯。刷新保持仅对具体使用持久化的模块成立，未逐项测试的状态不宣称可靠持久化。
- 浏览器临时文件、导出和打印应使用演示数据。生产需落实访问控制、脱敏、保密及测试数据制度；源文没有确定等保级别、RPO、RTO或统一性能阈值，本项目不擅自补写。
- 健康档案可读取并保存本地PDF/TXT/CSV演示文件（每份512KB以内、最多4份）；这属于浏览器内文件处理，不是安全服务器上传、患者文件存储或医学解析。

## 服务与专项质控中心

- /controls 提供独立通知、替检人工核验、签名留样、驳回统计、门户/导检配置与密码演练入口。入口统计只要求本条至少一个子项可定位，不掩盖该条其他子项仍缺失；请逐项阅读矩阵。
- 通知从共享演示订单和有限异常规则生成，支持逐对象预览、批量本地记录、模拟失败/重试与操作历史。没有短信、电话或站内消息对外发送，显式推进演示时钟可生成驳回/超期及生日/节日事件，并可显式扫描检前一天、复查、随访日期；无服务器后台自动运行。内置通知类型的正文可保存为本地模板库并重复套用；仍不代表医院全量模板或真实自动发送。
- 替检核验仅使用两幅固定抽象SVG示意图及人工一致/不一致记录，没有实际身份证照片、摄像头、活体或人脸识别。签名只允许固定演示文字或随意笔画，本地可查询预览，并可另行显式确认执行受角色/状态限制的演示弃检、领取或回收；不提供法律效力、防篡改或永久保存。请勿输入真实生物信息或签名。
- 专项统计按原分检结果元数据/主检节点归属处理人及可核对样本，未知人员/时间不补造；退回动作类型的消费范围以逐项复核表为准。样本占比仅为有限本地数据的复算比例，不能当作临床错误发生概率。
- 门户内容、海报摘要、菜单、科室/区域/诊室使用分域配置；患者H5已读取启用内容，科室/区域/诊室与业务队列也已联动；已支持本地栅格海报和主动点击HTTPS链接，真实微信发布/医院导航/导检用户已联动本地队列权限，真实认证及无缝接口仍按T项列缺口。
- 密码表单仅校验DEMO测试字符串，成功后清空输入，不保存输入值，只保留演练完成标志/时间/强度；不修改真实密码或认证权限，不验证安全存储或生产密码策略。
- 演示指南包含实际36秒H.264、1280×720视频、中文字幕和六章节定位。已检查媒体元数据及抽帧，自动测试只验证DOM媒体引用/章节时间/关闭。短片为流程示意，不是实际界面操作录屏、复杂操作完整教学或浏览器播放/视觉验收证据。

## 医疗判断

异常阈值、A/B类、关联指标建议、1+X推荐、AI主检/质控/报告解读及健康干预处方均为演示性逻辑或示例。源文未给出完整专家共识版本、字典、临床模型、部署方式、准确性阈值或人工复核验收细则。本演示不作诊断、处方执行或医学有效性验证，不能用于实际临床决策。生产内容必须由有资质的院方团队制定并验证，涉及药物处方的条目不能因有文本输入框而视为具备处方资质或电子处方能力。

## 外部接口与异步流程

- HIS/LIS/PACS/第三方检验报告、发医嘱、导航、呼叫中心、检查设备、短信/邮件、微信身份绑定及推送尚无真实医院接口与验收环境证据。按钮、模拟连接状态、测试提示或前端记录均不证明送达或联调成功。
- 微信小程序和公众号能力不能用响应式Web页面替代。团检入口二维码需真码、正确的单位订单目标及有效账号；二维码图片或入口仅能证明演示范围内的跳转。
- 支付、退费、银联、会员卡、电子发票、回款与充值只演示状态/金额。已有本地逐笔项目收退流水及双击防重，但没有真实支付结算、税务开票、验签回调、分布式幂等、正式财务凭证或生产交易一致性证明。
- 定时放号、预约前一天提醒、改期到期自动弃检、报告超期、队列定时开关等不能仅凭配置输入认定执行；生产需要可观察的调度任务、失败处理、时区/节假日规则和送达证据。
- 人员替检、锁单、多级审核锁定、并发叫号、跨院区和多终端同步需要真实并发与状态一致性验证。当前同浏览器演示不是分布式业务事务保障。

## 硬件与打印

全部167个硬件T项标为hardware-unverifiable，不以页面展示或模拟故障恢复转为通过。采购数量仍是体检自助一体机3台、报告自助打印装订机2台；屏幕43寸/19英寸及各自分辨率分别保留，不自动互相补齐参数。

- 身份证读写、磁条卡、扫码、活体双目摄像头、签字板、高拍仪、条码/A4打印、自动切刀、导检单回收和装订均需厂商驱动/SDK、设备权限及真机验证。
- 浏览器打印对话框或生成打印任务不证明条码码制、打印速度、分辨率、进纸、缺纸、装订厚度及硬件状态回传。
- 机柜钢板、工控CPU/内存/端口、电源、功率、漏电保护、EMC、接地电阻、绝缘电阻、寿命和备件需型号、合格证、检测报告及实物验收。
- 不低于仅按原文修饰处理器，不扩张到全部数值；两设备参数不互相套用。报告机“2个装订机”是每台还是合计待澄清；不换算成4个。500页扩展纸盒是否随供待澄清。

## 必须保留的澄清

1. 取消预约删除订单与删除策略可配置并存；演示策略不能覆盖正式答复（2.2.1.3，p.13）。
2. 假身份证号备单的条款为未完句（T0144）；“项目自取”（T0256）、外检（T0534）未定义，不补造业务规则。
3. 重大异常自动规则T0244尾含“是否删除”；报告自取T0355是疑问句，不能擅自转成确定义务。
4. ★账龄原区间0-30/30-60/60-90/90-180/180天以上端点重叠（T0435，p.28）。演示若采用互斥端点，应注明只是演示口径，生产口径由院方确认。
5. 专家共识、AI及报告质控标准版本、报告难易度使用项目数量还是金额仍未给定。
6. 原文硬件“200W像素”“80HZ 16KIZ”“80UB”“ISO-I4443”等保留，不自行校正为采购技术参数。
7. 其余逐项疑义见矩阵“缺口与边界”；源清单的正式澄清问题不作为新增义务。

## 非T项交付事项单列

这些事项没有混入225条/945项，也不因前端构建或测试通过而完成：

- D0001：适用的信息网络开发服务须交源代码及技术文档（p.12）；交付源码不等于已厘清既有软件及第三方权属。
- D0003：接到采购人项目开工通知起60日历日内完成开发、部署、调试并具备上线运行条件（p.39、53），不是合同签署日起算，不是明确60日内最终验收。
- D0005–D0007：采购人全面检验与正式验收报告（p.40）。
- D0008–D0013：验收合格起至少3年免费维护/升级/技术支持；7×24小时、2小时响应、远程无法解决时4小时到场、每季度至少一次上门（p.40）。响应/到场不是修复时限。
- D0014–D0017：患者与医院数据保密、全部模块部署、与现有系统信息集成和联调（p.40）。
- B0039：不少于4名驻场人员是评分方案资源要求（p.50），驻场时段及是否覆盖3年未明确。
- 证书、类似项目业绩、信创证明、著作权、技术偏离表、实施/售后/人员方案为独立证据。原文件未设系统演示评分；不得将本演示写成招标强制证明。
- 合同范本的空白期限、地址、验收阈值不自行填写为确定需求；所有权、使用权和源码范围须正式确认。

## 验证与复现口径

python3 scripts/coverage.py --check 是可重复的结构审计：945个连续ID、225条、分模块数量、14个星标T项/10处星标、来源保真、证据/测试锚点存在和JSON/CSV/Markdown/边界文档一致。源清单可访问时对SHA-256及逐项原文复核；清单未随仓库分发时回退到已登记来源快照，不能重新证明原PDF。它不执行浏览器交互、网络集成、临床验证或硬件测试。

实际浏览器证据须与具体源码提交对应：第一版基线CI及截图详见docs/TEST_REPORT.md；旧提交的成功不能外推本轮新增功能。实际手机扫码、实体外设与微信原生能力仍需单独验证。

矩阵每行MC-T####是逐项手工验收设计，testStatus统一not-executed。部分条目同时引用tests中的具体自动测试源码和断言子集，其运行结果以实际测试报告为准；不会由代码存在推定测试通过。实际浏览器冒烟或关键流程测试只证明测试确实断言的行为，不能自动外推为945项通过。生产需按条目执行验收、记录预期/实际、数据前提、失败场景、截图/日志和责任人。
'''


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source',type=Path)
    parser.add_argument('--check',action='store_true')
    args=parser.parse_args()
    source_path=args.source or (DEFAULT_SOURCE if DEFAULT_SOURCE.exists() else None)
    if source_path:
        source=parse_source(source_path)
        if hashlib.sha256(source_path.read_bytes()).hexdigest() != SOURCE_SHA256:
            parser.error('Source fingerprint changed; inspect the new source and explicitly update the audited version before regenerating')
    elif DATA.exists():
        source=[{k:r[k] for k in SOURCE_KEYS} for r in json.loads(DATA.read_text(encoding='utf-8'))]
    else: parser.error('Need --source for first generation')
    rows=[baseline(r) for r in source]; apply_reviews(rows); apply_test_refs(rows)
    errors=validate(rows,source)
    outputs={DATA:json.dumps(rows,ensure_ascii=False,indent=2)+'\n', ROOT/'docs/coverage-matrix.csv':render_csv(rows), ROOT/'docs/coverage-matrix.md':render_md(rows), ROOT/'docs/BOUNDARIES.md':render_boundaries(rows)}
    if args.check:
        for path,expected in outputs.items():
            if not path.exists() or path.open(encoding='utf-8', newline='').read() != expected:
                errors.append(f'Stale/missing output: {path.relative_to(ROOT)}')
    elif not errors:
        for path,content in outputs.items():
            path.parent.mkdir(parents=True,exist_ok=True)
            with path.open('w',encoding='utf-8',newline='') as f: f.write(content)
    if errors:
        for error in errors: print('FAIL:',error,file=sys.stderr)
        return 1
    print(json.dumps({'result':'PASS' if args.check else 'GENERATED','clauses':225,'items':len(rows),'software':778,'hardware':167,'starItems':14,'starClauses':10,'status':dict(Counter(r['status'] for r in rows)),'classification':dict(Counter(r['classification'] for r in rows)),'softwareClauseEntries':{k:len(v) for k,v in clause_entry_summary(rows).items()},'automatedSubsetItems':sum(r['automatedTest']!='无本项专用自动测试' for r in rows),'businessAcceptance':'not-claimed'},ensure_ascii=False))
    return 0

if __name__=='__main__': raise SystemExit(main())
