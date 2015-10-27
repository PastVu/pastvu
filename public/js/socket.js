define(['module'], function (module) {
	'use strict';

	return {
		load: function (name, req, onLoad, config) {
			if (config.isBuild) {
				onLoad(null); //avoid errors on the optimizer
				return;
			}

			req(['underscore', 'socket.io'], function (_, io) {
				var connectPath = location.host,
					connectOptions = {
						autoConnect: false,
						reconnectionDelay: _.random(700, 900),  //Изначальный интервал (в мс) между попытками реконнекта браузера, каждый следующий растет экспоненциально
						reconnectionDelayMax: _.random(6000, 8000), //Максимальный интервал (в мс) между попытками реконнекта браузера, до него дорастет предыдущий параметр
						reconnectionAttempts: 150 //Максимальное колво попыток реконнекта браузера, после которого будет вызванно событие reconnect_failed
					},
					manager = io(connectPath, connectOptions),
					socket = {connected: false, ons: {}, emitQueue: {}},

					firstConnected = false, //Флаг первоначального коннекта
					firstConnectSubscribers = [],
					disconnectionDataReturn = {error: true, noconnect: true, message: 'No connection with the server, please try again after reconnecting'},
					noСonnWait = '<div class="noconn"><div class="inn">No connection with the server, trying to connect .. After the restoration of connection message will disappear automatically</div></div>',
					noСonnFail = '<div class="noconn fail"><div class="inn">Failed to connect to the server automatically. <span class="repeat">Keep trying</span></div></div>',
					$noСonnWait,
					$noСonnFail;

				/**
				 * Событие первого соединения с сервером
				 * @param cb Коллбэк
				 * @param [ctx] Контекст коллбэка
				 */
				socket.onFirstConnect = function (cb, ctx) {
					if (firstConnected) {
						cb.call(ctx);
					} else {
						firstConnectSubscribers.push({cb: cb, ctx: ctx});
					}
				};

				/**
				 * Отправляет данные на сервер
				 * @param name Имя сообщения
				 * @param [data] Данные
				 * @param {boolean} [queueIfNoConnection=false] Ожидать ли подключения, в случае его отсутствия, и автоматически отправить при подключении. По умолчанию - false
				 * @returns {boolean} Отправлено ли сообщение
				 */
				socket.emit = function (name, data, queueIfNoConnection) {
					if (socket.connected) {
						manager.emit(name, data);
						return true;
					} else if (queueIfNoConnection) {
						var nameQueue = socket.emitQueue[name];
						if (!nameQueue) {
							socket.emitQueue[name] = [data];
						} else {
							nameQueue.push(data);
						}
						return true;
					}
					return false; //Если соединения нет, возращаем false
				};

				/**
				 * Постоянная подписка на событие
				 * @param name Имя события
				 * @param cb Коллбэк
				 * @param [ctx] Контекст коллбэка
				 * @param {boolean} [noConnectionNotify=false] Вызывать ли при отсутствии соединения. По умолчанию - false
				 * @returns {boolean} Флаг, что событие зарегистрировано
				 */
				socket.on = function (name, cb, ctx, noConnectionNotify) {
					var registered = eventHandlerRegister('on', name, cb, ctx, noConnectionNotify);
					//Если указано уведомлять об отсутствии соединения и его сейчас нет, то сразу после регистрации события уведомляем об этом
					if (registered && noConnectionNotify && !socket.connected) {
						setTimeout(function () {
							eventHandlersNotify(name, null, true);
						}, 4);
					}
					return registered;
				};

				/**
				 * Одноразовая подписка на событие. Отписывается после первого вызова коллбэка
				 * @param name Имя события
				 * @param cb Коллбэк
				 * @param [ctx] Контекст коллбэка
				 * @param {boolean} [noConnectionNotify=true] Вызывать ли при отсутствии соединения. По умолчанию - true
				 * @param {boolean} [registerEvenNoConnection=false] Регистрировать, даже если нет соединения. По умолчанию - false. Будет использован, только если noConnectionNotify=false
				 * @returns {boolean} Флаг, что событие зарегистрировано и коннект есть
				 */
				socket.once = function (name, cb, ctx, noConnectionNotify, registerEvenNoConnection) {
					noConnectionNotify = noConnectionNotify !== false;

					if (!socket.connected) {
						if (noConnectionNotify) {
							//Если указано уведомлять об отсутствии соединения и его сейчас нет, то сразу уведомляем об этом и не регистрируем событие, так как подписка одноразовая
							setTimeout(function () {
								cb.call(ctx, disconnectionDataReturn);
							}, 4);
							return false;
						} else if (!registerEvenNoConnection) {
							//Если флагом не указано, что сказано регистрировать даже в случае отсутствия соединения, то выходим
							return false;
						}
					}
					return eventHandlerRegister('once', name, cb, ctx, noConnectionNotify);
				};

				/**
				 * Отписка от события. Если конкретный коллбэк не передан, отпишет все обработчики события
				 * @param {string} name Имя события
				 * @param {function} [cb] Коллбэк
				 * @returns {boolean}
				 */
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
					//Если обработчиков не осталось, удаляем подписку на событие manager
					if (!nameStack.length) {
						manager.removeAllListeners(name);
						delete socket.ons[name];
					}
					return true;
				};

				// Уведомление обработчиков о первом соединении
				function firstConnectNotifier() {
					firstConnectSubscribers.forEach(function (subscriber) {
						subscriber.cb.call(subscriber.ctx);
					});
				}

				//Добавляем обработчик события
				//Если его еще нет в хеше, создаем в нем стек по имени и вешаем событие на manager
				function eventHandlerRegister(type, name, cb, ctx, noConnectionNotify) {
					var nameStack = socket.ons[name],
						stackRecord = {type: type, name: name, cb: cb, ctx: ctx, connoty: noConnectionNotify};

					if (Array.isArray(nameStack)) {
						nameStack.push(stackRecord);
					} else {
						socket.ons[name] = [stackRecord];
						manager.on(name, function (data) {
							eventHandlersNotify(name, data);
						});
					}
					return true;
				}

				//Вызывает обработчики события с переданными данными
				//Если обработчик установлен как once, удаляет его из стека после вызова
				//Если обработчиков после вызова не осталось, удаляем событие из хэша и отписываемся от manager
				function eventHandlersNotify(name, data, aboutNoConnection) {
					var nameStack = socket.ons[name],
						item,
						i;
					if (aboutNoConnection) {
						data = disconnectionDataReturn;
					}
					if (Array.isArray(nameStack)) {
						for (i = 0; i < nameStack.length; i++) {
							item = nameStack[i];
							if (aboutNoConnection && !item.connoty) {
								continue; //Если уведомляем про отсутствие соединения, а флага уведомлять об этом на хэндлере нет, пропускаем его
							}
							item.cb.call(item.ctx, data);
							//Если это once, удаляем из стека после вызова коллбэка
							if (item.type === 'once') {
								nameStack.splice(i--, 1);
							}
						}
						//Если обработчиков не осталось, удаляем подписку на событие manager
						if (!nameStack.length) {
							manager.removeAllListeners(name);
							delete socket.ons[name];
						}
					}
				}

				//Отправляет все emit, которые ожидали подключения
				function emitQueued() {
					function emitNameData (data) {
						manager.emit(name, data);
					}

					for (var name in socket.emitQueue) {
						if (socket.emitQueue.hasOwnProperty(name)) {
							socket.emitQueue[name].forEach(emitNameData);
						}
					}
					socket.emitQueue = {};
				}

				//В случае разрыва соединения оповещает все подписанные на все события обработчики
				function disconnectionAllNotyfy() {
					for (var name in socket.ons) {
						if (socket.ons.hasOwnProperty(name)) {
							eventHandlersNotify(name, null, true);
						}
					}
				}

				//Показывает сообщение о разрыве соединения
				function noConnWaitShow() {
					if (!$noСonnWait) {
						$noСonnWait = $(noСonnWait).appendTo('#top');
					}
				}

				//Скрывает сообщение о разрыве соединения
				function noConnWaitHide() {
					if ($noСonnWait) {
						$noСonnWait.remove();
						$noСonnWait = null;
					}
				}

				//Начинает процедуру реконнектов сначала. Вызывается по кнопке на сообщении о превышении попыток подключения
				function noConnRepeat() {
					noConnFailHide();
					noConnWaitShow();
					manager.io.attempts = 0; //Вручную сбрасываем попытки
					manager.io.reconnect(); //Вызываем реконнекты
				}

				//Показывает сообщение о превышении попыток подключения
				function noConnFailShow() {
					if (!$noСonnFail) {
						$noСonnFail = $(noСonnFail);
						$('.repeat', $noСonnFail).on('click', noConnRepeat);
						$noСonnFail.appendTo('#top');
					}
				}

				//Скрывает сообщение о превышении попыток подключения
				function noConnFailHide() {
					if ($noСonnFail) {
						$noСonnFail.remove();
						$noСonnFail = null;
					}
				}


				manager.on('error', function (reason) {
					console.log('Unable to connect socket: ', reason);
				});
				manager.on('connect', function () {
					if (!firstConnected) {
						console.log('Connected to server');
						socket.connected = true;
						firstConnected = true;
						onLoad(socket);
						firstConnectNotifier();
					}
				});

				manager.on('disconnect', function () {
					console.log('Disconnected from server ');
					socket.connected = false;
					disconnectionAllNotyfy();
				});
				manager.on('reconnecting', function (attempt) {
					console.log('Trying to reconnect to server %d time', attempt);
					if (attempt > 1) {
						noConnWaitShow();
					}
				});
				manager.on('reconnect_failed', function (attempt) {
					noConnWaitHide();
					noConnFailShow();
					console.log('Failed to reconnect for %d attempts. Stopped trying', manager.io.reconnectionAttempts());
				});
				manager.on('reconnect', function () {
					console.log('ReConnected to server');
					socket.connected = true;
					manager.emit('giveInitData', location.pathname); //После реконнекта заново запрашиваем initData
					noConnWaitHide(); //Скрываем сообщение об отсутствии соединения
					emitQueued(); //Отправляем все сообщения emit, которые ожидали восстановления соединения
				});

				manager.open(); // Коннектимся к серверу

				/*setTimeout(function () {
				 manager.io.disconnect();
				 setTimeout(function () {
				 manager.io.maybeReconnectOnOpen();
				 }, 4000);
				 }, 2000);
				 */
			});
		}
	};
});