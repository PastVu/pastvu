define(['jquery'], function (jQuery) {

	jQuery.extend({
		cachedScript: function(url, options) {
			// allow user to set any option except for dataType, cache, and url
			options = jQuery.extend(options || {}, {
				dataType: "script",
				crossDomain: true, //Hack to display scripts in firebug panel
				cache: false,
				url: url
			});
			// Use $.ajax() since it is more flexible than $.getScript
			// Return the jqXHR object so we can chain callbacks
			return jQuery.ajax(options);
		},
		getScript: function(url, callback) {
			var head = document.getElementsByTagName("head")[0],
				script = document.createElement("script");
			script.src = url;
			script.type = 'text/javascript';

			// Handle Script loading
			{
				var done = false;

				// Attach handlers for all browsers
				script.onload = script.onreadystatechange = function(){
					if ( !done && (!this.readyState ||
					this.readyState == "loaded" || this.readyState == "complete") ) {
						done = true;
						if (callback) callback();

						// Handle memory leak in IE
						script.onload = script.onreadystatechange = null;
					}
				};
			}

			head.appendChild(script);

			// We handle everything using the script element injection
			return undefined;
		},
		
		getStyle: function(path, callbackSuccess, callbackFail, scope) {
			var head = document.getElementsByTagName('head')[0], // reference to document.head for appending/ removing link nodes
			   link = document.createElement('link');           // create the link node
			link.setAttribute('href', path);
			link.setAttribute('rel', 'stylesheet');
			link.setAttribute('type', 'text/css');

			var sheet, cssRules;
			//get the correct properties to check for depending on the browser
			if ( 'sheet' in link ) {
				sheet = 'sheet'; cssRules = 'cssRules';
			} else {
				sheet = 'styleSheet'; cssRules = 'rules';
			}

		   var interval_id = setInterval(function() {	// start checking whether the style sheet has successfully loaded
			  try {
				 if ( link[sheet] && link[sheet][cssRules].length ) { // SUCCESS! our style sheet has loaded
					clearInterval( interval_id );                     // clear the counters
					clearTimeout( timeout_id );
					callbackSuccess.call(scope || window);	// fire the success callback
				 }
			  } catch( e ) {console.error('Ошибка применения стилей (getStyle) '+e); if(callbackFail) callbackFail.call(scope || window);} finally {}
		   }, 100);
		   
		   var timeout_id = setTimeout(function() {	// start counting down till fail
			  clearInterval( interval_id );	// clear the counters
			  clearTimeout( timeout_id );
			  head.removeChild( link );	// since the style sheet didn't load, remove the link node from the DOM
			  console.error('Превышен интервал загрузки стилей (getStyle)');
			  if(callbackFail) callbackFail.call(scope || window); // fire the fail callback
		   }, 15000);

		   head.appendChild(link);  // insert the link node into the DOM and start loading the style sheet

		   return link; // return the link node;

		},
		
		urlParam: function(name){
			var results = new RegExp('[\\?&]' + name + '=([^&#]*)').exec(window.location.href);
			return (results && results[1] ? decodeURIComponent(results[1]): 0);
		}
	});

	/**
	 * Serialize Form to JSON
	 */
	jQuery.fn.serializeObject = function()
	{
	   var o = {};
	   var a = this.serializeArray();
	   $.each(a, function() {
		   if (o[this.name]) {
			   if (!o[this.name].push) {
				   o[this.name] = [o[this.name]];
			   }
			   o[this.name].push(this.value || '');
		   } else {
			   o[this.name] = this.value || '';
		   }
	   });
	   return o;
	};

});