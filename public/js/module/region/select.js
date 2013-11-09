/*global define:true*/

/**
 * Модель создания/редактирования новости
 */
define([
	'underscore', 'jquery', 'Utils', 'socket!', 'Params', 'knockout', 'knockout.mapping', 'm/_moduleCliche', 'globalVM',
	'model/storage', 'text!tpl/region/select.jade', 'css!style/region/select', 'bs/ext/tokenfield'
], function (_, $, Utils, socket, P, ko, ko_mapping, Cliche, globalVM, storage, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			selectedInit: []
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];

			this.selectedInit = this.options.selectedInit;
			this.selectedInitHash = {};
			this.selectedInitTkns = [];
			if (this.selectedInit.length) {
				this.selectedInit.forEach(function (item) {
					this.selectedInitHash[item.title_local] = item;
					this.selectedInitTkns.push({value: item.title_local, label: item.title_local});
				}, this);
			}

			this.regionsTree = ko.observableArray();
			this.regionsFlat = [];
			this.regionsTypehead = [];
			this.regionsHashByTitle = {};

			this.getRegions(function () {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.show();
				//Создавать токены должны после отображения, чтобы появился скроллинг и правильно посчиталась ширина инпута для typehead
				this.createTokens();
			}, this);
		},
		show: function (cb, ctx) {
			globalVM.func.showContainer(this.$container);
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getRegions: function (cb, ctx) {
			socket.once('takeRegions', function (data) {
				var error = !data || !!data.error || !data.regions;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					this.regionsTree(this.treeBuild(data.regions));
					this.regionsFlat = data.regions;
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegions', {});
		},
		getSelectedRegions: function (fields) {
			var tkn = this.$dom.find('.regionstkn'),
				tokens = tkn.tokenfield('getTokens'),
				result = [];

			tokens.forEach(function (item) {
				var region = this.regionsHashByTitle[item.value];
				if (region) {
					result.push(fields ? _.pick(region, fields) : region);
				}
			}, this);
			return result;
		},
		createTokens: function () {
			this.$dom.find('.regionstkn')
				.tokenfield({
					allowDuplicates: false,
					createTokensOnBlur: false,
					minLength: 1,
					minWidth: 200,
					tokens: this.selectedInitTkns,
					typeahead: {
						name: 'regions',
						valueKey: 'title',
						limit: 7,
						local: this.regionsTypehead/*[{
						 title: 'США',
						 tokens: ['USA', 'США', 'Соединенные Штаты Америки']
						 }]*/
					}
				})
				.on('afterCreateToken', this.onCreateToken.bind(this)) //При создании токена добавляем выбор
				.on('beforeEditToken removeToken', this.onRemoveToken.bind(this)); //При удалении или редиктировании токена удаляем выбор

		},
		onCreateToken: function (e) {
			var title = e.token.value,
				region = this.regionsHashByTitle[title];

			if (region) {
				if (this.checkBranchSelected(region)) {
					this.removeToken(region);
					window.noty({text: 'Нельзя одновременно выбирать родительский и дочерний регионы', type: 'error', layout: 'center', timeout: 3000, force: true});
					return;
				}
				region.selected(true);
				this.nodeToggle(region, false, true, 'up');
			} else {
				$(e.relatedTarget).addClass('invalid').attr('title', 'Нет такого региона');
			}
		},
		onRemoveToken: function (e) {
			var title = e.token.value,
				region = this.regionsHashByTitle[title];

			if (region) {
				region.selected(false);
			}
		},
		removeToken: function (region) {
			var title = region.title_local,
				tkn = this.$dom.find('.regionstkn'),
				tokensExists;

			tokensExists = tkn.tokenfield('getTokens');
			_.remove(tokensExists, function (item) {
				return item.value === title;
			});
			tkn.tokenfield('setTokens', tokensExists);
		},
		selectNode: function (title) {
			var region = this.regionsHashByTitle[title],
				add = !region.selected(),
				tkn = this.$dom.find('.regionstkn'),
				tokensExists;

			if (add) {
				if (this.checkBranchSelected(region)) {
					window.noty({text: 'Нельзя одновременно выбирать родительский и дочерний регионы', type: 'error', layout: 'center', timeout: 3000, force: true});
					return;
				}
				tkn.tokenfield('createToken', {value: title, label: title});
			} else {
				this.removeToken(region);
			}
			region.selected(add);
		},
		checkBranchSelected: function (region) {
			return uprecursive(region.parent) || downrecursive(region.regions);

			function uprecursive(region) {
				return region && (region.selected() || uprecursive(region.parent));
			}

			function downrecursive(regions) {
				if (regions && regions.length) {
					for (var i = regions.length; i--;) {
						if (regions[i].selected() || downrecursive(regions[i].regions)) {
							return true;
						}
					}
				}
				return false;
			}
		},

		treeBuild: function (arr) {
			var i = 0,
				len = arr.length,
				hash = {},
				region,
				results = [];

			//Сортируем массим по уровням и названиям в пределах одного уровня
			arr.sort(function (a, b) {
				return a.parents.length < b.parents.length || a.parents.length === b.parents.length && a.title_en < b.title_en ? -1 : 1;
			});

			function incrementParentsChildLen(region, deepestLevel) {
				var parentRegion = region.parent,
					parentChildsArrPosition = deepestLevel - parentRegion.level - 1;

				//Если открыт дочерний, надо открыть и родителя
				if (region.opened()) {
					parentRegion.opened(true);
				}
				parentRegion.childLenAll += 1;
				parentRegion.childLenArr[parentChildsArrPosition] = -~parentRegion.childLenArr[parentChildsArrPosition];
				if (parentRegion.parent) {
					incrementParentsChildLen(parentRegion, deepestLevel);
				}
			}

			for (; i < len; i++) {
				region = arr[i];
				region.regions = [];
				region.level = region.parents.length;
				region.childLen = 0; //Количество непосредственных потомков
				region.childLenAll = 0; //Количество всех потомков
				region.childLenArr = [0]; //Массив количеств потомков
				region.selected = ko.observable(this.selectedInitHash[region.title_local] !== undefined);
				region.opened = ko.observable(region.selected());
				if (region.level) {
					region.parent = hash[region.parents[region.level - 1]];
					region.parent.regions.push(region);
					region.parent.childLen += 1;
					incrementParentsChildLen(region, region.level);
				} else {
					results.push(region);
				}
				hash[region.cid] = region;

				this.regionsTypehead.push({title: region.title_local, tokens: [region.title_local, region.title_en]});
				this.regionsHashByTitle[region.title_local] = region;
			}

			return results;
		},

		/**
		 * Открывает/закрывает узел дерева. Возможно рекурсивное переключение
		 * @param region Стартовый регион
		 * @param expandSelf Открыть/закрыть непосредственно переданный узел (true/false)
		 * @param cascadeExpand Открыть/закрыть рекурсивные узлы (true/false)
		 * @param cascadeDir Направление рекурсивного переключения ('up'/'down')
		 */
		nodeToggle: function (region, expandSelf, cascadeExpand, cascadeDir) {
			var nextRegions,
				i;

			if (region) {
				region.opened(typeof expandSelf === 'boolean' ? expandSelf : (typeof cascadeExpand === 'boolean' ? cascadeExpand : !region.opened()));
			} else if (cascadeDir) {
				region = {regions: this.regionsTree()};
			}

			if (cascadeDir === 'up' && region.parent) {
				nextRegions = [region.parent];
			} else if (cascadeDir === 'down' && region.regions.length) {
				nextRegions = region.regions;
			}
			if (nextRegions) {
				for (i = nextRegions.length; i--;) {
					this.nodeToggle(nextRegions[i], undefined, cascadeExpand, cascadeDir);
				}
			}
		},

		collapseToggle: function (data, event) {
			data.opened(!data.opened());
		},
		expandAll: function (data, event) {
			this.nodeToggle(null, null, true, 'down');
		},
		collapseAll: function (data, event) {
			this.nodeToggle(null, null, false, 'down');
		}
	});
});