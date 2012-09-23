/*global requirejs:true, require:true, define:true*/
define(['Utils', 'Browser'], function (Utils, Browser) {
    var keyTarget = [];

    !function () {
        if (Browser.name == 'OPERA') return handleOpera;
        else return handleNonOpera;

        function handleOpera(handler) {
            var holdActive = false, holdWait = null, lastEvent = null;

            function holdingTry(evt) {
                lastEvent = evt;
                window.clearTimeout(holdWait);
                holdWait = window.setTimeout(holdingStart, 110);
            }

            function holdingStart() {
                holdActive = true;
                lastEvent['holdStart'] = true;
                handler(lastEvent);
                Utils.Event.remove(document, 'keyup', keyUp);
                Utils.Event.add(document, 'keyup', holdingStop);
            }

            function holdingStop() {
                holdActive = false;
                delete lastEvent['holdStart'];
                lastEvent['holdEnd'] = true;
                handler(lastEvent);
                lastEvent = null;
                Utils.Event.add(document, 'keyup', keyUp);
                Utils.Event.remove(document, 'keyup', holdingStop);
            }

            function keyDown(event) {
                holdingTry(event);
                handler(event);
            }

            function keyUp(event) {
                window.clearTimeout(holdWait);
            }

            Utils.Event.add(document, 'keydown', keyDown);
            Utils.Event.add(document, 'keyup', keyUp);
        }

        function handleNonOpera(handler) {
            var lastKeyPress = new Date().getTime(), holdActive = false, lastEvent = null;

            function holdingTry(evt) {
                var tryStamp = new Date().getTime(),
                    result = false;
                if (!holdActive && tryStamp - lastKeyPress < 150) {
                    holdingStart(evt);
                    result = true;
                }
                lastKeyPress = tryStamp;
                return result;
            }

            function holdingStart(evt) {
                Utils.Event.remove(document, 'keydown', keyDown);
                Utils.Event.add(document, 'keyup', holdingStop);
                holdActive = true;
                lastEvent = evt;
                lastEvent['holdStart'] = true;
                handler(lastEvent);
            }

            function holdingStop() {
                holdActive = false;
                delete lastEvent['holdStart'];
                lastEvent['holdEnd'] = true;
                handler(lastEvent);
                lastEvent = null;
                Utils.Event.add(document, 'keydown', keyDown);
                Utils.Event.remove(document, 'keyup', holdingStop);
            }

            function keyDown(event) {
                if (holdingTry(event)) {
                    return;
                }

                handler(event);
            }

            Utils.Event.add(document, 'keydown', keyDown);
        }
    }()(handleKey);

    /**
     * Main handler
     * @param {Event} event KeyboardEvent.
     * @return {boolean} result.
     */
    function handleKey(event) {
        var key = 0;
        try {
            key = getKey(event);
            var action = '';
            switch (parseInt(key, 0)) {
            case 38:
                action = 'onUp';
                break;
            case 40:
                action = 'onDown';
                break;
            case 37:
                action = 'onLeft';
                break;
            case 39:
                action = 'onRight';
                break;

            case 27:
                action = 'onEsc';
                break;
            }
            if (event['holdStart']) action += 'HoldStart';
            if (event['holdEnd']) action += 'HoldEnd';

            var currTarget = keyTarget[keyTarget.length - 1];
            if (currTarget && currTarget.stopFurther) {
                if (typeof event.preventDefault == 'function') {
                    event.preventDefault();
                }
                if (typeof event.stopPropagation == 'function') {
                    event.stopPropagation();
                }
            }

            if (currTarget[action]) currTarget[action].call(currTarget.source || null, event, action);
        } catch (e) {
        }
        return true;
    }

    function getKey(event) {
        var keyCode = event.keyCode;
        var charCode = event.type != 'keydown' ? event.charCode : null;
        var which = event.which;

        if (Browser.engine == 'WEBKIT') {
            return keyCode || charCode || which;
        } else if (Browser.engine == 'GECKO') {
            return charCode ? charCode : keyCode;
        } else {
            return keyCode;
        }

        return which;
    }

    return keyTarget;
});