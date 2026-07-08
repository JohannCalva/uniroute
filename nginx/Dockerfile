FROM nginx:alpine

# Certificado autofirmado para desarrollo/demo (TLS — S3).
# openssl viene disponible en la imagen alpine; lo instalamos explícitamente por si acaso.
RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/ssl \
 && openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/selfsigned.key \
      -out /etc/nginx/ssl/selfsigned.crt \
      -subj "/CN=uniroute.local"

COPY nginx.conf /etc/nginx/nginx.conf
