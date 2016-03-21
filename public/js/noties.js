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

                if (error.rid && error.type !== 'NoticeError' && error.type !== 'InputError') {
                    message += '<br><span style="color:#A7A7A7">Номер ошибки: ' + error.rid + '</span>';
                }
            }
        }

        return message;
    }

    function notyConfirm(params) {
        var okClass = 'btn ' + (params.okClass || 'btn-danger');
        var okClassSelector = '.' + okClass.trim().split(' ').join('.');
        var cancelClass = 'btn ' + (params.cancelClass || 'btn-primary');
        var cancelClassSelector = '.' + cancelClass.trim().split(' ').join('.');

        return window.noty({
            text: params.message,
            type: 'confirm',
            layout: 'center',
            modal: true,
            force: true,
            animation: { open: 'animated fadeIn' },
            buttons: [
                {
                    addClass: okClass, text: params.okText || 'Ok',
                    onClick: function ($noty) {
                        // this = button element
                        // $noty = $noty element

                        if (!params.onOk) {
                            $noty.close();
                            return;
                        }

                        var $buttons = $noty.$buttons;
                        var finish = function (onFinish, ctx) {
                            $buttons.find(okClassSelector).remove();
                            return $buttons.find(cancelClassSelector)
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
                                $noty.$bar.css('height', $('.noty_bar', $noty.$bar).innerHeight());

                                if (okText) {
                                    $(okClassSelector, $buttons).text(okText);
                                }
                                if (cancelText) {
                                    $(cancelClassSelector, $buttons).text(cancelText);
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
                    addClass: cancelClass, text: params.cancelText || 'Отмена',
                    onClick: function ($noty) {
                        $noty.close();
                        params.onCancel && params.onCancel.call(params.ctx);
                    }
                }
            ]
        });
    }

    function notyAlert(params) {
        var type = params.type || 'confirm';
        var okText = params.text || 'Ok';
        var okClass = 'btn ';
        var countdown = params.countdown > 0 ? params.countdown : null;
        var timeout = null;
        var buttons = null;

        if (!countdown) {
            if (params.timeout !== undefined) {
                timeout = params.timeout;
            } else if (!params.ok) {
                timeout = 2500;
            }
        }

        if (params.ok) {
            if (params.okClass) {
                okClass += params.okClass;
            } else if (type === 'error') {
                okClass += 'btn-danger';
            } else if (type === 'warning') {
                okClass += 'btn-warning';
            } else if (type === 'success') {
                okClass += 'btn-success';
            } else {
                okClass += 'btn-primary';
            }

            buttons = [{
                addClass: okClass, text: okText,
                onClick: function ($noty) {
                    // this = button element, $noty = $noty element

                    $noty.close();
                    if (params.onOk) {
                        params.onOk.call(params.ctx);
                    }
                }
            }];
        } else if (params.buttons) {
            buttons = params.buttons;
        }

        var $noty = window.noty(_.assign({
            text: params.message,
            timeout: timeout,
            type: params.type || 'confirm',
            force: true,
            buttons: buttons
        }, getPosition(params), params.override));

        if (params.ok && (countdown || timeout)) {
            var okButton = $('.btn', $noty.$bar);

            if (countdown) {
                okButton.text(okText + ' (' + (countdown - 1) + ')');

                Utils.timer(countdown * 1000,
                    function (timeleft) {
                        okButton.text(okText + ' (' + timeleft + ')');
                    },
                    function () {
                        okButton.trigger('click');
                    }
                );
            } else if (timeout) {
                setTimeout(function () {
                    okButton.trigger('click');
                }, timeout);
            }
        }
    }

    function notyError(error, params) {
        if (!params) {
            params = {};
        }
        notyAlert({
            message: getErrorMessage(error),
            type: 'error', timeout: params.timeout || 120000,
            ok: true, text: 'Закрыть'
        });
    }

    return {
        alert: notyAlert,
        error: notyError,
        confirm: notyConfirm
    };
});