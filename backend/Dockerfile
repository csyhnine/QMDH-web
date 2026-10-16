FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

ARG DEBIAN_MIRROR=
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|$DEBIAN_MIRROR|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update \
    && apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# Aliyun ECS often cannot reach pypi.org reliably during cold builds.
RUN pip install --no-cache-dir \
    -i https://mirrors.aliyun.com/pypi/simple/ \
    --trusted-host mirrors.aliyun.com \
    -r requirements.txt

# Optional official Linux ODA package, supplied outside Git by the deployer.
ARG CAD_ODA_PACKAGE=
ARG CAD_ODA_SHA256=
COPY vendor/oda/ /tmp/qmdh-oda/
RUN if [ -n "$CAD_ODA_PACKAGE" ]; then \
      test -n "$CAD_ODA_SHA256" \
      && echo "$CAD_ODA_SHA256  /tmp/qmdh-oda/$CAD_ODA_PACKAGE" | sha256sum -c - \
      && apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 update \
      && apt-get -o Acquire::Retries=2 -o Acquire::http::Timeout=30 install -y --no-install-recommends \
         xvfb xauth libxcb-cursor0 libxcb-icccm4 libxcb-image0 libxcb-keysyms1 \
         libxcb-render-util0 libxcb-xinerama0 libxcb-util1 libxkbcommon-x11-0 \
         libgl1 libegl1 libdbus-1-3 /tmp/qmdh-oda/"$CAD_ODA_PACKAGE" \
      && if [ ! -e /usr/lib/x86_64-linux-gnu/libxcb-util.so.0 ]; then \
           ln -s libxcb-util.so.1 /usr/lib/x86_64-linux-gnu/libxcb-util.so.0; \
         fi; \
    fi \
    && rm -rf /tmp/qmdh-oda /var/lib/apt/lists/*

COPY alembic.ini ./
COPY migrations ./migrations
COPY app ./app
COPY seed_users.py ./
COPY README.md ./

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
