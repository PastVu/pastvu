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
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.regionsTree = ko.observableArray();
			this.regionsFlat = [];
			this.regionsTypehead = [];
			this.regionsHashByTitle = {};

			this.getRegions(function () {
				ko.applyBindings(globalVM, this.$dom[0]);
				this.createTokens();
				this.show();
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
			socket.once('takeRegionList', function (data) {
				var error = !data || !!data.error || !data.regions;

				if (error) {
					window.noty({text: data && data.message || 'Error occurred', type: 'error', layout: 'center', timeout: 4000, force: true});
				} else {
					this.regionsTree(this.treeBuild(data.regions));
					this.regionsFlat = data.regions;
					console.log(this.regionsTypehead);
				}

				if (Utils.isType('function', cb)) {
					cb.call(ctx, data, error);
				}
			}.bind(this));
			socket.emit('giveRegionList', {});
		},
		createTokens: function () {
			this.$dom.find('.regionstkn')
				.tokenfield({
					allowDuplicates: false,
					createTokensOnBlur: false,
					minLength: 1,
					tokens: [
						{
							value: 'США',
							label: 'США'
						}
					], //[{value: "one", label: "Einz"}, {value: "two", label: "Zwei"}],

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
				.on('afterCreateToken', function (e) {
					var title = e.token.value,
						region = this.regionsHashByTitle[title];

					if (region) {
						region.selected(true);
						this.nodeToggle(region, false, true, 'up');
					} else {
						$(e.relatedTarget).addClass('invalid');
					}
				}.bind(this));

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
				region.opened = ko.observable(false);
				region.selected = ko.observable(false);
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
		 * Открывает/закрывает узел дерева. Возможно рекурсивное переклчение
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
		},
		selectToggle: function (cid) {
			console.log(arguments);
		}
	});
});