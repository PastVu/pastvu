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
					s = io.connect(location.host, {
						'reconnection delay': 1000, //Изначальный интервал (в мс) между попытками реконнекта браузера, каждый следующий растет экспоненциально
						'reconnection limit': 15000, //Максимальный интервал (в мс) между попытками реконнекта браузера, до него дорастет предыдущий параметр
						'max reconnection attempts': 20 //Максимальное колво попыток реконнекта браузера, после которого будет вызванно событие reconnect_failed
					});

				s.on('error', function (reason){
					console.log('Unable to connect socket: ', reason);
				});
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

				s.once('connectData', recieveConnectDataFirst);

				function recieveConnectDataFirst(data) {
					if (!data || !Utils.isType('object', data.p)) {
						console.log('First connectData recieve error!');
						return;
					}

					//Принимаем настройки
					updateParams(data.p);

					//Принимаем своего пользователя
					if (Utils.isType('object', data.u)) {
						P.iAm = data.u;
					}

					//Устанавливаем куки
					if (Utils.isType('object', data.cook)) {
						updateCookie(data.cook);
					}

					s.on('connectData', recieveConnectDataFurther);

					onLoad(s);
				}

				//Обработчик получения данных после повторных коннектов
				function recieveConnectDataFurther(data) {
					if (!data || !Utils.isType('object', data.p)) {
						console.log('connectData recieve error!');
						return;
					}

					//Обновляем настройки
					updateParams(data.p);

					//Обновляем куки
					if (Utils.isType('object', data.cook)) {
						updateCookie(data.cook);
					}
				}

				//Обновляем настройки и в случае наличия поддоменов формируем их массив
				function updateParams(p) {
					ko_mapping.fromJS({settings: p}, P);
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
				}

				function updateCookie(obj) {
					Utils.cookie.setItem(obj.name, obj.key, obj['max-age'], '/', null);
				}
			});
		}
	};
});