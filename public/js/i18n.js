/*global define:true*/
/**
 * Localizations
 */
define(['knockout', 'knockout.mapping', 'Utils'], function(ko, ko_mapping, Utils) {
	"use strict";
	var i18n = {
		en : {
			login : 'Log In',
			logout : 'Log Out',
			register : 'Sign Up',
			mod : 'Moderation',
			admin : 'Administration',
			gallery : 'Gallery',
			image_upload : 'Upload'
		},
		ru : {
			login : 'Вход',
			logout : 'Выход',
			register : 'Регистрация',
			mod : 'Модерирование',
			admin : 'Админ',
			gallery : 'Галерея',
			image_upload : 'Загрузить фото'
		}
	};
	return ko_mapping.fromJS(i18n.ru);
});