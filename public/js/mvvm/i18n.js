/**
 * Localizations
 */
define(['knockout', 'knockout.mapping', 'Utils'], function(ko, ko_mapping, Utils) {
	var i18n = {
		en : {
			login : 'Login',
			logout : 'Logout',
			register : 'Registration',
			admin : 'Administration',
			image_upload : 'Upload photo'
		},
		ru : {
			login : 'Вход',
			logout : 'Выход',
			register : 'Регистрация',
			admin : 'Администрирование',
			image_upload : 'Загрузить фото'
		}
	}
	return ko_mapping.fromJS(i18n.en);
});