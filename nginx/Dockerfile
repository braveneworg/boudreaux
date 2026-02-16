FROM nginx:alpine

# Setup nginx config in a single layer
RUN rm -f /etc/nginx/conf.d/default.conf \
    && rm -rf /etc/nginx/sites-enabled /etc/nginx/sites-available \
    && mkdir -p /etc/nginx/sites-enabled /etc/nginx/sites-available

COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY ./nginx/nginx.conf /etc/nginx/sites-available/website
RUN ln -s /etc/nginx/sites-available/website /etc/nginx/sites-enabled/

EXPOSE 80 443

CMD ["nginx", "-g", "daemon off;"]
