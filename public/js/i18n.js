/*global define:true*/
/**
 * Localizations
 */
define(['knockout', 'knockout.mapping', 'Utils'], function(ko, ko_mapping, Utils) {
	"use strict";
	var i18n = {
		en : {
			login : 'Login',
			logout : 'Logout',
			register : 'Registration',
			mod : 'Moderation',
			admin : 'Administration',
			image_upload : 'Загрузить фото'
		},
		ru : {
			login : 'Вход',
			logout : 'Выход',
			register : 'Регистрация',
			mod : 'Модерирование',
			admin : 'Админ',
			image_upload : 'Загрузить фото'
		}
	};
	return ko_mapping.fromJS(i18n.ru);
});