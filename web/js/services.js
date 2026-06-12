'use strict';

lqSync.factory('lqShop', ['$resource', function ($resource) { return $resource('shop', { id: '@Id' }); } ]);

lqSync.factory('lqTemplates', ['$resource', function ($resource) { return $resource('template'); } ]);


lqSync.factory('lqConfigTemplate', ['$resource', function ($resource) { return $resource('cnftemplate'); } ]);


lqSync.factory('lqCurrentShop', ['$resource', function ($resource) { return $resource('currshop', { id: 0 }); } ]);


lqSync.factory('lqLog', ['$resource', function ($resource) { return $resource('log'); } ]);
lqSync.factory('lqConsole', ['$resource', function ($resource) { return $resource('console'); } ]);
lqSync.factory('lqLang', ['$resource', function ($resource) { return $resource('lang', { id: 0 }); } ]);
lqSync.factory('lqTranslations', ['$resource', function ($resource) { return $resource('translations', { id: 0 }); } ]);
lqSync.factory('lqOpenFolder', ['$resource', function ($resource) { return $resource('openfolder'); } ]);