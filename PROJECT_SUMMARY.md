# PHANTOM FUSION: final summary / 最終總結

Hacktoberfest Southampton 2026 · Team: Dunja Gvozdenovic & Jjho0
GitHub: https://github.com/dunja-g/Hack_ECSS (branch `main`, latest commit `dd2bd45`)

---

## 1. What the game is / 遊戲是什麼

**EN:** Upload a photo of a real room, or an architectural floor plan. Gemma 4, running locally in Ollama, reads it, and the game rebuilds it as a 3D arena. Cute "BOO!" ghosts live inside the haunted furniture and burst out to fight you. No API keys and no cloud: Gemma 4 is the only AI while playing.

**中文：** 上傳一張真實房間的照片，或一張建築平面圖。在本機 Ollama 跑的 Gemma 4 會讀懂它，遊戲再把它重建成 3D 場地。可愛的「BOO!」鬼魂住在鬧鬼的家具裡，會衝出來和你戰鬥。不需要 API key，也不用雲端：遊玩時唯一的 AI 是 Gemma 4。

---

## 2. What we built in this session / 這次完成的內容

| # | Feature / 功能 | EN | 中文 |
|---|---|---|---|
| 1 | Mac setup / Mac 環境 | Docker Desktop, the native Ollama app (on the M4 GPU) and Gemma 4 `e4b-it-qat`, all tested with real Gemma | Docker Desktop、原生 Ollama App（跑在 M4 GPU）和 Gemma 4 `e4b-it-qat`，都用真實 Gemma 測試過 |
| 2 | GitHub | All work pushed to `dunja-g/Hack_ECSS`; README credits Jjho0 | 所有成果都 push 到 `dunja-g/Hack_ECSS`；README 列上 Jjho0 |
| 3 | Enemies attack from range / 敵人遠距攻擊 | Line-of-sight checks: walls and furniture block them | 視線檢查：牆壁和家具會擋住它們 |
| 4 | CS-style HUD / CS 風格 HUD | HP and armor boxes, ammo 30/90 with reserve, and a rotating radar | HP 與護甲方框、彈藥 30/90 含備用、會旋轉的雷達 |
| 5 | Better graphics / 畫面優化 | 4x MSAA, environment light, sharper shadows, adaptive resolution | 4x MSAA、環境光、更清晰的陰影、自適應解析度 |
| 6 | Aim down sights / 右鍵瞄準 | Hold right-click: scope view, tighter aim, slower movement | 按住右鍵：瞄準鏡畫面、準度提高、移動變慢 |
| 7 | BOO! ghosts / BOO! 鬼魂 | Hand-drawn style ghost with a sign; throws spirit orbs you can dodge | 手繪風格、拿著牌子的鬼魂；丟出可閃躲的光球 |
| 8 | Real furniture / 真實家具 | 16 furniture types (shelves with books, desks with legs, doors, windows...) instead of plain boxes | 16 種家具（有書的書櫃、有桌腳的書桌、門、窗戶……），取代單純的方塊 |
| 9 | Two-step photo reading / 兩步驟照片判讀 | Gemma describes the room; room templates build it at real sizes (the library photo now gives walls of bookshelves) | Gemma 描述房間；房間範本以真實尺寸建造（圖書館照片現在會有整面牆的書櫃） |
| 10 | Floor-plan mode / 平面圖模式 | Walls traced from the drawing in about 0.15 s; Gemma names the rooms; ghosts path-find through doors | 約 0.15 秒從平面圖描出牆壁；Gemma 命名房間；鬼魂會穿過門口找路 |
| 11 | Crouch / 蹲下 | Hold C: lower view, steadier aim, and a desk is enough cover | 按住 C：視角變低、瞄準更穩，一張書桌就足以當掩體 |
| 12 | Describe a room / 文字描述房間 | Type "two beds and three chairs" (English or Chinese); Gemma designs it and the game keeps exactly those counts | 輸入「兩張床和三把椅子」（中英文皆可）；Gemma 設計房間，遊戲會照你寫的數量擺放 |
| 13 | Halloween start screen / 萬聖節開始畫面 | Spooky title font (bundled, works offline), moon, bats, cobwebs, a BOO ghost, jack-o'-lanterns, fog | 恐怖字體標題（已內建、可離線）、月亮、蝙蝠、蜘蛛網、BOO 鬼魂、南瓜燈、霧氣 |

---

## 3. How to run it / 如何執行

**EN:** First open the **Ollama** app and **Docker Desktop**, then run:
**中文：** 先打開 **Ollama** App 和 **Docker Desktop**，然後執行：

```bash
cd ~/Downloads/Hack_ECSS
docker compose up -d --build open-webui game
```

- Game / 遊戲: http://localhost:8081
- Open WebUI (chat with Gemma / 和 Gemma 聊天): http://localhost:3000 → model **phantom-architect**

**EN:** `.env` uses the native Ollama app (`OLLAMA_URL=http://host.docker.internal:11434`), so Gemma runs on the GPU.
**中文：** `.env` 使用原生 Ollama App（`OLLAMA_URL=http://host.docker.internal:11434`），讓 Gemma 跑在 GPU 上。

---

## 4. Controls / 操作

| Key / 按鍵 | EN | 中文 |
|---|---|---|
| WASD | Move | 移動 |
| Mouse / 滑鼠 | Look | 轉視角 |
| Left click / 左鍵 | Shoot | 射擊 |
| Right click / 右鍵 | Aim down sights | 瞄準 |
| R | Reload | 換彈 |
| Shift | Dash | 衝刺 |
| Space | Jump | 跳 |
| C | Crouch (hold) | 蹲下（按住） |

---

## 5. The four ways to make a level / 四種做關卡的方式

1. **Room photo / 房間照片** → FUSE WITH GEMMA (about 40 s / 約 40 秒)
2. **Floor plan / 平面圖** → choose "Floor plan" first (walls appear in under 1 s, Gemma about 40 s; instant the second time) / 先選「Floor plan」（牆壁不到 1 秒出現，Gemma 約 40 秒；第二次瞬間完成）
3. **Describe a room / 文字描述** → box 03, type what you want and press BUILD IT (about 25 s) / 03 框輸入你要的房間，按 BUILD IT（約 25 秒）
4. **Paste JSON / 貼上 JSON** → same box 03, from Open WebUI or a saved level / 同樣在 03 框，來自 Open WebUI 或存好的關卡

**Demo tips / Demo 小技巧:**
- EN: Run your demo photo or plan once before going on stage, so it loads instantly from the cache. If a floor plan's size looks wrong, type the real width in the wish box, for example `26 m`.
- 中文：上台前先把 demo 用的照片或平面圖跑一次，這樣就會從快取瞬間載入。如果平面圖的大小看起來不對，在提示框輸入實際寬度，例如 `26 m`。

---

## 6. File map / 檔案說明

| File / 檔案 | EN | 中文 |
|---|---|---|
| `game/index.html` | Start screen, HUD, upload card | 開始畫面、HUD、上傳卡片 |
| `game/main.js` | Game engine: world, player, weapon, ghosts, waves, radar | 遊戲引擎：世界、玩家、武器、鬼魂、波次、雷達 |
| `game/ghost.js` | The BOO! ghost model | BOO! 鬼魂模型 |
| `game/furniture.js` | 16 furniture models, and guessing the type from a name | 16 種家具模型，以及從名稱判斷類型 |
| `game/layout.js` | Room templates: turns Gemma's description into placed furniture | 房間範本：把 Gemma 的描述轉成擺好的家具 |
| `game/floorplan.js` | Floor-plan mode: wall detection, rooms, pathfinding | 平面圖模式：牆壁偵測、房間、路徑規劃 |
| `game/styles.js` | Visual styles (tactical, clean, night, neon) | 畫面風格（tactical、clean、night、neon） |
| `game/style.css` | Page and HUD styling | 頁面與 HUD 樣式 |
| `game/samples/*.json` | Ready-made levels (dorm, B60 lab) | 預先做好的關卡（宿舍、B60 lab） |
| `game/vendor/` | Three.js 0.186.1 and the Creepster font (offline) | Three.js 0.186.1 和 Creepster 字體（離線可用） |
| `server/server.py` | Game server and Gemma API (`/api/analyze`, photo or plan mode) | 遊戲伺服器和 Gemma API（`/api/analyze`，照片或平面圖模式） |
| `server/prompt.txt` | Gemma instructions for room photos | 給 Gemma 的房間照片指令 |
| `server/prompt_floorplan.txt` | Gemma instructions for floor plans | 給 Gemma 的平面圖指令 |
| `docker-compose.yml` | The three containers (ollama, open-webui, game) | 三個容器（ollama、open-webui、game） |
| `ollama/setup-model.sh` | Downloads Gemma 4 and creates the phantom-architect preset | 下載 Gemma 4 並建立 phantom-architect 預設模型 |
| `README.md` / `SETUP_MAC.md` | Full instructions | 完整說明 |

---

## 7. Known limits / 已知限制

- EN: Gemma takes about 40 s per image on the M4 (`e4b` model); `gemma4:12b-mlx` may be faster and more accurate, but hasn't been tested yet.
  中文：在 M4 上 Gemma 每張圖約 40 秒（`e4b` 模型）；`gemma4:12b-mlx` 可能更快也更準，但還沒測試。
- EN: Gemma sometimes miscounts furniture, or misses unlabelled areas such as a café corner on a plan.
  中文：Gemma 有時會數錯家具，或漏掉沒有標籤的區域，例如平面圖上的咖啡區角落。
- EN: Floor-plan mode was tuned on one plan; other drawing styles may need adjusting. Clean digital plans work best.
  中文：平面圖模式只在一張平面圖上調校過；其他繪圖風格可能需要調整。乾淨的數位平面圖效果最好。
- EN: Still open: a README line saying Claude helped write the code and Gemma 4 powers the gameplay, and checking whether the Gemma prize needs the Gemini API.
  中文：還沒做：在 README 加一句說明 Claude 協助撰寫程式碼、Gemma 4 驅動遊戲玩法，以及確認 Gemma 獎項是否需要使用 Gemini API。
