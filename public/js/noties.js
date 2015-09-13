define(['underscore', 'jquery', 'Utils', 'Params'], function (_, $, Utils, P) {
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
                       error: function (message, buttonText, onFinish, ctx) {
                           this.replaceTexts(message, null, buttonText);
                           finish(onFinish, ctx);
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

    function notyError(message, timeout) {
        window.noty({
            text: message || 'Возникла ошибка',
            type: 'error',
            layout: 'center',
            timeout: timeout || 2000,
            force: true
        });
    }

    return {
        confirm: confirm,
        alert: notyAlert,
        error: notyError
    }
});