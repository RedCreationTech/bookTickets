"""Generate the source-authored, silent workflow explainer (not an app recording)."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import subprocess, tempfile, os
ROOT=Path(__file__).resolve().parents[1]
FONT=os.environ.get('CJK_FONT','/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc')
STEPS=[
 ('检前预约','患者端 → 开启健康计划','选择套餐、院区和时间；阅读须知后确认预约。','对比套餐 / 团检入口 / 问卷推荐'),
 ('到检登记','模拟支付 → 自助签到','选择合成身份，确认订单及到检院区。','待支付 → 待到检 → 已登记'),
 ('科室分检','分检工作站 → 录入结果','输入数值或检查描述；异常须复核并填写小结。','完整性校验 / 数值校验 / 异常上报'),
 ('三级审核','初审 → 主检 → 总检','审核结果与综合建议；需要补充时填写原因驳回。','责任医生 / 报告锁定 / 关联规则示例'),
 ('报告流转','报告中心 → 打印装订机','查看历史对比，模拟打印装订，登记领取或移柜。','打印 / 装订 / 入库 / 发放均可追踪'),
 ('健康随访','健康管理 → 干预随访','记录本次随访结果后完成任务，回到患者端看报告。','风险分组 / 健康计划 / 随访闭环'),
]
def font(n):return ImageFont.truetype(FONT,n)
def make_frame(i,title,subtitle,desc,foot):
 im=Image.new('RGB',(1280,720),'#f3f7f3');d=ImageDraw.Draw(im)
 d.rectangle((0,0,1280,122),fill='#173e35');d.text((64,33),'青禾 · 智慧体检',font=font(32),fill='#e7f1e8');d.text((851,43),'操作引导 / 流程示意',font=font(20),fill='#aac6b8')
 d.rounded_rectangle((63,159,167,198),radius=12,fill='#e3eee4');d.text((79,166),f'第 {i+1} 步',font=font(20),fill='#35725c')
 d.text((62,219),title,font=font(54),fill='#24493b');d.text((65,311),subtitle,font=font(30),fill='#5f8a73');d.text((65,377),desc,font=font(25),fill='#748879')
 d.rounded_rectangle((63,456,1216,533),radius=15,fill='#e6efe5');d.text((89,479),foot,font=font(23),fill='#587953')
 for j in range(6):
  x=63+j*193;d.rounded_rectangle((x,584,x+165,589),radius=2,fill='#478165' if j<=i else '#dce5d8')
 d.text((64,633),'合成数据 · 纯前端模拟 · 本片不是实际界面录屏或验收证据',font=font(19),fill='#91a08a');d.text((1079,633),f'{i+1} / 6',font=font(19),fill='#91a08a')
 return im
out=ROOT/'public/media';out.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory(prefix='health-guide-') as folder:
 for i,step in enumerate(STEPS):make_frame(i,*step).save(Path(folder)/f'step-{i:02}.png')
 make_frame(0,*STEPS[0]).save(out/'workflow-poster.png')
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-framerate','1/6','-i',str(Path(folder)/'step-%02d.png'),'-c:v','libx264','-r','24','-pix_fmt','yuv420p','-crf','24','-movflags','+faststart',str(out/'workflow-guide.mp4')],check=True)
vtt='WEBVTT\n\n'
for i,(title,sub,desc,foot) in enumerate(STEPS):
 vtt+=f'{i+1}\n00:00:{i*6:02}.000 --> 00:00:{(i+1)*6:02}.000\n{title}：{desc}\n\n'
(out/'workflow-captions.vtt').write_text(vtt,encoding='utf-8')
print(out/'workflow-guide.mp4')
