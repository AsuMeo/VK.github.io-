#!/usr/bin/env python3
"""
Flask API + SOCKS5 proxy для Render.
SOCKS5 работает на порту из PORT (Render).
Flask API работает на порту PORT+1 (внутренний).
"""
import os
import threading
import asyncio
from flask import Flask, jsonify
from flask_cors import CORS
from socks5_server import SOCKS5Proxy

app = Flask(__name__)
CORS(app)

proxy_info = {}


def run_socks5(port, username, password):
    """Запускает SOCKS5 в отдельном потоке."""
    proxy = SOCKS5Proxy(port=port, username=username, password=password)
    asyncio.run(proxy.start())


@app.route("/")
def index():
    return jsonify({
        "status": "ok",
        "service": "SOCKS5 Proxy",
        "endpoints": ["/info", "/health"]
    })


@app.route("/info")
def info():
    """Возвращает данные для подключения."""
    if not proxy_info:
        return jsonify({"error": "Proxy not ready"}), 500
    return jsonify(proxy_info)


@app.route("/health")
def health():
    return jsonify({"status": "ok"})


def init_proxy():
    """Инициализация proxy."""
    global proxy_info

    # Render даёт PORT для внешнего доступа — используем его для SOCKS5
    socks5_port = int(os.environ.get("PORT", "10000"))
    # Flask API на внутреннем порту (Render не проксирует его наружу, но для логов ок)
    flask_port = socks5_port + 1

    username = os.environ.get("PROXY_USER", "user")
    password = os.environ.get("PROXY_PASS", "pass123")
    host = os.environ.get("RENDER_EXTERNAL_HOSTNAME", "localhost")

    proxy_info = {
        "type": "socks5",
        "server": host,
        "port": socks5_port,
        "username": username,
        "password": password,
        "auth_required": bool(username and password)
    }

    print("=" * 50)
    print("SOCKS5 PROXY")
    print(f"Server: {host}")
    print(f"SOCKS5 Port: {socks5_port}")
    print(f"Username: {username}")
    print(f"Password: {password}")
    print("=" * 50)

    # Запускаем SOCKS5 в отдельном потоке
    proxy_thread = threading.Thread(
        target=run_socks5,
        args=(socks5_port, username, password),
        daemon=True
    )
    proxy_thread.start()

    return flask_port


if __name__ == "__main__":
    flask_port = init_proxy()
    # Flask на внутреннем порту (не конфликтует с SOCKS5)
    app.run(host="0.0.0.0", port=flask_port)
