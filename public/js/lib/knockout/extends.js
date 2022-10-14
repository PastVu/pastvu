/*global requirejs:true, require:true, define:true*/
/**
 * Klimashkin
 */
define(['jquery', 'underscore', 'knockout'], function ($, _, ko) {
    /**
     * Создает новый дочерний контекст у дочерних элементов
     *
     * @type {object}
     */
    ko.bindingHandlers.newChildContext = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
            const flag = valueAccessor();
            const childBindingContext = bindingContext.createChildContext(viewModel);

            ko.applyBindingsToDescendants(childBindingContext, element);

            // Also tell KO *not* to bind the descendants itself, otherwise they will be bound twice
            return { controlsDescendantBindings: true };
        },
    };
    ko.virtualElements.allowedBindings.newChildContext = true;

    /**
     * Позволяет отменить байндинг у элемента и его потомков
     *
     * @type {object}
     */
    ko.bindingHandlers.allowBindings = {
        init: function (elem, valueAccessor) {
            // Let bindings proceed as normal *only if* my value is false
            const shouldAllowBindings = ko.unwrap(valueAccessor());

            return { controlsDescendantBindings: !shouldAllowBindings };
        },
    };
    ko.virtualElements.allowedBindings.allowBindings = true;

    /**
     * Объединяет два массива
     *
     * @param arr Массив для объединения
     * @param before Флаг, означающий что надо вставить в начало
     * @returns {*}
     */
    ko.observableArray.fn.concat = function (arr, before) {
        const underlyingArray = this();
        let methodCallResult;

        this.valueWillMutate();
        methodCallResult = Array.prototype[before ? 'unshift' : 'push'][Array.isArray(arr) ? 'apply' : 'call'](underlyingArray, arr);
        this.valueHasMutated();

        return methodCallResult;
    };

    /**
     * Вызывает переданную функцию по нажатию enter
     *
     * @type {object}
     */
    ko.bindingHandlers.executeOnEnter = {
        init: function (element, valueAccessor, allBindingsAccessor, viewModel) {
            const allBindings = allBindingsAccessor();

            $(element).keypress(function (event) {
                const keyCode = event.which || event.keyCode;

                if (keyCode === 13) {
                    allBindings.executeOnEnter.call(viewModel);

                    return false;
                }

                return true;
            });
        },
    };

    const specialKeyCodes = [8, 13, 16, 17, 18, 20, 27, 35, 36, 37, 38, 39, 40, 46, 123, 144];

    // Возвращает и устанавливает позицию курсора на input/textarea/contenteditable элементов
    // Пример: caret(element) - взять позицию, caret(element, 7) - установить позицию
    // Адаптированно с http://code.accursoft.com/caret/src
    const caret = function (target, pos) {
        const isContentEditable = target.contentEditable === 'true';
        let range1;
        let range2;

        // GET
        if (pos === undefined) {
            if (window.getSelection) {
                if (isContentEditable) { //contenteditable
                    target.focus();
                    range1 = window.getSelection().getRangeAt(0);
                    range2 = range1.cloneRange();
                    range2.selectNodeContents(target);
                    range2.setEnd(range1.endContainer, range1.endOffset);

                    return range2.toString().length;
                }

                return target.selectionStart; //textarea
            }

            //not supported
            return 0;
        }

        // SET
        if (pos === -1) {
            pos = $(target)[isContentEditable ? 'text' : 'val']().length;
        }

        if (window.getSelection) {
            if (isContentEditable) { //contenteditable
                target.focus();
                window.getSelection().collapse(target.firstChild, pos);
            } else {
                target.setSelectionRange(pos, pos); //textarea
            }
        }

        if (!isContentEditable) {
            target.focus();
        }

        return pos;
    };

    /**
     * Разрешение/запрещение ввода в поле только переданных символов
     * Может передаваться как значение, так и объект со значением и флaгом allow (true, false)
     * Значением может быть строка символов или regexp (в этом случае нужно дополнительно экранировать \)
     * По умолчанию, переданные значения - разрешенные
     * Если в параметре watch передан observable, поле будет форматироваться при его изменении
     * Чтобы корректно отрабатывала максимальная длина поля, параметр maxLength нужно указыват здесь, в не в атрибуте,
     * на случай вставки длинной строки с запреденными символами в середине
     * P.S. Если на инпуте используется value-binding, то valueUpdate должен быть 'keyup'
     *
     * @example
     * symbols: /\\d/
     * symbols: 'abcdef'
     * symbols: {pattern: new RegExp('\\\d', 'g'), allow: false, watch: someobservable, noMultiplySpace: false, maxLength: 15}
     */
    ko.bindingHandlers.symbols = (function () {
        const validateRegexp = function (regex, str) {
            return regex.test(str);
        };
        const validateIndexOf = function (values, str) {
            return values.indexOf(str) > -1;
        };

        return {
            init: function (element, valueAccessor) {
                const $element = $(element);
                const param = ko.utils.unwrapObservable(valueAccessor());
                const pattern = param.pattern || param;
                const disallow = param.allow === false;
                const maxLength = param.maxLength || false;
                const noMultiplySpace = !!param.noMultiplySpace;
                const validator = _.partial(_.isRegExp(pattern) ? validateRegexp : validateIndexOf, pattern);
                let watchSubscription;
                let downKey;

                $element.on('keydown', onkeydown);
                $element.on('keypress', onkeypress);

                // Если передан observable, подписываемся на изменения для форматирования его значения в поле
                if (param.watch && param.watch.subscribe) {
                    watchSubscription = param.watch.subscribe(function (value) {
                        if (!_.isString(value) || _.isEmpty(value)) {
                            return;
                        }

                        let valueOnlyAllowed = value.match(pattern).join(''); // TODO: for symbols, not only regexp

                        if (noMultiplySpace) {
                            valueOnlyAllowed = valueOnlyAllowed.replace(/ {2,}/g, ' ');
                        }

                        if (maxLength && valueOnlyAllowed.length > maxLength) {
                            valueOnlyAllowed = valueOnlyAllowed.substr(0, maxLength);
                        }

                        if (valueOnlyAllowed !== value) {
                            param.watch(valueOnlyAllowed);
                        }
                    });
                }

                // Некоторые символы мы можем определить только на этапе keycode
                function onkeydown(evt) {
                    const key = evt.keyCode || evt.which;

                    //console.log('onkeydown', key, String.fromCharCode(key));
                    downKey = key;

                    return true;
                }

                function onkeypress(evt) {
                    let key = evt.keyCode || evt.which;
                    let cancelInput;
                    let fullValue;
                    let valid;

                    // console.log('onkeypress', key, String.fromCharCode(key));
                    // Если keycode определился и нажат shift или код не совпадает с keydowm
                    if (key && (evt.shiftKey || downKey !== key || specialKeyCodes.indexOf(key) < 0)) {
                        key = String.fromCharCode(key);
                        cancelInput = function () {
                            evt.stopImmediatePropagation();
                            evt.preventDefault();

                            return false;
                        };

                        if (key) {
                            valid = validator(key);

                            if (!disallow && !valid || disallow && valid) {
                                return cancelInput();
                            }

                            fullValue = $(this).val() || '';

                            if (maxLength && fullValue.length > maxLength) {
                                return cancelInput();
                            }

                            if (noMultiplySpace && key === ' ' && !_.isEmpty(fullValue)) {
                                const cursorPosition = caret(this);

                                if (fullValue.charAt(cursorPosition - 1) === ' ' || fullValue.charAt(cursorPosition) === ' ') {
                                    return cancelInput();
                                }
                            }
                        }
                    }

                    return true;
                }

                ko.utils.domNodeDisposal.addDisposeCallback(element, function () {
                    $element.off('keydown', onkeydown);
                    $element.off('keypress', onkeypress);

                    if (watchSubscription) {
                        watchSubscription.dispose();
                    }
                });
            },
        };
    }());

    /**
     * Редактирование содержимого элементов с помошью contenteditable
     * Inspired by https://groups.google.com/forum/#!topic/knockoutjs/Mh0w_cEMqOk
     *
     * @type {object}
     */
    //ko.bindingHandlers.cEdit = {
    //    init: function (element, valueAccessor) {
    //    },
    //    update: function (element, valueAccessor, allBindingsAccessor, viewModel) {
    //        var obj = ko.unwrap(valueAccessor()),
    //            $element = $(element);
    //
    //        $element.text(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val);
    //
    //        if (obj.edit) {
    //            if (!$element.attr('contenteditable')) {
    //                $element
    //                    .css({ display: '' })
    //                    .attr('contenteditable', 'true')
    //                    .on('blur', function () {
    //                        var modelValue = obj.val,
    //                            elementValue = $.trim($element.text());
    //
    //                        $element.text(elementValue);
    //                        if (ko.isWriteableObservable(modelValue)) {
    //                            if (elementValue === modelValue()) {
    //                                checkForCap();
    //                            } else {
    //                                modelValue(elementValue);
    //                            }
    //                        }
    //                    })
    //                    .on('focus', function () {
    //                        $element.removeClass('cap');
    //                        if (_.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
    //                            $element.html('&nbsp;');
    //                        }
    //                    });
    //                checkForCap();
    //            } else {
    //                checkForCap();
    //            }
    //        } else {
    //            if ($element.attr('contenteditable') === 'true') {
    //                $element.off('blur').off('focus').removeAttr('contenteditable').removeClass('cap');
    //            }
    //            if (_.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
    //                $element.css({ display: 'none' });
    //            }
    //        }
    //
    //        function checkForCap() {
    //            if (obj.edit && obj.cap && _.isEmpty(String(ko.isWriteableObservable(obj.val) ? obj.val() : obj.val))) {
    //                $element.addClass('cap');
    //                $element.text(obj.cap);
    //            } else {
    //                $element.removeClass('cap');
    //            }
    //        }
    //    }
    //};
});
