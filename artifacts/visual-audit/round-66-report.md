# Round 66 · 潮汐洞穴盐晶修道院

## 目标

固定提示词：

> 建在潮汐洞穴群中的盐晶修道院，退潮时露出石路，涨潮时部分回廊被淹，有海蚀礼拜堂、僧侣居室、钟塔、藏经洞和悬崖逃生梯

固定 Seed：`round66-tidal-salt-monastery`  
回归 Seed：`round66-floating-salt-regression`  
规模：中型 · 地点  
密度：72%  
网格：1 格 = 5 英尺 / 1.524 米

## 本轮改动

- 将“潮汐洞穴群 + 修道院”识别为站点级复合场景，而不是普通建筑。
- 盐晶只表达材质与垂直地标，不再默认生成浮空岛。
- 只有提示词明确出现“浮空 / 浮岛 / 悬空 / floating / levitating”时，才进入浮空岛语法。
- 非浮空版本使用洞窟承载地貌，生成洞穴边界、盐晶柱、盐晶洞壁、裂谷和洞底潮池。
- 非浮空洞穴的垂直交通使用 `vertical-opening`，不再强制错误地生成悬索桥。
- 为功能性 B1 模块按“功能 + 建筑实例”建立 `focus-cluster`，使藏经洞等地下空间可以单独检查。
- 保留明确浮空盐晶修道院的三层浮岛、悬索桥和垂直路线。

## 浏览器视觉证据

| 视图 | Seed | 结果 |
|---|---|---|
| 潮汐洞穴修道院总览 | `round66-tidal-salt-monastery` | [tidal-monastery-regression.png](./round-66/tidal-monastery-regression.png) |
| B1 聚焦视图 | `round66-tidal-salt-monastery` | [tidal-monastery-b1-regression.png](./round-66/tidal-monastery-b1-regression.png) |
| 藏经洞内部聚焦 | `round66-tidal-salt-monastery` | [tidal-monastery-archive-focus.png](./round-66/tidal-monastery-archive-focus.png) |
| 明确浮空版本总览 | `round66-floating-salt-regression` | [floating-salt-regression.png](./round-66/floating-salt-regression.png) |
| 明确浮空版本低角度 | `round66-floating-salt-regression` | [floating-salt-low.png](./round-66/floating-salt-low.png) |

## 自我验收

- 隐藏标题后，非浮空版本仍能看出洞窟群、盐晶柱、潮池与修道院建筑群的关系；不再是三块平整浮空板。
- 非浮空 B1 已从全聚落地下室列表收敛为单一功能簇；楼梯和藏经洞入口在画面中可见。
- 明确浮空版本仍保留三层浮岛、岛间桥和暴露底面；低角度可以确认真实高度，而不是贴地平台。
- 两个版本的 `grammar`、地貌父类型和图元数量明显不同。
- 语义覆盖均为 100%，诊断均为 99/100。
- 仍未完全通过：修道院群的专用建筑外观仍有部分由通用独立建筑模块承担；低角度浮空版本的桥下垂直构件仍偏工程化；潮汐“涨潮/退潮”的水位变化目前是语义标签和固定潮池几何，尚未做时间动画。

## 自动校验

```text
npm run check       12 files / 216 tests passed
npm run build       passed
git diff --check    passed
```
