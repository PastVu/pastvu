/**
 * Copyright: The PastVu contributors.
 * GNU Affero General Public License v3.0+ (see COPYING or https://www.gnu.org/licenses/agpl.txt)
 */

import Utils from 'Utils';
import socket from 'socket';
import 'Params';
import ko from 'knockout';
import 'knockout.mapping';
import Cliche from 'm/_moduleCliche';
import globalVM from 'globalVM';
import Photo from 'model/Photo';
import doT from 'dot/doT';
import pug from 'tpl/main/commentsFeed.pug?raw';
import 'style/main/commentsFeed.css';

let tplComments;
const regexpAHrefTag = /<(?:\s*)?\/?(?:\s*)?a[^>]*>/g;
const regexpNewLine = /\f|\r|\n|<br\/?>/gi;

export default Cliche.extend({
    pug: pug,
    create: function () {
        this.auth = globalVM.repository['m/common/auth'];
        ko.applyBindings(globalVM, this.$dom[0]);
        this.receive(function () {
            if (!this.auth.loggedIn()) {
                this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
            }

            this.show();
        }, this);
    },
    show: function () {
        globalVM.func.showContainer(this.$container);
        this.showing = true;
    },
    hide: function () {
        globalVM.func.hideContainer(this.$container);
        this.showing = false;
    },
    loggedInHandler: function () {
        //Перезапрашиваем ленту комментариев на главной, чтобы показать для регионов пользователя
        this.receive();
        this.subscriptions.loggedIn.dispose();
        delete this.subscriptions.loggedIn;
    },
    receive: function (cb, ctx) {
        socket.run('comment.giveForFeed', { limit: 30 }).then(function (data) {
            let photo;
            let user;
            let comment;
            const regions = data.regions;
            const photoCommentsToInsert = [];
            let i;
            let j;

            for (i in data.users) {
                if (data.users[i] !== undefined) {
                    user = data.users[i];
                    user.link = '/u/' + user.login;
                }
            }

            for (i = 0; i < data.comments.length; i++) {
                comment = data.comments[i];

                //Убираем тэги ссылок (т.к. всё сообщение у нас ссылка, а ссылки в ссылках не разрешены)
                //и заменяем перенос строки на пробел в каждом сообщении
                comment.txt = comment.txt.replace(regexpAHrefTag, '').replace(regexpNewLine, ' ');

                photo = data.photos[comment.obj];
                user = data.users[comment.user];

                if (photo && user) {
                    comment.user = user;

                    if (photo.comments === undefined) {
                        photo.link = '/p/' + photo.cid;
                        photo.sfile = Photo.picFormats.s + photo.file;
                        photo.comments = [];

                        if (photo.rs) {
                            for (j = photo.rs.length; j--;) {
                                photo.rs[j] = regions[photo.rs[j]];
                            }
                        }

                        photoCommentsToInsert.push(photo);
                    }

                    comment.link = photo.link + '?hl=comment-' + comment.cid;
                    photo.comments.unshift(comment);
                }
            }

            if (!tplComments) {
                tplComments = doT.template(document.getElementById('cfeeddot').text);
            }

            this.$dom[0].querySelector('.commentsBody').innerHTML = tplComments({
                photos: photoCommentsToInsert,
                regionTitle: Utils.regionTitle,
            });

            if (cb) {
                cb.call(ctx);
            }
        }.bind(this));
    },
});
