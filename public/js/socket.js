/*global define*/
define(['module'], function (module) {
	'use strict';

	function getConsoleTime() {
		return new Date().toLocaleTimeString();
	}

	return {
		load: function (name, req, onLoad, config) {
			if (config.isBuild) {
				onLoad(null); //avoid errors on the optimizer
				return;
			}

			req(['underscore', 'socket.io', 'Utils', 'Params', 'knockout', 'knockout.mapping'], function (_, io, Utils, P, ko, ko_mapping) {
				var socket = io(location.host, {
					reconnectionDelay: 800,  //Изначальный интервал (в мс) между попытками реконнекта браузера, каждый следующий растет экспоненциально
					reconnectionDelayMax: 10000, //Максимальный интервал (в мс) между попытками реконнекта браузера, до него дорастет предыдущий параметр
					reconnectionAttempts: 5 ////Максимальное колво попыток реконнекта браузера, после которого будет вызванно событие reconnect_failed
				});

				socket.on('error', function (reason) {
					console.log(getConsoleTime(), 'Unable to connect socket: ', reason);
				});
				socket.on('connect', function () {
					console.log(getConsoleTime(), 'Connected to server');
					socket.on('updateCookie', updateCookie);
				});
				socket.on('disconnect', function () {
					console.log(getConsoleTime(), 'Disconnected from server ');
				});
				socket.on('reconnecting', function (attempt) {
					console.log('%s Trying to reconnect to server %d time', getConsoleTime(), attempt);
				});
				socket.on('reconnect_failed', function (attempt) {
					console.log('%s Failed to reconnect for %d attempts. Stopped trying', getConsoleTime(), socket.io.reconnectionAttempts());
				});

				socket.once('connectData', receiveConnectDataFirst);
				function receiveConnectDataFirst(data) {
					if (!data || !Utils.isType('object', data.p)) {
						console.log(getConsoleTime(), 'First connectData receive error!');
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

					socket.on('connectData', receiveConnectDataFurther);

					onLoad(socket);
				}

				//Обработчик получения данных после повторных коннектов
				function receiveConnectDataFurther(data) {
					if (!data || !Utils.isType('object', data.p)) {
						console.log(getConsoleTime(), 'Further connectData receive error!');
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
							return (location.protocol || 'http:') + '//' + sub + '.' + location.host;
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