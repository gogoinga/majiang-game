# AGENTS

4 人麻将 Web 项目。前端 Vue 3 + PixiJS 8 渲染桌面，后端 Node.js + Socket.IO 维护房间与游戏状态，状态通过事件下发给前端；前端不做权威判定。

## 模块布局

- `web-ui/` — 前端，Vue 3 + Vite + TypeScript
  - `src/pixi/scenes/TableScene.ts` — 牌桌主场景，Pixi 渲染核心
  - `src/pixi/entities/` — 牌 (`Card`) / 牌背 (`CardBack`) 等图元
  - `src/stores/game.ts` — 游戏状态（hands / river / pengs / gangs / turn / banker）
  - `src/hooks/useSocket.ts` — Socket.IO 客户端封装
  - `src/pages/` — 路由页面（`game-index/`, `room-lobby/`）
  - `public/tiles/` — 静态牌面 PNG 与图集
- `web-server/` — 后端，Node.js + Express + Socket.IO（端口 3000）
  - `main.js` — 房间、事件、回合流转
  - `createDeck.js` / `winCheck.js` — 牌堆与胡牌判定
  - `verify_*.js` — 历史一次性校验脚本，不当作单测

## 常用命令

```sh
# 前端
cd web-ui && pnpm install
pnpm dev      # Vite dev server，host 0.0.0.0
pnpm build    # vue-tsc 类型检查 + vite build

# 后端
cd web-server && pnpm install
pnpm exec node main.js   # 暂无 dev 脚本，需要 nodemon 自行加
```

两个子项目各自 `pnpm`，锁文件分别位于 `web-ui/pnpm-lock.yaml` 和 `web-server/pnpm-lock.yaml`，互不混用。Vite 配置里没有 Socket.IO 代理；前端实际连接后端的地址看 `useSocket.ts`。

## 约定与注意事项

- **状态来源唯一**：游戏权威状态在后端，前端只通过 Socket.IO 事件同步。不要在前端硬编码回合 / 胡牌 / 牌墙等规则。
- **不要在仓库根目录新增一次性补丁脚本**（`patch_*.js` / `fix_*.js` / `patch_*.sh`）。之前已清过一批，规则是直接改源码，不留工具脚本。
- **不要手动改 `web-ui/public/tiles/` 下的 PNG / 图集 JSON**，由资源管线维护。如确需调整，落到独立的生成脚本里。
- **Pixi 8 渲染**：精灵池由 `TableScene` 内部维护（`handPools` / `publicPools` / `riverContainers`），替换或重渲时记得 `destroy({ texture: false })` 回收。新增图元类型先在 `src/pixi/entities/` 扩展，不要在场景里 inline 创建。
- **移动端横屏**：常量 `MOBILE_LANDSCAPE_*` 在 `TableScene.ts` 顶部；新增布局元素时复用同一组缩放。
- **类型严格**：`tsconfig.app.json` 开 `strict`；`vue-tsc` 在 `pnpm build` 里跑，构建失败先看类型错误。

## 联调

- 启动后端：`node main.js`，监听 `:3000`
- 启动前端：`pnpm dev`
- 4 个浏览器标签（或 4 个无痕窗口）即可凑一桌

## 范围外

- 仓库里没有自动化测试框架。后端 `verify_*.js` 是临时脚本，不作单测。如果新增功能需要回归保障，先和项目维护者确认引入哪个测试栈（vitest / mocha）。

## 操作安全规则

- **禁止擅自删除文件**：除非用户明确说“删除”并确认文件路径，否则永远不要执行删除操作。
- 执行文件操作前，必须先使用工具查看当前目录结构（ls / tree / list files）。
- 重要文件修改前，建议先备份或告知用户。
- 严格遵守用户指令，不要自作主张执行危险操作。

## 代码规范

- 保持代码整洁、可读性强
- 优先使用现代语法和最佳实践
- 添加必要的注释
- 遵循项目已有的代码风格

## 核心输出规则（必须严格遵守）

- **回复语言**：**所有回答尽量使用中文**，除非用户明确要求使用英文或代码注释需要英文。
