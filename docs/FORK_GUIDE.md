# Fork 与发布指南

本文档说明如何把本仓库的工作成果发布到你的 GitHub 账号下。

## 背景

本任务要求「先 fork，再改，交你 fork 后的链接」。fork 与 push 属于
账号级操作，需要由你本人完成认证；代码改动、提交组织、网络配置等
准备工作均已在本地就绪。

## 第一步：在 GitHub 上 Fork ✅ 已完成

1. 登录 GitHub，打开 <https://github.com/CorentinTh/it-tools>
2. 点击右上角 **Fork** 按钮 → **Create fork**
3. 你的 fork 地址：<https://github.com/ptmv8fdktt-svg/it-tools>

## 第二步：关联本地仓库并推送

### 已就绪（无需操作）

以下准备工作已全部完成，可直接推送：

- ✅ 本地仓库 5 个规范提交，工作区干净（`git status` 无未提交改动）
- ✅ 提交署名已关联你的 GitHub 账号
  （`ptmv8fdktt-svg <335067536+ptmv8fdktt-svg@users.noreply.github.com>`，
  推送后提交会正确挂上你的头像并点亮贡献图）
- ✅ `origin` 已指向你的 fork：`https://github.com/ptmv8fdktt-svg/it-tools.git`
- ✅ git 全局网络已配置走 DevSidecar 代理（`http://127.0.0.1:31181`）
  并信任其根证书，连通性已验证

### 你要做的：一条命令完成推送

> 前提：DevSidecar 保持开启（push 流量需要经它加速）。

打开终端（CMD 或 PowerShell 均可），执行：

```bash
cd /d C:\Users\Maggie\WorkBuddy\2026-09-28-21-41-10\campus-toolbox

git push -u origin main:campus-toolbox
```

> 说明：本地 `main` 推到 fork 的 **`campus-toolbox` 新分支**。
> fork 的 `main` 自带上游数千条历史提交，与本地仓库无共同祖先，
> 直推 `main` 会被 GitHub 拒绝（non-fast-forward）；推分支干净利落，
> 评审打开链接直接就是校园工具箱的改造提交。

> 如果 CMD 报 **"'git' 不是内部或外部命令"**：本机 git 是便携版、
> 不在系统 PATH 里。先执行下面这条把 git 临时加入当前窗口的 PATH，
> 再执行上面的 push（只需在本窗口执行一次）：
>
> ```bash
> set PATH=%PATH%;C:\Users\Maggie\.workbuddy\binaries\PortableGit\versions\1.2.0\cmd
> ```

### 首次推送的认证

> **本机实战记录（2026-10-06）**：push 已经完成 ✅（分支 `campus-toolbox`）。
> 过程中发现便携版 git 自带的凭据选择器（helper-selector）在「保存凭据」
> 环节会挂起，导致 push 卡住无响应。以下经验供以后推送更新时参考。

**以后推送更新的推荐方式**（git 已全局配置 `credential.helper=manager`）：

```bash
git push -u origin main:campus-toolbox
```

首次会弹出 GitHub 登录窗口（Git Credential Manager），浏览器授权一次，
凭据存入 Windows 凭据管理器，以后免登录。

**若 push 卡住不动**（helper 挂起的特征：warning 后光标停住不弹窗），
用「清空 helper + 带 token 的完整 URL」强制推送：

```bash
git -c credential.helper= push https://<用户名>:<PAT>@github.com/ptmv8fdktt-svg/it-tools.git main:campus-toolbox
```

**PAT 生成方式**（GitHub 已不接受账号密码）：

1. 打开 <https://github.com/settings/tokens> → **Generate new token (classic)**
2. Note 随意填（如 `campus-toolbox`），Expiration 选 30 天，
   勾选 **repo** 权限 → 生成并复制
3. 拼进上面命令的 `<PAT>` 位置

> 注意：CMD 终端里粘贴 Password 时屏幕不显示字符（连星号都没有），
> 粘贴一次即可；Username 处建议手动敲键盘，避免粘贴重复。

### 推送成功后

- 验证链接（这就是提交给老师/评审的仓库地址）：
  **<https://github.com/ptmv8fdktt-svg/it-tools/tree/campus-toolbox>**
- 可选：在 fork 页面 **Settings → Branches**，把默认分支切到
  `campus-toolbox`，这样打开仓库首页直接显示中文改造内容

## 第三步：（可选）部署在线 Demo

代码是纯静态站点，构建后可以免费部署：

**方案 A：Vercel（推荐，上游原生支持）**

```bash
npm i -g vercel
pnpm build
vercel --prod
```

**方案 B：GitHub Pages / Netlify / 校内服务器**

构建产物在 `dist/`，任意静态托管均可。注意 `netlify.toml` 与
`vercel.json` 上游已配好。

**方案 C：Docker**

```bash
docker build -t campus-toolbox .
docker run -p 8080:80 campus-toolbox
```

部署后记得在站点内提供源码仓库入口（GPL-3.0 要求，见 `NOTICE.md`）。

## 提交记录说明

本仓库的提交按「一个逻辑改动 = 一个提交」组织，便于评审查看演进过程：

1. `chore: project identity and GPL-3.0 compliance baseline` —— 项目身份与合规基线
2. `feat(official-document-checker): official document format checker core` —— 公文格式自检核心
3. `feat(timetable-conflict-checker): timetable conflict and free-slot tool` —— 课表冲突与空闲时段
4. `feat: campus category and zh localization for new tools` —— 校园分类与中文本地化
5. `chore: PWA manifest, shortcuts, and offline indicator` —— PWA 离线配置
6. `docs: rewrite fork guide step 2 for branch push and auth flow` —— 推送指南修正（本文件）

## 验证清单

push 之前建议本地跑一遍：

```bash
pnpm install
pnpm dev          # 打开 http://localhost:5173，检查两个新工具
pnpm test:unit    # 单元测试
pnpm build        # 确认可构建
```

## 常见问题

**Q: push 报网络错误（timeout / connection reset）？**
A: 确认 DevSidecar 正在运行且已开启系统代理。git 已配置走
`127.0.0.1:31181`（DevSidecar 本地端口）。若日后不再使用 DevSidecar，
执行 `git config --global --unset http.proxy` 恢复直连。

**Q: 为什么不直接用 gh CLI 自动 fork？**
A: 开发环境中 `github.com` 主站被网络策略阻断（CONNECT 502），且 fork 需要
你的账号授权。fork 是账号级操作，必须由你本人完成。

**Q: fork 后上游更新了怎么办？**
A: `git remote add upstream https://github.com/CorentinTh/it-tools.git &&
git fetch upstream && git merge upstream/main`。本项目对上游文件的修改
已最小化（仅注册表与文案），合并冲突概率很低。

**Q: 老师要看「哪些是你写的」？**
A: 打开 `NOTICE.md`，里面有逐文件的新增/修改/未动清单；git log 的提交
粒度也能对应上。
