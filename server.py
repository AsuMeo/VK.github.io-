#!/usr/bin/env python3
"""
Flask сервер для MTProto proxy на Render.
Запускает MTProto proxy и предоставляет HTTP API для получения данных.
"""
import os
import threading
import asyncio
from flask import Flask, jsonify
from flask_cors import CORS
from mtproto_server import MTProtoProxy, generate_secret

app = Flask(__name__)
CORS(app)

# Глобальные переменные
proxy_secret = None
proxy_port = None
proxy_host = None


def run_proxy(secret: bytes, port: int):
    """Запускает MTProto proxy в отдельном потоке."""
    proxy = MTProtoProxy(secret, port)
    asyncio.run(proxy.start())


@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "service": "MTProto Proxy",
        "endpoints": ["/info", "/health"]
    })


@app.route("/info")
def info():
    """Возвращает данные для подключения к прокси."""
    global proxy_secret, proxy_port, proxy_host

    if not proxy_secret:
        return jsonify({"error": "Proxy not initialized"}), 500

    # Формируем ссылку для Telegram
    secret_hex = proxy_secret.hex()
    server = proxy_host or "localhost"

    # MTProto ссылка
    tg_link = f"tg://proxy?server={server}&port={proxy_port}&secret=dd{secret_hex}"
    web_link = f"https://t.me/proxy?server={server}&port={proxy_port}&secret=dd{secret_hex}"

    return jsonify({
        "status": "online",
        "server": server,
        "port": proxy_port,
        "secret": secret_hex,
        "tg_link": tg_link,
        "web_link": web_link,
        "mtproto_link": f"https://t.me/proxy?server={server}&port={proxy_port}&secret=dd{secret_hex}"
    })


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


def init_proxy():
    """Инициализация proxy при старте."""
    global proxy_secret, proxy_port, proxy_host

    # Получаем настройки из env
    secret_hex = os.environ.get("SECRET", "")
    if secret_hex:
        proxy_secret = bytes.fromhex(secret_hex)
    else:
        proxy_secret = generate_secret()
        print(f"Generated secret: {proxy_secret.hex()}")

    proxy_port = int(os.environ.get("PORT", "8443"))
    proxy_host = os.environ.get("RENDER_EXTERNAL_HOSTNAME", os.environ.get("HOST", "localhost"))

    print(f"=== MTProto Proxy ===")
    print(f"Server: {proxy_host}")
    print(f"Port: {proxy_port}")
    print(f"Secret: dd{proxy_secret.hex()}")
    print(f"Link: https://t.me/proxy?server={proxy_host}&port={proxy_port}&secret=dd{proxy_secret.hex()}")
    print("====================")

    # Запускаем proxy в отдельном потоке
    proxy_thread = threading.Thread(
        target=run_proxy,
        args=(proxy_secret, proxy_port),
        daemon=True
    )
    proxy_thread.start()


if __name__ == "__main__":
    init_proxy()
    app.run(host="0.0.0.0", port=10000)
