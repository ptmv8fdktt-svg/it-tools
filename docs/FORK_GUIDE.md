# Fork 与发布指南

本文档说明如何把本仓库的工作成果发布到你的 GitHub 账号下。

## 背景

本任务要求「先 fork，再改，交你 fork 后的链接」。由于开发环境的网络限制
（`github.com` 主站被阻断，仅 `api.github.com` 可达），fork 与 push 需要
你在本机完成。代码改动已全部就绪并写好规范的 git 提交，你只需执行下面
三步。

## 第一步：在 GitHub 上 Fork

1. 登录 GitHub，打开 <https://github.com/CorentinTh/it-tools>
2. 点击右上角 **Fork** 按钮 → **Create fork**
3. 得到你的 fork 地址，形如：`https://github.com/<你的用户名>/it-tools`

## 第二步：关联本地仓库并推送

本项目目录已经初始化为 git 仓库并完成了提交，直接关联你的 fork 即可：

```bash
cd campus-toolbox

# 查看现有提交（应看到规范分次的提交记录）
git log --oneline

# 把 origin 指向你的 fork（把 <你的用户名> 换成实际用户名）
git remote set-url origin https://github.com/<你的用户名>/it-tools.git

# 推送（本地分支名 main 推到 fork 的 main）
git push -u origin main
```

> 提示：如果 push 提示需要认证，使用 Personal Access Token（PAT）作为密码，
> 或配置 SSH key。GitHub 已不接受账号密码直推。

推送成功后，访问 `https://github.com/<你的用户名>/it-tools` 就能看到
全部改造内容 —— 这个链接就是可以提交的仓库链接。

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

1. `feat(official-document-checker): 公文格式自检核心引擎` —— 规则引擎 + 解析器 + 修复器
2. `feat(official-document-checker): 工具界面与示例文档`
3. `feat(timetable-conflict-checker): 课表冲突与空闲时段工具`
4. `feat: 中文本地化与校园分类注册`
5. `chore: PWA 离线配置与品牌信息`
6. `docs: GPL-3.0 合规声明与项目说明`

## 验证清单

push 之前建议本地跑一遍：

```bash
pnpm install
pnpm dev          # 打开 http://localhost:5173，检查两个新工具
pnpm test:unit    # 单元测试
pnpm build        # 确认可构建
```

## 常见问题

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
