(function (factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define(['jquery', 'noty'], factory);
    } else {
        // Browser globals
        factory(jQuery, window.noty);
    }
}(function ($, noty) {

	$.noty.layouts.center = {
		name: 'center',
		options: { // overrides options
			
		},
		container: {
			object: '<ul id="noty_center_layout_container" />',
			selector: 'ul#noty_center_layout_container',
			style: function() {
				$(this).css({
					position: 'fixed',
					width: '310px',
					height: 'auto',
					margin: 0,
					padding: 0,
					listStyleType: 'none',
					zIndex: 10000000
				});

				// getting hidden height
				var dupe = $(this).clone().css({visibility:"hidden", display:"block", position:"absolute", top: 0, left: 0}).attr('id', 'dupe');
				$("body").append(dupe);
				dupe.find('.i-am-closing-now').remove();
				dupe.find('li').css('display', 'block');
				var actual_height = dupe.height();
				dupe.remove();

				if ($(this).hasClass('i-am-new')) {
					$(this).css({
						left: ($(window).width() - $(this).outerWidth(false)) / 2 + 'px',
						top: ($(window).height() - actual_height) / 2 + 'px'
					});
				} else {
					$(this).animate({
						left: ($(window).width() - $(this).outerWidth(false)) / 2 + 'px',
						top: ($(window).height() - actual_height) / 2 + 'px'
					}, 500);
				}
				
			}
		},
		parent: {
			object: '<li />',
			selector: 'li',
			css: {}
		},
		css: {
			display: 'none',
			width: '310px'
		},
		addClass: ''
	};
	
	$.noty.layouts.topRight = {
		name: 'topRight',
		options: { // overrides options

		},
		container: {
			object: '<ul id="noty_topRight_layout_container" />',
			selector: 'ul#noty_topRight_layout_container',
			style: function() {
				$(this).css({
					top: 37,
					right: 5,
					position: 'fixed',
					width: '320px',
					height: 'auto',
					margin: 0,
					padding: 0,
					listStyleType: 'none',
					zIndex: 10000000
				});

				if (window.innerWidth < 600) {
					$(this).css({
						right: 5
					});
				}
			}
		},
		parent: {
			object: '<li />',
			selector: 'li',
			css: {}
		},
		css: {
			display: 'none',
			width: '320px'
		},
		addClass: ''
	};

}));