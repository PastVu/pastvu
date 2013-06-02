/*global define:true*/
/**
 * Модель профиля пользователя
 */
define(['underscore', 'underscore.string', 'Utils', '../../socket', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'model/Photo', 'model/storage', 'text!tpl/diff/news.jade', 'css!style/diff/news', 'bs/bootstrap-tooltip', 'bs/bootstrap-popover', 'jquery-plugins/scrollto'], function (_, _s, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, Photo, storage, jade) {
	'use strict';
	var newsDefault = {
		pdate: new Date(),
		title: 'Нет заголовка',
		txt: '',
		ccount: 0
	};

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.binded = false;
			this.auth = globalVM.repository['m/common/auth'];
			this.news = null;

			this.commentsLoading = ko.observable(false);
			this.commentsInViewport = false;

			this.scrollTimeout = null;
			this.commentsRecieveTimeout = null;
			this.commentsViewportTimeout = null;

			this.$comments = this.$dom.find('.newsComments');

			this.commentsRecieveBind = this.commentsRecieve.bind(this);
			this.commentsCheckInViewportBind = this.commentsCheckInViewport.bind(this);
			this.viewScrollHandleBind = this.viewScrollHandle.bind(this);
			this.scrollToBind = this.scrollTo.bind(this);

			this.childs = [
				{
					module: 'm/comment/comments',
					container: '.photoCommentsContainer',
					options: {type: 'news', autoShowOff: true},
					ctx: this,
					callback: function (vm) {
						this.commentsVM = this.childModules[vm.id] = vm;
						// Так как при первом заходе, когда модуль еще не зареквайрен, нужно вызвать самостоятельно, а последующие будут выстреливать сразу
						this.routeHandler();
					}
				}
			];

			// Вызовется один раз в начале 700мс и в конце один раз, если за эти 700мс были другие вызовы
			this.routeHandlerDebounced = _.throttle(this.routeHandler, 700, {leading: true, trailing: true});

			// Subscriptions
			this.subscriptions.route = globalVM.router.routeChanged.subscribe(this.routeHandlerDebounced, this);
			if (!this.auth.loggedIn()) {
				this.subscriptions.loggedIn = this.auth.loggedIn.subscribe(this.loggedInHandler, this);
			}
		},
		show: function () {
			if (this.showing) {
				return;
			}

			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		makeBinding: function () {
			if (!this.binded) {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.binded = true;
			}
			this.show();
		},

		routeHandler: function () {
			var cid = Number(globalVM.router.params().cid),
				hl = globalVM.router.params().hl;

			this.toComment = undefined;
			window.clearTimeout(this.scrollTimeout);

			if (hl) {
				if (hl.indexOf('comment-') === 0) {
					this.toComment = parseInt(hl.substr(8), 10) || undefined;
				}
			}

			if (!this.news || (this.news && Utils.isType('function', this.news.cid) && this.news.cid() !== cid)) {
				this.commentsVM.clear();
				this.commentsLoading(false);
				this.commentsInViewport = false;

				this.viewScrollOff();
				window.clearTimeout(this.commentsRecieveTimeout);
				window.clearTimeout(this.commentsViewportTimeout);
				this.commentsRecieveTimeout = null;
				this.commentsViewportTimeout = null;

				this.getNews(cid, function (data) {
					Utils.title.setTitle({title: data.news.title});
					$(window).scrollTo($('body'), {duration: 400, onAfter: function () {
						this.commentsVM.setCid(cid);
						this.commentsActivate(this.news.ccount() > 30 ? 600 : 410);
					}.bind(this)});

					this.makeBinding();
				}, this);

			} else if (this.toFrag || this.toComment) {
				this.scrollTimeout = window.setTimeout(this.scrollToBind, 50);
			}
		},
		loggedInHandler: function () {
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		getNews: function (cid, cb, ctx) {
			socket.once('takeNewsPublic', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					_.defaults(data.news, newsDefault);
					data.news.user.avatar = data.news.user.avatar ? '/_avatar/h/' + data.news.user.avatar : '/img/caps/avatarth.png';
					data.news.user.name = ((data.news.user.firstName && (data.news.user.firstName + ' ') || '') + (data.news.user.lastName || '')) || data.news.user.login;
					if (this.news) {
						this.news = ko_mapping.fromJS(data.news, this.news);
					} else {
						this.news = ko_mapping.fromJS(data.news);
					}
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}.bind(this));
			socket.emit('giveNewsPublic', {cid: cid});
		},

		/**
		 * COMMENTS
		 */
		viewScrollOn: function () {
			$(window).on('scroll', this.viewScrollHandleBind);
		},
		viewScrollOff: function () {
			$(window).off('scroll', this.viewScrollHandleBind);
		},
		viewScrollHandle: function () {
			if (!this.commentsInViewport) {
				this.commentsCheckInViewport();
			}
		},
		commentsActivate: function (checkTimeout) {
			if (!this.commentsViewportTimeout) {
				this.commentsLoading(true);
				this.viewScrollOn();
				this.commentsViewportTimeout = window.setTimeout(this.commentsCheckInViewportBind, checkTimeout || 10);
			}
		},
		commentsCheckInViewport: function () {
			window.clearTimeout(this.commentsViewportTimeout);
			this.commentsViewportTimeout = null;

			var cTop = this.$comments.offset().top,
				wTop = $(window).scrollTop(),
				wFold = $(window).height() + wTop;

			if (this.toComment || cTop < wFold) {
				this.commentsInViewport = true;
				this.viewScrollOff();
				this.commentsGet();
			}
		},
		commentsGet: function () {
			window.clearTimeout(this.commentsRecieveTimeout);
			this.commentsRecieveTimeout = window.setTimeout(this.commentsRecieveBind, this.news.ccount() > 30 ? 750 : 400);
		},
		commentsRecieve: function () {
			this.commentsVM.recieve(this.news.cid(), function () {
				this.commentsLoading(false);
				this.commentsVM.show();
				this.scrollTimeout = window.setTimeout(this.scrollToBind, 100);
			}, this);
		},

		scrollToPhoto: function (duration, cb, ctx) {
			var $wrap = this.$dom.find('.photoImgWrap');

			$(window).scrollTo($wrap, {duration: duration || 400, onAfter: function () {
				if (Utils.isType('function', cb)) {
					cb.call(ctx);
				}
			}});
		},
		scrollTo: function () {
			if (this.toFrag) {
				this.commentsVM.highlightOff();
				this.scrollToFrag(this.toFrag);
			} else if (this.toComment) {
				this.highlightFragOff();
				this.commentsVM.scrollTo(this.toComment);
			}
		},
		scrollToFrag: function (frag) {
			var $element = $('.photoFrag[data-cid="' + frag + '"]');

			if ($element && $element.length === 1) {
				this.highlightFragOff();
				$(window).scrollTo($element, {duration: 400, onAfter: function () {
					this.highlightFrag(frag);
				}.bind(this)});
			}
			return $element;
		},
		highlightFrag: function (frag) {
			this.$dom.find('.photoFrag[data-cid="' + frag + '"]').addClass('hl');
		},
		highlightFragOff: function () {
			this.$dom.find('.photoFrag.hl').removeClass('hl');
		},

		commentCountIncrement: function (delta) {
			this.news.ccount(this.news.ccount() + delta);
		},
		commentAdd: function () {
			this.commentsVM.replyZero();
		},

		onImgLoad: function (data, event) {
			$(event.target).animate({opacity: 1});
			data = event = null;
		},
		onAvatarError: function (data, event) {
			//event.target.setAttribute('src', '/img/caps/avatar.png');
			data = event = null;
		}
	});
});