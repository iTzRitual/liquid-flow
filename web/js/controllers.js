'use strict';

lqSync.controller('HeaderCtrl', ['$scope', '$rootScope', 'lqLang', 'lqTranslations', function ($scope, $rootScope, lqLang, lqTranslations) {

  lqTranslations.get(function (z) {
    $rootScope.translations = z.Translations;
    $rootScope.version = z.Version;
    $scope.languages = z.Languages;
  });

  $scope.lng = lqLang.get(function (z) {
    $scope.language = z;
  });

  $scope.change = function () {
    $scope.language.$save(function () {
      lqTranslations.get(function (z) {
        $rootScope.translations = z.Translations;
      });
    });
  }

} ]);

lqSync.controller('ShopListCtrl', ['$scope', '$location', '$routeParams', 'lqShop', 'lqCurrentShop', function ($scope, $location, $routeParams, lqShop, lqCurrentShop) {

  $scope.currentShop = lqCurrentShop.get();

  $scope.shops = lqShop.query();

  $scope.addShop = function () { $location.path('/shop'); }

  $scope.$on('shopsChanged', function (e, a) {
    $scope.shops = lqShop.query();
  });

  $scope.$on('$routeChangeSuccess', function (e, a) {
    $scope.currentShop = lqCurrentShop.get();
  })

} ]);

lqSync.controller('ViewShopListCtrl', ['$scope', '$location', 'lqShop', 'lqCurrentShop', function ($scope, $location, lqShop, lqCurrentShop) {

  $scope.currentShop = lqCurrentShop.get();

  $scope.shops = lqShop.query(function (d) {
    if (d.length === 0) $location.path('/shop');
  });

} ]);

lqSync.controller('ShopCtrl', ['$scope', '$location', '$routeParams', '$rootScope', 'lqShop', function ($scope, $location, $routeParams, $rootScope, lqShop) {

  $scope.id = $routeParams.id;

  if ($scope.id === undefined) {
    var shop = new lqShop();

    shop.Login = 'webmaster';

    /*shop.Name = 'localhost';
    shop.Url = 'http://localhost:1604/e-sklep/';
    shop.Password = 'admin';
    shop.SavePassword = true;*/

    $scope.shop = shop;
  }
  else {
    lqShop.get({ id: $scope.id }, function (d) {
      if (d.Id === undefined) {
        $rootScope.$broadcast('shopsChanged', null);
        $location.path('/');
      }
      else {
        $scope.shop = d;
      }
    });
  }

  $scope.signIn = function () {
    if (!$scope.form.$valid) return;
    $scope.shop.$save(function (d) {
      $rootScope.$broadcast('shopsChanged', null);
      $location.path('/shop/templates');
    });
  }

  $scope.cancel = function () {
    $location.path('/');
    return;
    if ($scope.id === undefined) {
      $scope.shop = new lqShop();
    }
    else {
      $scope.shop = lqShop.get({ id: $scope.id });
    }
  }

  $scope.remove = function () {
    $scope.shop.$remove(function () {
      $rootScope.$broadcast('shopsChanged', null);
      $location.path('/');
    });
  };

} ]);

lqSync.controller('MsgCtrl', ['$scope', 'msg', function ($scope, msg) {
  $scope.msgs = msg.getText();

  $scope.$on('messagesRefresh', function (e, a) {
    $scope.msgs = msg.getText();
    $scope.$evalAsync()
  });

} ]);

lqSync.controller('TemplatesCtrl', ['$scope', '$routeParams', '$location', 'lqTemplates', 'lqCurrentShop', function ($scope, $routeParams, $location, lqTemplates, lqCurrentShop) {

  $scope.shop = lqCurrentShop.get();

  $scope.templates = lqTemplates.query(function (d) {
    if (d.length === 0) $location.path('/shop/' + $scope.shopId);
  });

  $scope.select = function (id) {
    lqTemplates.get({ id: $scope.shop.Id, tplId: id }, function (d) {
      if (d.Locked) $location.path('/shop/template-unlock/' + id);
      else $location.path('/shop/sync');
    });
  }

} ]);





lqSync.controller('TemplateCtrl', ['$scope', '$routeParams', '$location', 'lqConfigTemplate', function ($scope, $routeParams, $location, lqConfigTemplate) {

  $scope.tplId = $routeParams.tplId;

  $scope.template = lqConfigTemplate.get({ id: $scope.tplId }, function (d) {
    if (d.Id === undefined) {
      $location.path('/');
    }
  });

  $scope.cancel = function () {
    $location.path('/shop/templates');
  }

  $scope.save = function () {
    $scope.template.$save(function () {
      $location.path('/shop/sync');
    });
  }

} ]);





lqSync.controller('SyncCtrl', ['$scope', '$routeParams', '$timeout', '$location', 'lqConfigTemplate', 'lqLog', 'lqConsole', 'lqCurrentShop', 'lqOpenFolder', function ($scope, $routeParams, $timeout, $location, lqConfigTemplate, lqLog, lqConsole, lqCurrentShop, lqOpenFolder) {

  $scope.openFolder = function () { lqOpenFolder.get(); }

  $scope.lastId = 0;
  $scope.log = [];
  $scope.run = true;
  $scope.qLog = null;

  // Pobierz informację o bieżącym szablonie tylko raz (bez migotania nagłówka).
  lqConfigTemplate.get({ id: 0 }, function (d) {
    if (d.Id === undefined) { $location.path('/'); return; }
    $scope.template = d;
  });

  $scope.getLog = function () {
    $scope.qLog = lqLog.query({ lastId: $scope.lastId }, function (d) {
      var i;
      if (d.length != 0) {
        for (i = 0; i != d.length; i++)
          $scope.log.unshift(d[i]);
        $scope.lastId = d[d.length - 1].Id;
      }
      if (!$scope.run) return;
      $timeout(function () { $scope.getLog() }, 1);
    });
  }

  $timeout(function () { $scope.getLog() }, 1);

  $scope.$on('$destroy', function () {
    if ($scope.qLog != null) {
      $scope.qLog.$cancelRequest('__logDestroy');
    }
    $scope.run = false;
    lqConsole.remove();
  });


  $scope.console = lqConsole.query();

  $scope.refreshConsole = function () {
    $scope.console = lqConsole.query({ comm: 'refr' }, function () { }, function () { $location.path('/shop/templates'); });
  }

  $scope.shop = lqCurrentShop.get();

  $scope.download = function (file) {
    $scope.console = lqConsole.query({ comm: 'download', file: file }, function () { }, function () { $location.path('/shop/templates'); });
  }

  $scope.upload = function (file, type) {
    $scope.console = lqConsole.query({ comm: 'upload', type: type, file: file }, function () { }, function () { $location.path('/shop/templates'); });
  }

  $scope.removeLocal = function (file) {
    $scope.console = lqConsole.query({ comm: 'removeLocal', file: file }, function () { }, function () { $location.path('/shop/templates'); });
  }

  $scope.removeRemote = function (file) {
    $scope.console = lqConsole.query({ comm: 'removeRemote', file: file }, function () { }, function () { $location.path('/shop/templates'); });
  }

  $scope.downloadAll = function () {
    $scope.console = lqConsole.query({ comm: 'downloadAll'}, function () { }, function () { $location.path('/shop/templates'); });
  }

  $scope.uploadAll = function () {
    $scope.console = lqConsole.query({ comm: 'uploadAll' }, function () { }, function () { $location.path('/shop/templates'); });
  }

} ]);