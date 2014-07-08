define(['module'], function (module) {
	'use strict';

	return {
		load: function (name, req, onLoad, config) {
			if (config.isBuild) {
				onLoad(null); //avoid errors on the optimizer
				return;
			}

			req(['underscore', 'socket.io', 'Utils', 'Params', 'knockout', 'knockout.mapping'], function (_, io, Utils, P, ko, ko_mapping) {
				var moduleLoaded, //Флаг первоначального коннекта для вызова события загрузки модуля
					connectPath = location.host,
					connectOptions = {
						reconnectionDelay: 800,  //Изначальный интервал (в мс) между попытками реконнекта браузера, каждый следующий растет экспоненциально
						reconnectionDelayMax: 7000, //Максимальный интервал (в мс) между попытками реконнекта браузера, до него дорастет предыдущий параметр
						reconnectionAttempts: 150 //Максимальное колво попыток реконнекта браузера, после которого будет вызванно событие reconnect_failed
					},
					sio = io(connectPath, connectOptions),
					socket = {connected: false, ons: {}},

					disconnectionDataReturn = {error: true, message: 'Connection lost', noconnect: true},
					noСonnWait = '<div class="noconn"><div class="inn">Нет соединения с сервером, пробую подключиться.. После восстановления связи сообщение пропадет автоматически</div></div>',
					noСonnFail = '<div class="noconn fail"><div class="inn">Не удалось автоматически подключиться к серверу. <span class="repeat">Продолжать попытки</span></div></div>',
					$noСonnWait,
					$noСonnFail;

				sio.on('error', function (reason) {
					console.log('Unable to connect socket: ', reason);
				});
				sio.on('connect', function () {
					if (!moduleLoaded) {
						console.log('Connected to server');
						socket.connected = true;
						moduleLoaded = true;
						onLoad(socket);
					}
				});

				sio.on('disconnect', function () {
					console.log('Disconnected from server ');
					socket.connected = false;
					disconnectionAllNotyfy();
				});
				sio.on('reconnecting', function (attempt) {
					console.log('Trying to reconnect to server %d time', attempt);
					if (attempt > 1) {
						noConnWaitShow();
					}
				});
				sio.on('reconnect_failed', function (attempt) {
					noConnWaitHide();
					noConnFailShow();
					console.log('Failed to reconnect for %d attempts. Stopped trying', sio.io.reconnectionAttempts());
				});
				sio.on('reconnect', function () {
					console.log('ReConnected to server');
					socket.connected = true;
					sio.emit('giveInitData', location.pathname); //После реконнекта заново запрашиваем initData
					noConnWaitHide();
				});

				sio.on('updateCookie', updateCookie);
				sio.on('takeInitData', function (data) {
					if (!data || data.error) {
						console.log('takeInitData receive error!', data.error);
						return;
					}

					//Обновляем настройки
					P.updateSettings(data.p);

					//Обновляем куки
					if (Utils.isType('object', data.cook)) {
						updateCookie(data.cook);
					}
				});

				setTimeout(function () {
					sio.io.disconnect();
					setTimeout(function () {
						sio.io.maybeReconnectOnOpen();
					}, 4000);
				}, 2000);

				socket.emit = function (name, data) {
					//Если соединения нет, возращаем коллбэку ошибку через timeout
					if (!socket.connected) {
						setTimeout(function () {
							eventHandlersNotify(name, disconnectionDataReturn);
						}, 4);
						return false;
					}
					sio.emit(name, data);
				};
				socket.on = function (name, cb, ctx) {
					eventHandlerRegister('on', name, cb, ctx);
				};
				socket.once = function (name, cb, ctx) {
					eventHandlerRegister('once', name, cb, ctx);
				};
				socket.off = function (name, cb) {
					var nameStack = socket.ons[name],
						item,
						i;
					if (!Array.isArray(nameStack)) {
						return false;
					}
					for (i = 0; i < nameStack.length; i++) {
						item = nameStack[i];
						//Если коллбека не передано, то удаляем все. Если передан, то только его
						if (!cb || cb === item.cb) {
							nameStack.splice(i--, 1);
						}
					}
					//Если обработчиков не осталось, удаляем подписку на событие sio
					if (!nameStack.length) {
						sio.removeAllListeners(name);
						delete socket.ons[name];
					}
					return true;
				};

				//Добавляем обработчик события
				//Если его еще нет в хеше, создаем в нем стек по имени и вешаем событие на sio
				function eventHandlerRegister(type, name, cb, ctx) {
					var nameStack = socket.ons[name],
						stackRecord = {type: type, name: name, cb: cb, ctx: ctx};
					if (Array.isArray(nameStack)) {
						nameStack.push(stackRecord);
					} else {
						socket.ons[name] = [stackRecord];
						sio.on(name, function (data) {
							eventHandlersNotify(name, data);
						});
					}
				}

				//Вызывает обработчики события с переданными данными
				//Если обработчик установлен как once, удаляет его из стека после вызова
				//Если обработчиков после вызова не осталось, удаляем событие из хэша и отписываемся от sio
				function eventHandlersNotify(name, data) {
					var nameStack = socket.ons[name],
						item,
						i;
					if (Array.isArray(nameStack)) {
						for (i = 0; i < nameStack.length; i++) {
							item = nameStack[i];
							item.cb.call(item.ctx, data);
							//Если это once, удаляем из стека после вызова коллбэка
							if (item.type === 'once') {
								nameStack.splice(i--, 1);
							}
						}
						//Если обработчиков не осталось, удаляем подписку на событие sio
						if (!nameStack.length) {
							sio.removeAllListeners(name);
							delete socket.ons[name];
						}
					}
				}

				//В случае разрыва соединения оповещает все подписанные на все события обработчики
				function disconnectionAllNotyfy() {
					for (var name in socket.ons) {
						if (socket.ons.hasOwnProperty(name)) {
							eventHandlersNotify(name, disconnectionDataReturn);
						}
					}
				}

				function noConnWaitShow() {
					if (!$noСonnWait) {
						$noСonnWait = $(noСonnWait).appendTo('#top');
					}
				}

				function noConnWaitHide() {
					if ($noСonnWait) {
						$noСonnWait.remove();
						$noСonnWait = null;
					}
				}

				function noConnRepeat() {
					noConnFailHide();
					noConnWaitShow();
					sio.io.attempts = 0; //Вручную сбрасываем попытки
					sio.io.reconnect(); //Вызываем реконнекты
				}

				function noConnFailShow() {
					if (!$noСonnFail) {
						$noСonnFail = $(noСonnFail);
						$('.repeat', $noСonnFail).on('click', noConnRepeat);
						$noСonnFail.appendTo('#top');
					}
				}

				function noConnFailHide() {
					if ($noСonnFail) {
						$noСonnFail.remove();
						$noСonnFail = null;
					}
				}

				function updateCookie(obj) {
					Utils.cookie.setItem(obj.key, obj.value, obj['max-age'], obj.path, obj.domain, null);
				}
			});
		}
	};
});