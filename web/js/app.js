'use strict';

var lqSync = angular.module('lqSync', ['ngRoute', 'ngResource']);

lqSync.provider('msg', ['$timeoutProvider', function ($timeoutProvider) {
    var messages = [];
    var rootScope;

    this.$get = ['$injector', function ($injector) {
        rootScope = $injector.get('$rootScope');
        return { getText: function () { return messages; }
        }
    } ];

    this.setText = function (t, type) {
        messages.push({ msg: t, type: type });
        if (rootScope) rootScope.$broadcast('messagesRefresh');
        setTimeout(function () {
            messages.shift();
            if (rootScope) rootScope.$broadcast('messagesRefresh');
        }, 7000);
    }
} ]);

lqSync.directive('ngConfirmClick', [function () {
    return {
        link: function (scope, element, attrs) {
            element.bind('click', function () {
                var message = attrs.ngConfirmMessage;
                if (message && confirm(message)) {
                    scope.$apply(attrs.ngConfirmClick);
                }
            });
        }
    }
} ]);

lqSync.directive('ngSpinner', ['$http', function ($http) {
    var z = 0;
    return {
        restrict: 'A',
        link: function (scope, s, attrs) {
            scope.isLoading = function () { return $http.pendingRequests.length > 0; };
            scope.$watch(scope.isLoading, function (v) { if (v) s.show(); else s.hide(); });
        }
    };
} ]);

lqSync.config(['$routeProvider', '$httpProvider', '$resourceProvider', 'msgProvider',
  function ($routeProvider, $httpProvider, $resourceProvider, msgProvider) {

      $routeProvider.
        when('/', { templateUrl: 'shops.htm' }).
        when('/shop', { templateUrl: 'shop.htm' }).
        when('/shop/templates', { templateUrl: 'templates.htm' }).
        when('/shop/sync', { templateUrl: 'sync.htm' }).
        when('/shop/template-unlock/:tplId', { templateUrl: 'template-unlock.htm' }).
        when('/shop/:id', { templateUrl: 'shop.htm' }).
        otherwise({ redirectTo: '/' });

      $httpProvider.interceptors.push(['$q', '$location', function ($q, $location) {
          return {
              responseError: function (rejection) {

                  console.log(rejection);

                  if (rejection.status == -1 && (rejection.config.timeout.$$state.value !== '__logDestroy')) {
                      msgProvider.setText('ERR_CONNECTION_REFUSED', 'err');
                      $location.path('/');
                  }
                  else if (rejection.data && rejection.data.Message != null) {
                      msgProvider.setText(rejection.data.Message, 'err');
                  }



                  if (rejection.status == 498) {
                      $location.path('/');
                  }
                  if (rejection.status == 499) {
                      $location.path('/');
                  }
                  return $q.reject(rejection);
              },
              response: function (resp) {
                  return resp;
              }
          };
      } ]);

      $resourceProvider.defaults.cancellable = true;

  } ]);