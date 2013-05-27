/*global requirejs:true, require:true, define:true*/
/**
 * Klimashkin
 */
define(['jquery', 'underscore', 'knockout'], function ($, _, ko) {

	/**
	 * Создает новый дочерний контекст у дочерних элементов
	 * @type {Object}
	 */
	ko.bindingHandlers.newChildContext = {
		init: function (element, valueAccessor, allBindingsAccessor, viewModel, bindingContext) {
			var flag = valueAccessor(),
				childBindingContext = bindingContext.createChildContext(viewModel);
			ko.applyBindingsToDescendants(childBindingContext, element);

			// Also tell KO *not* to bind the descendants itself, otherwise they will be bound twice
			return { controlsDescendantBindings: true };
		}
	};
	ko.virtualElements.allowedBindings.newChildContext = true;

	/**
	 * Позволяет отменить байндинг у элемента и его потомков
	 * @type {Object}
	 */
	ko.bindingHandlers.allowBindings = {
		init: function (elem, valueAccessor) {
			// Let bindings proceed as normal *only if* my value is false
			var shouldAllowBindings = ko.utils.unwrapObservable(valueAccessor());
			return { controlsDescendantBindings: !shouldAllowBindings };
		}
	};
	ko.virtualElements.allowedBindings.allowBindings = true;

	/**
	 * Объединяет два массива
	 * @param arr Массив для объединения
	 * @param before Флаг, означающий что надо вставить в начало
	 * @return {*}
	 */
	ko.observableArray['fn']['concat'] = function (arr, before) {
		var underlyingArray = this(),
			methodCallResult;

		this.valueWillMutate();
		methodCallResult = Array.prototype[(before ? 'unshift' : 'push')][(Array.isArray(arr) ? 'apply' : 'call')](underlyingArray, arr);
		this.valueHasMutated();

		return methodCallResult;
	};
});