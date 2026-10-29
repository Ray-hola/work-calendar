# Work Calendar in one small image: the standard-library server and the three
# front-end files. Everything it writes lives in /app/data; mount it as a volume.
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    WORK_CALENDAR_HOST=0.0.0.0 \
    WORK_CALENDAR_PORT=4173 \
    WORK_CALENDAR_DB=/app/data/work-calendar.sqlite3

WORKDIR /app

# The server needs no packages; tzdata supplies Asia/Shanghai, which slim images leave out.
RUN pip install --no-cache-dir tzdata

COPY server.py app.js index.html styles.css ./

EXPOSE 4173
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:4173/api/health', timeout=4)"

CMD ["python", "server.py"]
