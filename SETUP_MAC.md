# Mac setup, step by step (Apple Silicon, 16 GB)

Do steps 1 to 4 while you still have good Wi-Fi. After that everything works offline.

## 1. Install Docker Desktop
1. Go to docker.com, Products > Docker Desktop, click **Download for Mac - Apple Silicon** (not Intel).
2. Open the `.dmg`, drag Docker to Applications, open it.
3. Choose **Use recommended settings**, then skip sign-in (you do not need an account).
4. Docker Desktop > Settings (gear) > **Resources**: set **Memory** to **10 GB**, click **Apply & restart**.

Check in Terminal: `docker --version`

## 2. Get the code
```bash
cd ~/Desktop
git clone https://github.com/dunja-g/Hack_ECSS.git
cd Hack_ECSS
cp .env.example .env
```

## 3. Start the three containers
```bash
docker compose up -d --build
docker compose ps        # ollama, open-webui and game should say "running"
```
First run downloads the images (Open WebUI is the big one, a few GB).

## 4. Download Gemma 4 into the Ollama container
```bash
docker compose exec ollama sh /setup/setup-model.sh
```
This pulls `gemma4:e4b-it-qat` (about 6 GB) and creates the `phantom-architect` preset.

## 5. Play
- Game: http://localhost:8081 (green dot = Gemma ready)
- Open WebUI: http://localhost:3000 > model dropdown > **phantom-architect** > attach a photo with the paperclip > send.

## If Gemma is too slow (over about 2 minutes per photo)
Docker on a Mac cannot use the GPU. Switch Gemma to the native Ollama app:
1. Download Ollama for macOS from ollama.com, open it (llama icon appears in the menu bar).
2. `docker compose stop ollama`
3. Edit `.env`: `OLLAMA_URL=http://host.docker.internal:11434`
4. Optional, better quality: `GEMMA_MODEL=gemma4:12b-mlx`
5. ```bash
   sh ollama/setup-model.sh
   docker compose up -d --build open-webui game
   ```

## Useful commands
```bash
docker compose logs -f game      # see Gemma requests and errors
docker compose restart game      # after editing server/ files (game/ edits only need a browser refresh)
docker compose down              # stop everything (models are kept)
```

## Troubleshooting
| Problem | Fix |
|---|---|
| Red dot "Gemma offline" | `docker compose ps`; is ollama running? Check `OLLAMA_URL` in `.env` |
| "model is not downloaded yet" | Run step 4 again, or the model name in `.env` is different from the one pulled |
| iPhone photo will not load | AirDrop it to the Mac and open in Safari, or export as JPG |
| Game laggy | Use http://localhost:8081/?lowfx |
| Port already in use | Another app uses 3000/8081/11434. Quit it, or change the left number in `docker-compose.yml` |
