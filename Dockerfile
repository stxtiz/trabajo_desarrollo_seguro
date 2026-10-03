FROM php:8.3-apache

RUN apt-get update && apt-get install -y \
    libonig-dev \
    && docker-php-ext-install mysqli pdo pdo_mysql mbstring \
    && a2enmod rewrite