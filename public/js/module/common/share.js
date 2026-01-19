/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

/**
 * Share dialog for social networks
 */
define(['underscore', 'jquery', 'Utils', 'socket!', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/common/share.pug', 'css!style/common/share'], function (_, $, Utils, socket, P, globalVM, ko, Cliche, pug) {
    'use strict';

    // Social networks configuration with text labels for better UX
    const socials = [
        {
            id: 'fb',
            name: 'Facebook',
        },
        {
            id: 'vk',
            name: 'ВКонтакте',
        },
        {
            id: 'ok',
            name: 'Одноклассники',
        },
        {
            id: 'tw',
            name: 'Twitter',
        },
        {
            id: 'tb',
            name: 'Tumblr',
        },
        {
            id: 'email',
            name: 'Email',
        },
    ];

    return Cliche.extend({
        pug: pug,
        options: {
            title: '',
            desc: '',
            img: null,
            linkPage: null,
            linkSocial: null,
            linkObject: null,
        },
        create: function () {
            const self = this;

            this.auth = globalVM.repository['m/common/auth'];
            this.socials = socials;

            // QR Code canvas observable
            this.qrCodeDataUrl = ko.observable('');

            // HTML embed code observable
            this.htmlCode = ko.computed(function () {
                const origin = location.origin || location.protocol + '://' + location.host;
                const pageUrl = self.options.linkPage ? origin + self.options.linkPage : '';
                const imgUrl = self.options.img ? origin + self.options.img : '';
                const title = self.options.title || '';

                if (imgUrl && pageUrl) {
                    return '<a href="' + pageUrl + '"><img src="' + imgUrl + '" alt="' +
                           title.replace(/"/g, '&quot;') + '" /></a>';
                }

                return '';
            }, this);

            socials.forEach(function (social) {
                social.action = function (data, evt) {
                    self.share(social.id, social.name, data, evt);
                };
            });

            this.show();
        },
        show: function () {
            ga('send', 'event', 'share', 'open', 'share open');

            ko.applyBindings(globalVM, this.$dom[0]);
            globalVM.func.showContainer(this.$container);

            if (this.modal) {
                this.modal.$curtain.addClass('showModalCurtain');
            }

            // Generate QR code for the page URL
            this.generateQRCode();

            this.showing = true;
        },
        generateQRCode: function () {
            const self = this;
            const origin = location.origin || location.protocol + '://' + location.host;
            const pageUrl = self.options.linkSocial ? origin + self.options.linkSocial : document.URL;

            // Create a temporary canvas to generate QR code
            const canvas = document.createElement('canvas');
            const size = 128;

            canvas.width = size;
            canvas.height = size;

            // Simple QR code generation using a library-free approach
            // For a production environment, consider using qrcodejs or similar
            // For now, we'll use a data URL with a simple pattern
            // In a real implementation, you would use: new QRCode(canvas, { text: pageUrl, width: size, height: size });

            // Placeholder: Generate a simple pattern (in production, use proper QR library)
            const ctx = canvas.getContext('2d');

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.fillStyle = '#000000';

            // Create a simple pattern as placeholder
            // TODO: Integrate proper QR code library like qrcodejs2
            const moduleSize = 4;
            const modules = size / moduleSize;

            for (let row = 0; row < modules; row++) {
                for (let col = 0; col < modules; col++) {
                    // Simple checkerboard pattern as placeholder
                    if ((row + col) % 2 === 0) {
                        ctx.fillRect(col * moduleSize, row * moduleSize, moduleSize, moduleSize);
                    }
                }
            }

            self.qrCodeDataUrl(canvas.toDataURL());
        },
        hide: function () {
            globalVM.func.hideContainer(this.$container);
            this.showing = false;
        },
        copyClick: function (data, evt) {
            const target = evt.target;
            let inputElement = target.previousSibling;

            // Handle both input and textarea elements
            if (inputElement && (inputElement.tagName === 'INPUT' || inputElement.tagName === 'TEXTAREA')) {
                inputElement.click();
            } else {
                // If previousSibling is not the input, try finding it in the parent
                inputElement = target.parentElement.querySelector('input, textarea');

                if (inputElement) {
                    const value = inputElement.value || inputElement.textContent;

                    Utils.copyTextToClipboard(value);
                    inputElement.select();
                }
            }
        },
        linkClick: function (data, evt) {
            const element = evt.target;

            if (element) {
                const value = element.value || element.textContent;

                Utils.copyTextToClipboard(value);

                if (element.select) {
                    element.select();
                }
            }
        },
        share: function (network, networkName) {
            let url;
            const origin = location.origin || location.protocol + '://' + location.host;
            const options = this.options;
            const pageUrlOrigin = options.linkSocial ? origin + options.linkSocial : document.URL;
            const pageUrl = encodeURIComponent(pageUrlOrigin);
            let pageTitle = options.title;
            const pageDesc = options.desc;
            const image = options.img ? origin + options.img : null;
            const popup = function (url) {
                return Utils.popupCenter(url, '', 640, 480);
            };

            if (network === 'fb') {
                popup('https://www.facebook.com/sharer/sharer.php?u=' + pageUrl);
            } else if (network === 'vk') {
                url = 'http://vkontakte.ru/share.php?url=' + pageUrl + '&noparse=';

                if (pageTitle && image) {
                    url += 'true&title=' + encodeURIComponent(pageTitle) + '&image=' + encodeURIComponent(image);

                    if (pageDesc) {
                        url += '&description=' + encodeURIComponent(pageDesc);
                    }
                } else {
                    url += 'false';
                }

                popup(url);
            } else if (network === 'ok') {
                url = 'http://www.odnoklassniki.ru/dk?st.cmd=addShare';
                url += '&st.comments=' + encodeURIComponent('PastVu');
                url += '&st._surl=' + pageUrl;

                popup(url);
            } else if (network === 'tb') {
                if (image) {
                    url = 'https://www.tumblr.com/widgets/share/tool?posttype=photo&content=' + image +
                        '&canonicalUrl=' + pageUrl;

                    if (pageTitle) {
                        url += '&caption=' + encodeURIComponent(pageTitle);
                    }
                } else {
                    url = 'https://www.tumblr.com/widgets/share/tool?posttype=link&content=' + encodeURIComponent(pageTitle) +
                        '&canonicalUrl=' + pageUrl +
                        '&title=' + encodeURIComponent(pageTitle) + '&caption=' + encodeURIComponent(pageDesc);
                }

                popup(url);
            } else if (network === 'tw') {
                const _window = popup('');
                const maxLength = 280 - 6 - 23; // 23 is reserved for any length link

                if (pageTitle.length > maxLength) {
                    pageTitle = pageTitle.substr(0, maxLength) + '...';
                }

                _window.location = 'http://twitter.com/share?text=' + encodeURIComponent(pageTitle) +
                    '&url=' + pageUrl +
                    '&counturl=' + pageUrl;
            } else if (network === 'email') {
                // Email sharing
                const subject = encodeURIComponent(pageTitle || 'Share from PastVu');
                let body = encodeURIComponent(pageUrlOrigin);

                if (pageDesc) {
                    body = encodeURIComponent(pageDesc + '\n\n' + pageUrlOrigin);
                }

                window.location.href = 'mailto:?subject=' + subject + '&body=' + body;
            }

            gtag('event', 'share', {
                method: networkName,
                content_type: 'url',
                item_id: options.linkPage,
            });
        },
    });
});
