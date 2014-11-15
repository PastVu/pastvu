/**
 * Выбор причины
 */
define(['underscore', 'jquery', 'Utils', 'Params', 'globalVM', 'knockout', 'm/_moduleCliche', 'text!tpl/common/reason.jade', 'css!style/common/reason'], function (_, $, Utils, P, globalVM, ko, Cliche, jade) {
	'use strict';

	return Cliche.extend({
		jade: jade,
		options: {
			text: '',
			select: []
		},
		create: function () {
			this.auth = globalVM.repository['m/common/auth'];
			this.selectedKey = ko.observable();
			this.desc = ko.observable('');
			this.errMsg = ko.observable('');

			this.selected = this.co.selected = ko.computed(function () {
				var selectedKey = this.selectedKey();
				return _.find(this.options.select, function (item) {
					return item.key === selectedKey;
				});
			}, this);

			if (this.options.select.length) {
				this.selectedKey(this.options.select[0].key);
			}

			ko.applyBindings(globalVM, this.$dom[0]);
			this.show();
		},
		show: function () {
			globalVM.func.showContainer(this.$container);
			if (this.modal) {
				this.modal.$curtain.addClass('showModalCurtain');
			}
			this.showing = true;
		},
		hide: function () {
			globalVM.func.hideContainer(this.$container);
			this.showing = false;
		},
		getReason: function () {
			var selected = this.selected(),
				key = Number(selected.key),
				desc = this.desc();

			if (selected.desc || !key) {
				if (desc.length < (selected.descmin || 5) ||
					desc.length > (selected.descmax || 1000)) {
					this.errMsg('Длина описания должна быть в пределах ' + (selected.descmin || 5) + ' - ' + (selected.descmax || 1000) + ' символов');
					return false;
				}
			}
			return {key: key, desc: desc};
		}
	});

});