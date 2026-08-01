FROM python:3.11-slim

WORKDIR /app

# Установка зависимостей
RUN apt-get update && apt-get install -y --no-install-recommends     gcc     libffi-dev     && rm -rf /var/lib/apt/lists/*

# Python зависимости
RUN pip install --no-cache-dir     cryptography     aiohttp     python-socks[asyncio]

# Копируем код
COPY mtproto_server.py /app/
COPY server.py /app/

# Порт
EXPOSE 8443

# Запуск
CMD ["python", "server.py"]

