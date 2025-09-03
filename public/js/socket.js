/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

define(['module'], function (/* module */) {
    'use strict';

    let onLoad;

    function moduleHandler(_, io, noties, TimeoutError) {
        const connectPath = location.host;
        const connectOptions = {
            autoConnect: false,
            // Initial interval (in ms) between browser attempts to reconnect, followings increase exponentially
            reconnectionDelay: _.random(700, 900),
            // Maximum interval (in ms) between browser attempts to reconnect
            reconnectionDelayMax: _.random(6000, 8000),
            // Maximum amount of reconnect, after which will be triggered 'reconnect_failed' event
            reconnectionAttempts: 150,
            // Close connection on beforeunload event in Chrome (manager will
            // remove all listeners also).
            closeOnBeforeunload: true,
        };
        const manager = io(connectPath, connectOptions); // Strictly speaking, this is Socket instance, not Manager.
        const socket = { connected: false, ons: {}, emitQueue: {} };

        let firstConnected = false; // Flag of initial connect
        const firstConnectSubscribers = [];
        const disconnectionDataReturn = {
            error: true,
            noconnect: true,
            message: 'No connection with the server, please try again after reconnecting',
        };
        const noConnWait = '<div class="inn">No connection with the server, trying to connect .. After the restoration of connection message will disappear automatically</div>';
        const noConnFail = '<div class="inn">Failed to connect to the server automatically. <span class="repeat">Keep trying</span></div>';

        /**
         * Событие первого соединения с сервером
         *
         * @param {Function} cb Коллбэк
         * @param {object} ctx Контекст коллбэка
         */
        socket.onFirstConnect = function (cb, ctx) {
            if (firstConnected) {
                cb.call(ctx);
            } else {
                firstConnectSubscribers.push({ cb: cb, ctx: ctx });
            }
        };

        /**
         * Отправляет данные на сервер
         *
         * @param {string} name Имя сообщения
         * @param {...*} data Данные
         * @param {boolean} [queueIfNoConnection=false] Ожидать ли подключения, в случае его отсутствия,
         *                  и автоматически отправить при подключении. По умолчанию - false
         * @returns {boolean} Отправлено ли сообщение
         */
        socket.emit = function (name, data, queueIfNoConnection) {
            if (socket.connected) {
                manager.emit(name, data);

                return true;
            }

            if (queueIfNoConnection) {
                const nameQueue = socket.emitQueue[name];

                if (!nameQueue) {
                    socket.emitQueue[name] = [data];
                } else {
                    nameQueue.push(data);
                }

                return true;
            }

            return false; // If no connection, return false
        };

        /**
         * Постоянная подписка на событие
         *
         * @param {string} name Имя события
         * @param {Function} cb Коллбэк
         * @param {object} ctx Контекст коллбэка
         * @param {boolean} [noConnectionNotify=false] Вызывать ли при отсутствии соединения. По умолчанию false
         * @returns {boolean} Флаг, что событие зарегистрировано
         */
        socket.on = function (name, cb, ctx, noConnectionNotify) {
            const registered = eventHandlerRegister('on', name, cb, ctx, noConnectionNotify);

            // Если указано уведомлять об отсутствии соединения и его сейчас нет,
            // то сразу после регистрации события уведомляем об этом
            if (registered && noConnectionNotify && !socket.connected) {
                setTimeout(function () {
                    eventHandlersNotify(name, null, true);
                }, 4);
            }

            return registered;
        };

        /**
         * Одноразовая подписка на событие. Отписывается после первого вызова коллбэка
         *
         * @param {string} name Имя события
         * @param {Function} cb Коллбэк
         * @param {object} ctx Контекст коллбэка
         * @param {boolean} [noConnectionNotify=true] Вызывать ли при отсутствии соединения. По умолчанию - true
         * @param {boolean} [registerEvenNoConnection=false] Регистрировать, даже если нет соединения. По умолчанию - false.
         * @returns {boolean} Флаг, что событие зарегистрировано и коннект есть
         */
        socket.once = function (name, cb, ctx, noConnectionNotify, registerEvenNoConnection) {
            noConnectionNotify = noConnectionNotify !== false;

            if (!socket.connected) {
                if (noConnectionNotify) {
                    // Если указано уведомлять об отсутствии соединения и его сейчас нет,
                    // то сразу уведомляем об этом и не регистрируем событие, так как подписка одноразовая
                    setTimeout(function () {
                        cb.apply(ctx, [disconnectionDataReturn, _.noop]);
                    }, 4);

                    return false;
                }

                if (!registerEvenNoConnection) {
                    // Если флагом не указано, что сказано регистрировать даже в случае отсутствия соединения,
                    // то выходим
                    return false;
                }
            }

            return eventHandlerRegister('once', name, cb, ctx, noConnectionNotify);
        };

        /**
         * Отписка от события. Если конкретный коллбэк не передан, отпишет все обработчики события
         *
         * @param {string} name Имя события
         * @param {Function} [cb] Коллбэк
         * @returns {boolean}
         */
        socket.off = function (name, cb) {
            const nameStack = socket.ons[name];
            let item;

            if (!Array.isArray(nameStack)) {
                return false;
            }

            for (let i = 0; i < nameStack.length; i++) {
                item = nameStack[i];

                // Если коллбека не передано, то удаляем все. Если передан, то только его
                if (!cb || cb === item.cb) {
                    nameStack.splice(i--, 1);
                }
            }

            // Если обработчиков не осталось, удаляем подписку на событие manager
            if (!nameStack.length) {
                manager.removeAllListeners(name);
                delete socket.ons[name];
            }

            return true;
        };

        /**
         * Отправляет данные на сервер с ожиданием результата.
         * Возвращает Promise
         *
         * @param {string} name Имя сообщения
         * @param {...*} [data] Данные
         * @param {number} [timeToWaitIfNoConnection] Время ожидания отправки, если нет подключения. 0 - ждать вечно
         * @returns {Promise}
         */
        socket.request = function (name, data, timeToWaitIfNoConnection) {
            return new Promise(function (resolve, reject) {
                const resolver = function (result) {
                    // console.log('Request resolve', result);
                    resolve(result);
                };

                if (socket.connected) {
                    manager.emit(name, data, resolver);
                } else if (_.isNumber(timeToWaitIfNoConnection) && timeToWaitIfNoConnection >= 0) {
                    let queueName = socket.emitQueue[name];
                    const queueData = { data: data, cb: resolver };

                    if (timeToWaitIfNoConnection) {
                        setTimeout(function () {
                            queueName = _.without(queueName, queueData);

                            if (_.isEmpty(queueName)) {
                                delete socket.emitQueue[name];
                            }

                            reject(new TimeoutError({
                                type: 'SOCKET_CONNECTION',
                                name: name,
                                data: data,
                            }, timeToWaitIfNoConnection));
                        }, timeToWaitIfNoConnection);
                    }

                    if (!queueName) {
                        queueName = socket.emitQueue[name] = [queueData];
                    } else {
                        queueName.push(queueData);
                    }
                } else {
                    reject(new TimeoutError({ type: 'SOCKET_CONNECTION', name: name, data: data }, timeToWaitIfNoConnection));
                }
            });
        };

        /**
         * Отправляет данные на сервер с ожиданием результата.
         * Возвращает Promise
         *
         * @param {string} name Имя сообщения
         * @param {...*} [data] Данные
         * @param {boolean} [notyOnError] Показывать нотификацию об ошибке
         * @param {number} [timeToWaitIfNoConnection] Время ожидания отправки, если нет подключения. 0 - ждать вечно
         * @returns {Promise}
         */
        socket.run = function (name, data, notyOnError, timeToWaitIfNoConnection) {
            return socket.request(name, data, timeToWaitIfNoConnection)
                .catch(function (error) {
                    if (error instanceof TimeoutError) {
                        error.message = 'Request timed out';
                    }

                    return { error: error };
                })
                .then(function (result) {
                    if (result.error) {
                        console[result.error.type === 'NoticeError' || result.error.type === 'InputError' ? 'warn' : 'error'](
                            'socket.run "' + name + '" returned error\n', result
                        );
                        result.error.rid = _.get(result, 'rid', '');

                        if (notyOnError) {
                            noties.error(result.error);
                        }

                        throw result.error; // TODO: think about Uncaught promise error
                    }

                    return result.result;
                });
        };

        // Уведомление обработчиков о первом соединении
        function firstConnectNotifier() {
            firstConnectSubscribers.forEach(function (subscriber) {
                subscriber.cb.call(subscriber.ctx);
            });
        }

        // Добавляем обработчик события
        // Если его еще нет в хеше, создаем в нем стек по имени и вешаем событие на manager
        function eventHandlerRegister(type, name, cb, ctx, noConnectionNotify) {
            const nameStack = socket.ons[name];
            const stackRecord = { type: type, name: name, cb: cb, ctx: ctx, connoty: noConnectionNotify };

            if (Array.isArray(nameStack)) {
                nameStack.push(stackRecord);
            } else {
                socket.ons[name] = [stackRecord];
                manager.on(name, function () {
                    const data = _.head(arguments);
                    let acknowledgementCallback;
                    let acknowledgementCallbackCallResult;
                    const acknowledgementCallbackOrigin = _.last(arguments);

                    if (_.isFunction(acknowledgementCallbackOrigin)) {
                        acknowledgementCallbackCallResult = { data: [] };
                        acknowledgementCallback = function () {
                            acknowledgementCallbackCallResult.data = acknowledgementCallbackCallResult.data.concat(_.toArray(arguments));
                        };
                    }

                    eventHandlersNotify(name, [data, acknowledgementCallback]);

                    if (_.isFunction(acknowledgementCallbackOrigin)) {
                        acknowledgementCallbackOrigin(acknowledgementCallbackCallResult);
                    }
                });
            }

            return true;
        }

        // Вызывает обработчики события с переданными данными
        // Если обработчик установлен как once, удаляет его из стека после вызова
        // Если обработчиков после вызова не осталось, удаляем событие из хэша и отписываемся от manager
        function eventHandlersNotify(name, result, aboutNoConnection) {
            const nameStack = socket.ons[name];

            if (!Array.isArray(nameStack)) {
                return;
            }

            if (aboutNoConnection) {
                result = [disconnectionDataReturn, _.noop];
            }

            if (!Array.isArray(result)) {
                result = [result];
            }

            for (let i = 0, item; i < nameStack.length; i++) {
                item = nameStack[i];

                // Если уведомляем про отсутствие соединения,
                // а флага уведомлять об этом на хэндлере нет, пропускаем его
                if (aboutNoConnection && !item.connoty) {
                    continue;
                }

                item.cb.apply(item.ctx, result);

                // Если это once, удаляем из стека после вызова коллбэка
                if (item.type === 'once') {
                    nameStack.splice(i--, 1);
                }
            }

            // Если обработчиков не осталось, удаляем подписку на событие manager
            if (!nameStack.length) {
                manager.removeAllListeners(name);
                delete socket.ons[name];
            }
        }

        // Отправляет все emit, которые ожидали подключения
        function emitQueued() {
            for (const name in socket.emitQueue) {
                if (socket.emitQueue.hasOwnProperty(name)) {
                    socket.emitQueue[name].forEach(({ data, cb }) => manager.emit(name, data, cb));
                }
            }

            socket.emitQueue = {};
        }

        // В случае разрыва соединения оповещает все подписанные на все события обработчики
        function disconnectionAllNotyfy() {
            for (const name in socket.ons) {
                if (socket.ons.hasOwnProperty(name)) {
                    eventHandlersNotify(name, null, true);
                }
            }
        }

        // Показывает сообщение о разрыве соединения
        function noConnWaitShow() {
            const elem = document.createElement('div');

            elem.setAttribute('class', 'noconn');
            elem.innerHTML = noConnWait;
            document.querySelector('#top').appendChild(elem);
        }

        // Скрывает сообщение о разрыве соединения
        function noConnHide() {
            const elem = document.querySelector('#top .noconn');

            if (elem) {
                elem.remove();
            }
        }

        // Начинает процедуру реконнектов сначала.
        // Вызывается по кнопке на сообщении о превышении попыток подключения
        function noConnRepeat() {
            noConnHide();
            manager.io.attempts = 0; // Вручную сбрасываем попытки
            manager.io.reconnect(); // Вызываем реконнекты
        }

        // Показывает сообщение о превышении попыток подключения
        function noConnFailShow() {
            const elem = document.createElement('div');

            elem.setAttribute('class', 'noconn fail');
            elem.innerHTML = noConnFail;
            elem.querySelector('.repeat').addEventListener('click', noConnRepeat);
            document.querySelector('#top').appendChild(elem);
        }

        manager.on('connect_error', function (error) {
            console.log('Unable to connect socket: ', error.message);
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
        manager.io.on('reconnect_attempt', function (attempt) {
            console.log('Trying to reconnect to server %d time', attempt);

            if (attempt === 1) {
                noConnWaitShow();
            }
        });
        manager.io.on('reconnect_failed', function () {
            noConnHide();
            noConnFailShow();
            console.log('Failed to reconnect for %d attempts. Stopped trying', manager.io.reconnectionAttempts());
        });
        manager.io.on('reconnect', function (/* attempt */) {
            console.log('ReConnected to server');
            socket.connected = true;
            noConnHide(); // Скрываем сообщение об отсутствии соединения
            emitQueued(); // Отправляем все сообщения emit, которые ожидали восстановления соединения
        });

        manager.open(); // Коннектимся к серверу
    }

    return {
        load: function (name, req, onLoadExe, config) {
            if (config.isBuild) {
                onLoadExe(null); // Avoid errors in the r.js optimizer

                return;
            }

            onLoad = onLoadExe;

            req(['underscore', 'socket.io', 'noties', 'errors/Timeout'], moduleHandler);
        },
    };
});
