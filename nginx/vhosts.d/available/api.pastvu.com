server {
	listen		144.76.69.116:80;

	server_name	api.pastvu.com;

	limit_conn	gulag 100;

	root /var/www/api.pastvu.com/app/public;

	charset         utf-8;
        etag            off;

#	access_log   /var/log/nginx/api.pastvu.com-acc  main;
	access_log   off;
	error_log    /var/log/nginx/api.pastvu.com-err  crit;



	include /etc/nginx/bad_user_agent;


	location = /robots.txt {
		allow all;
		log_not_found off;
		access_log off;
	}

	location / {
		error_page  404  /views/html/status/404.html;

		try_files $uri appMain.html @proxy;
	}


	location @proxy {
		proxy_next_upstream error timeout http_500 http_502 http_503 http_504;

		proxy_redirect off;
		proxy_set_header   X-Real-IP           $remote_addr;
		proxy_set_header   X-Forwarded-For     $remote_addr; #$proxy_add_x_forwarded_for;
		proxy_set_header   X-Forwarded-Proto   $scheme;
		proxy_set_header   Host                $http_host;
		proxy_set_header   X-NginX-Proxy       true;

		proxy_http_version 1.1;
		proxy_set_header   Upgrade             $http_upgrade;
		proxy_set_header   Connection          $connection_upgrade;

		proxy_pass http://backend_api_nodejs;
	}
}
