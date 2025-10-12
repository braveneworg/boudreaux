FROM nginx:lts-alpine

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Copy custom nginx config
COPY ./nginx/nginx.conf /etc/nginx/conf.d/default.conf

RUN rm -rf /etc/nginx/sites-enabled/website
RUN rm -rf /etc/nginx/sites-available/website

RUN mkdir -p /etc/nginx/sites-enabled
RUN mkdir -p /etc/nginx/sites-available

COPY ./nginx/nginx.conf /etc/nginx/sites-available/website
RUN ln -s /etc/nginx/sites-available/website /etc/nginx/sites-enabled/

# Expose ports
EXPOSE 80 443

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
