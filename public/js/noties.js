define(['underscore', 'jquery', 'Utils'], function (_, $, Utils) {
    'use strict';

    function getPosition(params) {
        var layout = params.layout || 'center';
        var animation = params.animation;
        var modal = null;

        if (animation === undefined) {
            if (layout === 'center') {
                animation = {
                    open: 'animated fadeIn',
                    close: 'animated fadeOut'
                };
                modal = true;
            } else if (layout === 'topRight') {
                animation = {
                    open: 'animated bounceInRight',
                    close: 'animated bounceOutRight'
                };
            } else {
                animation = false;
            }
        }

        return { layout: layout, animation: animation, modal: modal };
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

    function notyConfirm(params) {
        return window.noty({
            text: params.message,
            type: 'confirm',
            layout: 'center',
            modal: true,
            force: true,
            animation: { open: { height: 'toggle' }, close: {}, easing: 'swing', speed: 500 },
            buttons: [
                {
                    addClass: 'btn btn-danger', text: params.okText || 'Ok',
                    onClick: function ($noty) {
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
                    addClass: 'btn btn-primary', text: params.cancelText || 'Отмена',
                    onClick: function ($noty) {
                        $noty.close();
                        params.onCancel && params.onCancel.call(params.ctx);
                    }
                }
            ]
        });
    }

    function notyAlert(params) {
        var okText = params.text || 'Ok';
        var okClass = 'btn ' + (params.okClass || 'btn-primary');
        var countdown = params.countdown > 0 ? params.countdown : null;
        var timeout = null;
        var buttons = null;

        if (!countdown) {
            if (params.timeout !== undefined) {
                timeout = params.timeout;
            } else {
                timeout = 2500;
            }
        }

        if (params.ok) {
            buttons = [
                {
                    addClass: okClass, text: okText,
                    onClick: function ($noty) {
                        // this = button element
                        // $noty = $noty element

                        $noty.close();
                        if (params.onOk) {
                            params.onOk.call(params.ctx);
                        }
                    }
                }
            ];
        }

        var $noty = window.noty(_.assign({
            text: params.message,
            timeout: timeout,
            type: params.type || 'confirm',
            force: true,
            buttons: buttons
        }, getPosition(params), params.override));

        if (params.ok && countdown > 0) {
            var okButton = $('.btn', $noty.$bar);
            okButton.text(okText + ' (' + (countdown - 1) + ')');

            Utils.timer(countdown * 1000,
                function (timeleft) {
                    okButton.text(okText + ' (' + timeleft + ')');
                },
                function () {
                    okButton.trigger('click');
                }
            );
        }
    }

    function notyError(error, params) {
        if (!params) {
            params = {};
        }
        notyAlert({
            message: getErrorMessage(error),
            type: 'error', timeout: params.timeout || 120000,
            ok: true, okClass: 'btn-danger', text: 'Закрыть'
        });
    }

    return {
        alert: notyAlert,
        error: notyError,
        confirm: notyConfirm,
    };
});