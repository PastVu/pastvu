/*global define*/
define(function () {
	'use strict';

	return {
		load: function (name, req, onLoad, config) {
			if (config.isBuild) {
				onLoad(null); //avoid errors on the optimizer
				return;
			}

			req(['underscore', 'socket.io', 'Utils', 'Params', 'knockout', 'knockout.mapping'], function (_, io, Utils, P, ko, ko_mapping) {
				var connectionType = '',
					s = io.connect(location.host);

				s.on('connect', function () {
					console.log('Connected with ' + connectionType);

					s.on('updateCookie', updateCookie);
				});

				s.on('connecting', function (type) {
					connectionType = type;
				});

				s.on('disconnect', function () {
					console.log('Disconnected');
				});

				s.once('initData', function (data) {
					if (!data || !Utils.isType('object', data.p)) {
						console.log('initData recieve error!');
						return;
					}

					//Принимаем настройки и в случае наличия поддоменов формируем их массив
					ko_mapping.fromJS({settings: data.p}, P);
					if (P.settings.server.subdomains() && P.settings.server.subdomains().length) {
						P.settings.server.subdomains(_.shuffle(P.settings.server.subdomains()));
						P.preaddrs = P.settings.server.subdomains().map(function (sub) {
							return 'http://' + sub + '.' + location.host;
						});
						P.preaddr = P.preaddrs[0];
					} else {
						P.preaddrs = [];
						P.preaddr = '';
					}

					//Принимаем своего пользователя
					if (Utils.isType('object', data.u)) {
						P.iAm = data.u;
					}

					//Устанавливаем куки
					if (Utils.isType('object', data.cook)) {
						updateCookie(data.cook);
					}

					onLoad(s);
				});

				function updateCookie(obj) {
					console.log('updateCookie');
					Utils.cookie.setItem(obj.name, obj.key, obj['max-age'], '/', null);
				}
			});
		}
	};
});