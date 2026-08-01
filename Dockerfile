FROM python:3.11-slim

WORKDIR /app

RUN pip install --no-cache-dir flask flask-cors

COPY socks5_server.py /app/
COPY server.py /app/

CMD ["python", "server.py"]
