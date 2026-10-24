FROM python:3.12-slim
WORKDIR /app
COPY server/ /app/server/
COPY game/ /app/game/
ENV GAME_DIR=/app/game PORT=8081 PYTHONUNBUFFERED=1
EXPOSE 8081
CMD ["python", "/app/server/server.py"]
