/**
 * Localizations
 */
define(['knockout', 'knockout.mapping', 'Utils'], function(ko, ko_mapping, Utils) {
	var i18n = {
		en : {
			login : 'Login',
			logout : 'Logout',
			register : 'Registration',
			admin : 'Administration'
		},
		ru : {
		}
	}
	return ko_mapping.fromJS(i18n.en);
});