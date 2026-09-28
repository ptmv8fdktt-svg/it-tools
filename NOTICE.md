# NOTICE — 衍生作品声明

本项目 **Campus Toolbox（校园工具箱）** 是基于开源项目 **it-tools** 二次开发的衍生作品（derivative work）。

依据 GNU GPL-3.0 第 5 条，特此声明修改内容与时间。

## 一、原始项目信息

| 项目 | 内容 |
|---|---|
| 名称 | it-tools |
| 仓库 | https://github.com/CorentinTh/it-tools |
| 作者 | Corentin Thomasset 及 it-tools 贡献者 |
| 许可 | GNU General Public License v3.0 |
| 本项目 fork 基线 | 上游 `main` 分支，抓取时间 2026-09-28 |
| 上游版本号（抓取时） | `2024.10.22-7ca5933` |

原始项目版权归原作者及贡献者所有。原始许可证全文见 [LICENSE](./LICENSE)（本项目未修改许可证文本）。

## 二、修改声明

本项目 **完全以 GPL-3.0 授权**，并向任何接收者提供完整对应源代码。

### 2.1 新增的文件（原创部分）

| 路径 | 说明 |
|---|---|
| `src/tools/official-document-checker/official-document.rules.ts` | 公文格式校验规则引擎，14 条规则，依据 GB/T 9704-2012 |
| `src/tools/official-document-checker/official-document.parser.ts` | 文档解析器，含手写的最小 ZIP 读取器与 OOXML 解析，可读取 docx 内部真实排版参数 |
| `src/tools/official-document-checker/official-document.fixer.ts` | 一键修复引擎与检查报告生成 |
| `src/tools/official-document-checker/official-document-checker.vue` | 公文自检工具界面 |
| `src/tools/official-document-checker/official-document.sample.md` | 示例公文（含 12 处典型错误） |
| `src/tools/official-document-checker/index.ts` | 工具注册信息 |
| `src/tools/timetable-conflict-checker/timetable-conflict.models.ts` | 课表冲突检测与空闲时段计算核心逻辑 |
| `src/tools/timetable-conflict-checker/timetable-conflict-checker.vue` | 课表工具主界面 |
| `src/tools/timetable-conflict-checker/multi-person-planner.vue` | 多人课表求交集组件 |
| `src/tools/timetable-conflict-checker/index.ts` | 工具注册信息 |
| `docs/` | 项目策划书、合规说明等文档 |

上述新增文件同样以 GPL-3.0 授权。

### 2.2 修改的既有文件

| 路径 | 修改内容 |
|---|---|
| `src/tools/index.ts` | 新增两个原创工具的 import；新增「校园常用」分类并置于分类列表首位 |
| `package.json` | 项目名改为 `campus-toolbox`，更新描述、关键词、仓库地址、版本号 |
| `README.md` | 重写为中文项目说明，包含工具介绍、离线能力、GPL 合规说明、贡献指南 |
| `locales/zh.yml` | 新增两个原创工具的中文名称与描述条目 |
| `index.html` | 更新站点标题与描述为中文 |

### 2.3 未修改的部分

原项目其余 90 个工具的实现代码、构建配置、测试配置、CI 配置**均保持原样**，未作改动。

## 三、GPL-3.0 合规说明

GPL-3.0 是**强 copyleft（传染性）许可**。对本项目而言，这意味着：

1. **修改后公开部署，必须开源**。把本项目部署成网页给同学访问，属于 GPL-3.0 定义的「向公众传播」（conveying），因此必须同时提供完整对应源代码，且同样以 GPL-3.0 授权。
2. **不能改用闭源许可**。不能把本项目修改后以专有许可发布，也不能通过改名、混淆、打包等方式规避。
3. **必须保留版权声明**。不得移除原项目的版权声明、许可证文本与免责声明。
4. **必须声明修改**。本文件即为该声明。
5. **源码获取途径**：本项目部署为公开站点时，页面内提供指向源码仓库的入口；任何人也可从仓库地址获取完整对应源码。

### 关于「内部使用」的边界

GPL-3.0 第 2 条规定，仅为自身使用而制作副本、修改，**不构成传播**，因此不受开源义务约束。但需要注意：

- 若修改后的版本仅部署在**校内内网**、且访问者仅限于**同一法人单位内的成员**，通常不构成「向公众传播」；
- 一旦**任何校外人员**（包括其他学校的同学、通过公网访问的用户）可以使用，即构成传播，必须开源。

**本项目的做法是：无论哪种情况，一律以 GPL-3.0 开源。** 这样既绝对合规，也让成果可以被其他高校复用。

### 商标与署名

- 本项目**不声称**对 it-tools 的名称、标识拥有任何权利。
- 本项目使用独立名称「校园工具箱 / Campus Toolbox」，避免与原项目混淆。
- 不得暗示本项目获得原作者的官方认可或背书。

## 四、第三方依赖

本项目依赖的第三方 npm 包各自遵循其自身许可（多数为 MIT / Apache-2.0 / ISC）。构建产物中会包含这些依赖，其许可信息可通过 `pnpm licenses list` 查看。

其中需要留意的依赖：

| 依赖 | 许可 | 说明 |
|---|---|---|
| `@it-tools/bip39`、`@it-tools/oggen` | MIT | 原项目维护的独立小包 |

## 五、免责声明

本项目按「现状」提供，不附带任何明示或暗示的担保。使用本工具生成的检查结果**仅供参考**，不能替代学校教务部门、办公室的正式审核。因使用本工具产生的任何后果，作者不承担责任。

---

最后更新：2026-09-28
