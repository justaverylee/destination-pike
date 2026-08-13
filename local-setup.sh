docker network create wordpress-network
docker volume create --name mariadb_data
docker volume create --name wordpress_data

docker run -d --name mariadb \
  --env ALLOW_EMPTY_PASSWORD=yes \
  --env MARIADB_USER=bn_wordpress \
  --env MARIADB_PASSWORD=bitnami \
  --env MARIADB_DATABASE=bitnami_wordpress \
  --network wordpress-network \
  --volume mariadb_data:/bitnami/mariadb \
  bitnami/mariadb:latest

docker run -d --name wordpress \
  -p 80:80 --pull always \
  --network wordpress-network \
  --env WORDPRESS_DB_HOST=mariadb \
  --env WORDPRESS_DB_USER=bn_wordpress \
  --env WORDPRESS_DB_PASSWORD=bitnami \
  --env WORDPRESS_DB_NAME=bitnami_wordpress \
  --env WP_SITEURL=http://localhost \
  --env TMPDIR=/var/www/html/wp-content/tmp/ \
  -v /Users/zggz/Desktop/destination-pike-shared/wp-content/:/var/www/html/wp-content \
  wordpress:latest

# username is now user
# password is not bitnami
# login at localhost:8080/wp-admin