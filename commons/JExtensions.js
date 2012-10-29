if (!Function.prototype.neoBind) {
    /**
     * Closes the context and any number of parameters. That is, returns
     * closured function.
     *
     * Примечание: Если мы используем neoBind для замыкания контекстов и
     * параметров, то в менеджерах событий сохраняется не ожидаемая нами
     * функция, а "замкнутая", которая потом уже вызывает нашу функцию.
     * Поэтому внутри нашей функции её нельзя удалить используя
     * arguments.callee (Например, так: Application.removeListener(event.id,
     * arguments.callee))
     * Так как arguments.callee - это уже другой объект.
     * Можно использовать не arguments.callee, а arguments.callee.caller.
     * Но это свойство помеченно как deprecated (the deprecation is due to
     * current ECMAScript design principles)
     * К тому же arguments.callee.caller опасно использовать в
     * компиляции (Closure Compiler).
     * Так как в режиме ADVANCED_OPTIMIZATION компилятор теоретически может
     * заинлайнить некоторые функции, тогда непонятно куда будет ссылаться
     * caller.
     *
     * Поэтому, когда используете neoBind для функций, которые используют
     * arguments.callee для удаления событий,
     * замените это на arguments[arguments.length-1] - это последний параметр в
     * функции, в который передается ссылка на замкнутый callee.
     * @author P.Klimashkin
     * @param {!Object} scope Context, that becomes 'this' in function.
     * @param {!Array=} bind_args Array of parameters.
     * @return {!Function} Closured function.
     */
    Function.prototype.neoBind = function (scope, bind_args) {
        'use strict';
        /**@type {!Function}*/
        var fn = this;
        return function () {
            /**@type {!Array}*/
            var args = bind_args ?
                       Array.prototype.slice.call(arguments).concat(bind_args) :
                       Array.prototype.slice.call(arguments),
                res;
            args.push(arguments.callee);

            try {
                res = fn.apply(scope, args);
            } catch (e) {
                var s = '';
                try {
                    s = fn.toString();
                } catch (e1) {
                }
                if (s) {
                    e.message += ' Failed bound function: ' + s;
                }
                throw e;
            }
            return res;
        };
    };
}

if (!Array.isArray) {
    Array.isArray = function (vArg) {
        'use strict';
        return vArg.constructor === Array;
    };
}

/**
 * JSON.minify()
 * v0.1 (c) Kyle Simpson
 * MIT License
 */
(function (global) {
    if (typeof global.JSON === "undefined" || !global.JSON) {
        global.JSON = {};
    }

    global.JSON.minify = function (json) {

        var tokenizer = /"|(\/\*)|(\*\/)|(\/\/)|\n|\r/g,
            in_string = false,
            in_multiline_comment = false,
            in_singleline_comment = false,
            tmp, tmp2, new_str = [], ns = 0, from = 0, lc, rc;

        tokenizer.lastIndex = 0;

        while (tmp = tokenizer.exec(json)) {
            lc = RegExp.leftContext;
            rc = RegExp.rightContext;
            if (!in_multiline_comment && !in_singleline_comment) {
                tmp2 = lc.substring(from);
                if (!in_string) {
                    tmp2 = tmp2.replace(/(\n|\r|\s)*/g, "");
                }
                new_str[ns++] = tmp2;
            }
            from = tokenizer.lastIndex;

            if (tmp[0] == "\"" && !in_multiline_comment && !in_singleline_comment) {
                tmp2 = lc.match(/(\\)*$/);
                if (!in_string || !tmp2 || (tmp2[0].length % 2) == 0) {    // start of string with ", or unescaped " character found to end string
                    in_string = !in_string;
                }
                from--; // include " character in next catch
                rc = json.substring(from);
            }
            else if (tmp[0] == "/*" && !in_string && !in_multiline_comment && !in_singleline_comment) {
                in_multiline_comment = true;
            }
            else if (tmp[0] == "*/" && !in_string && in_multiline_comment && !in_singleline_comment) {
                in_multiline_comment = false;
            }
            else if (tmp[0] == "//" && !in_string && !in_multiline_comment && !in_singleline_comment) {
                in_singleline_comment = true;
            }
            else if ((tmp[0] == "\n" || tmp[0] == "\r") && !in_string && !in_multiline_comment && in_singleline_comment) {
                in_singleline_comment = false;
            }
            else if (!in_multiline_comment && !in_singleline_comment && !(/\n|\r|\s/.test(tmp[0]))) {
                new_str[ns++] = tmp[0];
            }
        }
        new_str[ns++] = rc;
        return new_str.join("");
    };
}(global));

/**
 * Extend
 */
Object.defineProperty(Object.prototype, "extend", {
    enumerable: false,
    value: function (from) {
        'use strict';
        var props = Object.getOwnPropertyNames(from),
            dest = this;
        props.forEach(function (name) {
            Object.defineProperty(dest, name, Object.getOwnPropertyDescriptor(from, name));
        });
        return this;
    }
});