define(['underscore', 'jquery', 'Utils'], function (_, $, Utils) {
    'use strict';

    function confirm(params) {
        return window.noty({
            text: params.message,
            type: 'confirm',
            layout: 'center',
            modal: true,
            force: true,
            animation: { open: { height: 'toggle' }, close: {}, easing: 'swing', speed: 500 },
            buttons: [
                {
                    addClass: 'btn btn-danger', text: params.okText || 'Ok', onClick: function ($noty) {
                    // this = button element
                    // $noty = $noty element

                    if (!params.onOk) {
                        $noty.close();
                        return;
                    }

                    var $buttons = $noty.$buttons;
                    var finish = function (onFinish, ctx) {
                        $buttons.find('.btn-danger').remove();
                        return $buttons.find('.btn-primary')
                            .off('click')
                            .attr('disabled', false)
                            .on('click', function () {
                                $noty.close();
                                if (onFinish) {
                                    onFinish.call(ctx);
                                }
                            });
                    };
                    var methods = {
                        close: function () {
                            $noty.close();
                        },
                        enable: function () {
                            $buttons.find('button').attr('disabled', false);
                        },
                        disable: function () {
                            $buttons.find('button').attr('disabled', true);
                        },
                        replaceTexts: function (message, okText, cancelText) {
                            $noty.$message.children().html(message);
                            if (okText) {
                                $('.btn-danger', $buttons).text(okText);
                            }
                            if (cancelText) {
                                $('.btn-primary', $buttons).text(cancelText);
                            }
                        },
                        success: function (message, buttonText, countdown, onFinish, ctx) {
                            this.replaceTexts(message, null, buttonText);
                            var finishButton = finish(onFinish, ctx);

                            if (_.isNumber(countdown) && countdown > 0) {
                                finishButton.text(buttonText + ' (' + (countdown - 1) + ')');

                                Utils.timer(
                                    countdown * 1000,
                                    function (timeleft) {
                                        finishButton.text(buttonText + ' (' + timeleft + ')');
                                    },
                                    function () {
                                        finishButton.trigger('click');
                                    }
                                );
                            }
                        },
                        error: function (error, buttonText, countdown, onFinish, ctx) {
                            this.replaceTexts(getErrorMessage(error), null, buttonText);
                            var finishButton = finish(onFinish, ctx);

                            if (_.isNumber(countdown) && countdown > 0) {
                                finishButton.text(buttonText + ' (' + (countdown - 1) + ')');

                                Utils.timer(
                                    countdown * 1000,
                                    function (timeleft) {
                                        finishButton.text(buttonText + ' (' + timeleft + ')');
                                    },
                                    function () {
                                        finishButton.trigger('click');
                                    }
                                );
                            }
                        }
                    };

                    params.onOk.call(params.ctx, methods);
                }
                },
                {
                    addClass: 'btn btn-primary', text: params.cancelText || 'Отмена', onClick: function ($noty) {
                    $noty.close();
                    params.onCancel && params.onCancel.call(params.ctx);
                }
                }
            ]
        });
    }

    function notyAlert(params) {
        var buttonText = params.text || 'Ok';
        var countdown = params.countdown;

        var $noty = window.noty({
            text: params.message,
            type: 'confirm',
            layout: 'center',
            modal: true,
            force: true,
            animation: { open: { height: 'toggle' }, close: {}, easing: 'swing', speed: 100 },
            buttons: [
                {
                    addClass: 'btn btn-primary', text: buttonText, onClick: function ($noty) {
                    // this = button element
                    // $noty = $noty element

                    $noty.close();
                    if (params.onOk) {
                        params.onOk.call(params.ctx);
                    }
                }
                }
            ]
        });

        var finishButton = $('.btn-primary', $noty);

        if (_.isNumber(countdown) && countdown > 0) {
            finishButton.text(buttonText + ' (' + (countdown - 1) + ')');

            Utils.timer(
                countdown * 1000,
                function (timeleft) {
                    finishButton.text(buttonText + ' (' + timeleft + ')');
                },
                function () {
                    finishButton.trigger('click');
                }
            );
        }
    }

    function notyError(error, timeout) {
        window.noty(
            { text: getErrorMessage(error), type: 'error', layout: 'center', timeout: timeout || 3000, force: true }
        );
    }

    function getErrorMessage(error) {
        var message = 'Возникла ошибка';

        if (!_.isEmpty(error)) {
            if (_.isString(error)) {
                message = error;
            } else if (_.isObject(error)) {
                message = _.get(error, 'message') || message;

                if (error.rid) {
                    message += '<br>Номер ошибки: ' + error.rid;
                }
            }
        }

        return message;
    }

    return {
        confirm: confirm,
        alert: notyAlert,
        error: notyError
    };
});