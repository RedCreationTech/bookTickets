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
reviewed('1-2,17,82-83',P,['questionDone','使用方案继续预约'],'partial','勾选生活方式/关注项，生成示例推荐并带入预约。','仅有限关键词规则，没有给定专家共识版本、验证医学规则、互斥/绑定引擎；不是经临床验证的1+X推荐。')
reviewed('3,16,26,28,31,40',P,['createOrder','CREATE_APPOINTMENT'],'demonstrated','选择体检人、套餐、院区、日期与时段，确认后在共享预约列表出现新订单。',LOCAL+'这是H5演示，未构建微信原生小程序或账号认证。')
reviewed('4,36,49',P,['selfPay','模拟支付'],'partial','显示团检单位承担/超额自费，选择模拟支付并推进本地订单状态。','无真实支付接口、费用拆单交易、支付回调、退款或财务对账；选择渠道不代表实际扣款。')
reviewed('5',P,["view === 'article'"],'partial','打开健康课堂示例文章并记录收藏。','只内置科普示例，未与内容运营发布列表自动联动，H5不是已发布小程序。')
reviewed('6',P,["view === 'services'"],'demonstrated','打开健康服务列表，选择项目和日期并生成本地服务申请。',LOCAL+'服务申请未与专业服务订单工作区自动关联。')
reviewed('8-10',P,["view === 'guide'",'upcoming.results'],'partial','电子导检按共享检查结果更新完成状态，显示下一未检项目和预计等候。','项目状态可变；楼层和等候时长为固定示例，不是实时科室队列/路径算法。')
reviewed('11',P,['提交留言','H5 留言'],'partial','提交留言生成本地任务。','留言气泡为组件内临时状态；没有医患双向会话和回复展示，未接入短信/微信。')
reviewed('12',P,['提交评价','满意度评价'],'partial','选择1至5星并写入演示日志。','只有评分交互，缺完整满意度调查问卷及问卷维护/分析。')
reviewed('15',P,['QRCodeSVG','group=xingchen-2026','entranceGroup'],'demonstrated','团检入口生成真实SVG二维码，URL携固定单位标识；打开同一入口进入相应团检预约。','二维码为真实本地SVG编码，目标为本服务H5地址；仅固定演示单位，未验证手机实际扫码、微信发布、账号归属和后端订单权限。')
reviewed('19',K,['创建模拟预约','ks-package-grid'],'partial','自助机选择演示身份、固定套餐和院区时间，创建本地预约。','固定套餐流程可操作，缺自助机个性化问卷；真实设备身份验证未接入。',route='/kiosk')
reviewed('21',P,['selectedExtras','extras.map'],'partial','预约页勾选三个预设加项，价格随选择变化。','没有按检查部位/疾病类型检索或分类选项。')
reviewed('22',P,['simple','简单预约'],'demonstrated','勾选简单预约后只选到院时间，套餐项目为空。',LOCAL+'后端零元/空项目规则、预约限额及审核策略未验证。')
reviewed('23',P,['就诊院区','state.packages.filter'],'partial','切换预约院区并选择套餐。','套餐集合未按院区过滤；院区名称与医护端不完全一致，缺统一院区字典。')
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
reviewed('72',C,['取消预约','预约状态'],'partial','筛选预约并执行取消/日期修改。','同条短信发送、黑名单设置/取消没有实现。')
reviewed('78',C,['操作追踪','state.audit'],'partial','操作追踪查询本地预约/改期/取消日志。','记录仅包含有限操作字段；未完整保存问卷内容、推荐项目和选择项目、所有前后值。',route='/quality')
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
reviewed('151',C,['单位支付 / 个人支付'],'partial','财务列表展示应收、单位/个人金额和本地支付状态。','单位支付固定显示0，未完整关联团检分摊、待缴/待退和项目金额。',route='/finance')
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
reviewed('284-285,287,293-294,305,310-311',C,['reviewStages','仅看异常','责任医生'],'partial','按2/3阶段推进审核，显示本次/固定上次结果，筛选血糖异常并选择责任医生。','缺真正可配置流程引擎、医生负载分配、问卷/各类项目完整呈现；仅看异常只识别血糖，历史对比为样例。',route='/review')
reviewed('292',C,['锁定报告','a.locked'],'partial','报告锁定后SAVE_RESULTS路径阻止继续分检修改。','没有第三方报告接入阻断、并发抢锁和服务端锁控制，部分UPDATE_APPOINTMENT仍可直接更改。',route='/review')
reviewed('295,297,320-325',C,['生成关联异常综合建议'],'partial','辅助主检读取结果，运行有限本地规则并写入可编辑综合建议。','采用有限确定性规则识别血糖/血脂/收缩压及合并示例，不是医疗AI；无通用共识异常抓取、术语校验、风险排序或临床有效性证据。',route='/review')
reviewed('296',C,['综合结论与指导意见'],'demonstrated','编辑综合结论并随审核保存。',LOCAL,route='/review')
reviewed('312-317',C,['驳回重检','确认驳回'],'partial','填写原因后驳回到分检，审核记录保留。','没有撤销审核及按主检/总检层级选择退回目标、驳回项目和定向通知；无法证明全部本组要求。',route='/review')
reviewed('326,329-333,351,356',C,['体检报告预览与流转','年度健康报告'],'partial','审核后报告列表，预览报告并切换三种标题模板。','模板主要改变标题，缺完整多样化布局、模板设计/上传下载、历史日期查询及独立报告终审。',route='/reports')
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
reviewed('702-711',O,['settlements','演示账户充值'],'partial','通用本地账单按商城/服务/报告/平台/充值类型维护金额和核对状态。','没有真实充值余额、交易流水、待付款服务订单自动关联、自动结算汇总与资金流转。',route='/commerce')
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
reviewed('254,268,272,275,277-278,281-283',H,['Followup','ADD_TASK','UPDATE_TASK'],'partial','按客户查询随访、手工分配负责人/日期，创建或完成本地任务，显示任务状态统计。','没有自动风险排序、锁定绑定、按工作量平均分配、到期提醒调度及完整客户类型过滤；外部异常来源未集成。',route='/health')
reviewed('274',H,['selected.history','保存记录'],'demonstrated','随访详情多次保存本次记录，历史顺序显示并可重新跟进。',LOCAL+'记录未含全部每次通话人员/时间精度和真实录音。',route='/health')
reviewed('570,583,587-588',H,['UPSERT_PATIENT','medicalRecords','体检记录'],'demonstrated','新增/维护共享客户档案，查看关联体检和时间线；新增查看病历记录。',LOCAL+'档案仅为合成数据，病历条目以姓名文本关联。','frontend',route='/health')
reviewed('571-572',H,['questions','评估客户','评估类型'],'partial','为选中客户填写五问示例问卷，可切换评估类型并保存。','不同人群共用同一简化问题，缺人群专属问卷入口/临床量表。',route='/health')
reviewed('574-576',H,['healthAssets','报告与个人设备'],'config-only','登记外部报告/设备标识、短信或邮件草稿元数据。','没有真实文件上传/存储、物联设备接入或发短信/邮件；资料登记不是上传完成。','unverifiable',route='/health')
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
gap('158-160,162-166',C,['订单详情'],'未实现导检单双照片控制、表头配置、打印机选择、身份证刷卡历史联动、替检完整替换/关联查询/导出或团检批量导检单/条码打印。',route='/appointments')
reviewed('171',H,['Followup','selected.history'],'partial','随访工作台可为客户记录跟进内容及日期。','订单未完成/未回传专项回访流程和精确操作人/时间字段未完整实现。',route='/health')
gap('175-176,178-180',C,['Exam'],'没有签字板、导检单回收机、高拍仪或回收单触发未检项目提示；文字与模拟打印不等于设备集成。',route='/exam',kind='unverifiable')
gap('187-188,193-194,196',C,['Finance'],'团检账单仅合成合同金额和回款；没有按付费项目/分组/弃检细目结算、单位发票业务员关联及回款到期弹窗。',route='/finance')
gap('215-216',C,['Exam'],'没有麦克风录音、录音文件与可视化录音管理。',kind='unverifiable')
reviewed('217',C,['加项：肺功能'],'partial','可返回订单详情加项并改变应收金额。','缺分检页直接加项及补缴费完成后才准继续检查的状态联动。',route='/appointments')
gap('229-234',C,['分检小结 / 医学建议'],'没有小结等级/手动排序、报告图片上传、内科问诊模板、快捷键提交或撤销已提交结果。')
reviewed('235-236',C,['LIS 检验结果回传','设备采集工作站'],'config-only','接口模拟台可点击生成本地成功提示/日志。','无医院第三方报告/检查设备接口、PC工作站SDK或结果自动回传；原文厂家前提未验证。','unverifiable',route='/quality')
reviewed('244',C,['criticalGlucose',"collection:'alerts'"],'partial','血糖阈值触发本地异常记录。','仅一项演示规则；不是通用检验检查危急值字典，原文是否保留功能待澄清。')
gap('245-246',C,['采样与条码工作站'],'采样弹窗是固定血/尿样例；没有妇科漏采提醒与病理专属条码。')
gap('251-253,255-256,259-261',C,['Exam'],'没有单项打印、申请单查看/重推、导检单两种回收策略、项目自取、独立结束标记、改期临期短信或到期自动弃检并送审。')
gap('262-267',H,['Followup'],'随访可手工记录，但没有异常项目聚合生成可编辑短信、自动发送/多次通知渠道和完整发送回执。',route='/health',kind='unverifiable')
gap('269-271,273,276',H,['Followup','groupSpec'],'四色风险使用固定标签；没有共识AB标准版本、自定义颜色/等级名称、客户随访锁定及同一订单异常合并逻辑。',route='/health')
gap('279-280',H,['Followup'],'没有三方呼叫中心接口、自动拨号或电话录音；需院方提供第三方接口。',route='/health',kind='unverifiable')
gap('286,288-291',C,['责任医生'],'只能手选两个示例医生；缺按日期排班、繁忙指数、报告难度分级/权重及级别分配。',route='/review')
gap('298-300,302-304,306-309,318',C,['Review'],'没有ICD10配置、标点拆分抓取、词条学习、共识AB字典生成、医生自定义异常分级、建议排序/拖动、危急客户置顶或特殊订单复查标记。',route='/review')
reviewed('319',C,['PACS 影像报告'],'config-only','接口模拟台记录PACS演示响应。','没有PACS网络、影像文件或影像查看器。','unverifiable',route='/quality')
gap('327-328,335,339,341,352-355',C,['Reports'],'没有模板文件上传/下载、报告批量打印/领取、实际领取短信、解读人时间/工作量或AI解读；报告自主领取范围待澄清。',route='/reports')
reviewed('357-364',H,['Enterprise','生成分析报告'],'partial','企业页筛选单位/年龄/性别生成当前人群统计，并导出CSV数据。','不能代替完整团检报告；缺体检完成时间/婚姻/套餐/部门过滤、阳性异常选择排序、男女前十疾病/三高分析、Word输出及自动医学建议。',route='/enterprise')
gap('365-376',C,['Dashboard'],'运营看板是总体订单/任务计数和固定趋势；未实现逐登记人/医生/科室/标本/销售/打印/解读工作量与金额统计及对应条件。',route='/dashboard')
reviewed('386,464-465',O,['roles','scope'],'config-only','角色可记录数据范围和页面权限勾选。','未实际按角色限制报表、人员、体检类型和页面数据；没有服务端鉴权。','frontend',route='/settings')
reviewed('400-401',H,['Enterprise','cohortLabel'],'partial','企业分析提供基础人口属性筛选。','非临床指标结构化科研查询；不支持如血脂异常AND血压高的复合筛选或真实结果值集。',route='/enterprise')
gap('402-403',C,['Exam'],'只有姓名头像和合成身份，未提供证件照/现场照双验证及采血分检照片比对。',route='/quality',kind='unverifiable')
gap('407-408,417-418',C,['弃检'],'弃检仅修改订单项目；没有手写板签名、签名文档查询、关键节点签署与永久存档。',route='/quality',kind='unverifiable')
gap('410-411',C,['Quality'],'驳回事件写日志，但没有按医生/原因/次数与错误概率统计整改。',route='/quality')
gap('420-422,426-428',O,['messages'],'存在模拟消息记录，不执行真实报告/体检/异常/节日生日短信，也没有批量/自定义发送与送达回执。',route='/content',kind='unverifiable')
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
reviewed('436-438,441,444-450,452-455',O,['crmContracts','crmCustomers','crmActivities'],'demonstrated','专业服务中的CRM页维护客户/合同/拜访立项资料，支持新建删除详情导出及合同审批状态流转。',LOCAL+'合同与客户为文本关联；满意度/周期/签约数是手填字段，非自动业务事实。',route='/services')
reviewed('439-440,442-443,451,456-461',O,['CrmSummary','monthly','认领待审'],'partial','CRM客户可认领/审批/指派状态；维护计划/实际回款；看板汇总合同金额、完成率、月份收款与逾期合同。','没有当前人员权限/年度过滤，月份汇总不限定年份；指派为文本与状态，不验证真实认领锁；缺完整体检进度、按业务员绩效统计和财务联动。',route='/services')
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
reviewed('503-506',Q,['检查路径建议','最短等待优先'],'partial','显示固定空腹路径；按演示等待分钟或订单标识重排当前科室队列。','未实现瓶颈预排、项目依赖/性别/服务均时/区域综合算法；“预约时间优先”实际按订单标识排序。',route='/queue')
reviewed('509',Q,['displayName','maskQueueNames'],'demonstrated','勾选隐藏姓名中间字，候检/过号/叫号大屏显示脱敏姓名。','仅视觉姓名遮蔽；操作按钮无障碍名称仍含全名，不能视为完整隐私访问控制。','frontend',route='/queue')
reviewed('512-513,520,529,533,537-538,542-545,547-548',Q,['手动入队','position','完成出队','召回入队'],'demonstrated','查看当前科室候检/过号，手动加入符合项目的到检客户，上下移动、选呼/重呼、过号说明、召回、完成出队；显示呼叫客户。',LOCAL+'跨标签共享本地数据，非真实现场语音/屏幕；队列完整并发控制和跨用户推送未验证。',route='/queue')
reviewed('516-519,530-532,539-541',Q,['tickets','list.length','Object.keys(areas)'],'partial','以科室标签查看候检/过号名单、姓名编号、当前呼叫与人数。','缺高级查询、瓶颈标识、已检计数、客户姓名/身份证搜索及全部队列明细、VIP类型；切科室不是硬件呼叫器。',route='/queue')
reviewed('535-536,552',Q,['呼叫 / 重呼','语音与微信推送为模拟'],'partial','点击叫号写本地记录，同源数据更新大屏。','现场语音播放和物理诊室屏未接入；本地更新不能证明真实终端/语音设备。','unverifiable',route='/queue')
reviewed('554-555',Q,['候检大屏'],'partial','切换当前队列的大屏视图。','没有多诊室模式管理或多个诊室负载均衡共享池，视图切换不等于诊室调度。',route='/queue')
gap('507-508,510-511,514-515',Q,['Queue'],'未按性别、瓶颈进度、固定超声号、当日已完成人数、已开队列/登录医生数量进行完整统计。',route='/queue')
gap('521-525,527-528,534',Q,['Queue'],'没有清空/批量开关/定时开关、医生照片简介配置或外检流程。',route='/queue')
gap('526,546,551,553',Q,['Queue'],'缺远程物理屏关闭、恢复检查条码凭条、自助扫码/刷卡入队及姓名多音字语音配置。',route='/queue',kind='unverifiable')
gap('549-550',Q,['Queue'],'列表可展示候检与过号；没有针对长队列的大屏滚动策略/自动滚屏。',route='/queue')
gap('564-569',Q,['areas'],'科室映射固定；尚无科室/队列/区域/诊室/用户完整维护和真实体检系统接口。',route='/queue')

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
    out=io.StringIO(); writer=csv.DictWriter(out, fieldnames=keys); writer.writeheader(); writer.writerows({k:r[k] for k in keys} for r in rows)
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

## 数据、隐私与权限

- 只用虚构演示数据。本地状态和浏览器存储能被当前用户查看、编辑或清除，不是安全数据库，也不是可靠的医院档案保存机制。不要录入真实患者、身份证、照片、病历、联系方式或支付凭据。
- UI角色切换、菜单隐藏、折扣输入校验和本地日志不是服务端鉴权。生产还需身份认证、按角色/院区/患者的数据范围控制、接口授权和审计。
- 本地日志可演示谁、何时、什么动作；不等于不可篡改、永久保存、签章或完整跨系统追溯。刷新保持仅对具体使用持久化的模块成立，未逐项测试的状态不宣称可靠持久化。
- 浏览器临时文件、导出和打印应使用演示数据。生产需落实访问控制、脱敏、保密及测试数据制度；源文没有确定等保级别、RPO、RTO或统一性能阈值，本项目不擅自补写。
- 健康档案可读取并保存本地PDF/TXT/CSV演示文件（每份512KB以内、最多4份）；这属于浏览器内文件处理，不是安全服务器上传、患者文件存储或医学解析。

## 服务与专项质控中心

- /controls 提供独立通知、替检人工核验、签名留样、驳回统计、门户/导检配置与密码演练入口。入口统计只要求本条至少一个子项可定位，不掩盖该条其他子项仍缺失；请逐项阅读矩阵。
- 通知从共享演示订单和有限异常规则生成，支持逐对象预览、批量本地记录、模拟失败/重试与操作历史。没有短信、电话或站内消息对外发送，也没有自动事件触发或前一天调度。模板正文编辑只作用于本次消息，不是可持久维护的模板库。
- 替检核验仅使用两幅固定抽象SVG示意图及人工一致/不一致记录，没有实际身份证照片、摄像头、活体或人脸识别。签名只允许固定演示文字或随意笔画，本地可查询预览，不执行对应弃检/领取/回收动作，也不提供法律效力、防篡改或永久保存。请勿输入真实生物信息或签名。
- 驳回统计确实读取本地REJECT快照，但记录医生是订单责任医生，不一定等于原分检执行人；主检/总检合并。原因占比的分母为筛选后驳回事件数，不能当作临床错误发生概率。
- 门户内容、海报摘要、菜单、科室/区域/诊室使用分域配置；未联动患者端发布、既有固定队列映射或真实医院导航。队列配置、用户管理及无缝接口仍按各自T项列缺口。
- 密码表单仅校验DEMO测试字符串，成功后清空输入，不保存输入值，只保留演练完成标志/时间/强度；不修改真实密码或认证权限，不验证安全存储或生产密码策略。
- 演示指南包含实际36秒H.264、1280×720视频、中文字幕和六章节定位。已检查媒体元数据及抽帧，自动测试只验证DOM媒体引用/章节时间/关闭。短片为流程示意，不是实际界面操作录屏、复杂操作完整教学或浏览器播放/视觉验收证据。

## 医疗判断

异常阈值、A/B类、关联指标建议、1+X推荐、AI主检/质控/报告解读及健康干预处方均为演示性逻辑或示例。源文未给出完整专家共识版本、字典、临床模型、部署方式、准确性阈值或人工复核验收细则。本演示不作诊断、处方执行或医学有效性验证，不能用于实际临床决策。生产内容必须由有资质的院方团队制定并验证，涉及药物处方的条目不能因有文本输入框而视为具备处方资质或电子处方能力。

## 外部接口与异步流程

- HIS/LIS/PACS/第三方检验报告、发医嘱、导航、呼叫中心、检查设备、短信/邮件、微信身份绑定及推送尚无真实医院接口与验收环境证据。按钮、模拟连接状态、测试提示或前端记录均不证明送达或联调成功。
- 微信小程序和公众号能力不能用响应式Web页面替代。团检入口二维码需真码、正确的单位订单目标及有效账号；二维码图片或入口仅能证明演示范围内的跳转。
- 支付、退费、银联、会员卡、电子发票、回款与充值只演示状态/金额。没有真实支付结算、税务开票、验签回调、幂等、财务凭证、交易一致性证明。
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
