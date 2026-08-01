#!/usr/bin/env python3
"""
SOCKS5 прокси сервер для Render.
Поддерживает аутентификацию (логин/пароль) или без неё.
"""
import asyncio
import socket
import struct
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
logger = logging.getLogger("socks5")


class SOCKS5Proxy:
    def __init__(self, host="0.0.0.0", port=1080, username=None, password=None):
        self.host = host
        self.port = port
        self.username = username
        self.password = password
        self.auth_required = bool(username and password)

    async def handle_client(self, reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
        client_addr = writer.get_extra_info("peername")
        logger.info(f"New connection from {client_addr}")

        try:
            # 1. Приветствие от клиента
            # VER NMETHODS METHODS[]
            data = await reader.read(2)
            if len(data) < 2:
                writer.close()
                return

            ver, nmethods = struct.unpack("!BB", data)
            if ver != 5:
                writer.close()
                return

            methods = await reader.read(nmethods)

            # 2. Выбираем метод аутентификации
            if self.auth_required and 0x02 in methods:
                # Username/password auth
                writer.write(struct.pack("!BB", 5, 0x02))
                await writer.drain()

                # 3. Аутентификация
                auth_data = await reader.read(2)
                if len(auth_data) < 2:
                    writer.close()
                    return

                auth_ver, ulen = struct.unpack("!BB", auth_data)
                username = (await reader.read(ulen)).decode("utf-8")
                plen = (await reader.read(1))[0]
                password = (await reader.read(plen)).decode("utf-8")

                if username == self.username and password == self.password:
                    writer.write(struct.pack("!BB", 1, 0x00))  # Success
                else:
                    writer.write(struct.pack("!BB", 1, 0x01))  # Failure
                    await writer.drain()
                    writer.close()
                    return

            elif not self.auth_required and 0x00 in methods:
                # No auth
                writer.write(struct.pack("!BB", 5, 0x00))
            else:
                writer.write(struct.pack("!BB", 5, 0xFF))  # No acceptable method
                await writer.drain()
                writer.close()
                return

            await writer.drain()

            # 4. Запрос подключения
            # VER CMD RSV ATYP DST.ADDR DST.PORT
            req = await reader.read(4)
            if len(req) < 4:
                writer.close()
                return

            ver, cmd, rsv, atyp = struct.unpack("!BBBB", req)

            if atyp == 0x01:  # IPv4
                addr = socket.inet_ntoa(await reader.read(4))
            elif atyp == 0x03:  # Domain
                domain_len = (await reader.read(1))[0]
                addr = (await reader.read(domain_len)).decode("utf-8")
            elif atyp == 0x04:  # IPv6
                addr = socket.inet_ntop(socket.AF_INET6, await reader.read(16))
            else:
                writer.write(struct.pack("!BBBBIH", 5, 0x08, 0, 1, 0, 0))
                await writer.drain()
                writer.close()
                return

            port = struct.unpack("!H", await reader.read(2))[0]

            if cmd != 0x01:  # Only CONNECT supported
                writer.write(struct.pack("!BBBBIH", 5, 0x07, 0, 1, 0, 0))
                await writer.drain()
                writer.close()
                return

            # 5. Подключаемся к целевому серверу
            try:
                if atyp == 0x03:
                    # Resolve domain
                    addr_info = await asyncio.get_event_loop().getaddrinfo(
                        addr, port, family=socket.AF_INET, type=socket.SOCK_STREAM
                    )
                    target_host, target_port = addr_info[0][4]
                else:
                    target_host, target_port = addr, port

                target_reader, target_writer = await asyncio.open_connection(
                    target_host, target_port
                )
                logger.info(f"Connected to {addr}:{port}")

                # Отправляем успешный ответ
                bind_addr = writer.get_extra_info("sockname")
                writer.write(struct.pack("!BBBB", 5, 0x00, 0, 0x01))
                writer.write(socket.inet_aton(bind_addr[0]))
                writer.write(struct.pack("!H", bind_addr[1]))
                await writer.drain()

            except Exception as e:
                logger.error(f"Connection failed: {e}")
                writer.write(struct.pack("!BBBBIH", 5, 0x05, 0, 1, 0, 0))
                await writer.drain()
                writer.close()
                return

            # 6. Проксируем трафик
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
                    logger.debug(f"{name} error: {e}")

            task1 = asyncio.create_task(pipe(reader, target_writer, "client->target"))
            task2 = asyncio.create_task(pipe(target_reader, writer, "target->client"))

            done, pending = await asyncio.wait(
                [task1, task2], return_when=asyncio.FIRST_COMPLETED
            )

            for task in pending:
                task.cancel()

            target_writer.close()
            try:
                await target_writer.wait_closed()
            except:
                pass

        except Exception as e:
            logger.error(f"Error: {e}")
        finally:
            writer.close()
            try:
                await writer.wait_closed()
            except:
                pass
            logger.info(f"Connection closed: {client_addr}")

    async def start(self):
        server = await asyncio.start_server(
            self.handle_client, self.host, self.port
        )
        logger.info(f"SOCKS5 proxy started on {self.host}:{self.port}")
        if self.auth_required:
            logger.info(f"Auth: {self.username}:{self.password}")
        else:
            logger.info("Auth: none")

        async with server:
            await server.serve_forever()


if __name__ == "__main__":
    import os

    port = int(os.environ.get("PORT", "1080"))
    username = os.environ.get("PROXY_USER", "")
    password = os.environ.get("PROXY_PASS", "")

    proxy = SOCKS5Proxy(port=port, username=username, password=password)
    asyncio.run(proxy.start())
