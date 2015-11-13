/**
 * Модель новости
 */
define(['underscore', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM', 'renderer', 'moment', 'model/Photo', 'model/storage', 'text!tpl/diff/news.jade', 'css!style/diff/news'], function (_, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, renderer, moment, Photo, storage, jade) {
	'use strict';
	var newsDefault = {
		pdate: new Date(),
		title: 'Нет заголовка',
		txt: '',
		ccount: 0,
		ccount_new: 0,
		nocomments: false,
		subscr: false
	};

	return Cliche.extend({
		jade: jade,
		create: function () {
			this.binded = false;
			this.auth = globalVM.repository['m/common/auth'];
			this.news = null;

			this.canEdit = ko.observable(this.auth.loggedIn() && this.auth.iAm.role() > 9);

			this.scrollTimeout = null;
			this.scrollToBind = this.scrollTo.bind(this);

			this.childs = [
				{
					module: 'm/comment/comments',
					container: '.commentsContainer',
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
			this.routeHandlerDebounced = _.debounce(this.routeHandler, 700, {leading: true, trailing: true});

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
					this.toComment = hl.substr(8) || undefined; //Навигация к конкретному комментарию
				} else if (hl.indexOf('comments') === 0) {
					this.toComment = true; //Навигация к секции комментариев
				}
			}

			if (!this.news || (this.news && Utils.isType('function', this.news.cid) && this.news.cid() !== cid)) {
				this.commentsVM.deactivate();

				this.getNews(cid, function (data) {
					Utils.title.setTitle({title: data.news.title});
					$(window).scrollTo($('body'), { offset: -P.window.head, duration: 400, onAfter: function () {
						this.commentsActivate();
					}.bind(this)});

					this.makeBinding();
					ga('send', 'pageview');
				}, this);
			} else if (this.toComment) {
				this.scrollTimeout = window.setTimeout(this.scrollToBind, 50);
			}
		},
		loggedInHandler: function () {
			// После логина проверяем если мы можем редактировать новости
			this.canEdit(this.auth.iAm.role() > 9);
			this.subscriptions.loggedIn.dispose();
			delete this.subscriptions.loggedIn;
		},
		getNews: function (cid, cb, ctx) {
			socket.once('takeNewsPublic', function (data) {
				if (!data || data.error || !data.news) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 3000, force: true});
				} else {
					_.defaults(data.news, newsDefault);
					data.news.user.avatar = data.news.user.avatar ? P.preaddr + '/_a/d/' + data.news.user.avatar : '/img/caps/avatar.png';
					if (this.news) {
						this.news = ko_mapping.fromJS(data.news, this.news);
					} else {
						this.news = ko_mapping.fromJS(data.news);
						this.canComment = this.co.canComment = ko.computed(function () {
							return !this.news.nocomments() || this.canEdit();
						}, this);
					}
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data);
				}
			}, this);
			socket.emit('index.giveNewsPublic', {cid: cid});
		},

		/**
		 * COMMENTS
		 */
		commentsActivate: function (options) {
			this.commentsVM.activate(
				{cid: this.news.cid(), count: this.news.ccount(), countNew: this.news.ccount_new(), subscr: this.news.subscr(), nocomments: this.news.nocomments()},
				_.defaults(options || {}, {instant: !!this.toComment, checkTimeout: this.news.ccount() > 30 ? 600 : 410}),
				function () {
					//На случай наличия параметра подсветки фрагментов или комментариев вызываем scrollTo, после окончания receive
					window.setTimeout(this.scrollToBind, 150);
				},
				this
			);
		},

		scrollTo: function () {
			if (this.toComment) {
				this.commentsVM.scrollTo(this.toComment);
			}
			this.toComment = undefined;
		},

		commentCountIncrement: function (delta) {
			this.news.ccount(this.news.ccount() + delta);
		},
		setNoComments: function (val) {
			this.news.nocomments(val);
		},
		setSubscr: function (val) {
			this.news.subscr(val);
		},

		onImgLoad: function (data, event) {
			$(event.target).animate({opacity: 1});
			data = event = null;
		}
	});
});