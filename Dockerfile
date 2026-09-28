# syntax = docker/dockerfile:1

# A placeholder, and yours to replace: it serves one page, plus README.md
# verbatim at /readme/, which is enough to prove the deploy path end to end.
# Whatever your app is built with, the image that replaces this one must serve
# HTTP on 0.0.0.0:$PORT (fly.toml sets PORT) and publish README.md at /readme/
# (spec/README.md says what's checked).

FROM docker.io/library/busybox:1.38.0
COPY placeholder/ /src/
COPY README.md /src/
# README.md goes into the page as-is, HTML-escaped, in place of @README@;
# rendering it properly is your app's job
RUN mkdir -p /site/readme \
    && cp /src/index.html /site/ \
    && sed 's/&/\&amp;/g; s/</\&lt;/g; s/>/\&gt;/g' /src/README.md > /src/body \
    && sed -e '/@README@/{r /src/body' -e 'd}' /src/readme.html > /site/readme/index.html
CMD ["sh", "-c", "exec httpd -f -p 0.0.0.0:${PORT:-8080} -h /site"]
