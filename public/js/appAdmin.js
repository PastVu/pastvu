/*global requirejs:true*/
requirejs.config({
    baseUrl: '/js',
    waitSeconds: 15,
    deps: ['lib/JSExtensions'],
    paths: {
        'jquery': 'lib/jquery/jquery-1.8.0.min',
        'socket.io': 'lib/socket.io',

        'domReady': 'lib/require/plugins/domReady',
        'text': 'lib/require/plugins/text',
        'css': 'lib/require/plugins/css',
        'css.api': 'lib/require/plugins/css.api',
        'async': 'lib/require/plugins/async',
        'goog': 'lib/require/plugins/goog',
        'Utils': 'lib/Utils',
        'Browser': 'lib/Browser',

        'knockout': 'lib/knockout/knockout-2.1.0',
        'knockout.mapping': 'lib/knockout/knockout.mapping-latest',

        'jquery.ui': 'lib/jquery/ui/jquery-ui-1.8.22.custom.min',
        'jquery.jgrid': 'lib/jquery/plugins/grid/jquery.jqGrid.min',
        'jquery.jgrid.en': 'lib/jquery/plugins/grid/i18n/grid.locale-en'
    }
});
//////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
require(['lib/JSExtensions']); //Делаем require вместо deps чтобы модуль заинлайнился во время оптимизации

require([
    'domReady',
    'jquery',
    'Utils',
    'socket',
    'EventTypes',
    'knockout', 'knockout.mapping',
    'mvvm/GlobalParams', 'mvvm/User', 'mvvm/TopPanel', 'mvvm/i18n',
    'KeyHandler', 'auth',
    'jquery.ui', 'jquery.jgrid', 'jquery.jgrid.en'
], function (domReady, $, Utils, socket, ET, ko, ko_mapping, GlobalParams, User, TopPanel, i18n, keyTarget, auth) {
    console.timeStamp('Require app Ready');
    var login, reg, recall,
        profileView, profileVM,
        grid, grid_data, lastSel;

    $.when(LoadParams(), waitForDomReady())
        .pipe(auth.LoadMe)
        .then(app);

    function waitForDomReady() {
        var dfd = $.Deferred();
        domReady(function () {
            console.timeStamp('Dom Ready');
            dfd.resolve();
        })
        return dfd.promise();
    }

    function LoadParams() {
        var dfd = $.Deferred();
        socket.on('takeGlobeParams', function (json) {
            ko_mapping.fromJS(json, GlobalParams);
            dfd.resolve();
        });
        socket.emit('giveGlobeParams');
        return dfd.promise();
    }

    function app() {
        new TopPanel('top_panel_fringe');
        grid = $("#usersGrid");

        CreateGrid();

        socket.on('initMessage', function (json) {
            var init_message = json.init_message;
        });
    }

    function CreateGrid() {
        socket.on('takeUsers', function (users) {
            console.dir(users);
            //users.forEach(function(element){});

            var avatar = '/ava/__def__.png';

            function unitsInStockFormatter(cellvalue, options, rowObject) {
                var cellValueInt = parseInt(cellvalue);

                return "<div class='userGridAvatar' style='background-image: url(" + (cellvalue || avatar) + ")'></div>";
            }

            grid_data = users;
            grid.jqGrid({
                data: grid_data,
                datatype: "local",
                height: 'auto',
                colNames: ['Join date', 'Avatar', 'Login', 'Email', 'Role', 'First name', 'Last name', 'Country', 'City'],
                colModel: [
                    {name: 'regdate', index: 'regdate', width: 110, align: 'center', sorttype: 'date', formatter: 'date', formatoptions: {newformat: 'd.m.Y'}},
                    {name: 'avatar', index: 'avatar', width: 46, formatter: unitsInStockFormatter},
                    {name: 'login', index: 'login', width: 150},
                    {name: 'email', index: 'email', width: 170, align: 'left'},
                    {name: 'roles', index: 'roles', width: 170, align: 'center',
                        formatter: 'select', editable: true, edittype: 'select',
                        editoptions: {
                            value: 'registered:Registered user;spec:Special account;moderator:Moderator;admin:Administrator;super_admin:Super Administrator',
                            multiple: true,
                            size: 5
                        }
                    },
                    {name: 'firstName', index: 'firstName', width: 100, align: 'right'},
                    {name: 'lastName', index: 'lastName', width: 150, align: 'left'},
                    {name: 'country', index: 'country', width: 100},
                    {name: 'city', index: 'city', width: 130}
                ],
                afterInsertRow: function (rowId, data) {
                    grid.setCell(rowId, 'roles', '', {'white-space': 'normal'});
                },
                loadComplete: function () {
                    //grid.jqGrid('setCell',"","login","",{color:'red'});
                },
                editurl: 'clientArray',
                onSelectRow: function (rowid) {
                    if (rowid && rowid !== lastSel) {
                        jQuery(this).restoreRow(lastSel);
                        lastSel = rowid;
                    }
                },
                sortname: 'regdate',
                sortorder: "asc",
                multiselect: false,
                caption: "Oldmos active users"
            });
            $("#edit").click(function () {
                var rowid = grid.jqGrid('getGridParam', 'selrow');
                grid.jqGrid('editRow', rowid, true, null, null, 'clientArray');
            });
            $("#gotouser").click(function () {
                var rowid = grid.jqGrid('getGridParam', 'selrow');
                item = grid.jqGrid('getRowData', rowid);
                if (item) {
                    window.open("/u/" + item.login);
                }
            });
        });
        socket.emit('giveUsers', {});
    }

});
