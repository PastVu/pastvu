define (['knockout.mapping', 'mvvm/GlobalParams'], function(ko_mapping, GlobalParams){
	Locations = {
		types: {'_def_': ko_mapping.toJS(GlobalParams.locDef)},
		range: [GlobalParams.locDefRange()],
		
		current: null,
		
		subscribers: [],
		
		set: function (obj) {
			$.extend(this.types, obj);
			this.subscribersNotify();
		},
		setRange: function (ran) {
			this.range = ran;
		},
		setRangeTypePos: function (type, pos) {
			this.range = ran;
		},
		subscribe: function (fn, context) {
			this.subscribers.push({fn: fn, context: context});
		},
		subscribersNotify:  function () {
			this.current = this.get();
			this.subscribers.forEach(function(element, index, array){
				element['fn'].call(element['context'] || null, this.current);
			}, this);
		},
		get: function(){
			for (var i=0; i<this.range.length; i++){
				if (this.types[this.range[i]]) return this.types[this.range[i]];
			}
		}
	};
	
	return Locations;
});