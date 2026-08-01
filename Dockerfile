FROM telegrammessenger/proxy:latest

# Render использует порт из переменной окружения
ENV PORT=8443

# Открываем порт
EXPOSE 8443

# Запуск с нашим портом
CMD ["-p", "8443"]
