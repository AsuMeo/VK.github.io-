#!/usr/bin/env python3
"""
Упрощённый MTProto proxy сервер.
Принимает MTProto handshake и проксирует трафик на Telegram DC.
"""
import asyncio
import struct
import socket
import hashlib
import secrets
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mtproto")

# Telegram DC addresses (IPv4)
TELEGRAM_DCS = [
    ("149.154.175.50", 443),   # DC1
    ("149.154.167.51", 443),   # DC2
    ("149.154.175.100", 443),  # DC3
    ("149.154.167.91", 443),   # DC4
    ("91.108.56.130", 443),    # DC5
]

class MTProtoProxy:
    def __init__(self, secret: bytes, port: int = 8443):
        self.secret = secret
        self.port = port
        self.dc_index = 0

    def get_dc(self):
        dc = TELEGRAM_DCS[self.dc_index % len(TELEGRAM_DCS)]
        self.dc_index += 1
        return dc

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        client_addr = writer.get_extra_info('peername')
        logger.info(f"New connection from {client_addr}")

        try:
            # Читаем первые 64 байта (handshake)
            handshake = await reader.read(64)
            if len(handshake) != 64:
                logger.warning(f"Invalid handshake length: {len(handshake)}")
                writer.close()
                await writer.wait_closed()
                return

            # Проверяем secret
            # MTProto handshake: 56 байт random + 8 байт hash
            # Для простоты — проксируем всё на Telegram DC

            # Подключаемся к Telegram DC
            dc_host, dc_port = self.get_dc()
            dc_reader, dc_writer = await asyncio.open_connection(dc_host, dc_port)
            logger.info(f"Connected to DC {dc_host}:{dc_port}")

            # Отправляем handshake на DC
            dc_writer.write(handshake)
            await dc_writer.drain()

            # Проксируем трафик в обе стороны
            async def pipe(src, dst, name):
                try:
                    while True:
                        data = await src.read(8192)
                        if not data:
                            break
                        dst.write(data)
                        await dst.drain()
                except asyncio.CancelledError:
                    pass
                except Exception as e:
                    logger.debug(f"{name} pipe error: {e}")

            task1 = asyncio.create_task(pipe(reader, dc_writer, "client->dc"))
            task2 = asyncio.create_task(pipe(dc_reader, writer, "dc->client"))

            done, pending = await asyncio.wait(
                [task1, task2], return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                task.cancel()

        except Exception as e:
            logger.error(f"Error handling client: {e}")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except:
                pass
            try:
                dc_writer.close()
                await dc_writer.wait_closed()
            except:
                pass
            logger.info(f"Connection closed: {client_addr}")

    async def start(self):
        server = await asyncio.start_server(
            self.handle_client, '0.0.0.0', self.port
        )
        logger.info(f"MTProto proxy started on 0.0.0.0:{self.port}")
        logger.info(f"Secret: {self.secret.hex()}")

        async with server:
            await server.serve_forever()


def generate_secret() -> bytes:
    """Генерирует 16-байтный secret для MTProto."""
    return secrets.token_bytes(16)


if __name__ == "__main__":
    import os

    # Получаем secret из env или генерируем
    secret_hex = os.environ.get("SECRET", "")
    if secret_hex:
        secret = bytes.fromhex(secret_hex)
    else:
        secret = generate_secret()
        logger.info(f"Generated new secret: {secret.hex()}")

    port = int(os.environ.get("PORT", "8443"))

    proxy = MTProtoProxy(secret, port)
    asyncio.run(proxy.start())
